import { supabaseAdmin } from '@/lib/supabase/admin'
import { formatPrice } from '@/lib/format/price'

type OrderStatus = 'pending' | 'paid' | 'amount_mismatch' | 'submitted_to_lab' | 'shipped' | 'cancelled' | 'refunded'

type Order = {
  id: string
  status: OrderStatus
  created_at: string
  customer_name: string | null
  customer_email: string
  shipping_address: { name?: string; street?: string; city?: string; region?: string; postal_code?: string; country?: string }
  subtotal_cents: number
  shipping_cents: number
  tax_cents: number
  total_cents: number
  tracking_number: string | null
}
type Item = { title: string; size: string; register: string; qty: number; unit_cents: number }

// Honest status map (product.md §1). Active = not cancelled/refunded. The ship-window promise is
// gated to payment-confirmed states; pending/amount_mismatch get the reviewing note and never a
// 'paid' claim or a shipment.
const PAYMENT_CONFIRMED: OrderStatus[] = ['paid', 'submitted_to_lab', 'shipped']

function noteFor(status: OrderStatus): string {
  if (status === 'cancelled') return 'This order was cancelled.'
  if (status === 'refunded') return 'This order was refunded.'
  if (PAYMENT_CONFIRMED.includes(status)) {
    return 'Every print is made to order and typically ships within 5–7 days. Your receipt comes from Stripe. — Jon'
  }
  return "We\u2019ve received your order and are reviewing it. Your receipt comes from Stripe. — Jon"
}

export default async function OrderConfirmation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = supabaseAdmin()
  const { data: order } = await db
    .from('orders')
    .select('id, status, created_at, customer_name, customer_email, shipping_address, subtotal_cents, shipping_cents, tax_cents, total_cents, tracking_number')
    .eq('id', id)
    .single()

  if (!order) {
    return <main className="confirm"><p className="confirm-notfound">We couldn&rsquo;t find that order.</p></main>
  }

  const o = order as Order
  const { data: itemsData } = await db
    .from('order_items')
    .select('title, size, register, qty, unit_cents')
    .eq('order_id', id)
  const items = (itemsData ?? []) as Item[]

  const active = o.status !== 'cancelled' && o.status !== 'refunded'
  const a = o.shipping_address ?? {}

  return (
    <main className="confirm">
      <p className="confirm-id">{o.id}</p>
      <h1 className="confirm-h1">{active ? 'Thank you.' : 'Order update'}</h1>
      <p className="confirm-note">{noteFor(o.status)}</p>

      {/* product.md §6.1: shipped is the ONLY state that may show a tracking
          number, and only after a human entered a real one. No carrier, no
          "track your package" link — the schema records neither, and the
          legacy site's fabricated UPS numbers are the reason this rule exists.
          The customer gets no email, so this page is the only place it can
          reach them. */}
      {o.status === 'shipped' && o.tracking_number ? (
        <p className="confirm-tracking">Tracking: {o.tracking_number}</p>
      ) : null}

      <div className="confirm-cells">
        <section className="confirm-cell">
          <h2 className="confirm-cell-h">Shipping to</h2>
          <address className="confirm-address">
            {a.name && <span>{a.name}</span>}
            {a.street && <span>{a.street}</span>}
            <span>{[a.city, a.region, a.postal_code].filter(Boolean).join(', ')}</span>
            {a.country && <span>{a.country}</span>}
          </address>
        </section>

        <section className="confirm-cell">
          <h2 className="confirm-cell-h">Your works</h2>
          <ul className="confirm-works">
            {items.map((it, i) => (
              <li key={i}>
                <span>{it.title} · {it.size} · {it.register} × {it.qty}</span>
                <span>{formatPrice(it.unit_cents * it.qty)}</span>
              </li>
            ))}
          </ul>
          {o.status === 'amount_mismatch' ? (
            // A quarantined order was charged an amount that differs from total_cents, so we do NOT
            // present total_cents as the total — that would be a total-as-charged the customer may
            // not have paid (product.md §1). The Stripe receipt is the source of truth here.
            <p className="confirm-review">Your payment is being reviewed. Your Stripe receipt reflects the amount charged.</p>
          ) : (
            <dl className="confirm-totals">
              <div><dt>Subtotal</dt><dd>{formatPrice(o.subtotal_cents)}</dd></div>
              <div><dt>Shipping</dt><dd>{formatPrice(o.shipping_cents)}</dd></div>
              <div><dt>Tax</dt><dd>{formatPrice(o.tax_cents)}</dd></div>
              <div className="confirm-total"><dt>Total</dt><dd>{formatPrice(o.total_cents)}</dd></div>
            </dl>
          )}
        </section>
      </div>
    </main>
  )
}
