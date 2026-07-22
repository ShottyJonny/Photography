import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAdmin = vi.fn(async () => ({ id: 'admin' }))
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin: () => requireAdmin() }))

// A fake that records the last table/args and returns canned data per table.
const state: Record<string, unknown> = {}
function fake() {
  return {
    from(table: string) {
      const q = {
        _table: table,
        select() { return q },
        eq() { return q },
        order() { return q },
        maybeSingle: async () => ({ data: (state[table] as { one?: unknown })?.one ?? null, error: null }),
        then: (res: (v: { data: unknown; error: null }) => void) =>
          res({ data: (state[table] as { many?: unknown })?.many ?? [], error: null }),
      }
      return q
    },
  }
}
vi.mock('@/lib/supabase/auth-server', () => ({ createAuthServerClient: async () => fake() }))

import { listCollectionsAdmin, getCollectionForEdit } from '@/lib/data/collections-admin'

beforeEach(() => { vi.clearAllMocks(); for (const k in state) delete state[k] })

describe('listCollectionsAdmin', () => {
  it('requireAdmin first; returns rows', async () => {
    state.collections = { many: [{ id: 'c1', slug: 'relics', name: 'Relics', featured_on_home: true, cover_photo_id: null }] }
    state.collection_photos = { many: [{ collection_id: 'c1' }, { collection_id: 'c1' }] }
    const rows = await listCollectionsAdmin()
    expect(requireAdmin).toHaveBeenCalledOnce()
    expect(rows).not.toBeNull()
    expect(rows![0]).toMatchObject({ id: 'c1', name: 'Relics', featured_on_home: true, count: 2 })
  })
})

describe('getCollectionForEdit', () => {
  it('returns meta + ordered members incl drafts', async () => {
    state.collections = { one: { id: 'c1', slug: 'relics', name: 'Relics', dek: 'd', literature: 'L', cover_photo_id: 'p2', featured_on_home: false } }
    state.collection_photos = { many: [
      { position: 0, photos: { id: 'p1', slug: 'a', title: 'A', published: true } },
      { position: 1, photos: { id: 'p2', slug: 'b', title: 'B', published: false } },
    ] }
    const detail = await getCollectionForEdit('c1')
    expect(detail).not.toBeNull()
    expect(detail!.members.map((m) => m.id)).toEqual(['p1', 'p2'])
    expect(detail!.members[1].published).toBe(false)
    expect(detail!.cover_photo_id).toBe('p2')
  })
})
