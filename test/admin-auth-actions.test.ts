import { describe, it, expect, vi, beforeEach } from 'vitest'
import { INITIAL_SIGN_IN_STATE } from '@/lib/admin/auth-state'

const state: { signInError: unknown; signInThrows: boolean; signOutRejects: boolean } = {
  signInError: null, signInThrows: false, signOutRejects: false,
}
const signInWithPassword = vi.fn(async () => {
  if (state.signInThrows) throw new Error('boom')
  return { error: state.signInError }
})
const supabaseSignOut = vi.fn(async () => {
  if (state.signOutRejects) throw new Error('gotrue down')
  return { error: null }
})

vi.mock('@/lib/supabase/auth-server', () => ({
  createAuthServerClient: async () => ({
    auth: { signInWithPassword, signOut: supabaseSignOut },
  }),
}))

const deleted: string[] = []
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [{ name: 'sb-access-token', value: 'x' }, { name: 'theme:v1', value: 'dark' }],
    delete: (name: string) => { deleted.push(name) },
    set: () => {},
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT;${url}`) },
}))

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

function form(email: string, password: string) {
  const fd = new FormData()
  fd.set('email', email)
  fd.set('password', password)
  return fd
}
async function run(email: string, password: string) {
  const { signIn } = await import('@/lib/admin/auth-actions')
  return signIn(INITIAL_SIGN_IN_STATE, form(email, password))
}

beforeEach(() => {
  state.signInError = null; state.signInThrows = false; state.signOutRejects = false
  deleted.length = 0
  signInWithPassword.mockClear(); supabaseSignOut.mockClear(); revalidatePath.mockClear()
})

describe('signIn', () => {
  it('returns field errors for a malformed email and never calls Supabase', async () => {
    const result = await run('not-an-email', 'pw')
    expect(result.status).toBe('fieldErrors')
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('returns a field error for an empty password', async () => {
    expect((await run('jon@example.com', '')).status).toBe('fieldErrors')
  })

  it('maps invalid_credentials to the generic credentials error', async () => {
    state.signInError = { name: 'AuthApiError', code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' }
    expect(await run('jon@example.com', 'wrong')).toEqual({ status: 'error', kind: 'credentials' })
  })

  it('maps a 429 to rate_limited, not transport', async () => {
    state.signInError = { name: 'AuthApiError', code: 'over_request_rate_limit', status: 429, message: 'too many' }
    expect(await run('jon@example.com', 'pw')).toEqual({ status: 'error', kind: 'rate_limited' })
  })

  // THE ONE THAT MATTERS: supabase-js does NOT throw on a dead network. It
  // catches every AuthError and RETURNS it, with status 0. Without an explicit
  // branch the transport copy is unreachable dead code.
  it('maps a RETURNED AuthRetryableFetchError to transport', async () => {
    state.signInError = { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' }
    expect(await run('jon@example.com', 'pw')).toEqual({ status: 'error', kind: 'transport' })
  })

  it('maps a 5xx from GoTrue to transport', async () => {
    state.signInError = { name: 'AuthApiError', status: 503, message: 'service unavailable' }
    expect(await run('jon@example.com', 'pw')).toEqual({ status: 'error', kind: 'transport' })
  })

  it('maps an unrecognised auth error to unknown, not transport', async () => {
    state.signInError = { name: 'AuthApiError', code: 'email_not_confirmed', status: 400, message: 'Email not confirmed' }
    expect(await run('jon@example.com', 'pw')).toEqual({ status: 'error', kind: 'unknown' })
  })

  it('maps a thrown non-auth error to transport', async () => {
    state.signInThrows = true
    expect(await run('jon@example.com', 'pw')).toEqual({ status: 'error', kind: 'transport' })
  })

  it('redirects to /admin on success', async () => {
    await expect(run('jon@example.com', 'pw')).rejects.toThrow(/NEXT_REDIRECT;\/admin$/)
  })
})

describe('signOut', () => {
  it('clears sb- cookies, revalidates, and redirects', async () => {
    const { signOut } = await import('@/lib/admin/auth-actions')
    await expect(signOut()).rejects.toThrow(/NEXT_REDIRECT;\/admin\/sign-in/)
    expect(deleted).toContain('sb-access-token')
    expect(deleted).not.toContain('theme:v1')
    expect(revalidatePath).toHaveBeenCalledWith('/admin', 'layout')
  })

  // Fail-closed: a rejected signOut must not leave the admin signed in on a
  // screen that says otherwise.
  it('clears cookies and redirects even when Supabase signOut rejects', async () => {
    state.signOutRejects = true
    const { signOut } = await import('@/lib/admin/auth-actions')
    await expect(signOut()).rejects.toThrow(/NEXT_REDIRECT;\/admin\/sign-in/)
    expect(deleted).toContain('sb-access-token')
  })
})
