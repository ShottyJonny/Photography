'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatPrice } from '@/lib/format/price'
import { derivativeSrc } from '@/lib/images/derivatives'
import { copyableAddress } from '@/lib/orders/address'
import { CopyButton } from '@/components/admin/CopyButton'
import type { AdminOrderRow } from '@/lib/data/orders-admin'
import type { OrderStatus } from '@/lib/orders/query'

/** §11.1: a status always carries text. Colour never carries it alone. */
const CHIP: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: 'PENDING', className: 'admin-chip-status' },
  paid: { label: 'PAID', className: 'admin-paid' },
  amount_mismatch: { label: 'MISMATCH', className: 'admin-mismatch' },
  submitted_to_lab: { label: 'AT LAB', className: 'admin-chip-lab' },
  shipped: { label: 'SHIPPED', className: 'admin-chip-shipped' },
  cancelled: { label: 'CANCELLED', className: 'admin-chip-status' },
  refunded: { label: 'REFUNDED', className: 'admin-chip-status' },
}

const REGISTER: Record<'colour' | 'silver', string> = { colour: 'Colour', silver: 'Silver B&W' }

/** D14: no order-number column exists. The first 8 characters are what the
 *  queue shows and what Jon quotes back into the search box. */
function shortId(id: string): string {
  return id.slice(0, 8)
}

function OrderRow({ order, dateLabel }: { order: AdminOrderRow; dateLabel: string }) {
  const [open, setOpen] = useState(false)
  const held = order.status === 'amount_mismatch'
  const chip = CHIP[order.status]
  const works = order.items.reduce((sum, item) => sum + item.qty, 0)
  const panelId = `order-items-${order.id}`

  const copyText = [order.customer_name, copyableAddress(order.shipping_address)]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join('\n')

  return (
    <li className={held ? 'admin-ord-row admin-held' : 'admin-ord-row'}>
      <div className="admin-ord-rowmain">
        <div>
          <div className="admin-row-id">{shortId(order.id)}</div>
          <div className="admin-row-sub">{dateLabel}</div>
        </div>

        <div>
          <div className="admin-row-name">{order.customer_name ?? order.customer_email}</div>
          <div className="admin-row-sub">{order.customer_email}</div>
          {copyText ? <CopyButton text={copyText} label="⧉ Name + address" className="admin-ord-copy" /> : null}
          {held ? (
            <div className="admin-held-line">
              paid {formatPrice(order.amount_paid_cents ?? 0)} · expected {formatPrice(order.total_cents)}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="admin-ord-caret"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="admin-ord-thumbs" aria-hidden="true">
            {order.items.slice(0, 3).map((item) =>
              item.photoSlug ? (
                /* eslint-disable-next-line @next/next/no-img-element -- public derivative URL */
                <img
                  key={item.id}
                  className="admin-ord-thumb"
                  src={derivativeSrc(item.photoSlug, item.register, 160, 'webp')}
                  alt=""
                />
              ) : (
                // photo_id is `on delete set null`. The snapshot still says what
                // was bought; only the picture is gone.
                <span key={item.id} className="admin-ord-thumb is-empty" />
              ),
            )}
          </span>
          <span className="admin-ord-works">
            {works} {works === 1 ? 'work' : 'works'}
          </span>
          <span className={open ? 'admin-ord-chev is-open' : 'admin-ord-chev'} aria-hidden="true">⌄</span>
        </button>

        <div className="admin-ord-total">{formatPrice(order.total_cents)}</div>
        <span className={chip.className}>{chip.label}</span>
        <Link className="admin-ord-open" href={`/admin/orders/${order.id}`}>
          {held ? 'Review →' : 'Open →'}
        </Link>
      </div>

      {open ? (
        <ul className="admin-ord-items" id={panelId}>
          {order.items.length === 0 ? (
            <li className="admin-empty">No line items were recorded for this order.</li>
          ) : (
            order.items.map((item) => (
              <li key={item.id} className="admin-ord-item">
                {item.photoSlug ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- public derivative URL */
                  <img
                    className="admin-ord-itemthumb"
                    src={derivativeSrc(item.photoSlug, item.register, 160, 'webp')}
                    alt=""
                  />
                ) : (
                  <span className="admin-ord-itemthumb is-empty" />
                )}
                <span className="admin-ord-itemname">{item.title}</span>
                <span className="admin-ord-itemmeta">{item.size}</span>
                <span className="admin-ord-itemmeta">{REGISTER[item.register]}</span>
                <span className="admin-ord-itemmeta">
                  {item.qty} × {formatPrice(item.unit_cents)}
                </span>
                <span className="admin-ord-itemprice">{formatPrice(item.unit_cents * item.qty)}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </li>
  )
}

export function OrderRows({ orders, dateLabels }: { orders: AdminOrderRow[]; dateLabels: Record<string, string> }) {
  return (
    <ul className="admin-ord-list">
      {orders.map((order) => (
        <OrderRow key={order.id} order={order} dateLabel={dateLabels[order.id] ?? ''} />
      ))}
    </ul>
  )
}
