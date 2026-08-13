import { render, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { OrderRows } from '@/components/admin/OrderRows'
import type { AdminOrderRow } from '@/lib/data/orders-admin'

afterEach(cleanup)

const ORDER: AdminOrderRow = {
  id: '8f14e45f-ceea-467a-9b3a-2c4f7a5d1e02',
  status: 'paid',
  created_at: '2026-07-16T14:30:00.000Z',
  customer_name: 'Jane Marsh',
  customer_email: 'jane@example.com',
  shipping_address: { name: 'Jane Marsh', street: '1200 Vine Street', city: 'Cincinnati', region: 'OH', postal_code: '45202', country: 'US' },
  total_cents: 6500,
  amount_paid_cents: null,
  tracking_number: null,
  items: [
    { id: 'i1', title: 'Deterioration', size: '8x10', register: 'colour', qty: 2, unit_cents: 3250, original_key: 'deterioration/colour.jpg', photoSlug: 'deterioration' },
    { id: 'i2', title: 'Omniprominence', size: '16x20', register: 'silver', qty: 1, unit_cents: 12000, original_key: null, photoSlug: null },
  ],
}

function renderRows(orders: AdminOrderRow[] = [ORDER]) {
  return render(<OrderRows orders={orders} dateLabels={{ [ORDER.id]: '16 Jul' }} />)
}

describe('OrderRows', () => {
  it('renders one row per order, with the short id and the date', () => {
    const { container } = renderRows()
    expect(container.querySelectorAll('.admin-ord-row')).toHaveLength(1)
    expect(container.querySelector('.admin-row-id')?.textContent).toBe('8f14e45f')
    expect(container.textContent).toContain('16 Jul')
  })

  it('shows the customer and the total', () => {
    const { container } = renderRows()
    expect(container.textContent).toContain('Jane Marsh')
    expect(container.textContent).toContain('jane@example.com')
    expect(container.querySelector('.admin-ord-total')?.textContent).toBe('$65')
  })

  it('keeps the works collapsed until the caret is pressed', () => {
    const { container } = renderRows()
    const caret = container.querySelector('.admin-ord-caret')!
    expect(caret.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.admin-ord-items')).toBeNull()

    fireEvent.click(caret)
    expect(caret.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelectorAll('.admin-ord-item')).toHaveLength(2)
  })

  it('lists each work with size, register and unit price when expanded', () => {
    const { container } = renderRows()
    fireEvent.click(container.querySelector('.admin-ord-caret')!)
    const text = container.querySelector('.admin-ord-items')?.textContent ?? ''
    expect(text).toContain('Deterioration')
    expect(text).toContain('8x10')
    expect(text).toContain('Colour')
    expect(text).toContain('Silver B&W')
    expect(text).toContain('2 × $32.50')
  })

  // order_items.photo_id is `on delete set null`. The receipt still says what
  // was bought; only the picture is gone.
  it('keeps a work whose photo was deleted, without an image', () => {
    const { container } = renderRows()
    fireEvent.click(container.querySelector('.admin-ord-caret')!)
    const rows = [...container.querySelectorAll('.admin-ord-item')]
    expect(rows[1].textContent).toContain('Omniprominence')
    expect(rows[1].querySelector('img')).toBeNull()
    expect(rows[1].querySelector('.admin-ord-itemthumb.is-empty')).not.toBeNull()
  })

  it('carries the name and full address in the copy control', () => {
    const { container } = renderRows()
    expect(container.querySelector('.admin-ord-copy')?.textContent).toContain('Name + address')
  })

  it('links every row into its order', () => {
    const { container } = renderRows()
    expect(container.querySelector('.admin-ord-open')?.getAttribute('href')).toBe(`/admin/orders/${ORDER.id}`)
  })

  // product.md §6.3 / DESIGN.md §11.4-D: quarantined, both amounts shown, and
  // the alert wash — the failure mode is shipping $65 of prints for $5.50.
  it('quarantines a mismatch with both amounts and a Review link', () => {
    const { container } = renderRows([{ ...ORDER, status: 'amount_mismatch', amount_paid_cents: 550 }])
    expect(container.querySelector('.admin-ord-row')?.className).toContain('admin-held')
    expect(container.querySelector('.admin-held-line')?.textContent).toBe('paid $5.50 · expected $65')
    expect(container.querySelector('.admin-mismatch')?.textContent).toBe('MISMATCH')
    expect(container.querySelector('.admin-ord-open')?.textContent).toContain('Review')
  })

  // §11.1: a status always carries text; colour never carries it alone.
  it('labels every status in words', () => {
    for (const [status, label] of [
      ['paid', 'PAID'], ['submitted_to_lab', 'AT LAB'], ['shipped', 'SHIPPED'],
      ['cancelled', 'CANCELLED'], ['refunded', 'REFUNDED'], ['pending', 'PENDING'],
    ] as const) {
      cleanup()
      const { container } = renderRows([{ ...ORDER, status }])
      expect(container.textContent).toContain(label)
    }
  })

  it('says so when an order has no line items rather than rendering an empty list', () => {
    const { container } = renderRows([{ ...ORDER, items: [] }])
    fireEvent.click(container.querySelector('.admin-ord-caret')!)
    expect(container.textContent).toContain('No line items were recorded')
  })
})
