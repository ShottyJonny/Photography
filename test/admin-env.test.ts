import { describe, it, expect } from 'vitest'
import { supabaseAuthEnv } from '@/lib/env'

const base = {
  SUPABASE_URL: 'https://x.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
}

describe('supabaseAuthEnv', () => {
  it('returns the url and anon key', () => {
    expect(supabaseAuthEnv(base)).toEqual({ url: 'https://x.supabase.co', anonKey: 'anon' })
  })

  it('falls back to NEXT_PUBLIC_SUPABASE_URL when SUPABASE_URL is absent', () => {
    const s = { NEXT_PUBLIC_SUPABASE_URL: 'https://y.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' }
    expect(supabaseAuthEnv(s).url).toBe('https://y.supabase.co')
  })

  it('throws naming the url when both url vars are absent', () => {
    expect(() => supabaseAuthEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' })).toThrow(/SUPABASE_URL/)
  })

  it('throws naming the anon key when it is absent', () => {
    expect(() => supabaseAuthEnv({ SUPABASE_URL: 'https://x.supabase.co' })).toThrow(/ANON_KEY/)
  })

  it('treats a blank value as missing', () => {
    expect(() => supabaseAuthEnv({ ...base, NEXT_PUBLIC_SUPABASE_ANON_KEY: '   ' })).toThrow(/ANON_KEY/)
  })

  it('does NOT require the Stripe vars', () => {
    expect(() => supabaseAuthEnv(base)).not.toThrow()
  })
})
