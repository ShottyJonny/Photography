import { render, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CollectionDetail, PhotoInCollection } from '@/lib/data/collections'

// Mutable module-scope value, not vi.fn generics: Vitest 2 takes a single
// function-type generic, so the v1 `vi.fn<[], Promise<T>>` form is a type
// error. This is also the pattern test/admin-dashboard.test.tsx already uses.
const featuredValue: { current: CollectionDetail | null } = { current: null }
vi.mock('@/lib/data/collections', () => ({
  getFeaturedCollection: async () => featuredValue.current,
}))

function photo(n: number): PhotoInCollection {
  return {
    id: `p${n}`,
    slug: `photo-${n}`,
    title: `Photo ${n}`,
    alt_text: `Alt for photo ${n}`,
    aspect_ratio: 0.8,
    width_px: 1600,
    height_px: 2000,
    has_bw_variant: true,
    position: n,
  }
}

function featured(over: Partial<CollectionDetail> = {}): CollectionDetail {
  return {
    slug: 'reliquary',
    name: 'Reliquary',
    dek: 'A small cabinet of prints held close.',
    literature: null,
    cover: { slug: 'photo-3', alt: 'Alt for photo 3' },
    photos: [photo(1), photo(2), photo(3)],
    ...over,
  }
}

const renderHome = async () => {
  const Home = (await import('@/app/(store)/page')).default
  return render(await Home())
}

const activeTab = (c: HTMLElement) => c.querySelector('[role="tab"][aria-selected="true"]')

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  featuredValue.current = null
})

describe('Home', () => {
  it('renders the quiet empty state when there is no featured collection', async () => {
    const { container } = await renderHome()
    expect(container.textContent).toContain('Coming soon')
  })

  it('renders the quiet empty state when the featured collection has no photographs', async () => {
    featuredValue.current = featured({ photos: [], cover: null })
    const { container } = await renderHome()
    expect(container.textContent).toContain('Coming soon')
  })

  it('opens on the cover photograph, not on the first member', async () => {
    featuredValue.current = featured()
    const { container } = await renderHome()
    expect(activeTab(container)?.textContent).toContain('Photo 3')
  })

  it('falls back to the first member when the cover is not in the collection', async () => {
    featuredValue.current = featured({ cover: { slug: 'not-a-member', alt: null } })
    const { container } = await renderHome()
    expect(activeTab(container)?.textContent).toContain('Photo 1')
  })

  it('falls back to the first member when there is no cover at all', async () => {
    featuredValue.current = featured({ cover: null })
    const { container } = await renderHome()
    expect(activeTab(container)?.textContent).toContain('Photo 1')
  })
})
