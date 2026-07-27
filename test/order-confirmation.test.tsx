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

  // product.md §6.1: shipped is the ONLY state that may show a tracking number,
  // and the system sends no email — so this page is the only place a real one
  // can reach the customer. The legacy site invented a UPS number on a 900ms
  // timer for every order; nothing here may imply a carrier or a lookup.
  it('shows a real tracking number once the order is shipped', async () => {
    state.order = { ...ORDER, status: 'shipped', tracking_number: '1Z999AA10123456784' }
    state.items = ITEMS
    const { container } = await renderConfirm()
    expect(container.querySelector('.confirm-tracking')?.textContent).toBe('Tracking: 1Z999AA10123456784')
    expect(container.textContent).not.toMatch(/UPS|FedEx|USPS|track your/i)
    expect(container.querySelector('.confirm-tracking a')).toBeNull()
  })

  it('shows no tracking for any state short of shipped', async () => {
    for (const status of ['paid', 'submitted_to_lab', 'pending', 'amount_mismatch']) {
      cleanup()
      state.order = { ...ORDER, status, tracking_number: '1Z999AA10123456784' }
      state.items = ITEMS
      const { container } = await renderConfirm()
      expect(container.querySelector('.confirm-tracking')).toBeNull()
    }
  })

  it('shows no tracking line when a shipped order has no number', async () => {
    state.order = { ...ORDER, status: 'shipped', tracking_number: null }
    state.items = ITEMS
    const { container } = await renderConfirm()
    expect(container.querySelector('.confirm-tracking')).toBeNull()
    expect(container.textContent).not.toContain('Tracking:')
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
