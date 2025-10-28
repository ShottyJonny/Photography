import React from 'react'
import { useCart } from '../context/CartContext'
import { usePricing, priceForSize } from '../context/PricingContext'
import { products } from '../data/products'
import LinkButton from '../components/LinkButton'
import { estimateShipping, estimateTaxRate } from '../utils/taxShipping'
import { sendOrderNotification, type OrderData } from '../services/emailService'

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
  shipping: 'standard'
  promoAgree: boolean
  newsletterOptIn: boolean
}

type BillingForm = {
  name: string
  email: string
  address1: string
  address2: string
  city: string
  region: string
  postal: string
  country: string
  cardName: string
  cardNumber: string
  cardExp: string
  cardCvc: string
}

export default function Checkout() {
  const { priced } = usePricing()
  const { items, clear } = useCart()
  const [tab, setTab] = React.useState<'shipping' | 'billing'>('shipping')
  const [ship, setShip] = React.useState<ShippingForm>({
  name: '', email: '', address1: '', address2: '', city: '', region: '', postal: '', country: 'United States', notes: '', shipping: 'standard', promoAgree: false, newsletterOptIn: false
  })
  const [bill, setBill] = React.useState<BillingForm>({
  name: '', email: '', address1: '', address2: '', city: '', region: '', postal: '', country: 'United States', cardName: '', cardNumber: '', cardExp: '', cardCvc: ''
  })
  const [shipErrors, setShipErrors] = React.useState<Record<string, string>>({})
  const [billErrors, setBillErrors] = React.useState<Record<string, string>>({})
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
  const onBill = (k: keyof BillingForm, v: string) => setBill(prev => ({ ...prev, [k]: v }))

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

  const validateBill = () => {
    const e: Record<string, string> = {}
    if (!bill.name.trim()) e.name = 'Required'
    if (!bill.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(bill.email)) e.email = 'Valid email required'
    if (!bill.address1.trim()) e.address1 = 'Required'
    if (!bill.city.trim()) e.city = 'Required'
    if (!bill.region.trim()) e.region = 'Required'
    if (!bill.postal.trim()) e.postal = 'Required'
    if (!bill.country.trim()) e.country = 'Required'
    if (!bill.cardName.trim()) e.cardName = 'Required'
    const digits = bill.cardNumber.replace(/\D/g, '')
    if (digits.length < 13 || digits.length > 19 || !luhn(digits)) e.cardNumber = 'Invalid card number'
    const exp = bill.cardExp.trim()
    if (!/^\d{2}\s*\/\s*\d{2,4}$/.test(exp)) e.cardExp = 'MM/YY'
    else {
      const [mmStr, yyStr] = exp.split('/') as [string, string]
      const mm = Number(mmStr.trim())
      const yy = Number(yyStr.trim().slice(-2))
      if (mm < 1 || mm > 12) e.cardExp = 'Invalid month'
      else {
        const now = new Date()
        const curYY = Number(String(now.getFullYear()).slice(-2))
        const curMM = now.getMonth() + 1
        if (yy < curYY || (yy === curYY && mm < curMM)) e.cardExp = 'Expired'
      }
    }
    if (!/^\d{3,4}$/.test(bill.cardCvc.trim())) e.cardCvc = '3–4 digits'
    setBillErrors(e)
    return Object.keys(e).length === 0
  }

  const placeOrder = async () => {
  if (items.length === 0) return
  const okShip = validateShip()
  const okBill = validateBill()
  if (!okShip || !okBill) { if (!okShip) setTab('shipping'); else if (!okBill) setTab('billing'); return }
    setPlacing(true)
    try {
      const orderId = genId()
      const digitsForSave = bill.cardNumber.replace(/\D/g, '')
      const payment = {
        status: 'paid' as const,
        method: 'card' as const,
        brand: detectCardBrand(digitsForSave),
        last4: digitsForSave.slice(-4),
        transactionId: genPaymentId(),
      }
      const order = {
        id: orderId,
        createdAt: new Date().toISOString(),
    customerShipping: { ...ship },
        customerBilling: {
          name: bill.name,
          email: bill.email,
          address1: bill.address1,
          address2: bill.address2,
          city: bill.city,
          region: bill.region,
          postal: bill.postal,
          country: bill.country,
        },
        payment,
        marketing: {
          promoAgree: ship.promoAgree,
          newsletterOptIn: ship.newsletterOptIn,
        },
  items: lines.map(l => ({ id: l.p.id, name: l.p.name, size: l.ci.size || '4x6', qty: l.ci.qty, unit: l.unit })),
  totals: { subtotal, shipping: shippingEst.cost, tax, total }
      }
      
      // Save to localStorage
      const raw = localStorage.getItem('orders:v1')
      const list = raw ? (JSON.parse(raw) as any[]) : []
      list.push(order)
      localStorage.setItem('orders:v1', JSON.stringify(list))

      // Send emails
      try {
        // Send single notification email to you with all order details
        await sendOrderNotification(order as OrderData)
      } catch (emailError) {
        console.error('Email sending failed:', emailError)
        // Continue with order processing even if email fails
        // You can manually check orders in localStorage if needed
      }
      
      clear()
      window.location.hash = `/order/${orderId}`
    } finally {
      setPlacing(false)
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
      <div className="tabs">
        <div role="tablist" className="tablist" aria-label="Customer info">
          <button role="tab" aria-selected={tab==='shipping'} className={tab==='shipping'?'tab active':'tab'} onClick={() => setTab('shipping')}>Shipping</button>
          <button role="tab" aria-selected={tab==='billing'} className={tab==='billing'?'tab active':'tab'} onClick={() => setTab('billing')}>Billing</button>
        </div>
      </div>
      <div className="checkout-grid">
        <section className="checkout-form">
          {tab === 'shipping' ? (
            <>
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
                  <label>Delivery method</label>
                  <div className="radio-row">
                    <label className="radio selected">
                      <input type="radio" name="shipmethod" checked readOnly />
                      <span>Standard (10–12 days) — $9.95</span>
                    </label>
                  </div>
                </div>
                <div className="field full">
                  <label>Notes (optional)</label>
                  <textarea rows={3} value={ship.notes} onChange={e => onShip('notes', e.target.value)} />
                </div>
              </div>
            </>
          ) : (
            <>
              <h3>Billing information</h3>
              <div className="form-grid">
                <div className="field full">
                  <label>Name</label>
                  <input value={bill.name} onChange={e => onBill('name', e.target.value)} />
                  {billErrors.name && <span className="error">{billErrors.name}</span>}
                </div>
                <div className="field full">
                  <label>Email</label>
                  <input type="email" value={bill.email} onChange={e => onBill('email', e.target.value)} />
                  {billErrors.email && <span className="error">{billErrors.email}</span>}
                </div>
                <div className="field full">
                  <label>Address</label>
                  <input value={bill.address1} onChange={e => onBill('address1', e.target.value)} />
                  {billErrors.address1 && <span className="error">{billErrors.address1}</span>}
                </div>
                <div className="field full">
                  <label>Address 2 (optional)</label>
                  <input value={bill.address2} onChange={e => onBill('address2', e.target.value)} />
                </div>
                <div className="field">
                  <label>City</label>
                  <input value={bill.city} onChange={e => onBill('city', e.target.value)} />
                  {billErrors.city && <span className="error">{billErrors.city}</span>}
                </div>
                <div className="field">
                  <label>State/Province</label>
                  <input value={bill.region} onChange={e => onBill('region', e.target.value)} />
                  {billErrors.region && <span className="error">{billErrors.region}</span>}
                </div>
                <div className="field">
                  <label>Postal code</label>
                  <input value={bill.postal} onChange={e => onBill('postal', e.target.value)} />
                  {billErrors.postal && <span className="error">{billErrors.postal}</span>}
                </div>
                <div className="field">
                  <label>Country</label>
                  <input value={bill.country} onChange={e => onBill('country', e.target.value)} />
                  {billErrors.country && <span className="error">{billErrors.country}</span>}
                </div>
                <div className="field full">
                  <label>Name on card</label>
                  <input placeholder="Jane Q. Doe" value={bill.cardName} onChange={e => onBill('cardName', e.target.value)} />
                  {billErrors.cardName && <span className="error">{billErrors.cardName}</span>}
                </div>
                <div className="field full">
                  <label>Card number</label>
                  <input inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242"
                    value={bill.cardNumber}
                    onChange={e => onBill('cardNumber', formatCardNumber(e.target.value))} />
                  {billErrors.cardNumber && <span className="error">{billErrors.cardNumber}</span>}
                </div>
                <div className="field">
                  <label>Expiration (MM/YY)</label>
                  <input inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY"
                    value={bill.cardExp}
                    onChange={e => onBill('cardExp', formatExpiry(e.target.value))} />
                  {billErrors.cardExp && <span className="error">{billErrors.cardExp}</span>}
                </div>
                <div className="field">
                  <label>CVC</label>
                  <input inputMode="numeric" autoComplete="cc-csc" placeholder="123"
                    value={bill.cardCvc}
                    onChange={e => onBill('cardCvc', e.target.value.replace(/\D/g, '').slice(0,4))} />
                  {billErrors.cardCvc && <span className="error">{billErrors.cardCvc}</span>}
                </div>
                <div className="field full" style={{display:'flex', gap:8}}>
                  <button type="button" className="button" onClick={() => setBill({
                    name: ship.name,
                    email: ship.email,
                    address1: ship.address1,
                    address2: ship.address2,
                    city: ship.city,
                    region: ship.region,
                    postal: ship.postal,
                    country: ship.country,
                    cardName: bill.cardName,
                    cardNumber: bill.cardNumber,
                    cardExp: bill.cardExp,
                    cardCvc: bill.cardCvc,
                  })}>Copy from Shipping</button>
                </div>
              </div>
            </>
          )}
          <div style={{marginTop:12, display:'flex', gap:8}}>
            <button className="button" disabled={placing} onClick={placeOrder}>{placing ? 'Placing…' : 'Place Order'}</button>
            <LinkButton className="button" to="/cart">Back to Cart</LinkButton>
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

// helpers
function luhn(num: string) {
  let sum = 0, doubleIt = false
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i])
    if (doubleIt) { d *= 2; if (d > 9) d -= 9 }
    sum += d; doubleIt = !doubleIt
  }
  return sum % 10 === 0
}

function formatCardNumber(v: string) {
  const digits = v.replace(/\D/g, '').slice(0, 19)
  return digits.replace(/(.{4})/g, '$1 ').trim()
}

function formatExpiry(v: string) {
  const digits = v.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0,2)}/${digits.slice(2)}`
}

function detectCardBrand(digits: string): 'Visa' | 'Mastercard' | 'Amex' | 'Discover' | 'Card' {
  if (/^4\d{6,}$/.test(digits)) return 'Visa'
  if (/^(5[1-5]\d{4,}|2(2[2-9]\d{2}|[3-6]\d{3}|7[01]\d{2}|720\d))\d*$/.test(digits)) return 'Mastercard'
  if (/^3[47]\d{5,}$/.test(digits)) return 'Amex'
  if (/^(6011\d{2,}|65\d{4,})\d*$/.test(digits)) return 'Discover'
  return 'Card'
}

function genPaymentId() {
  return `txn_${Math.random().toString(36).slice(2,8)}${Date.now().toString(36).slice(-6)}`
}
