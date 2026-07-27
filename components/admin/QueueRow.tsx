import Link from 'next/link'
import { formatPrice } from '@/lib/format/price'
import { formatRowDate } from '@/lib/admin/dates'
import type { QueueOrder } from '@/lib/admin/dashboard'

/**
 * D14 — schema.sql has no order-number column. §11.4-E's JH-20260716-0042 is a
 * design fiction; deriving one from created_at plus an invented counter would
 * fabricate the field Jon uses to reconcile a row against Stripe.
 */
function shortId(id: string): string {
  return id.slice(0, 8)
}

export function QueueRow({ order, held = false }: { order: QueueOrder; held?: boolean }) {
  const works = `${order.workCount} ${order.workCount === 1 ? 'work' : 'works'}`
  const date = formatRowDate(new Date(order.created_at))

  return (
    <li className={held ? 'admin-queue-row admin-held' : 'admin-queue-row'}>
      <span className="admin-row-id">{shortId(order.id)}</span>

      <div>
        {/* customer_name is nullable in schema.sql. */}
        <div className="admin-row-name">{order.customer_name ?? order.customer_email}</div>
        <div className="admin-row-sub">{works} · {date}</div>
        {held ? (
          <div className="admin-held-line">
            paid {formatPrice(order.amount_paid_cents ?? 0)} · expected {formatPrice(order.total_cents)}
          </div>
        ) : null}
      </div>

      {held ? (
        // §11.1: every status carries a text label, never colour alone.
        <span className="admin-mismatch">MISMATCH</span>
      ) : (
        <span className="admin-paid">PAID</span>
      )}

      {/* §11.4-A's "Copy for lab" ghost button is a link instead: copying a
          block the row does not show is a control whose output you cannot
          check before pasting it into a real order form. The block lives on
          the order, directly under a Copy button. */}
      <Link className="admin-ord-open" href={`/admin/orders/${order.id}`}>
        {held ? 'Review →' : 'Open →'}
      </Link>
    </li>
  )
}
