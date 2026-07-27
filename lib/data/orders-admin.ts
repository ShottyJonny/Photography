import 'server-only'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import { countsByTab, filterOrders, statusesForTab, TABS, type OrderStatus, type OrderTab, type TabCounts } from '@/lib/orders/query'
import type { StoredAddress } from '@/lib/orders/address'

/**
 * Order reads for the admin (design.md §11.4-D/E).
 *
 * These run as the LOGGED-IN USER through createAuthServerClient(), so
 * schema.sql's `orders_admin_all` / `order_items_admin_all` policies are what
 * authorize them. The service key stays confined to the three sessionless
 * paths (/api/checkout, /api/stripe-webhook, /order/[id]) — an admin surface
 * that bypassed RLS would make those policies decorative.
 *
 * null from any read means it FAILED. Empty means there is nothing. The
 * surfaces must not collapse the two (slice 4b D7).
 */

/** The read is bounded, and the surface says so when it hits this. A silent
 *  truncation would let a real order be invisible on a page that looks whole. */
export const LIST_CAP = 200

/** Signed originals expire; one hour is long enough to fulfil an order and
 *  short enough that a leaked URL is not a standing key to a private bucket. */
export const SIGNED_URL_TTL_SECONDS = 3600

export interface AdminOrderItem {
  id: string
  title: string
  size: string
  register: 'colour' | 'silver'
  qty: number
  unit_cents: number
  original_key: string | null
  /** Soft join for the thumbnail. null when the photo was deleted
   *  (order_items.photo_id is `on delete set null`) — the snapshot still
   *  describes what was bought; only the picture is gone. */
  photoSlug: string | null
}

export interface AdminOrderRow {
  id: string
  status: OrderStatus
  created_at: string
  customer_name: string | null
  customer_email: string
  shipping_address: StoredAddress | null
  total_cents: number
  amount_paid_cents: number | null
  tracking_number: string | null
  items: AdminOrderItem[]
}

export interface OrderListResult {
  rows: AdminOrderRow[]
  counts: TabCounts
  truncated: boolean
}

export interface AdminOrderDetail extends AdminOrderRow {
  subtotal_cents: number
  shipping_cents: number
  tax_cents: number
  stripe_payment_intent_id: string | null
  submitted_to_lab_at: string | null
  shipped_at: string | null
  lab_finish: string | null
  notes: string | null
  /** item id -> signed URL, or null when there is no key or signing failed. */
  signedOriginals: Record<string, string | null>
}

const ROW_COLS =
  'id, status, created_at, customer_name, customer_email, shipping_address, total_cents, amount_paid_cents, tracking_number'

const DETAIL_COLS =
  `${ROW_COLS}, subtotal_cents, shipping_cents, tax_cents, stripe_payment_intent_id, submitted_to_lab_at, shipped_at, lab_finish, notes`

const ITEM_COLS = 'id, order_id, title, size, register, qty, unit_cents, original_key, photos(slug)'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** PostgREST returns an embedded to-one relation as an object, but types it
 *  loosely enough that an array shows up under some select shapes. */
function slugOf(row: any): string | null {
  const photos = row?.photos
  if (!photos) return null
  return (Array.isArray(photos) ? photos[0]?.slug : photos.slug) ?? null
}

function toItem(row: any): AdminOrderItem {
  return {
    id: row.id,
    title: row.title,
    size: row.size,
    register: row.register,
    qty: row.qty,
    unit_cents: row.unit_cents,
    original_key: row.original_key ?? null,
    photoSlug: slugOf(row),
  }
}

async function itemsByOrder(
  db: any,
  orderIds: string[],
): Promise<Map<string, AdminOrderItem[]> | null> {
  if (orderIds.length === 0) return new Map()
  // ONE read for the whole page, grouped in JS. A per-row read would be N+1
  // against a queue that exists to be scanned top-to-bottom.
  const { data, error } = await db.from('order_items').select(ITEM_COLS).in('order_id', orderIds)
  if (error) {
    console.error('[admin] order items read failed', error)
    return null
  }
  const grouped = new Map<string, AdminOrderItem[]>()
  for (const row of (data as any[]) ?? []) {
    const list = grouped.get(row.order_id) ?? []
    list.push(toItem(row))
    grouped.set(row.order_id, list)
  }
  return grouped
}

