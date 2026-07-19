import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }))
vi.mock('@/lib/admin/auth-actions', () => ({ signOut: async () => {} }))

afterEach(cleanup)

async function renderShell(email = 'jonhoffmanbusiness@gmail.com') {
  const { AdminShell } = await import('@/components/admin/AdminShell')
  return render(<AdminShell email={email}><p>page body</p></AdminShell>)
}

describe('AdminShell', () => {
  it('renders the lockup and the nav', async () => {
    const { container } = await renderShell()
    expect(container.textContent).toContain('Jon Hoffman')
    expect(container.textContent).toContain('Studio Admin')
    expect(container.querySelector('.admin-nav')).not.toBeNull()
  })

  it('renders its children in main', async () => {
    const { container } = await renderShell()
    expect(container.querySelector('.admin-main')?.textContent).toContain('page body')
  })

  it('links to the live site safely, in a new tab', async () => {
    const { container } = await renderShell()
    const link = container.querySelector('.admin-livesite')
    expect(link?.getAttribute('href')).toBe('/')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toContain('noopener')
    expect(link?.getAttribute('rel')).toContain('noreferrer')
  })

  // D2 — §11.3 specifies the chip and "View live site" but no sign-out.
  // A GET sign-out is CSRF-able and gets fired by link prefetching.
  it('renders sign-out as a form button, never an anchor', async () => {
    const { container } = await renderShell()
    const button = container.querySelector('form button[type="submit"]')
    expect(button?.textContent).toContain('Sign out')
    expect(container.querySelector('a[href*="sign-out"]')).toBeNull()
  })

  it('shows the avatar initials and the real email as visible text', async () => {
    const { container } = await renderShell('jon@example.com')
    expect(container.querySelector('.admin-chip-avatar')?.textContent).toBe('JH')
    expect(container.querySelector('.admin-chip-email')?.textContent).toBe('jon@example.com')
  })

  // The email overflows 242px at 10px mono, so the truncated text must not be
  // the only copy of it.
  it('carries the full email in a title, since the visible one is ellipsised', async () => {
    const { container } = await renderShell('jonhoffmanbusiness@gmail.com')
    expect(container.querySelector('.admin-chip-email')?.getAttribute('title'))
      .toBe('jonhoffmanbusiness@gmail.com')
  })

  it('puts the sidebar and main inside a single card', async () => {
    const { container } = await renderShell()
    const card = container.querySelector('.admin-card')
    expect(card?.querySelector('.admin-sidebar')).not.toBeNull()
    expect(card?.querySelector('.admin-main')).not.toBeNull()
  })
})
