'use client'
import { useState } from 'react'
import { useCart } from '@/components/cart/CartContext'

const COUNTRIES = [['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'], ['DE', 'Germany']]
export default function Checkout() {
  const { lines } = useCart()
  const [f, setF] = useState({ email: '', name: '', street: '', city: '', region: '', postalCode: '', country: 'US' })
  const [err, setErr] = useState<string | null>(null)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  async function pay() {
    setErr(null)
    const res = await fetch('/api/checkout', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: lines.map((l) => ({ photoId: l.photoId, size: l.size, register: l.register, qty: l.qty })),
        customer: { email: f.email, name: f.name },
        shippingAddress: { name: f.name, street: f.street, city: f.city, region: f.region, postalCode: f.postalCode, country: f.country },
      }),
    })
    const json = await res.json()
    if (!res.ok) { setErr(json.error ?? 'Checkout failed'); return }
    window.location.href = json.url
  }

  return (
    <main style={{ padding: 24, maxWidth: 480 }}>
      <h1 style={{ fontFamily: 'var(--font-playfair)' }}>Checkout</h1>
      <input placeholder="Email" value={f.email} onChange={set('email')} />
      <input placeholder="Full name" value={f.name} onChange={set('name')} />
      <input placeholder="Street" value={f.street} onChange={set('street')} />
      <input placeholder="City" value={f.city} onChange={set('city')} />
      <input placeholder="State/Region" value={f.region} onChange={set('region')} />
      <input placeholder="Postal code" value={f.postalCode} onChange={set('postalCode')} />
      <select value={f.country} onChange={set('country')}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
      {err && <p role="alert">{err}</p>}
      <button onClick={pay} disabled={!lines.length}>Pay with Stripe →</button>
    </main>
  )
}
