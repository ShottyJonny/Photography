import React from 'react'
import { useCart } from '../context/CartContext'
import { products } from '../data/products'
import { ALL_SIZES, priceForSize, usePricing } from '../context/PricingContext'
import { estimateShipping } from '../utils/taxShipping'
import Dropdown from './Dropdown'

interface CartDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export default function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { priced } = usePricing()
  const { items, update, remove, clear, add } = useCart()
  
  const lines = items.map((ci) => {
    const p = (priced.find((x) => x.id === ci.id) || products.find((x) => x.id === ci.id))
    return { ci, p }
  }).filter((x) => x.p)

  const subtotal = lines.reduce((sum, { ci }) => sum + priceForSize((ci.size as any) || '4x6') * ci.qty, 0)
  
  // Estimate shipping cost (using US as default for cart display)
  const shippingEst = estimateShipping(subtotal, 'United States')
  const estimatedTotal = subtotal + shippingEst.cost

  // Close drawer when clicking overlay
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  // Close drawer on ESC key
  React.useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  return (
    <>
      <div 
        className={`cart-drawer-overlay ${isOpen ? 'open' : ''}`}
        onClick={handleOverlayClick}
        aria-hidden={!isOpen}
      />
      <div 
        className={`cart-drawer ${isOpen ? 'open' : ''}`}
        role="dialog"
        aria-label="Shopping cart"
        aria-modal="true"
      >
        <div className="cart-drawer-header">
          <h2>Your Cart</h2>
          <button 
            className="icon-btn close-btn"
            onClick={onClose}
            aria-label="Close cart"
            title="Close cart"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="cart-drawer-content">
          {lines.length === 0 ? (
            <div className="cart-empty">
              <p>Your cart is empty.</p>
              <button className="button" onClick={onClose}>Continue Shopping</button>
            </div>
          ) : (
            <>
              <div className="cart-items">
                {lines.map(({ ci, p }) => {
                  const options = ALL_SIZES as readonly string[]
                  const current = (ci.size as string | undefined) || '4x6'
                  if (!options.includes(current)) {
                    setTimeout(() => update(ci.uid as any, ci.qty, options[0]), 0)
                  }
                  const itemPrice = priceForSize((ci.size as any) || '4x6') * ci.qty

                  return (
                    <div key={ci.uid as any} className="cart-drawer-item">
                      <img 
                        src={p!.thumbnail || p!.image} 
                        alt={p!.name}
                        className="cart-item-image"
                      />
                      <div className="cart-item-details">
                        <div className="cart-item-name">{p!.name}</div>
                        <div className="cart-item-size">Size: {ci.size || '4x6'}</div>
                        <div className="cart-item-controls">
                          <label className="size-selector">
                            <span>Size:</span>
                            <Dropdown 
                              value={current} 
                              onChange={(v) => update(ci.uid as any, ci.qty, v)} 
                              options={options} 
                            />
                          </label>
                          <div className="cart-item-actions">
                            <button 
                              className="icon-btn" 
                              aria-label="Add another" 
                              title="Add another"
                              onClick={() => add(ci.id, 1, current)}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                              </svg>
                            </button>
                            <span className="cart-item-qty">×{ci.qty}</span>
                            <button 
                              className="icon-btn danger" 
                              aria-label="Remove item" 
                              title="Remove item"
                              onClick={() => remove(ci.uid as any)}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                <path d="M10 11v6"/>
                                <path d="M14 11v6"/>
                                <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="cart-item-price">
                          {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(itemPrice / 100)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="cart-drawer-footer">
                <div className="cart-totals">
                  <div className="cart-line">
                    <span>Subtotal</span>
                    <span>
                      {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(subtotal / 100)}
                    </span>
                  </div>
                  <div className="cart-line">
                    <span>Shipping</span>
                    <span>
                      {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(shippingEst.cost / 100)}
                    </span>
                  </div>
                  <div className="cart-line cart-total">
                    <span>Estimated Total</span>
                    <span>
                      {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(estimatedTotal / 100)}
                    </span>
                  </div>
                  <div className="cart-tax-note">
                    <small>Tax will be calculated at checkout</small>
                  </div>
                </div>
                <div className="cart-drawer-actions">
                  <button 
                    className="button primary" 
                    onClick={() => {
                      onClose()
                      window.location.hash = '/checkout'
                    }}
                  >
                    Checkout
                  </button>
                  <button className="button secondary" onClick={clear}>
                    Clear Cart
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
