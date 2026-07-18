import { describe, it, expect, vi, beforeEach } from 'vitest'

const constructEvent = vi.fn()
const update = vi.fn(() => ({ eq: () => ({ eq: () => ({ error: null }) }) }))
const single = vi.fn()

vi.mock('@/lib/stripe', () => ({ stripe: () => ({ webhooks: { constructEvent } }) }))
vi.mock('@/lib/env', () => ({ env: () => ({ STRIPE_WEBHOOK_SECRET: 'whsec_x' }) }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single }) }),
      update,
    }),
  }),
}))

function evt(type: string, object: unknown) { constructEvent.mockReturnValue({ type, data: { object } }) }
function req() {
  return new Request('http://localhost/api/stripe-webhook', {
    method: 'POST', headers: { 'stripe-signature': 't=1,v1=x' }, body: '{}',
  })
}

beforeEach(() => { update.mockClear(); single.mockReset(); single.mockResolvedValue({ data: { id: 'o1', status: 'pending', total_cents: 4243 }, error: null }) })

describe('POST /api/stripe-webhook', () => {
  it('returns 400 on a bad signature', async () => {
    constructEvent.mockImplementation(() => { throw new Error('bad sig') })
    const { POST } = await import('@/app/api/stripe-webhook/route')
    expect((await POST(req())).status).toBe(400)
  })

  it('marks a matching order paid', async () => {
    evt('checkout.session.completed', { metadata: { orderId: 'o1' }, payment_intent: 'pi_1', amount_total: 4243, payment_status: 'paid' })
    const { POST } = await import('@/app/api/stripe-webhook/route')
    await POST(req())
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid', amount_paid_cents: 4243 }))
  })

  it('quarantines an underpaid order as amount_mismatch', async () => {
    evt('checkout.session.completed', { metadata: { orderId: 'o1' }, payment_intent: 'pi_1', amount_total: 550, payment_status: 'paid' })
    const { POST } = await import('@/app/api/stripe-webhook/route')
    await POST(req())
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'amount_mismatch', amount_paid_cents: 550 }))
  })

  it('ignores a completed session whose payment_status is not paid', async () => {
    evt('checkout.session.completed', { metadata: { orderId: 'o1' }, payment_intent: 'pi_1', amount_total: 4243, payment_status: 'unpaid' })
    const { POST } = await import('@/app/api/stripe-webhook/route')
    await POST(req())
    expect(update).not.toHaveBeenCalled()
  })

  it('cancels an expired session', async () => {
    evt('checkout.session.expired', { metadata: { orderId: 'o1' } })
    const { POST } = await import('@/app/api/stripe-webhook/route')
    await POST(req())
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
  })
})
