import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getOrderForFulfillment } from '@/lib/data/orders-admin'
import { formatKicker } from '@/lib/admin/dates'
import { formatPrice } from '@/lib/format/price'
import { addressLines, copyableAddress } from '@/lib/orders/address'
import { buildLabExport, DEFAULT_FINISH } from '@/lib/orders/lab-export'
import { CopyButton } from '@/components/admin/CopyButton'
import { LabExport } from '@/components/admin/LabExport'
import { FulfillmentRail } from '@/components/admin/FulfillmentRail'
import type { OrderStatus } from '@/lib/orders/query'

export const dynamic = 'force-dynamic'

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

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // getOrderForFulfillment() calls requireAdmin() first.
  const order = await getOrderForFulfillment(id)
  if (!order) notFound()

  const finish = order.lab_finish?.trim() || DEFAULT_FINISH
  const block = buildLabExport({
    id: order.id,
    created_at: order.created_at,
    email: order.customer_email,
    address: order.shipping_address,
    items: order.items,
    finish,
  })
  const chip = CHIP[order.status]
  const lines = addressLines(order.shipping_address)

  return (
    <>
      <div className="admin-band">
        <div>
          <p className="admin-band-kicker">
            <Link className="admin-ord-crumb" href="/admin/orders">Orders</Link> / {order.id.slice(0, 8)}
          </p>
          <h1 className="admin-band-h1">{order.customer_name ?? order.customer_email}</h1>
          {/* The full uuid, not a fabricated order number (D14) — this is what
              the customer quotes and what reconciles against Stripe. */}
          <p className="admin-ord-uuid">{order.id}</p>
          <p className="admin-meta">{formatKicker(new Date(order.created_at))}</p>
          {order.stripe_payment_intent_id ? (
            <p className="admin-ord-pi">Stripe payment intent · {order.stripe_payment_intent_id}</p>
          ) : null}
        </div>
        <div className="admin-ord-headright">
          <span className={chip.className}>{chip.label}</span>
          <p className="admin-ord-total">{formatPrice(order.total_cents)}</p>
          {order.status === 'amount_mismatch' ? (
            <p className="admin-held-line">
              paid {formatPrice(order.amount_paid_cents ?? 0)} · expected {formatPrice(order.total_cents)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="admin-ord-detail">
        <div>
          <section className="admin-ord-panel">
            <div className="admin-ord-cell">
              <h2 className="admin-sectionhead">Ship to</h2>
              {lines.length === 0 ? (
                <p className="admin-empty">No shipping address was recorded.</p>
              ) : (
                <address className="admin-ord-address">
                  {lines.map((line) => <span key={line}>{line}</span>)}
                </address>
              )}
              <div className="admin-ord-copyrow">
                {lines.length > 0 ? (
                  <CopyButton text={copyableAddress(order.shipping_address)} label="⧉ Copy address" />
                ) : null}
                {order.customer_name ? (
                  <CopyButton text={order.customer_name} label="⧉ Copy name" />
                ) : null}
              </div>
            </div>

            <div className="admin-ord-cell">
              <h2 className="admin-sectionhead">Contact</h2>
              <p className="admin-ord-email">{order.customer_email}</p>
              <p className="admin-ord-note">
                {/* product.md §1: the system sends no email. Saying otherwise
                    here would put a claim in front of the one person who could
                    act on it. */}
                The customer&rsquo;s only receipt is Stripe&rsquo;s. Nothing is emailed from here.
              </p>
            </div>
          </section>

          <section className="admin-ord-lines" aria-labelledby="lines-head">
            <h2 className="admin-sectionhead" id="lines-head">Works</h2>
            <ul className="admin-ord-linelist">
              {order.items.map((item) => {
                const signed = order.signedOriginals[item.id] ?? null
                return (
                  <li key={item.id} className="admin-ord-line">
                    <span className="admin-ord-itemname">{item.title}</span>
                    <span className="admin-ord-itemmeta">
                      {item.size} · {REGISTER[item.register]} · {finish} · ×{item.qty}
                    </span>
                    <span className="admin-ord-itemprice">{formatPrice(item.unit_cents * item.qty)}</span>
                    {signed ? (
                      // Fulfillment pulls the ORIGINAL, never a derivative
                      // (product.md §3, §6.2). Signed here, valid for an hour.
                      <a className="admin-ord-download" href={signed}>↓ original</a>
                    ) : (
                      <span className="admin-ord-missing">original not available</span>
                    )}
                  </li>
                )
              })}
            </ul>
            <dl className="admin-ord-totals">
              <div><dt>Subtotal</dt><dd>{formatPrice(order.subtotal_cents)}</dd></div>
              <div><dt>Shipping</dt><dd>{formatPrice(order.shipping_cents)}</dd></div>
              <div><dt>Tax</dt><dd>{formatPrice(order.tax_cents)}</dd></div>
              <div className="admin-ord-grand"><dt>Total</dt><dd>{formatPrice(order.total_cents)}</dd></div>
            </dl>
          </section>
        </div>

        <div className="admin-ord-side">
          <LabExport orderId={order.id} block={block} finish={finish} />
          <FulfillmentRail
            orderId={order.id}
            status={order.status}
            submittedLabel={
              order.submitted_to_lab_at ? formatKicker(new Date(order.submitted_to_lab_at)) : null
            }
            shippedLabel={order.shipped_at ? formatKicker(new Date(order.shipped_at)) : null}
            trackingNumber={order.tracking_number}
          />
        </div>
      </div>
    </>
  )
}
