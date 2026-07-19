import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const user: { value: { email: string } | null } = { value: { email: 'jon@example.com' } }

vi.mock('@/lib/admin/require-admin', () => ({
  requireAdmin: async () => {
    if (!user.value) throw new Error('NEXT_REDIRECT;/admin/sign-in')
    return user.value
  },
}))

vi.mock('@/lib/admin/auth-actions', () => ({ signOut: async () => {} }))

afterEach(() => {
  cleanup()
  user.value = { email: 'jon@example.com' }
})

describe('the protected landing', () => {
  it('shows the real signed-in email', async () => {
    const Page = (await import('@/app/admin/(protected)/page')).default
    const { container } = render(await Page())
    expect(container.textContent).toContain('jon@example.com')
    expect(container.textContent).toContain('Studio Admin')
  })

  it('renders sign-out as a form button, never a link', async () => {
    const Page = (await import('@/app/admin/(protected)/page')).default
    const { container } = render(await Page())
    const button = container.querySelector('form button[type="submit"]')
    expect(button).not.toBeNull()
    expect(button?.textContent).toContain('Sign out')
    // A GET sign-out is CSRF-able and gets fired by link prefetching.
    expect(container.querySelector('a[href*="sign-out"]')).toBeNull()
  })

  it('claims nothing it cannot know — no stats, no counts', async () => {
    const Page = (await import('@/app/admin/(protected)/page')).default
    const { container } = render(await Page())
    const text = (container.textContent ?? '').toLowerCase()
    expect(text).not.toContain('orders')
    expect(text).not.toContain('queue')
  })

  it('propagates the guard redirect when there is no user', async () => {
    user.value = null
    const Page = (await import('@/app/admin/(protected)/page')).default
    await expect(Page()).rejects.toThrow(/NEXT_REDIRECT/)
  })
})
