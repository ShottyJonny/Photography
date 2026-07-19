import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type CookieList = { name: string; value: string; options: Record<string, unknown> }[]
type SetAll = (list: CookieList, headers: Record<string, string>) => void

const state: { user: unknown; error: unknown; throws: boolean; emitCookie: boolean } = {
  user: null, error: null, throws: false, emitCookie: false,
}
const captured: { setAll?: SetAll } = {}

// Mock the LIBRARY, not our wrapper — so the real setAll adapter in
// lib/supabase/auth-proxy.ts runs and spec §3.5's three rules are exercised.
vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { getAll: () => unknown; setAll?: SetAll } },
  ) => {
    captured.setAll = opts.cookies.setAll
    return {
      auth: {
        getUser: async () => {
          if (state.throws) throw new Error('network down')
          if (state.emitCookie) {
            // Drive the adapter exactly as the library would on a refresh.
            captured.setAll?.(
              [{ name: 'sb-refreshed', value: 'new-token', options: { path: '/', maxAge: 3600 } }],
              { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' },
            )
          }
          return { data: { user: state.user }, error: state.error }
        },
      },
    }
  },
}))

function req(pathname: string) {
  return new NextRequest(new URL(pathname, 'http://localhost:3000'))
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  state.user = null; state.error = null; state.throws = false; state.emitCookie = false
  captured.setAll = undefined
})

describe('proxy', () => {
  it('redirects an unauthenticated request to sign-in', async () => {
    const { proxy } = await import('@/proxy')
    const res = await proxy(req('/admin'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/admin/sign-in')
  })

  it('lets an unauthenticated request through to sign-in', async () => {
    const { proxy } = await import('@/proxy')
    expect((await proxy(req('/admin/sign-in'))).status).toBe(200)
  })

  it('redirects an authenticated request away from sign-in', async () => {
    state.user = { id: 'u1' }
    const { proxy } = await import('@/proxy')
    const res = await proxy(req('/admin/sign-in'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/\/admin$/)
  })

  it('lets an authenticated request through', async () => {
    state.user = { id: 'u1' }
    const { proxy } = await import('@/proxy')
    expect((await proxy(req('/admin'))).status).toBe(200)
  })

  it('never fails open when getUser throws', async () => {
    state.throws = true
    const { proxy } = await import('@/proxy')
    const res = await proxy(req('/admin'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/admin/sign-in')
  })

  // supabase-js RETURNS network errors rather than throwing — this is the real
  // Supabase-down shape, and the case the `!error &&` conjunct exists for.
  it('never fails open when getUser RETURNS an error', async () => {
    state.error = { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' }
    const { proxy } = await import('@/proxy')
    const res = await proxy(req('/admin'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/admin/sign-in')
  })

  it('treats a user present alongside an error as unauthenticated', async () => {
    state.user = { id: 'u1' }
    state.error = { name: 'AuthApiError', status: 401, message: 'jwt expired' }
    const { proxy } = await import('@/proxy')
    expect((await proxy(req('/admin'))).status).toBe(307)
  })

  // THE TRAP: a bare NextResponse.redirect() discards refreshed auth cookies
  // and produces an intermittent logout loop. The real adapter sets these.
  it('carries refreshed cookies onto the redirect response, attributes intact', async () => {
    state.emitCookie = true
    const { proxy } = await import('@/proxy')
    const res = await proxy(req('/admin'))
    expect(res.status).toBe(307)
    expect(res.cookies.get('sb-refreshed')?.value).toBe('new-token')
    expect(res.cookies.get('sb-refreshed')?.httpOnly).toBe(true)
    expect(res.cookies.get('sb-refreshed')?.maxAge).toBe(3600)
  })

  it('sets no-store and noindex on every response', async () => {
    state.user = { id: 'u1' }
    const { proxy } = await import('@/proxy')
    const res = await proxy(req('/admin'))
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
  })

  it('matches /admin and everything under it, and nothing else', async () => {
    const { config } = await import('@/proxy')
    expect(config.matcher).toEqual(['/admin/:path*'])
  })
})

// Spec §3.5 rules 1 and 2, driven directly against the real adapter.
describe('the setAll adapter', () => {
  it('mirrors cookies onto the request and applies the library headers', async () => {
    const { createProxyAuthClient } = await import('@/lib/supabase/auth-proxy')
    const request = req('/admin')
    const { getResponse } = createProxyAuthClient(request)
    captured.setAll?.(
      [{ name: 'sb-x', value: 'v1', options: { path: '/' } }],
      { 'Cache-Control': 'private, no-store' },
    )
    expect(request.cookies.get('sb-x')?.value).toBe('v1')
    expect(getResponse().cookies.get('sb-x')?.value).toBe('v1')
    expect(getResponse().headers.get('cache-control')).toContain('no-store')
  })
})
