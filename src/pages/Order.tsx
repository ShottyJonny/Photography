import React from 'react'
import LinkButton from '../components/LinkButton'
import { useCart } from '../context/CartContext'
import { getOrder } from '../services/supabase'

type LoadState = 'loading' | 'found' | 'not-found'

function loadFromLocalStorage(id: string): any | null {
  try {
    const raw = localStorage.getItem('orders:v1')
    const list = raw ? (JSON.parse(raw) as any[]) : []
    return list.find(o => o.id === id) || null
  } catch {
    return null
  }
}

export default function Order({ id }: { id: string }) {
  const [order, setOrder] = React.useState<any | null>(null)
  const [state, setState] = React.useState<LoadState>('loading')
  const { clear } = useCart()

  React.useEffect(() => {
    let cancelled = false
    setState('loading')
    setOrder(null)

    async function load() {
      // Primary path: fetch the real order from Supabase.
      let found: any = null
      try {
        found = await getOrder(id)
      } catch (err) {
        console.error('Failed to fetch order from Supabase:', err)
      }

      // Offline/fallback path: only used if Supabase couldn't return the order
      // (e.g. the earlier save failed and Checkout fell back to localStorage).
      if (!found) {
        found = loadFromLocalStorage(id)
      }

      if (cancelled) return
      setOrder(found)
      setState(found ? 'found' : 'not-found')

      // Clear cart once we know a real order exists for this id (user returned from Stripe)
      if (found) clear()
    }

    load()

    return () => {
      cancelled = true
    }
  }, [id, clear])

  if (state === 'loading') {
    return (
      <div className="order">
        <h2>Loading your order…</h2>
        <p>Order ID: <strong>{id}</strong></p>
      </div>
    )
  }

  if (state === 'not-found' || !order) {
    return (
      <div className="order">
        <h2>Thank you for your order!</h2>
        <p>Your payment has been processed successfully.</p>
        <div className="about" style={{marginTop: 16, marginBottom: 16}}>
          <section>
            <p><strong>Order ID:</strong> {id}</p>
            <p>Stripe will email you a payment receipt. We'll notify you when your prints are ready to ship.</p>
            <p style={{fontSize:'.85rem', opacity: 0.7, marginTop: 12}}>
              If you need to reference this order later, please save this Order ID: <strong>{id}</strong>
            </p>
          </section>
        </div>
        <LinkButton className="button" to="/shop">Continue Shopping</LinkButton>
      </div>
    )
  }

  const email = order.customer_email
  const shipping = order.shipping_address || {}
  const totals = order.totals || { subtotal: 0, shipping: 0, tax: 0, total: 0 }
  const status = order.status || 'pending'

  return (
    <div className="order">
      <h2>Thank you for your order</h2>
      <p>Order ID: <strong>{order.id}</strong></p>
      <p>Stripe will email a payment receipt to {email}. We'll notify you when your prints are ready to ship.</p>
      <p style={{fontSize:'.75rem',opacity:.7}}>Totals include estimated tax and shipping based on the information provided at checkout.</p>

      <div className="about" style={{marginTop:8}}>
        <section>
          <strong>Status:</strong> {statusLabel(status)}
        </section>
      </div>

      <div className="order-grid">
        <section className="order-section">
          <h3>Items</h3>
          <ul className="summary-list">
            {(order.items || []).map((it: any, idx: number) => (
              <li key={idx} className="summary-line">
                <div className="info">
                  <div className="name">{it.name}</div>
                  <div className="meta">Size: {it.size}{it.blackAndWhite ? ' • B&W' : ''} • Qty: {it.qty}</div>
                </div>
                <div className="price">{fmt(it.unit)} x {it.qty}</div>
              </li>
            ))}
          </ul>
          <div className="totals">
            <div><span>Subtotal</span><span>{fmt(totals.subtotal)}</span></div>
            <div><span>Shipping</span><span>{fmt(totals.shipping)}</span></div>
            <div><span>Tax</span><span>{fmt(totals.tax)}</span></div>
            <div className="grand"><span>Total</span><span>{fmt(totals.total)}</span></div>
          </div>
        </section>
        <section className="order-section">
          <h3>Shipping</h3>
          <address className="addr">
            {shipping.name}<br/>
            {shipping.address1}{shipping.address2 ? <><br/>{shipping.address2}</> : null}<br/>
            {shipping.city}, {shipping.region} {shipping.postal}<br/>
            {shipping.country}
          </address>
        </section>
      </div>

      <div style={{marginTop:12}}>
        <LinkButton className="button" to="/shop">Continue Shopping</LinkButton>
      </div>
    </div>
  )
}

function fmt(cents: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function statusLabel(status: string) {
  switch (status) {
    case 'pending': return 'Processing — we’ve received your order'
    case 'completed': return 'Payment received — preparing for shipment'
    case 'payment_failed':
    case 'failed': return 'Payment failed'
    case 'expired': return 'Payment session expired'
    case 'shipped': return 'Shipped'
    default: return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')
  }
}
