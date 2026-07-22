/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic Supabase query-builder mock */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAdmin = vi.fn(async () => ({ id: 'admin' }))
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin: () => requireAdmin() }))
const revalidateTag = vi.fn()
vi.mock('next/cache', () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a) }))

const db = { collections: [] as any[], collection_photos: [] as any[] }
let rpcCalls: { fn: string; args: unknown }[] = []

function fake() {
  return {
    from(table: string) {
      const rows = () => (db as any)[table] as any[]
      return {
        select() {
          const preds: [string, any][] = []
          const match = (r: any) => preds.every(([c, v]) => r[c] === v)
          const chain: any = {
            eq(c: string, v: any) { preds.push([c, v]); return chain },
            order() { return chain },
            limit() { return chain },
            maybeSingle: async () => ({ data: rows().find(match) ?? null, error: null }),
            then: (res: any) => res({ data: preds.length ? rows().filter(match) : rows(), error: null }),
          }
          return chain
        },
        insert(rowOrRows: any) {
          const list = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows]
          list.forEach((r) => { if (!r.id) r.id = 'c-new'; rows().push(r) })
          return {
            select: () => ({ single: async () => ({ data: rows()[rows().length - 1], error: null }) }),
            then: (res: any) => res({ error: null }),   // insert(array) awaited directly
          }
        },
        update(patch: any) {
          const preds: [string, any][] = []
          const chain: any = {
            eq(c: string, v: any) { preds.push([c, v]); return chain },
            then(res: any) { rows().filter((r: any) => preds.every(([c, v]) => r[c] === v)).forEach((r: any) => Object.assign(r, patch)); res({ error: null }) },
          }
          return chain
        },
        delete() {
          const preds: [string, any][] = []
          const chain: any = {
            eq(c: string, v: any) { preds.push([c, v]); return chain },
            then(res: any) { (db as any)[table] = rows().filter((r: any) => !preds.every(([c, v]) => r[c] === v)); res({ error: null }) },
          }
          return chain
        },
      }
    },
    rpc: async (fn: string, args: unknown) => { rpcCalls.push({ fn, args }); return { error: null } },
  }
}
vi.mock('@/lib/supabase/auth-server', () => ({ createAuthServerClient: async () => fake() }))

import { createCollection, updateCollectionMeta, updateLiterature, deleteCollection } from '@/lib/admin/collection-actions'

beforeEach(() => { db.collections = []; db.collection_photos = []; rpcCalls = []; vi.clearAllMocks() })

describe('createCollection', () => {
  it('requireAdmin, derives slug, inserts, returns id', async () => {
    const r = await createCollection({ name: 'Wide Open' })
    expect(requireAdmin).toHaveBeenCalledOnce()
    expect(r.ok).toBe(true)
    expect(db.collections[0].slug).toBe('wide-open')
    expect(revalidateTag).toHaveBeenCalledWith('collections', 'max')
  })
  it('rejects an empty name', async () => {
    const r = await createCollection({ name: '  ' })
    expect(r.ok).toBe(false)
    expect(db.collections).toHaveLength(0)
  })
  it('rejects a duplicate slug', async () => {
    db.collections.push({ id: 'x', slug: 'relics', name: 'Relics' })
    const r = await createCollection({ name: 'Relics' })
    expect(r.ok).toBe(false)
  })
})

describe('updateCollectionMeta', () => {
  beforeEach(() => { db.collections.push({ id: 'c1', slug: 'relics', name: 'Relics', dek: null }) })
  it('updates name/slug/dek', async () => {
    const r = await updateCollectionMeta({ id: 'c1', name: 'Relics II', slug: 'relics-ii', dek: 'a dek' })
    expect(r.ok).toBe(true)
    expect(db.collections[0]).toMatchObject({ name: 'Relics II', slug: 'relics-ii', dek: 'a dek' })
  })
  it('rejects a non-canonical slug (public POST guard)', async () => {
    const r = await updateCollectionMeta({ id: 'c1', name: 'Relics', slug: '../evil', dek: null })
    expect(r.ok).toBe(false)
  })
  it('rejects a slug already used by ANOTHER collection', async () => {
    db.collections.push({ id: 'c2', slug: 'taken', name: 'Other' })
    const r = await updateCollectionMeta({ id: 'c1', name: 'Relics', slug: 'taken', dek: null })
    expect(r.ok).toBe(false)
  })
})

