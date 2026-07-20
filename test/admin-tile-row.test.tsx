import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatTile } from '@/components/admin/StatTile'
import { QueueRow } from '@/components/admin/QueueRow'
import type { QueueOrder } from '@/lib/admin/dashboard'

afterEach(cleanup)

const ORDER: QueueOrder = {
  id: 'ab12cd34-5678-90ef-1234-567890abcdef',
  status: 'paid',
  created_at: '2026-07-16T20:00:00Z',
  customer_name: 'Maya Lindqvist',
  customer_email: 'maya@example.com',
  total_cents: 6500,
  amount_paid_cents: null,
  workCount: 2,
}

describe('StatTile', () => {
  it('renders the label, number and sub', () => {
    const { container } = render(<StatTile label="In the queue" value={3} sub="paid · awaiting the lab" />)
    expect(container.textContent).toContain('In the queue')
    expect(container.querySelector('.admin-tile-number')?.textContent).toBe('3')
    expect(container.textContent).toContain('paid · awaiting the lab')
  })

  // D3 — the prototype's alert tile has four alarm signals. Around a 0 that is
  // a status that does not reflect reality.
  it('applies the alert treatment only when asked', () => {
    const quiet = render(<StatTile label="Needs attention" value={0} sub="amount mismatch — quarantined" />)
    expect(quiet.container.querySelector('.admin-tile')?.className).not.toContain('is-alert')
    cleanup()
    const loud = render(<StatTile label="Needs attention" value={1} sub="amount mismatch — quarantined" alert />)
    expect(loud.container.querySelector('.admin-tile')?.className).toContain('is-alert')
  })

  it('writes its label in sentence case, leaving uppercasing to CSS', () => {
    const { container } = render(<StatTile label="In the queue" value={0} sub="x" />)
    expect(container.querySelector('.admin-tile-label')?.textContent).toBe('In the queue')
  })
})

describe('QueueRow', () => {
  it('renders id, customer, fused works-and-date sub-line, and the PAID chip', () => {
    const { container } = render(<QueueRow order={ORDER} />)
    expect(container.querySelector('.admin-row-id')?.textContent).toBe('ab12cd34')
    expect(container.textContent).toContain('Maya Lindqvist')
    expect(container.querySelector('.admin-row-sub')?.textContent).toBe('2 works · 16 Jul')
    expect(container.querySelector('.admin-paid')?.textContent).toBe('PAID')
  })

  // D14 — JH-20260716-0042 has no backing column; inventing one would
  // fabricate the number Jon reconciles against Stripe.
  it('renders a uuid prefix, never a fabricated JH- order number', () => {
    const { container } = render(<QueueRow order={ORDER} />)
    expect(container.textContent).not.toContain('JH-')
  })

  it('pluralises the works count', () => {
    const one = render(<QueueRow order={{ ...ORDER, workCount: 1 }} />)
    expect(one.container.querySelector('.admin-row-sub')?.textContent).toContain('1 work ')
    cleanup()
    const none = render(<QueueRow order={{ ...ORDER, workCount: 0 }} />)
    expect(none.container.querySelector('.admin-row-sub')?.textContent).toContain('0 works')
  })

  it('falls back to the email when customer_name is null', () => {
    const { container } = render(<QueueRow order={{ ...ORDER, customer_name: null }} />)
    expect(container.querySelector('.admin-row-name')?.textContent).toBe('maya@example.com')
  })

  it('renders Copy for lab as a marked control, not a live button', () => {
    const { container } = render(<QueueRow order={ORDER} />)
    const button = container.querySelector('button')
    expect(button?.getAttribute('aria-disabled')).toBe('true')
    expect(button?.textContent).toContain('Copy for lab')
    expect(button?.textContent).toContain('NOT BUILT')
  })

  it('quarantines a held row with the paid-vs-expected line, in that order', () => {
    const { container } = render(
      <QueueRow held order={{ ...ORDER, status: 'amount_mismatch', amount_paid_cents: 550 }} />,
    )
    expect(container.querySelector('.admin-queue-row')?.className).toContain('admin-held')
    expect(container.querySelector('.admin-mismatch')?.textContent).toBe('MISMATCH')
    // Inverting these turns the quarantine line into a lie about which number
    // is real.
    expect(container.querySelector('.admin-held-line')?.textContent).toBe('paid $5.50 · expected $65')
  })

  it('renders Review as a marked control on a held row', () => {
    const { container } = render(
      <QueueRow held order={{ ...ORDER, status: 'amount_mismatch', amount_paid_cents: 550 }} />,
    )
    expect(container.textContent).toContain('Review')
    expect(container.querySelector('button')?.getAttribute('aria-disabled')).toBe('true')
  })
})
