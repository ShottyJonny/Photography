import Link from 'next/link'

export function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.inner}>
        <nav aria-label="Legal" style={styles.links}>
          <Link href="/shipping" style={styles.link}>
            Shipping
          </Link>
          <Link href="/refunds" style={styles.link}>
            Refunds
          </Link>
          <Link href="/privacy" style={styles.link}>
            Privacy
          </Link>
          <Link href="/terms" style={styles.link}>
            Terms
          </Link>
        </nav>
        <a href="mailto:jonhoffmanbusiness@gmail.com" style={styles.email}>
          jonhoffmanbusiness@gmail.com
        </a>
        <p style={styles.copy}>© Jon Hoffman</p>
      </div>
    </footer>
  )
}

const styles: Record<string, React.CSSProperties> = {
  footer: {
    borderTop: '1px solid var(--hair)',
    background: 'var(--paper)',
    color: 'var(--dim)',
    marginTop: '4rem',
  },
  inner: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem 2rem',
    maxWidth: 1200,
    margin: '0 auto',
    padding: '2rem 1.5rem',
  },
  links: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1.25rem',
  },
  link: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.6875rem',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--dim)',
    textDecoration: 'none',
  },
  email: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    letterSpacing: '0.02em',
    color: 'var(--ink)',
    textDecoration: 'none',
  },
  copy: {
    margin: 0,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.6875rem',
    letterSpacing: '0.06em',
    color: 'var(--dim)',
  },
}
