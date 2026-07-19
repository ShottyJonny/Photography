import { describe, it, expect, vi, beforeEach } from 'vitest'

const guard = { throws: false }
const requireAdmin = vi.fn(async () => {
  if (guard.throws) throw new Error('NEXT_REDIRECT;/admin/sign-in')
  return { id: 'u1', email: 'jon@example.com' }
})
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin: () => requireAdmin() }))

type Result = { data: unknown; count: number | null; error: unknown }
const results: Record<string, Result> = {}
const calls: string[] = []

vi.mock('@/lib/supabase/auth-server', () => ({
  createAuthServerClient: async () => ({
    from: (table: string) => {
      const chain = {
        select: (_cols: string, opts?: { head?: boolean }) => {
          const key = opts?.head ? `${table}:count` : table
          const settle = () => {
            calls.push(key)
            // A head:true response carries data:null BY DESIGN.
            const r = results[key] ?? { data: null, count: 0, error: null }
            return Promise.resolve(r)
          }
          const q = {
            eq: (_c: string, v: unknown) => {
              const k = `photos:${v ? 'published' : 'unlisted'}`
              calls.push(k)
              return Promise.resolve(results[k] ?? { data: null, count: 0, error: null })
            },
            in: () => q,
            order: () => settle(),
            then: (res: (v: Result) => unknown) => settle().then(res),
          }
          return q
        },
      }
      return chain
    },
  }),
}))

beforeEach(() => {
  guard.throws = false
  for (const k of Object.keys(results)) delete results[k]
  calls.length = 0
  requireAdmin.mockClear()
})

describe('getDashboard', () => {
  it('calls requireAdmin before touching the database', async () => {
    guard.throws = true
    const { getDashboard } = await import('@/lib/admin/dashboard')
    await expect(getDashboard()).rejects.toThrow(/NEXT_REDIRECT/)
    expect(calls).toEqual([])
  })

  // head:true returns data:null on SUCCESS. Keying failure on falsy data would
  // render the unreadable state on every healthy request.
  it('returns ok:true with zeroes for an empty but healthy database', async () => {
    results['orders'] = { data: [], count: null, error: null }
    results['photos:published'] = { data: null, count: 0, error: null }
    results['photos:unlisted'] = { data: null, count: 0, error: null }
    results['collections'] = { data: [], count: null, error: null }
    const { getDashboard } = await import('@/lib/admin/dashboard')
    const result = await getDashboard()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.summary.queueCount).toBe(0)
  })

  it('collapses to ok:false when any single query errors', async () => {
    results['orders'] = { data: [], count: null, error: null }
    results['photos:published'] = { data: null, count: 0, error: null }
    results['photos:unlisted'] = { data: null, count: 0, error: null }
    results['collections'] = { data: null, count: null, error: { message: 'permission denied for table collections' } }
    const { getDashboard } = await import('@/lib/admin/dashboard')
    expect(await getDashboard()).toEqual({ ok: false })
  })

  it('never returns the underlying error text', async () => {
    results['orders'] = { data: null, count: null, error: { message: 'column orders.secret does not exist', hint: 'perhaps you meant' } }
    const { getDashboard } = await import('@/lib/admin/dashboard')
    const result = await getDashboard()
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(JSON.stringify(result)).not.toContain('hint')
  })
})
