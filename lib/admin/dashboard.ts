import 'server-only'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

export type OrderRow = {
  id: string
  status: 'paid' | 'amount_mismatch'
  created_at: string
  customer_name: string | null      // schema.sql: nullable
  customer_email: string
  total_cents: number
  amount_paid_cents: number | null  // non-null iff amount_mismatch (schema constraint)
  order_items: { count: number }[]  // PostgREST returns an ARRAY, not a scalar
}

export type QueueOrder = Omit<OrderRow, 'order_items'> & { workCount: number }

export type DashboardData = {
  orders: OrderRow[]
  publishedCount: number
  unlistedCount: number
  collections: { name: string; featured_on_home: boolean }[]
}

export type Summary = {
  queueCount: number       // paid ONLY
  attentionCount: number   // amount_mismatch ONLY
  publishedCount: number
  unlistedCount: number
  collectionCount: number
  featuredCollectionName: string | null
}

export type DashboardResult =
  | { ok: true; summary: Summary; queue: QueueOrder[]; held: QueueOrder[] }
  | { ok: false }

const ORDER_COLUMNS =
  'id, status, created_at, customer_name, customer_email, total_cents, amount_paid_cents, order_items(count)'

function toQueueOrder({ order_items, ...rest }: OrderRow): QueueOrder {
  // order_items is [{ count: n }] — reading .count off the array yields undefined
  // and renders a blank works count.
  return { ...rest, workCount: order_items?.[0]?.count ?? 0 }
}

/** Pure. No client, no clock, no I/O. */
export function summarize(data: DashboardData): {
  summary: Summary
  queue: QueueOrder[]
  held: QueueOrder[]
} {
  const all = data.orders.map(toQueueOrder)
  const queue = all.filter((o) => o.status === 'paid')
  const held = all.filter((o) => o.status === 'amount_mismatch')
  const featured = data.collections.find((c) => c.featured_on_home)

  return {
    summary: {
      // product.md §6.3: mismatches are EXCLUDED from the queue count. The
      // failure mode is shipping $65 of prints for $5.50.
      queueCount: queue.length,
      attentionCount: held.length,
      publishedCount: data.publishedCount,
      unlistedCount: data.unlistedCount,
      collectionCount: data.collections.length,
      featuredCollectionName: featured?.name ?? null,
    },
    queue,
    held,
  }
}

/**
 * requireAdmin() is the FIRST statement, not decoration: an RLS denial returns
 * zero rows with NO error, so the error channel cannot detect a wrong-identity
 * read. Only the caller's identity assertion can.
 */
export async function getDashboard(): Promise<DashboardResult> {
  await requireAdmin()

  const db = await createAuthServerClient()
  const [orders, published, unlisted, collections] = await Promise.all([
    db.from('orders').select(ORDER_COLUMNS)
      .in('status', ['paid', 'amount_mismatch'])
      .order('created_at', { ascending: true }),          // §6.4: oldest first
    db.from('photos').select('id', { count: 'exact', head: true }).eq('published', true),
    db.from('photos').select('id', { count: 'exact', head: true }).eq('published', false),
    db.from('collections').select('name, featured_on_home'),
  ])

  // Keyed on `error`, NEVER on `data`: head:true returns data:null on SUCCESS,
  // so a falsy-data check would report "unreadable" on every healthy request.
  const failure =
    orders.error ?? published.error ?? unlisted.error ?? collections.error ??
    (published.count === null || unlisted.count === null ? { message: 'count unavailable' } : null)

  if (failure) {
    // Logged server-side only. A PostgREST error carries message/details/hint
    // that can include column names and SQL fragments, and a Server Component's
    // return value is serialized to the client.
    console.error('[admin-dashboard] read failed', failure)
    return { ok: false }
  }

  // Any single failure collapses the whole result: a partially-readable
  // dashboard is harder to reason about than an honestly unreadable one, and
  // D7's claim is that a tile never shows a number it did not receive.
  const { summary, queue, held } = summarize({
    orders: (orders.data ?? []) as OrderRow[],
    publishedCount: published.count ?? 0,
    unlistedCount: unlisted.count ?? 0,
    collections: (collections.data ?? []) as DashboardData['collections'],
  })

  return { ok: true, summary, queue, held }
}
