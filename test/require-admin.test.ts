import { describe, it, expect, vi, beforeEach } from 'vitest'

const authState: { user: unknown; error: unknown } = { user: null, error: null }
const getUser = vi.fn(async () => ({ data: { user: authState.user }, error: authState.error }))
const getSession = vi.fn()

vi.mock('@/lib/supabase/auth-server', () => ({
  createAuthServerClient: async () => ({ auth: { getUser, getSession } }),
}))

// redirect() must THROW. A no-op mock would let execution continue past the
// redirect, and the test would pass while proving nothing.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT;${url}`)
  },
}))

beforeEach(() => {
  authState.user = null
  authState.error = null
  getUser.mockClear()
  getSession.mockClear()
})

describe('loadAdmin', () => {
  it('redirects to sign-in when there is no user', async () => {
    const { loadAdmin } = await import('@/lib/admin/require-admin')
    await expect(loadAdmin()).rejects.toThrow(/NEXT_REDIRECT;\/admin\/sign-in/)
  })

  // supabase-js RETURNS auth errors rather than throwing, so this is the
  // shape a real expired/invalid session arrives in.
  it('redirects when getUser returns an error, even alongside a user', async () => {
    authState.user = { id: 'u1', email: 'a@b.com' }
    authState.error = { name: 'AuthApiError', status: 401, message: 'jwt expired' }
    const { loadAdmin } = await import('@/lib/admin/require-admin')
    await expect(loadAdmin()).rejects.toThrow(/NEXT_REDIRECT/)
  })

  it('returns the user when authenticated', async () => {
    authState.user = { id: 'u1', email: 'jon@example.com' }
    const { loadAdmin } = await import('@/lib/admin/require-admin')
    const user = await loadAdmin()
    expect(user.email).toBe('jon@example.com')
  })

  it('uses getUser, never getSession', async () => {
    authState.user = { id: 'u1', email: 'jon@example.com' }
    const { loadAdmin } = await import('@/lib/admin/require-admin')
    await loadAdmin()
    expect(getUser).toHaveBeenCalled()
    expect(getSession).not.toHaveBeenCalled()
  })
})
