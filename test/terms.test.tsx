import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import TermsPage from '@/app/(store)/terms/page'

afterEach(cleanup)

describe('Terms page', () => {
  it('states USD, US-only, and copyright retention', () => {
    render(<TermsPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Terms' })).toBeTruthy()
    expect(screen.getByText(/US dollars/)).toBeTruthy()
    expect(screen.getByText(/copyright remain/)).toBeTruthy()
  })
})
