import { describe, it, expect, vi, beforeEach } from 'vitest'

const photos = { current: [] as Array<{ slug: string }> }
const collections = { current: [] as Array<{ slug: string }> }

vi.mock('@/lib/data/photos', () => ({
  getPublishedPhotos: async () => photos.current,
}))
vi.mock('@/lib/data/collections', () => ({
  getCollections: async () => collections.current,
}))
vi.mock('@/lib/env', () => ({
  siteOrigin: () => 'https://www.jonhoffmanphotography.com',
}))

const load = async () => (await import('@/app/sitemap')).default()
const urls = async () => (await load()).map((e) => e.url)

beforeEach(() => {
  vi.resetModules()
  photos.current = [{ slug: 'sidelines' }, { slug: 'goalless' }]
  collections.current = [{ slug: 'relics' }]
})

describe('sitemap', () => {
  it('lists the public surfaces a visitor can actually reach', async () => {
    const u = await urls()
    for (const path of ['/', '/prints', '/collections', '/about', '/contact', '/shipping', '/refunds', '/privacy', '/terms']) {
      expect(u, `missing ${path}`).toContain(`https://www.jonhoffmanphotography.com${path}`)
    }
  })

  // /admin is gated and already disallowed in robots.txt. /checkout and
  // /order/[id] are per-visitor and per-order -- a crawler reaching them finds
  // an empty cart or someone else's receipt.
  it('omits the admin, the checkout and order receipts', async () => {
    const u = await urls()
    expect(u.some((x) => x.includes('/admin'))).toBe(false)
    expect(u.some((x) => x.includes('/checkout'))).toBe(false)
    expect(u.some((x) => x.includes('/order'))).toBe(false)
  })

  it('lists one entry per published photograph', async () => {
    const u = await urls()
    expect(u).toContain('https://www.jonhoffmanphotography.com/prints/sidelines')
    expect(u).toContain('https://www.jonhoffmanphotography.com/prints/goalless')
  })

  it('lists one entry per collection', async () => {
    expect(await urls()).toContain('https://www.jonhoffmanphotography.com/collections/relics')
  })

  // getPublishedPhotos and getCollections are both visibility-gated already, so
  // a draft photograph never reaches the sitemap. This pins that it stays that
  // way rather than the sitemap growing its own unfiltered query.
  it('publishes nothing when the catalogue is empty', async () => {
    photos.current = []
    collections.current = []
    const u = await urls()
    expect(u.some((x) => x.includes('/prints/'))).toBe(false)
    expect(u.some((x) => x.includes('/collections/'))).toBe(false)
    expect(u).toContain('https://www.jonhoffmanphotography.com/')
  })

  it('builds absolute URLs from SITE_URL, never relative paths', async () => {
    for (const url of await urls()) {
      const parsed = new URL(url)
      expect(parsed.protocol).toBe('https:')
      expect(parsed.hostname).toBe('www.jonhoffmanphotography.com')
    }
  })

  it('emits no duplicate URLs', async () => {
    const u = await urls()
    expect(new Set(u).size).toBe(u.length)
  })
})