export async function listOrders(input: { tab: OrderTab; query: string }): Promise<OrderListResult | null> {
  await requireAdmin()
  const db = await createAuthServerClient()

  // 1. Counts, from every order's status. Cheap, and it guarantees a tab's
  //    number and its contents come from the same predicates (lib/orders/query).
  const { data: statusRows, error: statusErr } = await db.from('orders').select('status')
  if (statusErr) {
    console.error('[admin] listOrders counts failed', statusErr)
    return null
  }
  const counts = countsByTab(((statusRows as { status: OrderStatus }[]) ?? []).map((r) => r.status))

  // 2. The tab's rows, capped at LIST_CAP + 1 so truncation is detectable.
  const statuses = statusesForTab(input.tab)
  const oldestFirst = TABS.find((t) => t.key === input.tab)?.oldestFirst ?? true
  let listQuery = db.from('orders').select(ROW_COLS)
  if (statuses) listQuery = listQuery.in('status', statuses)
  const { data: orderRows, error: listErr } = await listQuery
    .order('created_at', { ascending: oldestFirst })
    .limit(LIST_CAP + 1)
  if (listErr) {
    console.error('[admin] listOrders failed', listErr)
    return null
  }

  const all = ((orderRows as any[]) ?? [])
  const truncated = all.length > LIST_CAP
  const page = truncated ? all.slice(0, LIST_CAP) : all

  // 3. Items for exactly the rows on this page.
  const grouped = await itemsByOrder(db, page.map((o) => o.id as string))
  if (!grouped) return null

  const rows: AdminOrderRow[] = page.map((o) => ({
    id: o.id,
    status: o.status,
    created_at: o.created_at,
    customer_name: o.customer_name ?? null,
    customer_email: o.customer_email,
    shipping_address: (o.shipping_address ?? null) as StoredAddress | null,
    total_cents: o.total_cents,
    amount_paid_cents: o.amount_paid_cents ?? null,
    tracking_number: o.tracking_number ?? null,
    items: grouped.get(o.id) ?? [],
  }))

  // 4. Search last, in memory — see lib/orders/query.filterOrders.
  return { rows: filterOrders(rows, input.query), counts, truncated }
}

export async function getOrderForFulfillment(id: string): Promise<AdminOrderDetail | null> {
  await requireAdmin()
  const db = await createAuthServerClient()

  const { data: order, error } = await db.from('orders').select(DETAIL_COLS).eq('id', id).maybeSingle()
  if (error) {
    console.error('[admin] getOrderForFulfillment failed', error)
    return null
  }
  if (!order) return null

  const grouped = await itemsByOrder(db, [id])
  if (!grouped) return null
  const items = grouped.get(id) ?? []

  // Signed URLs are minted here, per render, and deliberately do NOT go into
  // the lab export block (spec decision 4): the block is pasted into Nations'
  // form and may sit for hours, and an expired link inside a document Jon
  // trusts is worse than no link.
  const signedOriginals: Record<string, string | null> = {}
  for (const item of items) {
    if (!item.original_key) {
      signedOriginals[item.id] = null
      continue
    }
    try {
      const { data: signed, error: signErr } = await db.storage
        .from('originals')
        .createSignedUrl(item.original_key, SIGNED_URL_TTL_SECONDS)
      if (signErr) console.error('[admin] signing original failed', item.original_key, signErr)
      signedOriginals[item.id] = signed?.signedUrl ?? null
    } catch (err) {
      // A storage outage must not take the fulfillment page down with it —
      // the export block and the rail are still usable without the link.
      console.error('[admin] signing original threw', item.original_key, err)
      signedOriginals[item.id] = null
    }
  }

  const o = order as any
  return {
    id: o.id,
    status: o.status,
    created_at: o.created_at,
    customer_name: o.customer_name ?? null,
    customer_email: o.customer_email,
    shipping_address: (o.shipping_address ?? null) as StoredAddress | null,
    total_cents: o.total_cents,
    amount_paid_cents: o.amount_paid_cents ?? null,
    tracking_number: o.tracking_number ?? null,
    subtotal_cents: o.subtotal_cents,
    shipping_cents: o.shipping_cents,
    tax_cents: o.tax_cents,
    stripe_payment_intent_id: o.stripe_payment_intent_id ?? null,
    submitted_to_lab_at: o.submitted_to_lab_at ?? null,
    shipped_at: o.shipped_at ?? null,
    lab_finish: o.lab_finish ?? null,
    notes: o.notes ?? null,
    items,
    signedOriginals,
  }
}
