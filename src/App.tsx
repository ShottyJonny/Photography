import React from 'react'
import Home from './pages/Home'
import Shop from './pages/Shop'
import Product from './pages/Product'
import Checkout from './pages/Checkout'
import About from './pages/About'
import Contact from './pages/Contact'
import Aspects from './pages/Aspects'
import Order from './pages/Order'
import Orders from './pages/Orders'
import { CartProvider, useCart } from './context/CartContext'
import { PricingProvider } from './context/PricingContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { ConsentProvider, useConsent } from './context/ConsentContext'
import { ToastProvider } from './context/ToastContext'
import LinkButton from './components/LinkButton'
import Header from './components/Header'
import CartDrawer from './components/CartDrawer'
import CookieBanner from './components/CookieBanner'
import CartNotification from './components/CartNotification'
import FloatingCartButton from './components/FloatingCartButton'
import Toasts from './components/Toasts'
import cloudFullLight from './assets/logos/CloudLogoFull LightMode2.png'
import cloudFullDark from './assets/logos/CloudLogoFull DarkMode2.png'

function CartBadge() {
  const { items } = useCart()
  const count = items.reduce((acc, i) => acc + i.qty, 0)
  return <span aria-label="cart-count">{count > 0 ? `(${count})` : null}</span>
}

function CartClearer() {
  const { clear } = useCart()
  
  React.useEffect(() => {
    // Check if user returned from successful Stripe payment
    const fullUrl = window.location.href
    const hash = window.location.hash
    
    // Clear cart if:
    // 1. URL contains payment=success parameter, OR
    // 2. User is on an order page (indicating successful payment), OR
    // 3. URL has Stripe session parameters
    const hasPaymentSuccess = fullUrl.includes('payment=success')
    const hasStripeSession = fullUrl.includes('session_id') || fullUrl.includes('checkout_session')
    const isOrderPage = hash.startsWith('#/order/')
    
    if (hasPaymentSuccess || hasStripeSession || isOrderPage) {
      // Small delay to ensure the page loads properly
      const timer = setTimeout(() => {
        clear()
        console.log('Cart cleared after successful payment detection')
        
        // Clean up URL by removing payment parameter
        if (hasPaymentSuccess) {
          const cleanUrl = fullUrl.replace(/[?&]payment=success/, '')
          window.history.replaceState({}, document.title, cleanUrl)
        }
      }, 1000)
      
      return () => clearTimeout(timer)
    }
  }, [clear])
  
  return null
}

export function App() {
  const [cartOpen, setCartOpen] = React.useState(false)

  // Listen for cart open events from other components
  React.useEffect(() => {
    const handleCartOpen = () => setCartOpen(true)
    window.addEventListener('cart:open', handleCartOpen)
    return () => window.removeEventListener('cart:open', handleCartOpen)
  }, [])

  return (
    <ThemeProvider>
      <ConsentProvider>
        <ToastProvider>
          <CartProvider>
            <PricingProvider>
              <div className="container">
                <WordmarkBar />
                <Header onCartOpen={() => setCartOpen(true)} />
                <main>
                  <HashRouter />
                </main>
              </div>
              <CookieBanner />
              <CartNotification />
              <CartClearer />
              <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />
              {/* Completely separate sticky cart button */}
              <FloatingCartButton onCartOpen={() => setCartOpen(true)} />
              {/* Toast notifications with simple slide animations */}
              <Toasts />
            </PricingProvider>
          </CartProvider>
        </ToastProvider>
      </ConsentProvider>
    </ThemeProvider>
  )
}

function useHashRoute() {
  const [hash, setHash] = React.useState(() => window.location.hash || '#/')
  React.useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return hash.replace(/^#/, '') || '/'
}

function HashRouter() {
  const route = useHashRoute()
  // analytics stub
  const { consent } = useConsent()
  React.useEffect(() => {
    if (consent?.analytics) {
      // Replace with GA/Plausible init; for now, console event for realism
      console.info('[analytics] view', route)
    }
  }, [route, consent])
  let view: React.ReactNode
  if (route === '/' || route === '') view = <Home />
  else if (route.startsWith('/product/')) {
    const id = route.slice('/product/'.length)
    view = <Product id={id} />
  }
  else if (route === '/shop') view = <Shop />
  else if (route === '/checkout') view = <Checkout />
  else if (route.startsWith('/order/')) { const id = route.slice('/order/'.length); view = <Order id={id} /> }
  else if (route === '/orders') view = <Orders />
  else if (route === '/about') view = <About />
  else if (route === '/contact') view = <Contact />
    else if (route === '/aspects') view = <Aspects />
  else view = <p>Not Found</p>

  return <div key={route} className="route-fade">{view}</div>
}

function WordmarkBar() {
  const { theme } = useTheme()
  const src = theme === 'dark' ? cloudFullDark : cloudFullLight
  return (
    <div className="wordmark-bar">
      <button type="button" className="brand-button" aria-label="Go to home" onClick={() => (window.location.hash = '/') }>
        <img src={src} alt="Jon Hoffman Photography" />
      </button>
    </div>
  )
}
