import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ContactPage from '@/app/(store)/contact/page'

afterEach(cleanup)

describe('Contact page', () => {
  it('renders the Contact heading and the mailto link', () => {
    render(<ContactPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Contact' })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /jonhoffmanbusiness@gmail.com/ }).getAttribute('href'),
    ).toBe('mailto:jonhoffmanbusiness@gmail.com')
  })
})
