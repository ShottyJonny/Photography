'use client'

import Link from 'next/link'
import { useCart } from '@/components/cart/CartContext'
import { useTheme } from '@/components/theme/ThemeProvider'

function CloudMark() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 18h10a4 4 0 0 0 .5-7.98A5 5 0 0 0 7.5 8.5 4 4 0 0 0 7 18z" />
    </svg>
  )
}

export function Header() {
  const { toggle } = useTheme()
  const { count, open } = useCart()

  return (
    <header style={styles.header}>
      <div style={styles.inner}>
        <div style={styles.lockup}>
          <button
            type="button"
            aria-label="Toggle theme"
            onClick={toggle}
            style={styles.themeBtn}
          >
            <CloudMark />
          </button>
          <div>
            <Link href="/" style={styles.wordmark}>
              Jon Hoffman
            </Link>
            <p style={styles.kicker}>PHOTOGRAPHS &amp; PRINTS</p>
          </div>
        </div>

        <nav aria-label="Primary" style={styles.nav}>
          <Link href="/prints" style={styles.navLink}>
            Prints
          </Link>
          <Link href="/collections" style={styles.navLink}>
            Collections
          </Link>
          <Link href="/contact" style={styles.navLink}>
            Contact
          </Link>
          <button type="button" onClick={open} style={styles.cartBtn}>
            Cart ({count})
          </button>
        </nav>
      </div>
    </header>
  )
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    borderBottom: '1px solid var(--hair)',
    background: 'var(--paper)',
    color: 'var(--ink)',
  },
  inner: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1.25rem 2rem',
    maxWidth: 1200,
    margin: '0 auto',
    padding: '1.25rem 1.5rem',
  },
  lockup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.875rem',
  },
  themeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.25rem',
    border: 'none',
    background: 'transparent',
    color: 'var(--ink)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  wordmark: {
    display: 'block',
    fontFamily: 'var(--font-playfair)',
    fontSize: '1.375rem',
    fontWeight: 400,
    lineHeight: 1.2,
    color: 'var(--ink)',
    textDecoration: 'none',
  },
  kicker: {
    margin: '0.125rem 0 0',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.625rem',
    fontWeight: 400,
    letterSpacing: '0.14em',
    color: 'var(--dim)',
  },
  nav: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '1.25rem 1.75rem',
  },
  navLink: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--ink)',
    textDecoration: 'none',
  },
  cartBtn: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--ink)',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
  },
}
