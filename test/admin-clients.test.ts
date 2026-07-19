import { it, expect, beforeAll, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'

// The one place this suite writes process.env. test/env.test.ts and
// test/admin-env.test.ts both inject their own source, so nothing collides.
const saved = { url: process.env.SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
})
afterAll(() => {
  process.env.SUPABASE_URL = saved.url
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key
})

it('constructs the proxy auth client (catches a missing ws transport on Node 20)', async () => {
  const { createProxyAuthClient } = await import('@/lib/supabase/auth-proxy')
  const { supabase } = createProxyAuthClient(
    new NextRequest(new URL('/admin', 'http://localhost:3000')),
  )
  expect(supabase.auth).toBeTypeOf('object')
})

it('constructs the server auth client (same guard, other module)', async () => {
  vi.doMock('next/headers', () => ({
    cookies: async () => ({ getAll: () => [], set: () => {} }),
  }))
  const { createAuthServerClient } = await import('@/lib/supabase/auth-server')
  const supabase = await createAuthServerClient()
  expect(supabase.auth).toBeTypeOf('object')
})
