import { describe, it, expect } from 'vitest'
import {
  TABS, statusesForTab, isOrderTab, countsByTab, filterOrders, type OrderTab,
} from '@/lib/orders/query'

const row = (id: string, email: string, name: string | null = null) => ({
  id, customer_email: email, customer_name: name,
})

const ROWS = [
  row('8f14e45f-ceea-467a-9b3a-2c4f7a5d1e02', 'jane@example.com', 'Jane Marsh'),
  row('1a2b3c4d-0000-4000-8000-000000000001', 'sam@elsewhere.org', 'Sam Okonkwo'),
  row('deadbeef-0000-4000-8000-000000000002', 'jane@other.net', null),
]

describe('the tabs', () => {
  it('has the five the surface renders, in order', () => {
    expect(TABS.map((t) => t.key)).toEqual(['queue', 'lab', 'attention', 'shipped', 'all'])
  })

  // product.md §6.4 defines the queue as `paid`, oldest first, and the
  // dashboard tile counts `paid` only. Widening it here would contradict a
  // number one click away.
  it('keeps Queue to exactly paid', () => {
    expect(statusesForTab('queue')).toEqual(['paid'])
  })

  // design.md §11.4-D's four tabs strand this state: not paid, not shipped,
  // so it would show up nowhere but All.
  it('gives submitted_to_lab its own tab', () => {
    expect(statusesForTab('lab')).toEqual(['submitted_to_lab'])
    expect(statusesForTab('queue')).not.toContain('submitted_to_lab')
    expect(statusesForTab('shipped')).not.toContain('submitted_to_lab')
  })

  it('quarantines amount_mismatch into Needs attention alone', () => {
    expect(statusesForTab('attention')).toEqual(['amount_mismatch'])
    for (const tab of ['queue', 'lab', 'shipped'] as OrderTab[]) {
      expect(statusesForTab(tab)).not.toContain('amount_mismatch')
    }
  })

  it('filters nothing on All', () => {
    expect(statusesForTab('all')).toBeNull()
  })

  it('sorts the working tabs oldest-first and the settled ones newest-first', () => {
    expect(TABS.find((t) => t.key === 'queue')!.oldestFirst).toBe(true)
    expect(TABS.find((t) => t.key === 'lab')!.oldestFirst).toBe(true)
    expect(TABS.find((t) => t.key === 'attention')!.oldestFirst).toBe(true)
    expect(TABS.find((t) => t.key === 'shipped')!.oldestFirst).toBe(false)
    expect(TABS.find((t) => t.key === 'all')!.oldestFirst).toBe(false)
  })
})

describe('isOrderTab', () => {
  it('accepts the five keys and rejects everything else', () => {
    for (const t of ['queue', 'lab', 'attention', 'shipped', 'all']) expect(isOrderTab(t)).toBe(true)
    for (const t of ['Queue', 'paid', '', 'drop table', undefined]) expect(isOrderTab(t)).toBe(false)
  })
})

describe('countsByTab', () => {
  it('counts each tab from the same predicates the rows use', () => {
    const counts = countsByTab([
      'paid', 'paid', 'submitted_to_lab', 'amount_mismatch', 'shipped', 'pending', 'refunded',
    ])
    expect(counts).toEqual({ queue: 2, lab: 1, attention: 1, shipped: 1, all: 7 })
  })

  it('excludes a mismatch from the queue count (product.md §6.3)', () => {
    // The failure mode this guards is shipping $65 of prints for $5.50.
    expect(countsByTab(['paid', 'amount_mismatch']).queue).toBe(1)
  })

  it('is all zeroes for no orders', () => {
    expect(countsByTab([])).toEqual({ queue: 0, lab: 0, attention: 0, shipped: 0, all: 0 })
  })
})

describe('filterOrders', () => {
  it('returns every row, in order, for an empty or whitespace query', () => {
    expect(filterOrders(ROWS, '')).toEqual(ROWS)
    expect(filterOrders(ROWS, '   ')).toEqual(ROWS)
  })

  // The id Jon has in hand is the 8-character prefix the queue showed him.
  it('matches an id by prefix', () => {
    expect(filterOrders(ROWS, '8f14e45f').map((r) => r.id)).toEqual([ROWS[0].id])
  })

  it('ignores case and hyphens in an id prefix', () => {
    expect(filterOrders(ROWS, '8F14E45F-CEEA')).toHaveLength(1)
    expect(filterOrders(ROWS, '8f14e45fceea')).toHaveLength(1)
  })

  it('does not match an id fragment from the middle', () => {
    expect(filterOrders(ROWS, 'ceea')).toEqual([])
  })

  it('matches an email substring', () => {
    expect(filterOrders(ROWS, 'jane@').map((r) => r.id)).toEqual([ROWS[0].id, ROWS[2].id])
    expect(filterOrders(ROWS, 'elsewhere').map((r) => r.id)).toEqual([ROWS[1].id])
  })

  it('matches a customer name, case-insensitively', () => {
    expect(filterOrders(ROWS, 'okonkwo').map((r) => r.id)).toEqual([ROWS[1].id])
  })

  it('tolerates a null customer name', () => {
    expect(() => filterOrders(ROWS, 'jane')).not.toThrow()
  })

  it('returns nothing rather than everything when there is no match', () => {
    expect(filterOrders(ROWS, 'nobody')).toEqual([])
  })
})
