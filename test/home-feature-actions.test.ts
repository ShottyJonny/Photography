/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic Supabase query-builder mock */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAdmin = vi.fn(async () => ({ id: 'admin' }))
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin: () => requireAdmin() }))
const revalidateTag = vi.fn()
vi.mock('next/cache', () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a) }))

let ops: { patch: any; preds: [string, any][] }[] = []
function fake() {
  return {
    from() {
      return {
        update(patch: any) {
          const preds: [string, any][] = []
          const chain: any = {
            eq(c: string, v: any) { preds.push([c, v]); return chain },
            then(res: any) { ops.push({ patch, preds }); res({ error: null }) },
          }
          return chain
        },
      }
    },
  }
}
vi.mock('@/lib/supabase/auth-server', () => ({ createAuthServerClient: async () => fake() }))

import { setFeaturedCollection } from '@/lib/admin/home-feature-actions'

beforeEach(() => { ops = []; vi.clearAllMocks() })

describe('setFeaturedCollection', () => {
  it('requireAdmin first; clears the old feature THEN sets the new one; revalidates', async () => {
    const r = await setFeaturedCollection({ collectionId: 'c2' })
    expect(requireAdmin).toHaveBeenCalledOnce()
    expect(r.ok).toBe(true)
    expect(ops).toHaveLength(2)
    // clear
    expect(ops[0]).toEqual({ patch: { featured_on_home: false }, preds: [['featured_on_home', true]] })
    // then set
    expect(ops[1]).toEqual({ patch: { featured_on_home: true }, preds: [['id', 'c2']] })
    expect(revalidateTag).toHaveBeenCalledWith('collections', 'max')
  })

  it('clears only (no set) when collectionId is null', async () => {
    const r = await setFeaturedCollection({ collectionId: null })
    expect(r.ok).toBe(true)
    expect(ops).toHaveLength(1)
    expect(ops[0]).toEqual({ patch: { featured_on_home: false }, preds: [['featured_on_home', true]] })
    expect(revalidateTag).toHaveBeenCalledWith('collections', 'max')
  })
})
