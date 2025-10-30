import React from 'react'
import LinkButton from './LinkButton'
import { useCart } from '../context/CartContext'
import cloudFullLighter from '../assets/logos/CloudLogoFullLighter.png'
import { useTheme } from '../context/ThemeContext'

interface HeaderProps {
  onCartOpen: () => void
}

export default function Header({ onCartOpen }: HeaderProps) {
  const { items } = useCart()
  const count = items.reduce((acc, i) => acc + i.qty, 0)
  const [open, setOpen] = React.useState(false)
  const { theme, toggleTheme } = useTheme()
  const [swapping, setSwapping] = React.useState(false)
  const [prevTheme, setPrevTheme] = React.useState<ReturnType<typeof useTheme>['theme'] | null>(null)
  const onToggleTheme = () => {
    setPrevTheme(theme)
    setSwapping(true)
    toggleTheme()
    window.setTimeout(() => { setSwapping(false); setPrevTheme(null) }, 520)
  }

  React.useEffect(() => {
    const onHash = () => setOpen(false)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <header className={open ? 'app-header open' : 'app-header'}>
        <div className="brand">
          <button type="button" className="brand-button" onClick={() => (window.location.hash = '/')} aria-label="Go to home">
            <img src={cloudFullLighter} alt="Jon Hoffman Photography logo" className="brand-logo" />
          </button>
        </div>
        <nav className="nav-buttons" aria-label="Primary" id="primary-nav">
          <LinkButton to="/">Home</LinkButton>
          <LinkButton to="/shop">Shop</LinkButton>
          <LinkButton to="/about">About</LinkButton>
          <LinkButton to="/contact">Contact</LinkButton>
        </nav>
      <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          className={swapping ? 'icon-btn theme-toggle spinning' : 'icon-btn theme-toggle'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span className="icon-wrap" aria-hidden>
            {swapping && prevTheme && (
              <span className="theme-icon out">{prevTheme === 'dark' ? <MoonIcon/> : <SunIcon/>}</span>
            )}
            <span className={swapping ? 'theme-icon in' : 'theme-icon'}>{theme === 'dark' ? <MoonIcon/> : <SunIcon/>}</span>
          </span>
        </button>
        <button
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="primary-nav"
          aria-label="Toggle menu"
          onClick={() => setOpen(v => !v)}
        >
          <span className="bar" />
          <span className="bar" />
          <span className="bar" />
        </button>
      </div>
    </header>
  )
}

function SunIcon(){
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon(){
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}
