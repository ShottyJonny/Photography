import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state: { order: unknown; items: unknown[] } = { order: null, items: [] }

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          table === 'orders'
            ? { single: async () => ({ data: state.order }) }
            : Promise.resolve({ data: state.items }),
      }),
    }),
  }),
}))

const ORDER = {
  id: 'order-abc', status: 'paid', created_at: '2026-07-19T00:00:00Z',
  customer_name: 'Buyer', customer_email: 'b@e.com',
  shipping_address: { name: 'Buyer', street: '1 Rd', city: 'LA', region: 'CA', postal_code: '90001', country: 'US' },
  subtotal_cents: 3000, shipping_cents: 995, tax_cents: 248, total_cents: 4243,
}
const ITEMS = [{ title: 'A Photo', size: '8x10', register: 'colour', qty: 2, unit_cents: 1500 }]

async function renderConfirm(id = 'order-abc') {
  const Page = (await import('@/app/(store)/order/[id]/page')).default
  return render(await Page({ params: Promise.resolve({ id }) }))
}

afterEach(() => { cleanup(); state.order = null; state.items = [] })

describe('OrderConfirmation', () => {
  it('renders a thank-you and the ship-window note for a paid order', async () => {
    state.order = { ...ORDER, status: 'paid' }; state.items = ITEMS
    const { container } = await renderConfirm()
    expect(container.textContent).toContain('Thank you.')
    expect(container.textContent).toContain('made to order')
  })

  it('shows works as text rows with snapshot prices and NO image (D4)', async () => {
    state.order = { ...ORDER }; state.items = ITEMS
    const { container } = await renderConfirm()
    expect(container.textContent).toContain('A Photo')
    expect(container.textContent).toContain('8x10')
    expect(container.textContent).toContain('$30') // 1500 * 2, from the snapshot
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders the stored shipping address', async () => {
    state.order = { ...ORDER }; state.items = ITEMS
    const { container } = await renderConfirm()
    expect(container.textContent).toContain('1 Rd')
    expect(container.textContent).toContain('90001')
  })

  it('treats amount_mismatch as active but never claims paid or promises shipping (F2/F3)', async () => {
    state.order = { ...ORDER, status: 'amount_mismatch' }; state.items = ITEMS
    const { container } = await renderConfirm()
    expect(container.textContent).toContain('Thank you.')
    expect(container.textContent).toContain('reviewing it')
    expect(container.textContent).not.toContain('made to order')
  })

  it('does not present a total-as-charged for amount_mismatch — points to Stripe instead', async () => {
    state.order = { ...ORDER, status: 'amount_mismatch', total_cents: 9999 }; state.items = ITEMS
    const { container } = await renderConfirm()
    expect(container.querySelector('.confirm-totals')).toBeNull() // no Subtotal/Shipping/Tax/Total block
    expect(container.textContent).toContain('payment is being reviewed')
    expect(container.textContent).not.toContain('$99.99') // the un-charged total is never shown
  })

  it('shows an update heading and no ship-window for a cancelled order', async () => {
    state.order = { ...ORDER, status: 'cancelled' }; state.items = ITEMS
    const { container } = await renderConfirm()
    expect(container.textContent).toContain('Order update')
    expect(container.textContent).toContain('cancelled')
    expect(container.textContent).not.toContain('made to order')
  })

  it('renders a not-found message when the order is missing', async () => {
    state.order = null
    const { container } = await renderConfirm('nope')
    expect(container.textContent).toContain('find that order')
  })
})
