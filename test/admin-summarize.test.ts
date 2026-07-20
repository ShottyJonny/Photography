import { describe, it, expect } from 'vitest'
import { summarize, type DashboardData } from '@/lib/admin/dashboard'

function order(over: Partial<DashboardData['orders'][number]> = {}) {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    status: 'paid' as const,
    created_at: '2026-07-16T20:00:00Z',
    customer_name: 'Maya Lindqvist',
    customer_email: 'maya@example.com',
    total_cents: 6500,
    amount_paid_cents: null,
    order_items: [{ count: 2 }],
    ...over,
  }
}
const EMPTY: DashboardData = { orders: [], publishedCount: 0, unlistedCount: 0, collections: [] }

describe('summarize', () => {
  // product.md §6.3 — the failure mode is shipping $65 of prints for $5.50.
  it('excludes amount_mismatch from the queue count', () => {
    const { summary } = summarize({
      ...EMPTY,
      orders: [
        order(),
        order({ id: 'b', status: 'amount_mismatch', amount_paid_cents: 550 }),
        order({ id: 'c' }),
      ],
    })
    expect(summary.queueCount).toBe(2)
    expect(summary.attentionCount).toBe(1)
  })

  it('splits the rows into queue and held, keeping both', () => {
    const { queue, held } = summarize({
      ...EMPTY,
      orders: [order({ id: 'a' }), order({ id: 'b', status: 'amount_mismatch', amount_paid_cents: 550 })],
    })
    expect(queue.map((o) => o.id)).toEqual(['a'])
    expect(held.map((o) => o.id)).toEqual(['b'])
  })

  it('reads workCount out of the embedded array, not a scalar', () => {
    const { queue } = summarize({ ...EMPTY, orders: [order({ order_items: [{ count: 3 }] })] })
    expect(queue[0].workCount).toBe(3)
  })

  it('survives an empty or missing order_items embed', () => {
    const { queue } = summarize({ ...EMPTY, orders: [order({ order_items: [] })] })
    expect(queue[0].workCount).toBe(0)
  })

  it('carries nullable customer_name and amount_paid_cents through untouched', () => {
    const { queue } = summarize({ ...EMPTY, orders: [order({ customer_name: null })] })
    expect(queue[0].customer_name).toBeNull()
    expect(queue[0].amount_paid_cents).toBeNull()
  })

  it('names the featured collection, or reports none', () => {
    const none = summarize({ ...EMPTY, collections: [{ name: 'Relics', featured_on_home: false }] })
    expect(none.summary.featuredCollectionName).toBeNull()
    expect(none.summary.collectionCount).toBe(1)

    const one = summarize({
      ...EMPTY,
      collections: [{ name: 'Relics', featured_on_home: true }, { name: 'Tide', featured_on_home: false }],
    })
    expect(one.summary.featuredCollectionName).toBe('Relics')
    expect(one.summary.collectionCount).toBe(2)
  })

  it('passes the photo counts straight through', () => {
    const { summary } = summarize({ ...EMPTY, publishedCount: 16, unlistedCount: 2 })
    expect(summary.publishedCount).toBe(16)
    expect(summary.unlistedCount).toBe(2)
  })

  it('produces an all-zero summary for an empty database without erroring', () => {
    const { summary, queue, held } = summarize(EMPTY)
    expect(summary.queueCount).toBe(0)
    expect(queue).toEqual([])
    expect(held).toEqual([])
  })
})
