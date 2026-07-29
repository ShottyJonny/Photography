import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import AboutPage from '@/app/(store)/about/page'

afterEach(cleanup)

describe('About page', () => {
  it('renders the About heading', () => {
    render(<AboutPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'About' })).toBeTruthy()
  })
})
