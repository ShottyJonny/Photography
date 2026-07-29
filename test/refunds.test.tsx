import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import RefundsPage from '@/app/(store)/refunds/page'

afterEach(cleanup)

describe('Refunds page', () => {
  it('states made-to-order and the damage path', () => {
    render(<RefundsPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Refunds' })).toBeTruthy()
    expect(screen.getByText(/made to order/)).toBeTruthy()
    expect(screen.getByText(/damaged or defective/)).toBeTruthy()
  })
})
