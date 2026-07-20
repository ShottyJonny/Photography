import { it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  process.env.STRIPE_SECRET_KEY = 'sk_test_x'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x'
})

it('constructs the admin client', async () => {
  const { supabaseAdmin } = await import('@/lib/supabase/admin')
  expect(supabaseAdmin().from).toBeTypeOf('function')
})

it('constructs the stripe client', async () => {
  const { stripe } = await import('@/lib/stripe')
  expect(stripe().checkout.sessions.create).toBeTypeOf('function')
})
