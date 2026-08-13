/**
 * Tab predicates and search for the orders queue (DESIGN.md §11.4-D).
 *
 * Pure, and shared by the read and the surface deliberately: a tab's COUNT and
 * a tab's ROWS are derived from the same predicate here, so the number on a tab
 * cannot disagree with what clicking it shows.
 */

export type OrderStatus =
  | 'pending' | 'paid' | 'amount_mismatch' | 'submitted_to_lab'
  | 'shipped' | 'cancelled' | 'refunded'

export type OrderTab = 'queue' | 'lab' | 'attention' | 'shipped' | 'all'

export interface TabSpec {
  key: OrderTab
  label: string
  /** null = no status filter (All). */
  statuses: OrderStatus[] | null
  oldestFirst: boolean
}

/**
 * FIVE tabs, not §11.4-D's four.
 *
 * The handoff's set (Queue · Needs attention · Shipped · All) strands
 * `submitted_to_lab`: an order at the lab is no longer `paid` and not yet
 * `shipped`, so it would appear nowhere but All — at the exact point in
 * fulfillment Jon most needs to see it.
 *
 * Queue stays EXACTLY `paid` (product.md §6.4) so it keeps matching the
 * dashboard's "In the queue" tile, which counts `paid` only.
 */
export const TABS: TabSpec[] = [
  { key: 'queue',     label: 'Queue',          statuses: ['paid'],            oldestFirst: true },
  { key: 'lab',       label: 'At the lab',     statuses: ['submitted_to_lab'], oldestFirst: true },
  { key: 'attention', label: 'Needs attention', statuses: ['amount_mismatch'], oldestFirst: true },
  { key: 'shipped',   label: 'Shipped',        statuses: ['shipped'],         oldestFirst: false },
  { key: 'all',       label: 'All',            statuses: null,                oldestFirst: false },
]

export function statusesForTab(tab: OrderTab): OrderStatus[] | null {
  return TABS.find((t) => t.key === tab)?.statuses ?? null
}

export function isOrderTab(value: string | undefined | null): value is OrderTab {
  return typeof value === 'string' && TABS.some((t) => t.key === value)
}

export type TabCounts = Record<OrderTab, number>

interface Searchable {
  id: string
  customer_email: string
  customer_name: string | null
}

const strip = (value: string): string => value.replace(/-/g, '').toLowerCase()

/**
 * product.md §6.4: "Search by order id or email — the customer's only receipt
 * is Stripe's, so the id is what they will quote."
 *
 * In memory, not in Postgres: PostgREST cannot prefix-match a uuid column
 * without a cast, and the id in hand is usually the 8-character prefix the
 * queue rendered. The read caps its fetch and the surface says when it did, so
 * this filter is bounded and its bound is visible.
 *
 * The id matches by PREFIX (a fragment from the middle is not an id anyone
 * quotes); email and name match by substring.
 */
export function filterOrders<T extends Searchable>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (q === '') return rows

  const idQuery = strip(q)
  return rows.filter((row) =>
    strip(row.id).startsWith(idQuery) ||
    row.customer_email.toLowerCase().includes(q) ||
    (row.customer_name ?? '').toLowerCase().includes(q),
  )
}
