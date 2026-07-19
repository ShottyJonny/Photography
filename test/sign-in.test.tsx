import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SignInFields } from '@/components/admin/SignInForm'
import { INITIAL_SIGN_IN_STATE, SIGN_IN_ERROR_COPY } from '@/lib/admin/auth-state'

afterEach(cleanup)

describe('the admin layout', () => {
  // The entire §5 token-scope fix hangs on this one attribute existing. The CSS
  // test proves the RULE exists; this proves an element MATCHES it.
  it('renders [data-admin] so the token scope applies', async () => {
    const Layout = (await import('@/app/admin/layout')).default
    const { container } = render(<Layout><span>x</span></Layout>)
    expect(container.querySelector('[data-admin]')).not.toBeNull()
  })
})

describe('SignInFields', () => {
  it('binds each label to its input', () => {
    const { container } = render(<SignInFields state={INITIAL_SIGN_IN_STATE} pending={false} />)
    expect(container.querySelector('input[name="email"]')?.getAttribute('id')).toBe('email')
    expect(container.querySelector('input[name="password"]')?.getAttribute('id')).toBe('password')
    expect(container.querySelector('label[for="email"]')).not.toBeNull()
    expect(container.querySelector('label[for="password"]')).not.toBeNull()
  })

  it('sets the autocomplete and type attributes a password manager needs', () => {
    const { container } = render(<SignInFields state={INITIAL_SIGN_IN_STATE} pending={false} />)
    const email = container.querySelector('input[name="email"]')
    const password = container.querySelector('input[name="password"]')
    expect(email?.getAttribute('autocomplete')).toBe('email')
    expect(email?.getAttribute('type')).toBe('email')
    expect(password?.getAttribute('autocomplete')).toBe('current-password')
    expect(password?.getAttribute('type')).toBe('password')
  })

  it('always renders the alert region so it can announce', () => {
    const { container } = render(<SignInFields state={INITIAL_SIGN_IN_STATE} pending={false} />)
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('renders the generic credentials copy and never names the field at fault', () => {
    const { container } = render(
      <SignInFields state={{ status: 'error', kind: 'credentials' }} pending={false} />,
    )
    expect(container.textContent).toContain(SIGN_IN_ERROR_COPY.credentials)
    expect(container.textContent?.toLowerCase()).not.toContain('no account')
    expect(container.textContent?.toLowerCase()).not.toContain('wrong password')
  })

  it('distinguishes the rate-limited state from the transport state', () => {
    const limited = render(<SignInFields state={{ status: 'error', kind: 'rate_limited' }} pending={false} />)
    expect(limited.container.textContent).toContain(SIGN_IN_ERROR_COPY.rate_limited)
    cleanup()
    const down = render(<SignInFields state={{ status: 'error', kind: 'transport' }} pending={false} />)
    expect(down.container.textContent).toContain(SIGN_IN_ERROR_COPY.transport)
    expect(down.container.textContent).not.toContain(SIGN_IN_ERROR_COPY.rate_limited)
  })

  it('renders the unknown-error copy without claiming a cause', () => {
    const { container } = render(<SignInFields state={{ status: 'error', kind: 'unknown' }} pending={false} />)
    expect(container.textContent).toContain(SIGN_IN_ERROR_COPY.unknown)
  })

  it('associates a per-field error with its input for assistive tech', () => {
    const { container } = render(
      <SignInFields state={{ status: 'fieldErrors', email: 'Enter your email.' }} pending={false} />,
    )
    expect(container.textContent).toContain('Enter your email.')
    const email = container.querySelector('input[name="email"]')
    expect(email?.getAttribute('aria-invalid')).toBe('true')
    const describedBy = email?.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(container.querySelector(`#${describedBy}`)?.textContent).toContain('Enter your email.')
  })

  it('disables the submit button while pending', () => {
    const { container } = render(<SignInFields state={INITIAL_SIGN_IN_STATE} pending />)
    expect(container.querySelector('button[type="submit"]')?.hasAttribute('disabled')).toBe(true)
  })

  // design.md §10 q2 — every control must be reachable and keep the global ring.
  it('renders three focusable controls and takes none out of the tab order', () => {
    const { container } = render(<SignInFields state={INITIAL_SIGN_IN_STATE} pending={false} />)
    expect(container.querySelectorAll('input, button').length).toBe(3)
    expect(container.querySelector('[tabindex="-1"]')).toBeNull()
  })
})
