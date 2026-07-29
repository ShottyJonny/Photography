import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Footer } from '@/components/store/Footer'

afterEach(cleanup)

describe('Footer', () => {
  it('links to each legal page', () => {
    render(<Footer />)
    expect(screen.getByRole('link', { name: 'Shipping' }).getAttribute('href')).toBe('/shipping')
    expect(screen.getByRole('link', { name: 'Refunds' }).getAttribute('href')).toBe('/refunds')
    expect(screen.getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy')
    expect(screen.getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/terms')
  })

  it('shows the contact email as a mailto link', () => {
    render(<Footer />)
    expect(
      screen.getByRole('link', { name: /jonhoffmanbusiness@gmail.com/ }).getAttribute('href'),
    ).toBe('mailto:jonhoffmanbusiness@gmail.com')
  })
})
