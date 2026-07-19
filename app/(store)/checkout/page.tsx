'use client'
import { useMemo, useState } from 'react'
import { useCart } from '@/components/cart/CartContext'
import { previewQuote } from '@/lib/format/quote'
import { priceForSize } from '@/lib/format/price'

const COUNTRIES: [string, string][] = [
  ['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'], ['DE', 'Germany'],
]

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`
}
function emailValid(e: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) }

type Fields = { email: string; name: string; street: string; city: string; region: string; postalCode: string; country: string }
const EMPTY: Fields = { email: '', name: '', street: '', city: '', region: '', postalCode: '', country: 'US' }

export default function Checkout() {
  const { lines } = useCart()
  const [f, setF] = useState<Fields>(EMPTY)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [err, setErr] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }))
  const blur = (k: keyof Fields) => () => setTouched((p) => ({ ...p, [k]: true }))

  const quote = useMemo(
    () => previewQuote(lines.map((l) => ({ size: l.size, qty: l.qty, title: l.title })), { country: f.country, region: f.region }),
    [lines, f.country, f.region],
  )

  const requiredText: (keyof Fields)[] = ['name', 'street', 'city', 'postalCode']
  const usNeedsRegion = f.country === 'US'
  const formValid =
    emailValid(f.email) &&
    requiredText.every((k) => f[k].trim() !== '') &&
    (!usNeedsRegion || f.region.trim() !== '') &&
    f.country.trim() !== ''
  const canPay = formValid && lines.length > 0 && !submitting

  async function pay() {
    setErr(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: lines.map((l) => ({ photoId: l.photoId, size: l.size, register: l.register, qty: l.qty })),
          customer: { email: f.email, name: f.name },
          shippingAddress: { name: f.name, street: f.street, city: f.city, region: f.region, postalCode: f.postalCode, country: f.country },
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error ?? 'Checkout failed'); setSubmitting(false); return }
      window.location.href = json.url
    } catch {
      setErr('Checkout failed'); setSubmitting(false)
    }
  }

  return (
    <main className="checkout">
      <h1 className="checkout-h1">Checkout</h1>
      <div className="checkout-cols">
        <form className="checkout-form" onSubmit={(e) => { e.preventDefault(); if (canPay) pay() }}>
          <fieldset className="checkout-field-group">
            <legend>Contact</legend>
            <label className="field"><span>Email</span>
              <input type="email" value={f.email} onChange={set('email')} onBlur={blur('email')} autoComplete="email" />
            </label>
            {touched.email && !emailValid(f.email) && <p role="alert" className="field-error">Enter a valid email address.</p>}
          </fieldset>

          <fieldset className="checkout-field-group">
            <legend>Ship to</legend>
            <label className="field"><span>Full name</span>
              <input value={f.name} onChange={set('name')} onBlur={blur('name')} autoComplete="name" /></label>
            {touched.name && f.name.trim() === '' && <p role="alert" className="field-error">Name is required.</p>}
            <label className="field"><span>Street</span>
              <input value={f.street} onChange={set('street')} onBlur={blur('street')} autoComplete="address-line1" /></label>
            {touched.street && f.street.trim() === '' && <p role="alert" className="field-error">Street is required.</p>}
            <label className="field"><span>City</span>
              <input value={f.city} onChange={set('city')} onBlur={blur('city')} autoComplete="address-level2" /></label>
            {touched.city && f.city.trim() === '' && <p role="alert" className="field-error">City is required.</p>}
            <label className="field"><span>State / Region</span>
              <input value={f.region} onChange={set('region')} onBlur={blur('region')} autoComplete="address-level1" /></label>
            {touched.region && usNeedsRegion && f.region.trim() === '' && <p role="alert" className="field-error">Region is required for US destinations.</p>}
            <label className="field"><span>Postal code</span>
              <input value={f.postalCode} onChange={set('postalCode')} onBlur={blur('postalCode')} autoComplete="postal-code" /></label>
            {touched.postalCode && f.postalCode.trim() === '' && <p role="alert" className="field-error">Postal code is required.</p>}
            <label className="field"><span>Country</span>
              <select value={f.country} onChange={set('country')}>
                {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select></label>
          </fieldset>
        </form>

        <aside className="checkout-summary" aria-label="Order summary">
          <ul className="summary-lines">
            {lines.map((l) => (
              <li key={`${l.photoId}|${l.size}|${l.register}`}>
                <span>{l.title} · {l.size} · {l.register} × {l.qty}</span>
                <span>{formatPrice(priceForSize(l.size) * l.qty)}</span>
              </li>
            ))}
          </ul>
          <dl className="summary-totals">
            <div><dt>Subtotal</dt><dd>{formatPrice(quote.subtotal)}</dd></div>
            {quote.complete ? (
              <>
                <div><dt>Shipping</dt><dd>{formatPrice(quote.shipping)}</dd></div>
                <div><dt>Tax</dt><dd>{formatPrice(quote.tax)}</dd></div>
                <div className="summary-total"><dt>Total</dt><dd>{formatPrice(quote.total)}</dd></div>
              </>
            ) : (
              <p className="summary-note">Shipping &amp; tax calculated once your address is complete.</p>
            )}
          </dl>
          {err && <p role="alert" className="checkout-error">{err}</p>}
          <button type="button" className="checkout-pay" onClick={pay} disabled={!canPay}>Pay with Stripe →</button>
          <p className="checkout-secure">Secure payment on Stripe&rsquo;s page · card never touches this site.</p>
        </aside>
      </div>
    </main>
  )
}