describe('updateLiterature', () => {
  it('saves literature and revalidates', async () => {
    db.collections.push({ id: 'c1', slug: 'relics', name: 'Relics' })
    const r = await updateLiterature({ id: 'c1', literature: 'An essay.' })
    expect(r.ok).toBe(true)
    expect(db.collections[0].literature).toBe('An essay.')
    expect(revalidateTag).toHaveBeenCalledWith('collections', 'max')
  })
})

describe('deleteCollection', () => {
  it('deletes the collection row', async () => {
    db.collections.push({ id: 'c1', slug: 'relics', name: 'Relics' })
    const r = await deleteCollection({ id: 'c1' })
    expect(r.ok).toBe(true)
    expect(db.collections).toHaveLength(0)
  })
})

import { addPhotos, removePhoto, reorderPhotos, setCover } from '@/lib/admin/collection-actions'

describe('addPhotos', () => {
  it('appends at max(position)+1 and revalidates', async () => {
    db.collections.push({ id: 'c1', slug: 'relics', name: 'Relics' })
    db.collection_photos.push({ collection_id: 'c1', photo_id: 'p0', position: 0 })
    const r = await addPhotos({ collectionId: 'c1', photoIds: ['p1', 'p2'] })
    expect(r.ok).toBe(true)
    const added = db.collection_photos.filter((j) => j.collection_id === 'c1')
    expect(added.map((j) => j.photo_id)).toEqual(['p0', 'p1', 'p2'])
    expect(added.map((j) => j.position)).toEqual([0, 1, 2])
    expect(revalidateTag).toHaveBeenCalledWith('collections', 'max')
  })
})

describe('reorderPhotos', () => {
  beforeEach(() => {
    db.collections.push({ id: 'c1', slug: 'relics', name: 'Relics' })
    db.collection_photos.push({ collection_id: 'c1', photo_id: 'a', position: 0 })
    db.collection_photos.push({ collection_id: 'c1', photo_id: 'b', position: 1 })
  })
  it('calls the RPC with the ordered ids', async () => {
    const r = await reorderPhotos({ collectionId: 'c1', orderedPhotoIds: ['b', 'a'] })
    expect(r.ok).toBe(true)
    expect(rpcCalls).toContainEqual({ fn: 'reorder_collection_photos', args: { p_collection: 'c1', p_ordered: ['b', 'a'] } })
  })
  it('rejects an id set that adds, drops, or duplicates a member', async () => {
    const added = await reorderPhotos({ collectionId: 'c1', orderedPhotoIds: ['a', 'b', 'c'] })
    expect(added.ok).toBe(false)
    const dropped = await reorderPhotos({ collectionId: 'c1', orderedPhotoIds: ['a'] })
    expect(dropped.ok).toBe(false)
    // Same Set as {a,b} but a duplicate 'a' — would join two RPC rows. Rejected by the length check.
    const dup = await reorderPhotos({ collectionId: 'c1', orderedPhotoIds: ['a', 'b', 'a'] })
    expect(dup.ok).toBe(false)
    expect(rpcCalls).toHaveLength(0)
  })
})

describe('setCover / removePhoto', () => {
  beforeEach(() => {
    db.collections.push({ id: 'c1', slug: 'relics', name: 'Relics', cover_photo_id: null })
    db.collection_photos.push({ collection_id: 'c1', photo_id: 'p1', position: 0 })
  })
  it('sets and clears the cover', async () => {
    await setCover({ collectionId: 'c1', photoId: 'p1' })
    expect(db.collections[0].cover_photo_id).toBe('p1')
    await setCover({ collectionId: 'c1', photoId: null })
    expect(db.collections[0].cover_photo_id).toBeNull()
  })
  it('removePhoto clears the cover when it removed the cover', async () => {
    db.collections[0].cover_photo_id = 'p1'
    await removePhoto({ collectionId: 'c1', photoId: 'p1' })
    expect(db.collection_photos.filter((j) => j.collection_id === 'c1')).toHaveLength(0)
    expect(db.collections[0].cover_photo_id).toBeNull()
  })
})
