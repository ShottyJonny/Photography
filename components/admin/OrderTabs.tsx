import Link from 'next/link'
import { TABS, type OrderTab, type TabCounts } from '@/lib/orders/query'

/**
 * Tabs and search, both driven by the URL — plain links and a GET form, so the
 * queue is linkable, back-button-able, and works with JavaScript off. No client
 * state, so this stays a server component.
 */
export function OrderTabs({
  tab,
  query,
  counts,
}: {
  tab: OrderTab
  query: string
  counts: TabCounts
}) {
  return (
    <div className="admin-ord-tabbar">
      <nav className="admin-ord-tabs" aria-label="Order views">
        {TABS.map((spec) => {
          const href = query
            ? `/admin/orders?tab=${spec.key}&q=${encodeURIComponent(query)}`
            : `/admin/orders?tab=${spec.key}`
          const active = spec.key === tab
          return (
            <Link
              key={spec.key}
              href={href}
              className={active ? 'admin-ord-tab is-active' : 'admin-ord-tab'}
              aria-current={active ? 'page' : undefined}
            >
              {spec.label} <span className="admin-ord-tabcount">{counts[spec.key]}</span>
            </Link>
          )
        })}
      </nav>

      <form className="admin-ord-search" action="/admin/orders" method="get">
        <input type="hidden" name="tab" value={tab} />
        <label className="admin-sr-only" htmlFor="order-search">Search orders</label>
        <input
          id="order-search"
          name="q"
          defaultValue={query}
          className="admin-ord-searchinput"
          placeholder="Order id or email"
        />
        <button type="submit" className="admin-ghost">Search</button>
        {query ? (
          <Link className="admin-ord-clear" href={`/admin/orders?tab=${tab}`}>Clear</Link>
        ) : null}
      </form>
    </div>
  )
}
