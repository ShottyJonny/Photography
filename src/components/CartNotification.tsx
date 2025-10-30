import React, { useEffect, useState } from 'react'
import { useCart } from '../context/CartContext'
import { products } from '../data/products'
import { getRecommendedSize } from '../utils/recommendedSize'

type NotificationState = {
  visible: boolean
  itemName: string
  itemSize: string
  itemCount: number
  previousItemCount: number
}

export default function CartNotification() {
  const { items } = useCart()
  const [notification, setNotification] = useState<NotificationState>({
    visible: false,
    itemName: '',
    itemSize: '',
    itemCount: 0,
    previousItemCount: -1 // Start with -1 to indicate uninitialized
  })
  const [isInitialized, setIsInitialized] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  const totalItems = items.reduce((acc, item) => acc + item.qty, 0)

  // Separate effect for initialization
  useEffect(() => {
    if (!isInitialized) {
      setNotification(prev => ({ ...prev, previousItemCount: totalItems, itemCount: totalItems }))
      setIsInitialized(true)
    }
  }, [totalItems, isInitialized])

  // Separate effect for detecting new items
  useEffect(() => {
    if (!isInitialized) return

    if (totalItems > notification.previousItemCount) {
      // Find the most recently added item
      const newestItem = items[items.length - 1]
      if (newestItem) {
        const product = products.find(p => p.id === newestItem.id)
        const itemName = product?.name || 'Item'
        const itemSize = newestItem.size || getRecommendedSize(newestItem.id) || '4x6'
        
        setNotification({
          visible: true,
          itemName,
          itemSize,
          itemCount: totalItems,
          previousItemCount: totalItems
        })
        setIsClosing(false) // Reset closing state
      }
    } else if (totalItems !== notification.previousItemCount) {
      // Update item count without showing notification (for removals, updates, etc.)
      setNotification(prev => ({ ...prev, previousItemCount: totalItems, itemCount: totalItems }))
    }
  }, [totalItems, items, isInitialized, notification.previousItemCount])

  // Separate effect for auto-dismiss timer
  useEffect(() => {
    if (notification.visible && !isClosing) {
      const timer = setTimeout(() => {
        setIsClosing(true)
        // Allow animation to complete before hiding
        setTimeout(() => {
          setNotification(prev => ({ ...prev, visible: false }))
          setIsClosing(false)
        }, 300)
      }, 3500)

      return () => clearTimeout(timer)
    }
  }, [notification.visible, isClosing])

  const handleDismiss = () => {
    setIsClosing(true)
    // Allow animation to complete before hiding
    setTimeout(() => {
      setNotification(prev => ({ ...prev, visible: false }))
      setIsClosing(false)
    }, 300)
  }

  const goToCart = () => {
    // Dispatch custom event to open cart drawer
    window.dispatchEvent(new CustomEvent('cart:open'))
    handleDismiss()
  }

  if (!notification.visible) return null

  return (
    <div className={`cart-notification ${isClosing ? 'closing' : ''}`}>
      <div className="cart-notification-content">
        <div className="cart-notification-details">
          <span className="cart-notification-message">
            <strong>{notification.itemName}</strong> ({notification.itemSize}) added to cart!
          </span>
          <span className="cart-notification-meta">
            {totalItems} item{totalItems !== 1 ? 's' : ''} in cart
          </span>
        </div>
        <div className="cart-notification-actions">
          <button 
            type="button" 
            className="cart-notification-btn view-cart"
            onClick={goToCart}
          >
            View Cart
          </button>
          <button 
            type="button" 
            className="cart-notification-btn dismiss"
            onClick={handleDismiss}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}