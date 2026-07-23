/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic Supabase query-builder mock */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAdmin = vi.fn(async () => ({ id: 'admin' }))
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin: () => requireAdmin() }))

const state: Record<string, any> = {}
function fake() {
  return {
    from(table: string) {
      const q: any = {
        select() { return q },
        eq() { return q },
        order() { return q },
        then: (res: any) => res({ data: state[table]?.many ?? [], error: state[table]?.error ?? null }),
      }
      return q
    },
  }
}
vi.mock('@/lib/supabase/auth-server', () => ({ createAuthServerClient: async () => fake() }))

import { listCollectionsForFeature } from '@/lib/data/collections-admin'

beforeEach(() => { vi.clearAllMocks(); for (const k in state) delete state[k] })

describe('listCollectionsForFeature', () => {
  it('requireAdmin first; published-only hero, count, and shared quote', async () => {
    state.collections = { many: [
      { id: 'c1', slug: 'relics', name: 'Relics', dek: 'Objects that survive.', literature: 'L', cover_photo_id: 'p2', featured_on_home: true, position: 0 },
      { id: 'c2', slug: 'empty', name: 'Empty', dek: null, literature: null, cover_photo_id: null, featured_on_home: false, position: 1 },
    ] }
    state.collection_photos = { many: [
      { collection_id: 'c1', position: 0, photos: { id: 'p1', slug: 'a', published: true } },
      { collection_id: 'c1', position: 1, photos: { id: 'p2', slug: 'b', published: true } },
      { collection_id: 'c1', position: 2, photos: { id: 'p3', slug: 'c', published: false } }, // draft — ignored
      { collection_id: 'c2', position: 0, photos: { id: 'p9', slug: 'z', published: false } }, // c2 has only a draft
    ] }
    const rows = await listCollectionsForFeature()
    expect(requireAdmin).toHaveBeenCalledOnce()
    expect(rows).not.toBeNull()
    // c1: cover p2 is published -> heroSlug 'b'; published count 2; dek wins the quote
    expect(rows![0]).toMatchObject({ id: 'c1', heroSlug: 'b', publishedCount: 2, previewQuote: 'Objects that survive.', featured_on_home: true })
    // c2: no published members -> heroSlug null, count 0, still returned
    expect(rows![1]).toMatchObject({ id: 'c2', heroSlug: null, publishedCount: 0, previewQuote: '' })
  })

  it('falls back to the first published photo when the cover is a draft', async () => {
    state.collections = { many: [{ id: 'c1', slug: 'r', name: 'R', dek: null, literature: null, cover_photo_id: 'p3', featured_on_home: false, position: 0 }] }
    state.collection_photos = { many: [
      { collection_id: 'c1', position: 0, photos: { id: 'p1', slug: 'a', published: true } },
      { collection_id: 'c1', position: 1, photos: { id: 'p3', slug: 'c', published: false } }, // cover, but a draft
    ] }
    const rows = await listCollectionsForFeature()
    expect(rows![0].heroSlug).toBe('a') // cover is a draft -> first published
  })

  it('returns null on a PostgREST error', async () => {
    state.collections = { error: { message: 'boom' } }
    expect(await listCollectionsForFeature()).toBeNull()
  })
})
