import React from 'react'
import { useCart } from '../context/CartContext'

interface FloatingCartButtonProps {
  onCartOpen: () => void
}

export default function FloatingCartButton({ onCartOpen }: FloatingCartButtonProps) {
  const { items } = useCart()
  const count = items.reduce((acc, i) => acc + i.qty, 0)

  return (
    <button 
      type="button" 
      className="floating-cart-btn" 
      onClick={onCartOpen}
      aria-label={`Open cart with ${count} items`}
      title="View cart"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1"></circle>
        <circle cx="20" cy="21" r="1"></circle>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
      </svg>
      {count > 0 && <span className="cart-badge">{count}</span>}
    </button>
  )
}