import React from 'react'
import { useCart } from '../context/CartContext'
import { usePricing, priceForSize } from '../context/PricingContext'
import { products } from '../data/products'
import LinkButton from '../components/LinkButton'
import { estimateShipping, estimateTaxRate } from '../utils/taxShipping'
import { saveOrder, supabase } from '../services/supabase'

type ShippingForm = {
  name: string
  email: string
  address1: string
  address2: string
  city: string
  region: string
  postal: string
  country: string
  notes: string
  promoAgree: boolean
  newsletterOptIn: boolean
}

export default function Checkout() {
  const { priced } = usePricing()
  const { items } = useCart()
  const [ship, setShip] = React.useState<ShippingForm>({
    name: '', email: '', address1: '', address2: '', city: '', region: '', postal: '', 
    country: 'United States', notes: '', promoAgree: false, newsletterOptIn: false
  })
  const [shipErrors, setShipErrors] = React.useState<Record<string, string>>({})
  const [placing, setPlacing] = React.useState(false)

  const lines = items.map(ci => {
    const p = (priced.find(x => x.id === ci.id) || products.find(x => x.id === ci.id))!
    const unit = priceForSize((ci.size as any) || '4x6')
    return { ci, p, unit }
  })

  const subtotal = lines.reduce((sum, l) => sum + l.unit * l.ci.qty, 0)
  const taxRate = React.useMemo(() => estimateTaxRate(ship.country, ship.region), [ship.country, ship.region])
  const shippingEst = React.useMemo(() => estimateShipping(subtotal, ship.country), [subtotal, ship.country])
  const tax = Math.round(subtotal * taxRate.rate)
  const total = subtotal + shippingEst.cost + tax

  const onShip = (k: keyof ShippingForm, v: string | boolean) => setShip(prev => ({ ...prev, [k]: v as any }))

  const validateShip = () => {
    const e: Record<string, string> = {}
    if (!ship.name.trim()) e.name = 'Required'
    if (!ship.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ship.email)) e.email = 'Valid email required'
    if (!ship.address1.trim()) e.address1 = 'Required'
    if (!ship.city.trim()) e.city = 'Required'
    if (!ship.region.trim()) e.region = 'Required'
    if (!ship.postal.trim()) e.postal = 'Required'
    if (!ship.country.trim()) e.country = 'Required'
    setShipErrors(e)
    return Object.keys(e).length === 0
  }

  const placeOrder = async () => {
    if (items.length === 0) return
    if (!validateShip()) return
    
    setPlacing(true)
    const orderId = genId()
    
    try {
      const order = {
        id: orderId,
        created_at: new Date().toISOString(),
        customer_email: ship.email,
        customer_name: ship.name,
        shipping_address: {
          name: ship.name,
          email: ship.email,
          address1: ship.address1,
          address2: ship.address2,
          city: ship.city,
          region: ship.region,
          postal: ship.postal,
          country: ship.country,
          notes: ship.notes,
        },
        items: lines.map(l => ({ 
          id: l.p.id, 
          name: l.p.name, 
          size: l.ci.size || '4x6', 
          qty: l.ci.qty, 
          unit: l.unit 
        })),
        totals: { 
          subtotal, 
          shipping: shippingEst.cost, 
          tax, 
          total 
        },
        status: 'pending',
        marketing: {
          promoAgree: ship.promoAgree,
          newsletterOptIn: ship.newsletterOptIn,
        }
      }
      
      try {
        await saveOrder(order)
      } catch (dbError) {
        console.error('Database save failed:', dbError)
        const raw = localStorage.getItem('orders:v1')
        const list = raw ? (JSON.parse(raw) as any[]) : []
        list.push(order)
        localStorage.setItem('orders:v1', JSON.stringify(list))
      }
      
      const response = await fetch('/.netlify/functions/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: order.items,
          orderId: order.id,
          customerEmail: ship.email,
          customerName: ship.name,
          totals: {
            shipping: shippingEst.cost,
            tax: tax,
            total: total
          }
        }),
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to create checkout session')
      }
      
      const { url, sessionId } = await response.json()
      
      if (!url) {
        throw new Error('No checkout URL returned from server')
      }
      
      // Store session ID for potential error tracking
      sessionStorage.setItem('stripe_session_id', sessionId)
      sessionStorage.setItem('pending_order_id', order.id)
      
      window.location.href = url
      
    } catch (error) {
      console.error('Checkout error:', error)
      
      // More specific error messages
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      
      alert(`Payment processing error: ${errorMessage}\n\nYour order has been saved and you can try again. If the problem persists, please contact support with order ID: ${orderId}`)
      
      setPlacing(false)
      
      // Update order status to 'payment_failed' in Supabase
      try {
        await supabase
          .from('orders')
          .update({ 
            status: 'payment_failed',
            metadata: { error: errorMessage }
          })
          .eq('id', orderId)
      } catch (dbError) {
        console.error('Failed to update order status:', dbError)
      }
    }
  }

  if (items.length === 0) return (
    <div>
      <h2>Checkout</h2>
      <p>Your cart is empty.</p>
      <LinkButton className="button" to="/shop">Go to Shop</LinkButton>
    </div>
  )

  return (
    <div className="checkout">
      <h2>Checkout</h2>
      <div className="checkout-grid">
        <section className="checkout-form">
          <h3>Shipping information</h3>
          <div className="form-grid">
            <div className="field full">
              <label>Name</label>
              <input value={ship.name} onChange={e => onShip('name', e.target.value)} />
              {shipErrors.name && <span className="error">{shipErrors.name}</span>}
            </div>
            <div className="field full">
              <label>Email</label>
              <input type="email" value={ship.email} onChange={e => onShip('email', e.target.value)} />
              {shipErrors.email && <span className="error">{shipErrors.email}</span>}
            </div>
            <div className="field full">
              <label>Address</label>
              <input value={ship.address1} onChange={e => onShip('address1', e.target.value)} />
              {shipErrors.address1 && <span className="error">{shipErrors.address1}</span>}
            </div>
            <div className="field full">
              <label>Address 2 (optional)</label>
              <input value={ship.address2} onChange={e => onShip('address2', e.target.value)} />
            </div>
            <div className="field">
              <label>City</label>
              <input value={ship.city} onChange={e => onShip('city', e.target.value)} />
              {shipErrors.city && <span className="error">{shipErrors.city}</span>}
            </div>
            <div className="field">
              <label>State/Province</label>
              <input value={ship.region} onChange={e => onShip('region', e.target.value)} />
              {shipErrors.region && <span className="error">{shipErrors.region}</span>}
            </div>
            <div className="field">
              <label>Postal code</label>
              <input value={ship.postal} onChange={e => onShip('postal', e.target.value)} />
              {shipErrors.postal && <span className="error">{shipErrors.postal}</span>}
            </div>
            <div className="field">
              <label>Country</label>
              <input value={ship.country} onChange={e => onShip('country', e.target.value)} />
              {shipErrors.country && <span className="error">{shipErrors.country}</span>}
            </div>
            <div className="field full">
              <label>Notes (optional)</label>
              <textarea rows={3} value={ship.notes} onChange={e => onShip('notes', e.target.value)} />
            </div>
            <div className="field full">
              <label>Preferences</label>
              <div className="checklist">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={ship.promoAgree}
                    onChange={e => onShip('promoAgree', e.currentTarget.checked)}
                  />
                  <span>I agree to receive occasional promotional emails.</span>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={ship.newsletterOptIn}
                    onChange={e => onShip('newsletterOptIn', e.currentTarget.checked)}
                  />
                  <span>Add me to the newsletter.</span>
                </label>
              </div>
            </div>
          </div>
          <div style={{marginTop:16}}>
            <p style={{fontSize:'.9rem', opacity:.8, marginBottom:12}}>
               Payment will be securely processed by Stripe on the next page.
            </p>
            <div style={{display:'flex', gap:8}}>
              <button className="button" disabled={placing} onClick={placeOrder}>
                {placing ? 'Processing' : 'Continue to Payment'}
              </button>
              <LinkButton className="button" to="/cart">Back to Cart</LinkButton>
            </div>
          </div>
        </section>
        <section className="checkout-summary">
          <h3>Order summary</h3>
          <ul className="summary-list">
            {lines.map(({ ci, p, unit }) => (
              <li key={ci.uid as any} className="summary-line">
                <img src={p.thumbnail || p.image} alt="" />
                <div className="info">
                  <div className="name">{p.name}</div>
                  <div className="meta">Size: {ci.size || '4x6'}</div>
                </div>
                <div className="price">{fmt(unit)} x {ci.qty}</div>
              </li>
            ))}
          </ul>
          <div className="totals">
            <div><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
            <div><span>Shipping</span><span>{fmt(shippingEst.cost)}</span></div>
            <div><span>Tax{taxRate.rate > 0 ? ` (${(taxRate.rate*100).toFixed(2)}%)` : ''}</span><span>{fmt(tax)}</span></div>
            <div className="grand"><span>Total</span><span>{fmt(total)}</span></div>
            <div style={{fontSize:'.7rem', opacity:.75, marginTop:2, lineHeight:1.2}}>
              {shippingEst.note && <div>{shippingEst.note}</div>}
              {taxRate.note && <div>{taxRate.note}</div>}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function fmt(cents: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function genId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try { return (crypto as any).randomUUID() } catch {}
  }
  return `o_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
