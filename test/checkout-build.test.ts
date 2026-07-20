import { describe, it, expect } from 'vitest'
import { buildCheckout, type ResolvedItem } from '@/lib/checkout/build'

const item: ResolvedItem = {
  photoId: '11111111-1111-1111-1111-111111111111',
  title: 'Deterioration', originalKey: 'originals/deterioration/colour.jpg',
  size: '8x10', register: 'colour', qty: 2,
}
const shipping = { name: 'A', street: '1 Rd', city: 'LA', region: 'CA', postalCode: '90001', country: 'US' }

describe('buildCheckout', () => {
  it('derives order-item cents from the server pricing, snapshotting photo fields', () => {
    const { orderItems, amounts } = buildCheckout([item], shipping)
    expect(orderItems[0]).toMatchObject({
      photo_id: item.photoId, title: 'Deterioration', size: '8x10',
      register: 'colour', qty: 2, unit_cents: 1500, original_key: item.originalKey,
    })
    expect(amounts.subtotal).toBe(3000)
    expect(amounts.total).toBe(3000 + 995 + Math.round(3000 * 0.0825))
  })

  it('emits Stripe line items with shipping and tax lines when > 0', () => {
    const { stripeLineItems } = buildCheckout([item], shipping)
    const names = stripeLineItems.map((l) => l.price_data.product_data.name)
    expect(names).toContain('Shipping')
    expect(names).toContain('Tax')
    expect(stripeLineItems[0].price_data.unit_amount).toBe(1500)
  })
})
