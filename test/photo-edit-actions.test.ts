import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAdmin = vi.fn(async () => ({ id: 'admin', email: 'jon@example.com' }))
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin: () => requireAdmin() }))

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
    }),
  }
}
vi.mock('@/lib/supabase/auth-server', () => ({ createAuthServerClient: async () => fakeClient() }))

import { getPhotoForEdit } from '@/lib/data/photos-admin'

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
