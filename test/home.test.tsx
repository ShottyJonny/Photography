import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/data/collections', () => ({
  getFeaturedCollection: vi.fn(async () => null),
}))

describe('Home', () => {
  it('renders the quiet empty state when there is no featured collection', async () => {
    const Home = (await import('@/app/(store)/page')).default
    const { container } = render(await Home())
    expect(container.textContent).toContain('Coming soon')
  })
})
