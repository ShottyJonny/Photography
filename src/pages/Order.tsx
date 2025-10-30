import React from 'react'
import LinkButton from '../components/LinkButton'
import { useCart } from '../context/CartContext'

export default function Order({ id }: { id: string }) {
  const [order, setOrder] = React.useState<any | null>(null)
  const [shipped, setShipped] = React.useState(false)
  const [tracking, setTracking] = React.useState<string | null>(null)
  const { clear } = useCart()
  
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('orders:v1')
      const list = raw ? (JSON.parse(raw) as any[]) : []
      const foundOrder = list.find(o => o.id === id) || null
      setOrder(foundOrder)
      
      // Clear cart when viewing a successful order (user returned from Stripe)
      if (foundOrder) {
        clear()
      }
    } catch {
      setOrder(null)
    }
  }, [id, clear])
  React.useEffect(() => {
    // small delay to simulate fulfillment system update
    const t = window.setTimeout(() => {
      setShipped(true)
      setTracking(genTracking())
    }, 900)
    return () => window.clearTimeout(t)
  }, [id])
  if (!order) return (
    <div className="order">
      <h2>Thank you for your order!</h2>
      <p>Your payment has been processed successfully.</p>
      <div className="about" style={{marginTop: 16, marginBottom: 16}}>
        <section>
          <p><strong>Order ID:</strong> {id}</p>
          <p>We've sent a confirmation email with your order details and will notify you when your prints are ready to ship.</p>
          <p style={{fontSize:'.85rem', opacity: 0.7, marginTop: 12}}>
            If you need to reference this order later, please save this Order ID: <strong>{id}</strong>
          </p>
        </section>
      </div>
      <LinkButton className="button" to="/shop">Continue Shopping</LinkButton>
    </div>
  )

  const email = order.customerBilling?.email || order.customerShipping?.email
  const pay = order.payment as undefined | { status: string, method: string, brand?: string, last4?: string, transactionId?: string }
  const totals = order.totals as { subtotal:number, shipping:number, tax:number, total:number }

  return (
    <div className="order">
      <h2>Thank you for your order</h2>
      <p>Order ID: <strong>{order.id}</strong></p>
      <p>We sent a confirmation to {email}. You’ll receive shipping updates soon.</p>
  <p style={{fontSize:'.75rem',opacity:.7}}>Totals include estimated tax and shipping based on the information provided at checkout.</p>
      {shipped && (
        <div className="about" style={{marginTop:8}}>
          <section>
            <strong>Shipped</strong> — Track your package: <a href="#" onClick={e => e.preventDefault()}>{tracking}</a>
          </section>
        </div>
      )}

      <div className="order-grid">
        <section className="order-section">
          <h3>Items</h3>
          <ul className="summary-list">
    {(order.items || []).map((it: any, idx: number) => (
              <li key={idx} className="summary-line">
                <div className="info">
                  <div className="name">{it.name}</div>
                  <div className="meta">Size: {it.size} • Qty: {it.qty}</div>
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
          <h3>Payment</h3>
          {pay ? (
            <div className="payment-summary">
              <div>Paid by {pay.brand || 'Card'} • **** {pay.last4 || '0000'}</div>
              {pay.transactionId && <div className="muted">Transaction: {pay.transactionId}</div>}
              <div className="muted">Status: {pay.status}</div>
            </div>
          ) : (
            <div className="payment-summary">Paid</div>
          )}
          <h3>Shipping</h3>
          <address className="addr">
            {order.customerShipping?.name}<br/>
            {order.customerShipping?.address1}{order.customerShipping?.address2 ? <><br/>{order.customerShipping.address2}</> : null}<br/>
            {order.customerShipping?.city}, {order.customerShipping?.region} {order.customerShipping?.postal}<br/>
            {order.customerShipping?.country}
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

function genTracking(){
  return `1Z${Math.random().toString(36).slice(2,6).toUpperCase()}${Date.now().toString(36).toUpperCase().slice(-8)}`
}
