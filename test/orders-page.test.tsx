import { render, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrderListResult } from '@/lib/data/orders-admin'

const result: { value: OrderListResult | null } = { value: null }
const lastCall: { tab?: string; query?: string } = {}

vi.mock('@/lib/data/orders-admin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/data/orders-admin')>('@/lib/data/orders-admin')
  return {
    LIST_CAP: 200,
    listOrders: async (input: { tab: string; query: string }) => {
      lastCall.tab = input.tab
      lastCall.query = input.query
      return result.value
    },
    getOrderForFulfillment: actual.getOrderForFulfillment,
  }
})
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin: async () => ({ id: 'admin' }) }))
vi.mock('@/lib/supabase/auth-server', () => ({ createAuthServerClient: async () => ({}) }))

const order = (over: Record<string, unknown> = {}) => ({
  id: '8f14e45f-ceea-467a-9b3a-2c4f7a5d1e02',
  status: 'paid' as const,
  created_at: '2026-07-16T14:30:00.000Z',
  customer_name: 'Jane Marsh',
  customer_email: 'jane@example.com',
  shipping_address: { name: 'Jane Marsh' },
  total_cents: 6500,
  amount_paid_cents: null,
  tracking_number: null,
  items: [],
  ...over,
})

const counts = (over: Partial<Record<string, number>> = {}) => ({
  queue: 1, lab: 0, attention: 0, shipped: 0, all: 1, ...over,
}) as OrderListResult['counts']

async function renderPage(params: { tab?: string; q?: string } = {}) {
  const Page = (await import('@/app/admin/(protected)/orders/page')).default
  return render(await Page({ searchParams: Promise.resolve(params) }))
}

beforeEach(() => {
  result.value = { rows: [order()], counts: counts(), truncated: false }
  delete lastCall.tab
  delete lastCall.query
})
afterEach(cleanup)

describe('the orders queue', () => {
  it('renders the five tabs with their counts', async () => {
    result.value = { rows: [], counts: counts({ queue: 2, lab: 1, attention: 1, shipped: 3, all: 7 }), truncated: false }
    const { container } = await renderPage()
    const tabs = [...container.querySelectorAll('.admin-ord-tab')].map((t) => t.textContent?.replace(/\s+/g, ' ').trim())
    expect(tabs).toEqual(['Queue 2', 'At the lab 1', 'Needs attention 1', 'Shipped 3', 'All 7'])
  })

  it('defaults to the work queue', async () => {
    await renderPage()
    expect(lastCall.tab).toBe('queue')
  })

  it('falls back to the queue for an unknown tab rather than erroring', async () => {
    await renderPage({ tab: 'nonsense' })
    expect(lastCall.tab).toBe('queue')
  })

  it('honours a real tab and passes the search through', async () => {
    await renderPage({ tab: 'shipped', q: 'jane@' })
    expect(lastCall.tab).toBe('shipped')
    expect(lastCall.query).toBe('jane@')
  })

  // 4b D7: an empty table would be a confident lie about an empty business.
  it('says the read failed instead of showing no orders', async () => {
    result.value = null
    const { container } = await renderPage()
    expect(container.textContent).toContain('Couldn’t read the orders')
    expect(container.querySelector('.admin-ord-list')).toBeNull()
  })

  it('uses a per-tab empty line when there is genuinely nothing', async () => {
    result.value = { rows: [], counts: counts({ queue: 0, all: 0 }), truncated: false }
    const { container } = await renderPage()
    expect(container.textContent).toContain('Nothing awaiting the lab.')
  })

  it('says no match when a search comes back empty', async () => {
    result.value = { rows: [], counts: counts(), truncated: false }
    const { container } = await renderPage({ q: 'nobody' })
    expect(container.textContent).toContain('No order matches that search.')
  })

  // A partial search only sees the rows that were read, so a flat "no match"
  // would be a claim about orders this page never looked at.
  it('bounds the no-match claim to what it actually searched', async () => {
    result.value = { rows: [], counts: counts(), truncated: true }
    const { container } = await renderPage({ q: 'nobody' })
    expect(container.textContent).toContain('No order matches that search in the first 200.')
    expect(container.textContent).toContain('Search a full order id')
  })

  // A cap that truncates silently hides a real order behind a page that looks
  // complete.
  it('admits when the list was truncated', async () => {
    result.value = { rows: [order()], counts: counts(), truncated: true }
    const { container } = await renderPage()
    expect(container.textContent).toContain('Showing the first 200 orders.')
  })

  // product.md §6.3: a mismatch is surfaced, never silently queued.
  it('banners a quarantined order on every other tab', async () => {
    result.value = { rows: [order()], counts: counts({ attention: 1, all: 2 }), truncated: false }
    const { container } = await renderPage()
    expect(container.querySelector('.admin-ord-banner')?.textContent).toContain('held out of the queue')
  })

  it('drops the banner on the Needs attention tab, where the rows are', async () => {
    result.value = { rows: [order({ status: 'amount_mismatch', amount_paid_cents: 550 })], counts: counts({ attention: 1 }), truncated: false }
    const { container } = await renderPage({ tab: 'attention' })
    expect(container.querySelector('.admin-ord-banner')).toBeNull()
  })

  it('keeps the search form on a GET so the queue works without JavaScript', async () => {
    const { container } = await renderPage()
    const form = container.querySelector('form.admin-ord-search')
    expect(form?.getAttribute('method')).toBe('get')
    expect(form?.getAttribute('action')).toBe('/admin/orders')
  })
})
