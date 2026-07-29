import { render, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminOrderDetail } from '@/lib/data/orders-admin'

const detail: { value: AdminOrderDetail | null } = { value: null }
const notFound = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })

vi.mock('@/lib/data/orders-admin', () => ({
  LIST_CAP: 200,
  getOrderForFulfillment: async () => detail.value,
}))
vi.mock('next/navigation', () => ({ notFound: () => notFound(), useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin: async () => ({ id: 'admin' }) }))
vi.mock('@/lib/supabase/auth-server', () => ({ createAuthServerClient: async () => ({}) }))

const ORDER: AdminOrderDetail = {
  id: '8f14e45f-ceea-467a-9b3a-2c4f7a5d1e02',
  status: 'paid',
  created_at: '2026-07-16T14:30:00.000Z',
  customer_name: 'Jane Marsh',
  customer_email: 'jane@example.com',
  shipping_address: { name: 'Jane Marsh', street: '1200 Vine Street', city: 'Cincinnati', region: 'OH', postal_code: '45202', country: 'US' },
  total_cents: 6500,
  amount_paid_cents: null,
  tracking_number: null,
  subtotal_cents: 5000,
  shipping_cents: 1000,
  tax_cents: 500,
  stripe_payment_intent_id: 'pi_3Nabc',
  submitted_to_lab_at: null,
  shipped_at: null,
  lab_finish: 'Lustre',
  notes: null,
  items: [
    { id: 'i1', title: 'Deterioration', size: '8x10', register: 'colour', qty: 2, unit_cents: 3250, original_key: 'deterioration/colour.jpg', photoSlug: 'deterioration' },
    { id: 'i2', title: 'Omniprominence', size: '16x20', register: 'silver', qty: 1, unit_cents: 12000, original_key: null, photoSlug: null },
  ],
  signedOriginals: { i1: 'https://signed.example/deterioration.jpg', i2: null },
}

async function renderDetail(over: Partial<AdminOrderDetail> = {}) {
  detail.value = { ...ORDER, ...over }
  const Page = (await import('@/app/admin/(protected)/orders/[id]/page')).default
  return render(await Page({ params: Promise.resolve({ id: ORDER.id }) }))
}

beforeEach(() => { vi.clearAllMocks() })
afterEach(cleanup)

describe('the order detail', () => {
  // D14: no order-number column exists; the uuid is what reconciles against
  // Stripe and what the customer quotes.
  it('shows the full uuid and the Stripe payment intent', async () => {
    const { container } = await renderDetail()
    expect(container.querySelector('.admin-ord-uuid')?.textContent).toBe(ORDER.id)
    expect(container.textContent).toContain('pi_3Nabc')
    expect(container.textContent).not.toMatch(/JH-\d/)
  })

  it('omits the payment intent when there is none, rather than showing a blank field', async () => {
    const { container } = await renderDetail({ stripe_payment_intent_id: null })
    expect(container.querySelector('.admin-ord-pi')).toBeNull()
  })

  it('renders the address as lines and offers copy controls', async () => {
    const { container } = await renderDetail()
    const address = container.querySelector('.admin-ord-address')?.textContent ?? ''
    expect(address).toContain('1200 Vine Street')
    expect(address).toContain('Cincinnati, OH 45202')
    expect(container.querySelector('.admin-ord-copyrow')?.textContent).toContain('Copy address')
    expect(container.querySelector('.admin-ord-copyrow')?.textContent).toContain('Copy name')
  })

  it('says so when no address was recorded instead of rendering empty lines', async () => {
    const { container } = await renderDetail({ shipping_address: null })
    expect(container.textContent).toContain('No shipping address was recorded.')
  })

  // product.md §1: the system sends no email; the receipt is Stripe's.
  it('states that nothing is emailed from here', async () => {
    const { container } = await renderDetail()
    expect(container.textContent).toContain('Nothing is emailed from here')
  })

  it('links the signed original, and says plainly when there is none', async () => {
    const { container } = await renderDetail()
    const download = container.querySelector('.admin-ord-download')
    expect(download?.getAttribute('href')).toBe('https://signed.example/deterioration.jpg')
    expect(container.querySelector('.admin-ord-missing')?.textContent).toBe('original not available')
  })

  it('renders the export block with the real key and the finish', async () => {
    const { container } = await renderDetail()
    const block = container.querySelector('.admin-ord-block')?.textContent ?? ''
    expect(block).toContain(ORDER.id)
    expect(block).toContain('file: deterioration/colour.jpg')
    expect(block).toContain('file: (not recorded)')
    expect(block).toContain('finish: Lustre')
    // The block outlives a signature, so it never carries one.
    expect(block).not.toContain('https://signed.example')
  })

  it('substitutes a saved finish across the block', async () => {
    const { container } = await renderDetail({ lab_finish: 'Metallic' })
    expect(container.querySelector('.admin-ord-block')?.textContent).toContain('finish: Metallic')
    expect(container.textContent).toContain('Metallic')
  })

  it('falls back to Lustre when the finish is blank', async () => {
    const { container } = await renderDetail({ lab_finish: null })
    expect(container.querySelector('.admin-ord-block')?.textContent).toContain('finish: Lustre')
  })

  it('shows the totals the order was charged', async () => {
    const { container } = await renderDetail()
    const totals = container.querySelector('.admin-ord-totals')?.textContent ?? ''
    expect(totals).toContain('$50')
    expect(totals).toContain('$10')
    expect(totals).toContain('$5')
    expect(totals).toContain('$65')
  })

  it('shows both amounts on a quarantined order', async () => {
    const { container } = await renderDetail({ status: 'amount_mismatch', amount_paid_cents: 550 })
    expect(container.querySelector('.admin-held-line')?.textContent).toBe('paid $5.50 · expected $65')
    expect(container.querySelector('.admin-mismatch')?.textContent).toBe('MISMATCH')
  })

  it('404s on an unknown order rather than rendering an empty shell', async () => {
    detail.value = null
    const Page = (await import('@/app/admin/(protected)/orders/[id]/page')).default
    await expect(Page({ params: Promise.resolve({ id: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })
})
