import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ShippingPage from '@/app/(store)/shipping/page'

afterEach(cleanup)

describe('Shipping page', () => {
  it('states US-only and the flat $9.95 shipping charge', () => {
    render(<ShippingPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Shipping' })).toBeTruthy()
    expect(screen.getByText(/United States only/)).toBeTruthy()
    expect(screen.getByText(/\$9\.95/)).toBeTruthy()
  })
})
