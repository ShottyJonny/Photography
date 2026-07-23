import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import PrivacyPage from '@/app/(store)/privacy/page'

afterEach(cleanup)

describe('Privacy page', () => {
  it('discloses Stripe, the NPL sharing, and no tracking', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeTruthy()
    expect(screen.getByText(/handled by Stripe/)).toBeTruthy()
    expect(screen.getByText(/Nations Photo Lab/)).toBeTruthy()
    expect(screen.getByText(/no analytics/)).toBeTruthy()
  })
})
