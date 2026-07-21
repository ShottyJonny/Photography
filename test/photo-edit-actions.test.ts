import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAdmin = vi.fn(async () => ({ id: 'admin', email: 'jon@example.com' }))
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin: () => requireAdmin() }))

const revalidateTag = vi.fn()
vi.mock('next/cache', () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a) }))

const db = { photos: [] as Record<string, unknown>[] }
let failRead = false

function fakeClient() {
  return {
    from: () => ({
      select: () => ({
        eq: (_c: string, id: string) => ({
          maybeSingle: async () =>
            failRead
              ? { data: null, error: { message: 'read failed' } }
              : { data: db.photos.find((p) => p.id === id) ?? null, error: null },
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => {
          const row = db.photos.find((p) => p.id === id)
          if (row) Object.assign(row, patch)
          return { error: null }
        },
      }),
    }),
  }
}
vi.mock('@/lib/supabase/auth-server', () => ({ createAuthServerClient: async () => fakeClient() }))

import { getPhotoForEdit } from '@/lib/data/photos-admin'
import { updatePhoto } from '@/lib/admin/photo-actions'

beforeEach(() => {
  db.photos = [{
    id: 'p1', slug: 'grand-ring', title: 'Grand Ring',
    caption: 'a line', description: 'a page', alt_text: 'alt here', published: true,
  }]
  failRead = false
  vi.clearAllMocks()
})

describe('getPhotoForEdit', () => {
  it('calls requireAdmin and returns the editable fields', async () => {
    const p = await getPhotoForEdit('p1')
    expect(requireAdmin).toHaveBeenCalledOnce()
    expect(p).toMatchObject({ slug: 'grand-ring', title: 'Grand Ring', alt_text: 'alt here', published: true })
  })

  it('returns null for an unknown id (no such photo)', async () => {
    expect(await getPhotoForEdit('nope')).toBeNull()
  })

  it('returns null when the read errors (distinct from not-found, but both null here)', async () => {
    failRead = true
    expect(await getPhotoForEdit('p1')).toBeNull()
  })
})

const GOOD = { photoId: 'p1', title: 'New Title', caption: 'c', description: 'd', altText: 'a' }

describe('updatePhoto', () => {
  it('calls requireAdmin and updates exactly the four text columns', async () => {
    const r = await updatePhoto(GOOD)
    expect(requireAdmin).toHaveBeenCalledOnce()
    expect(r.ok).toBe(true)
    const row = db.photos[0]
    expect(row.title).toBe('New Title')
    expect(row.caption).toBe('c')
    expect(row.description).toBe('d')
    expect(row.alt_text).toBe('a')
    // did NOT touch slug or published
    expect(row.slug).toBe('grand-ring')
    expect(row.published).toBe(true)
  })

  it('rejects a blank title', async () => {
    const r = await updatePhoto({ ...GOOD, title: '   ' })
    expect(r.ok).toBe(false)
    expect(db.photos[0].title).toBe('Grand Ring')
  })

  it('refuses clearing alt on a PUBLISHED photo, and changes nothing', async () => {
    const r = await updatePhoto({ ...GOOD, altText: '' })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.message).toMatch(/alt text/i)
    expect(db.photos[0].alt_text).toBe('alt here')
    expect(db.photos[0].title).toBe('Grand Ring') // no partial write
  })

  it('ALLOWS clearing alt on a draft', async () => {
    db.photos[0].published = false
    const r = await updatePhoto({ ...GOOD, altText: '' })
    expect(r.ok).toBe(true)
    expect(db.photos[0].alt_text).toBeNull()
  })

  it('revalidates all three storefront tags', async () => {
    await updatePhoto(GOOD)
    expect(revalidateTag).toHaveBeenCalledWith('photos', 'max')
    expect(revalidateTag).toHaveBeenCalledWith('photo:grand-ring', 'max')
    expect(revalidateTag).toHaveBeenCalledWith('collections', 'max')
  })
})
