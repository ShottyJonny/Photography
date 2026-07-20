import { describe, it, expect, vi, beforeEach } from 'vitest'

const PUBLISHED_PHOTO_ID = 'aaaa1111-1111-1111-1111-111111111111'
const UNPUBLISHED_PHOTO_ID = 'bbbb2222-2222-2222-2222-222222222222'

const PHOTOS = {
  [PUBLISHED_PHOTO_ID]: {
    id: PUBLISHED_PHOTO_ID,
    slug: 'relic-one',
    title: 'Relic One',
    alt_text: 'A relic',
    aspect_ratio: 1.5,
    width_px: 3000,
    height_px: 2000,
    has_bw_variant: true,
    published: true,
  },
  [UNPUBLISHED_PHOTO_ID]: {
    id: UNPUBLISHED_PHOTO_ID,
    slug: 'relic-draft',
    title: 'Draft',
    alt_text: null,
    aspect_ratio: 1,
    width_px: 1000,
    height_px: 1000,
    has_bw_variant: false,
    published: false,
  },
}

const COLLECTIONS = [
  {
    id: 'col-reliquary',
    slug: 'reliquary',
    name: 'Reliquary',
    dek: 'Sacred objects',
    literature: null,
    cover_photo_id: PUBLISHED_PHOTO_ID,
    position: 0,
    featured_on_home: false,
  },
  {
    id: 'col-empty',
    slug: 'empty',
    name: 'Empty',
    dek: null,
    literature: null,
    cover_photo_id: null,
    position: 1,
    featured_on_home: true,
  },
]

const COLLECTION_PHOTOS: Record<string, { position: number; photos: typeof PHOTOS[keyof typeof PHOTOS] }[]> = {
  'col-reliquary': [
    { position: 0, photos: PHOTOS[PUBLISHED_PHOTO_ID] },
    { position: 1, photos: PHOTOS[UNPUBLISHED_PHOTO_ID] },
  ],
  'col-empty': [],
}

type Filters = Record<string, unknown>

function resolveMaybeSingle(table: string, filters: Filters) {
  if (table === 'collections') {
    if (filters.featured_on_home === true) {
      const col = COLLECTIONS.find((c) => c.featured_on_home)
      return col ? { slug: col.slug } : null
    }
    if (typeof filters.slug === 'string') {
      return COLLECTIONS.find((c) => c.slug === filters.slug) ?? null
    }
  }
  return null
}

function resolveQuery(table: string, filters: Filters) {
  if (table === 'collections') {
    return [...COLLECTIONS].sort((a, b) => a.position - b.position)
  }
  if (table === 'collection_photos' && typeof filters.collection_id === 'string') {
    return COLLECTION_PHOTOS[filters.collection_id] ?? []
  }
  return []
}

function createBuilder(table: string) {
  const filters: Filters = {}

  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters[col] = val
      return builder
    },
    order: () => builder,
    maybeSingle: () => Promise.resolve({ data: resolveMaybeSingle(table, filters) }),
    then(onFulfilled: (v: { data: unknown }) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve({ data: resolveQuery(table, filters) }).then(onFulfilled, onRejected)
    },
  }
  return builder
}

vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}))

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: () => ({
    from: (table: string) => createBuilder(table),
  }),
}))

describe('storefront data layer', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('getCollections includes only collections with published photos', async () => {
    const { getCollections } = await import('@/lib/data/collections')
    const cards = await getCollections()
    expect(cards).toHaveLength(1)
    expect(cards[0].slug).toBe('reliquary')
    expect(cards[0].count).toBe(1)
  })

  it('getCollectionBySlug returns null for a collection with no published photos', async () => {
    const { getCollectionBySlug } = await import('@/lib/data/collections')
    expect(await getCollectionBySlug('empty')).toBeNull()
  })

  it('getFeaturedCollection returns null when featured collection has no published photos', async () => {
    const { getFeaturedCollection } = await import('@/lib/data/collections')
    expect(await getFeaturedCollection()).toBeNull()
  })

  it('getCollectionBySlug resolves cover from cover_photo_id', async () => {
    const { getCollectionBySlug } = await import('@/lib/data/collections')
    const detail = await getCollectionBySlug('reliquary')
    expect(detail?.cover?.slug).toBe(PHOTOS[PUBLISHED_PHOTO_ID].slug)
  })
})
