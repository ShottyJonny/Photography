import React from 'react'
import Home from './pages/Home'
import Shop from './pages/Shop'
import Product from './pages/Product'
import CartPage from './pages/CartPage'
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
import LinkButton from './components/LinkButton'
import Header from './components/Header'
import CookieBanner from './components/CookieBanner'
import CartNotification from './components/CartNotification'
import cloudFullLight from './assets/logos/CloudLogoFull LightMode2.png'
import cloudFullDark from './assets/logos/CloudLogoFull DarkMode2.png'

function CartBadge() {
  const { items } = useCart()
  const count = items.reduce((acc, i) => acc + i.qty, 0)
  return <span aria-label="cart-count">{count > 0 ? `(${count})` : null}</span>
}

export function App() {
  return (
    <ThemeProvider>
      <ConsentProvider>
        <CartProvider>
          <PricingProvider>
            <div className="container">
              <WordmarkBar />
              <Header />
              <main>
                <HashRouter />
              </main>
            </div>
            <CookieBanner />
            <CartNotification />
          </PricingProvider>
        </CartProvider>
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
  else if (route === '/cart') view = <CartPage />
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
