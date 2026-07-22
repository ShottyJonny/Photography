import { render, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardResult, QueueOrder } from '@/lib/admin/dashboard'

const result: { value: DashboardResult } = { value: { ok: false } }
vi.mock('@/lib/admin/dashboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/dashboard')>()),
  getDashboard: async () => result.value,
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }))

const NOW = new Date('2026-07-16T20:00:00Z') // 4pm EDT — "Good afternoon"

function order(over: Partial<QueueOrder> = {}): QueueOrder {
  return {
    id: 'ab12cd34-5678-90ef-1234-567890abcdef',
    status: 'paid', created_at: '2026-07-16T20:00:00Z',
    customer_name: 'Maya Lindqvist', customer_email: 'maya@example.com',
    total_cents: 6500, amount_paid_cents: null, workCount: 2, ...over,
  }
}
function ok(over: Partial<Extract<DashboardResult, { ok: true }>> = {}): Extract<DashboardResult, { ok: true }> {
  return {
    ok: true,
    summary: {
      queueCount: 0, attentionCount: 0, publishedCount: 0, unlistedCount: 0,
      collectionCount: 0, featuredCollectionName: null,
    },
    queue: [], held: [], ...over,
  }
}
async function renderDash() {
  const Page = (await import('@/app/admin/(protected)/page')).default
  return render(await Page())
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => { cleanup(); result.value = { ok: false }; vi.useRealTimers() })

describe('the dashboard', () => {
  it('renders four tiles with live numbers', async () => {
    result.value = ok({
      summary: { queueCount: 3, attentionCount: 1, publishedCount: 16, unlistedCount: 2, collectionCount: 3, featuredCollectionName: 'Relics' },
    })
    const { container } = await renderDash()
    const tiles = container.querySelectorAll('.admin-tile')
    expect(tiles.length).toBe(4)
    const numbers = [...container.querySelectorAll('.admin-tile-number')].map((n) => n.textContent)
    expect(numbers).toEqual(['3', '1', '16', '3'])
    expect(container.textContent).toContain('Relics is featured')
    expect(container.textContent).toContain('2 unlisted')
  })

  it('reports no featured collection honestly', async () => {
    result.value = ok()
    const { container } = await renderDash()
    expect(container.textContent).toContain('no collection is featured')
  })

  // D3
  it('leaves the attention tile quiet at zero and lights it above zero', async () => {
    result.value = ok()
    const quiet = await renderDash()
    expect(quiet.container.querySelectorAll('.admin-tile.is-alert').length).toBe(0)
    cleanup()
    result.value = ok({ summary: { ...ok().summary, attentionCount: 1 }, held: [order({ status: 'amount_mismatch', amount_paid_cents: 550 })] })
    const loud = await renderDash()
    expect(loud.container.querySelectorAll('.admin-tile.is-alert').length).toBe(1)
  })

  // D15 — the state that would otherwise read "In the queue: 0" directly above
  // a visibly non-empty queue.
  it('separates held rows from the queue so the count and the list agree', async () => {
    result.value = ok({
      summary: { ...ok().summary, queueCount: 0, attentionCount: 1 },
      queue: [],
      held: [order({ status: 'amount_mismatch', amount_paid_cents: 550 })],
    })
    const { container } = await renderDash()
    expect(container.textContent).toContain('Held out of the queue')
    expect(container.textContent).toContain('Nothing awaiting the lab.')
    expect(container.querySelectorAll('.admin-held').length).toBe(1)
  })

  it('omits the held section entirely when there is nothing held', async () => {
    result.value = ok({ queue: [order()], summary: { ...ok().summary, queueCount: 1 } })
    const { container } = await renderDash()
    expect(container.textContent).not.toContain('Held out of the queue')
  })

  it('renders the right rail empty states from data, not from assumption', async () => {
    result.value = ok()
    const { container } = await renderDash()
    expect(container.textContent).toContain('No collection leads home yet.')
    expect(container.textContent).toContain('No photographs yet.')
  })

  // The populated branch had no test at all, which is how "Plates arrive in
  // slice 5" — roadmap jargon under a heading promising content — shipped.
  it('marks the recent-uploads rail rather than inventing copy when photos exist', async () => {
    result.value = ok({ summary: { ...ok().summary, publishedCount: 16, unlistedCount: 2 } })
    const { container } = await renderDash()
    expect(container.textContent).not.toContain('No photographs yet.')
    expect(container.textContent).not.toMatch(/slice \d/i)
    const rail = container.querySelectorAll('.admin-railcard')[1]
    expect(rail?.textContent).toContain('NOT BUILT')
  })

  it('names the featured collection in the rail once one exists', async () => {
    result.value = ok({ summary: { ...ok().summary, collectionCount: 1, featuredCollectionName: 'Relics' } })
    const { container } = await renderDash()
    expect(container.querySelector('.admin-railcard-name')?.textContent).toBe('Relics')
    expect(container.textContent).not.toContain('No collection leads home yet.')
  })

  // D7 — four tiles reading 0 when the read failed is a confident lie about an
  // empty business.
  it('renders the unreadable state with no numbers at all', async () => {
    result.value = { ok: false }
    const { container } = await renderDash()
    expect(container.textContent).toContain('Couldn’t read the studio data.')
    expect(container.querySelectorAll('.admin-tile').length).toBe(0)
    expect(container.textContent).not.toContain('Nothing awaiting the lab.')
  })

  it('computes the greeting and the kicker server-side', async () => {
    result.value = ok()
    const { container } = await renderDash()
    expect(container.textContent).toContain('Good afternoon, Jon.')
    expect(container.textContent).toContain('Thursday · 16 July 2026')
  })

  it('marks every control whose action lands in a later slice', async () => {
    result.value = ok({ queue: [order()], summary: { ...ok().summary, queueCount: 1 } })
    const { container } = await renderDash()
    expect(container.textContent).toContain('＋ Post a photo')
    expect(container.textContent).toContain('All orders →')
    expect(container.textContent).toContain('Change what leads home →')
    const focal = container.querySelector('a[href="/admin/home-feature"]')
    expect(focal?.textContent).toContain('Change what leads home →')
    // Every button on the surface is marked; none is live.
    const buttons = [...container.querySelectorAll('button')]
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) expect(b.getAttribute('aria-disabled')).toBe('true')
  })
})
