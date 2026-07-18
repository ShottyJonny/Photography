import { describe, it, expect, vi, beforeEach } from 'vitest'

const sessionCreate = vi.fn()
const insert = vi.fn()

const PHOTOS = [{
  id: '11111111-1111-1111-1111-111111111111', title: 'Deterioration', published: true,
  has_bw_variant: true, original_key: 'originals/d/colour.jpg', original_bw_key: 'originals/d/silver.jpg',
}]

vi.mock('@/lib/stripe', () => ({ stripe: () => ({ checkout: { sessions: { create: sessionCreate } } }) }))
vi.mock('@/lib/env', () => ({ env: () => ({ siteUrl: 'https://jonhoffman.com' }) }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'photos') return { select: () => ({ in: () => Promise.resolve({ data: PHOTOS, error: null }) }) }
      if (table === 'orders') return {
        insert: (row: unknown) => { insert('orders', row); return { select: () => ({ single: () => Promise.resolve({ data: { id: 'order-123' }, error: null }) }) } },
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }
      return { insert: (rows: unknown) => { insert('order_items', rows); return Promise.resolve({ error: null }) } }
    },
  }),
}))

const body = {
  items: [{ photoId: '11111111-1111-1111-1111-111111111111', size: '8x10', register: 'colour', qty: 1 }],
  customer: { email: 'buyer@example.com', name: 'Buyer' },
  shippingAddress: { name: 'Buyer', street: '1 Rd', city: 'LA', region: 'CA', postalCode: '90001', country: 'US' },
}
const post = (payload: unknown) => new Request('http://localhost/api/checkout', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
})
const orderInsert = () => insert.mock.calls.find((c) => c[0] === 'orders')?.[1] as Record<string, unknown>
const itemsInsert = () => insert.mock.calls.find((c) => c[0] === 'order_items')?.[1] as Record<string, unknown>[]

beforeEach(() => { sessionCreate.mockReset(); insert.mockReset(); sessionCreate.mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.com/x' }) })

describe('POST /api/checkout', () => {
  it('rejects an invalid body with 400', async () => {
    const { POST } = await import('@/app/api/checkout/route')
    expect((await POST(post({ items: [] }))).status).toBe(400)
  })

  it('creates a card-only session with billing collection, no shipping collection, and a SITE_URL success_url', async () => {
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(post(body))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/x' })

    const args = sessionCreate.mock.calls[0][0]
    expect(args.payment_method_types).toEqual(['card'])
    expect(args.billing_address_collection).toBe('required')
    expect(args.shipping_address_collection).toBeUndefined()
    expect(args.success_url).toContain('https://jonhoffman.com/order/order-123')
    expect(args.success_url).not.toContain('localhost')
    expect(args.metadata.orderId).toBe('order-123')
  })

  it('persists the order with a snake_case shipping address and server-derived cents', async () => {
    const { POST } = await import('@/app/api/checkout/route')
    await POST(post(body))
    expect(orderInsert()).toMatchObject({
      status: 'pending',
      shipping_address: { postal_code: '90001', country: 'US', region: 'CA' },
      subtotal_cents: 1500,
      total_cents: 1500 + 995 + Math.round(1500 * 0.0825),
    })
    expect(itemsInsert()[0]).toMatchObject({ order_id: 'order-123', unit_cents: 1500, original_key: 'originals/d/colour.jpg', register: 'colour' })
  })

  it('snapshots the B&W master (original_bw_key) for a silver-register item', async () => {
    const { POST } = await import('@/app/api/checkout/route')
    await POST(post({ ...body, items: [{ ...body.items[0], register: 'silver' }] }))
    expect(itemsInsert()[0]).toMatchObject({ register: 'silver', original_key: 'originals/d/silver.jpg' })
  })
})
