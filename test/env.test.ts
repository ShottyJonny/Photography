import { describe, it, expect } from 'vitest'
import { loadEnv } from '@/lib/env'

const base = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'svc',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
}

describe('loadEnv', () => {
  it('throws with the missing key name when a required var is absent', () => {
    const { SUPABASE_URL, ...missing } = base
    expect(() => loadEnv(missing)).toThrow(/SUPABASE_URL/)
  })

  it('uses SITE_URL as the site origin when present', () => {
    const env = loadEnv({ ...base, SITE_URL: 'https://jonhoffman.com' })
    expect(env.siteUrl).toBe('https://jonhoffman.com')
  })

  it('falls back to https://$VERCEL_URL when SITE_URL is absent', () => {
    const env = loadEnv({ ...base, VERCEL_URL: 'preview-abc.vercel.app' })
    expect(env.siteUrl).toBe('https://preview-abc.vercel.app')
  })

  it('falls back to localhost when neither is set', () => {
    expect(loadEnv(base).siteUrl).toBe('http://localhost:3000')
  })

  it('never reads process.env.URL', () => {
    const env = loadEnv({ ...base, URL: 'https://netlify-trap.example' })
    expect(env.siteUrl).toBe('http://localhost:3000')
  })

  it('throws in production when no site origin is configured', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(/site origin/)
  })
})
