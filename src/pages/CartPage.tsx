import React from 'react'
import { useCart } from '../context/CartContext'
import { products } from '../data/products'
import { ALL_SIZES, priceForSize, usePricing } from '../context/PricingContext'
import Dropdown from '../components/Dropdown'
import LinkButton from '../components/LinkButton'
// aspect helpers no longer needed

export default function CartPage() {
  const { priced } = usePricing()
  const { items, update, remove, clear, add } = useCart()
  const lines = items.map((ci) => {
    const p = (priced.find((x) => x.id === ci.id) || products.find((x) => x.id === ci.id))
    return { ci, p }
  }).filter((x) => x.p)

  // unified sizes only
  const subtotal = lines.reduce((sum, { ci }) => sum + priceForSize((ci.size as any) || '4x6') * ci.qty, 0)
  return (
    <div>
      <h2>Your Cart</h2>
      {lines.length === 0 ? (
        <p>Your cart is empty.</p>
      ) : (
        <div className="cart-list">
          {lines.map(({ ci, p }) => {
            const options = ALL_SIZES as readonly string[]
            const current = (ci.size as string | undefined) || '4x6'
            if (!options.includes(current)) {
              // correct a mismatched size silently for this line
              setTimeout(() => update(ci.uid as any, ci.qty, options[0]), 0)
            }
            return (
            <div key={ci.uid as any} className="cart-line">
              <img src={p!.thumbnail || p!.image} alt={p!.name} />
              <div>
                <div>{p!.name} <span style={{opacity:.7}}>(Size: {ci.size || '4x6'})</span></div>
                <div>
                  <label style={{marginLeft:8, display:'inline-flex', alignItems:'center', gap:6}}>
                    <span>Size:</span>
                    <Dropdown value={current} onChange={(v) => update(ci.uid as any, ci.qty, v)} options={options} />
                  </label>
                  <button className="icon-btn" aria-label="Add one" title="Add one" onClick={() => add(ci.id, 1, current)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  </button>
                  <button className="icon-btn" aria-label="Remove item" title="Remove item" onClick={() => remove(ci.uid as any)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
              <div>
                {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format((priceForSize((ci.size as any) || '4x6') * ci.qty) / 100)}
              </div>
            </div>
          )})}
          <div className="cart-total">
            <div>Subtotal</div>
            <div>{new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(subtotal / 100)}</div>
          </div>
          <div>
            <LinkButton to="/checkout" className="button">Checkout</LinkButton>
            <button onClick={clear}>Clear cart</button>
          </div>
        </div>
      )}
    </div>
  )
}
