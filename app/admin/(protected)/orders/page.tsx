import { listOrders, LIST_CAP } from '@/lib/data/orders-admin'
import { formatRowDate } from '@/lib/admin/dates'
import { isOrderTab, TABS, type OrderTab } from '@/lib/orders/query'
import { OrderTabs } from '@/components/admin/OrderTabs'
import { OrderRows } from '@/components/admin/OrderRows'

export const dynamic = 'force-dynamic'

const EMPTY: Record<OrderTab, string> = {
  queue: 'Nothing awaiting the lab.',
  lab: 'Nothing is at the lab.',
  attention: 'No order needs attention.',
  shipped: 'Nothing shipped yet.',
  all: 'No orders yet.',
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>
}) {
  const params = await searchParams
  // An unknown ?tab= is junk, not an error worth a page for. Fall back to the
  // work queue, which is the default view (product.md §6.4).
  const tab: OrderTab = isOrderTab(params.tab) ? params.tab : 'queue'
  const query = params.q ?? ''

  // listOrders() calls requireAdmin() as its first statement — the boundary
  // lives in the data-access layer, never in a layout.
  const result = await listOrders({ tab, query })

  if (!result) {
    return (
      <>
        <div className="admin-band">
          <div>
            <p className="admin-band-kicker">Fulfillment</p>
            <h1 className="admin-band-h1">Orders</h1>
          </div>
        </div>
        {/* 4b D7: an empty table here would be a confident lie about an empty
            business. Nothing is shown rather than guessed. */}
        <p className="admin-empty admin-ord-pad">
          Couldn&rsquo;t read the orders. Nothing is shown rather than guessed.
        </p>
      </>
    )
  }

  const { rows, counts, truncated } = result
  const label = TABS.find((t) => t.key === tab)!.label
  // Dates are formatted here: lib/admin/dates.ts is server-only, and a client
  // new Date() would hydrate-mismatch the server's render.
  const dateLabels = Object.fromEntries(rows.map((o) => [o.id, formatRowDate(new Date(o.created_at))]))

  return (
    <>
      <div className="admin-band">
        <div>
          <p className="admin-band-kicker">Fulfillment</p>
          <h1 className="admin-band-h1">Orders</h1>
          <p className="admin-meta">
            {counts.all} {counts.all === 1 ? 'order' : 'orders'} · {label.toLowerCase()}
          </p>
        </div>
      </div>

      <div className="admin-ord-pad">
        <OrderTabs tab={tab} query={query} counts={counts} />

        {/* product.md §6.3: a mismatch is surfaced, never silently queued —
            the failure mode is shipping $65 of prints for $5.50. The banner
            shows on every tab, not just its own. */}
        {counts.attention > 0 && tab !== 'attention' ? (
          <p className="admin-ord-banner" role="status">
            {counts.attention} {counts.attention === 1 ? 'order is' : 'orders are'} held out of the queue —
            the amount paid does not match the order. See Needs attention.
          </p>
        ) : null}

        {truncated ? (
          <p className="admin-ord-note">Showing the first {LIST_CAP} orders.</p>
        ) : null}

        {rows.length === 0 ? (
          <p className="admin-empty">
            {query
              ? truncated
                // A partial search only sees the rows that were read. Claiming
                // "no match" outright would be a claim about orders this page
                // never looked at.
                ? `No order matches that search in the first ${LIST_CAP}. Search a full order id to look across every order.`
                : 'No order matches that search.'
              : EMPTY[tab]}
          </p>
        ) : (
          <>
            <div className="admin-ord-head" aria-hidden="true">
              <span>Order</span>
              <span>Customer</span>
              <span>Works</span>
              <span>Total</span>
              <span>Status</span>
              <span />
            </div>
            <OrderRows orders={rows} dateLabels={dateLabels} />
          </>
        )}
      </div>
    </>
  )
}
