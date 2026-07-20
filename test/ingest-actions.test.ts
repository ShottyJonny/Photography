import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factories are HOISTED above these declarations, so a factory may not
// reference a top-level const by value -- it throws "Cannot access X before
// initialization" and NOT ONE TEST IN THE FILE RUNS. Wrap each spy in a lazy
// arrow so the reference resolves at call time. This repo already does exactly
// this in test/admin-auth-actions.test.ts.
const requireAdmin = vi.fn(async () => ({ id: 'admin-uid', email: 'jon@example.com' }))
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin: () => requireAdmin() }))

const revalidateTag = vi.fn()
vi.mock('next/cache', () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a) }))

const measure = vi.fn()
const encodeLadder = vi.fn()
vi.mock('@/lib/ingest/process', () => ({
  measure: (...a: unknown[]) => measure(...a),
  encodeLadder: (...a: unknown[]) => encodeLadder(...a),
}))

// A minimal fake of the parts of the Supabase client the actions touch.
const db = {
  photos: [] as Record<string, unknown>[],
  orderItems: [] as { photo_id: string }[],
  storage: new Map<string, Set<string>>(),
}
let failNext: string | null = null

function fakeClient() {
  return {
    from: (table: string) => ({
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        const chain = (val: unknown) => ({
          maybeSingle: async () =>
            table === 'photos'
              ? { data: db.photos.find((p) => p.slug === val || p.id === val) ?? null, error: null }
              : { data: null, error: null },
          // collection_photos position lookup: .order().limit().maybeSingle()
          order: () => ({
            limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        })
        return {
          eq: (_col: string, val: unknown) =>
            // order_items count uses head:true, which resolves directly rather
            // than continuing the chain.
            opts?.head
              ? Promise.resolve(
                  failNext === 'count'
                    ? { count: null, error: { message: 'count failed' } }
                    : { count: db.orderItems.filter((i) => i.photo_id === val).length, error: null },
                )
              : chain(val),
        }
      },
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            if (failNext === 'insert') return { data: null, error: { message: 'insert failed' } }
            const created = { id: 'photo-1', ...row }
            db.photos.push(created)
            return { data: created, error: null }
          },
        }),
        // collection_photos inserts are awaited directly, with no .select()
        then: (resolve: (v: unknown) => void) => resolve({ error: null }),
      }),
      delete: () => ({
        eq: async (_col: string, id: string) => {
          db.photos = db.photos.filter((p) => p.id !== id)
          return { error: null }
        },
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          if (failNext === 'update') return { error: { message: 'update failed' } }
          const row = db.photos.find((p) => p.id === id)
          if (row) Object.assign(row, patch)
          return { error: null }
        },
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: async (path: string) =>
          failNext === 'sign'
            ? { data: null, error: { message: 'sign failed' } }
            : { data: { signedUrl: `https://x/${path}`, token: 'tok', path }, error: null },
        download: async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null }),
        upload: async (key: string) => {
          const set = db.storage.get(bucket) ?? new Set()
          set.add(key)
          db.storage.set(bucket, set)
          return { error: null }
        },
        list: async (prefix: string) => {
          const set = db.storage.get(bucket) ?? new Set()
          const names = [...set]
            .filter((k) => k.startsWith(`${prefix}/`))
            .map((k) => ({ name: k.slice(prefix.length + 1) }))
          return { data: names, error: null }
        },
        remove: async (keys: string[]) => {
          const set = db.storage.get(bucket) ?? new Set()
          keys.forEach((k) => set.delete(k))
          return { error: null }
        },
      }),
    },
  }
}

vi.mock('@/lib/supabase/auth-server', () => ({
  createAuthServerClient: async () => fakeClient(),
}))

import {
  beginIngest, createPhotoDraft, generateRegister, finishIngest, setPublished, deletePhoto,
} from '@/lib/ingest/actions'
import { expectedObjects } from '@/lib/ingest/plan'

const GOOD_BEGIN = {
  slug: 'evil-lies',
  title: 'Evil Lies',
  colour: { mime: 'image/jpeg', bytes: 5_000_000 },
}

beforeEach(() => {
  db.photos = []
  db.orderItems = []
  db.storage = new Map()
  failNext = null
  vi.clearAllMocks()
  measure.mockResolvedValue({
    widthPx: 6048,
    heightPx: 7560,
    aspectRatio: 0.8,
    aura: { r: 1, g: 2, b: 3 },
  })
  encodeLadder.mockImplementation(async (_buf: Buffer, slug: string, register: string) =>
    expectedObjects(slug, true)
      .filter((k) => k.includes(`/${register}/`))
      .map((key) => ({ key, body: Buffer.from('x'), contentType: 'image/avif' })),
  )
})

describe('every action guards itself', () => {
  it('calls requireAdmin before doing anything', async () => {
    await beginIngest(GOOD_BEGIN)
    await createPhotoDraft({
      slug: 'evil-lies', title: 'Evil Lies', caption: null, description: null,
      altText: null, collectionId: null, colourPath: 'evil-lies/colour.jpg', silverPath: null,
    })
    await generateRegister({ photoId: 'photo-1', register: 'colour' })
    await finishIngest({ photoId: 'photo-1', publish: false })
    await setPublished({ photoId: 'photo-1', published: false })
    await deletePhoto({ photoId: 'photo-1' })
    expect(requireAdmin).toHaveBeenCalledTimes(6)
  })
})

describe('beginIngest', () => {
  it('returns a signed target for the colour original', async () => {
    const result = await beginIngest(GOOD_BEGIN)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.targets).toHaveLength(1)
    expect(result.targets[0].register).toBe('colour')
    expect(result.targets[0].bucketPath).toBe('evil-lies/colour.jpg')
    expect(result.targets[0].token).toBe('tok')
  })

  it('returns two targets when a silver original is declared', async () => {
    const result = await beginIngest({ ...GOOD_BEGIN, silver: { mime: 'image/tiff', bytes: 30_000_000 } })
    expect(result.ok && result.targets.map((t) => t.bucketPath)).toEqual([
      'evil-lies/colour.jpg',
      'evil-lies/silver.tif',
    ])
  })

  it('rejects a duplicate slug rather than overwriting an existing photograph', async () => {
    db.photos.push({ id: 'existing', slug: 'evil-lies' })
    const result = await beginIngest(GOOD_BEGIN)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/already/i)
  })

  it('rejects an empty slug — it would become a storage path', async () => {
    const result = await beginIngest({ ...GOOD_BEGIN, slug: '' })
    expect(result.ok).toBe(false)
  })

  it('rejects a slug that is not the canonical derivation of itself', async () => {
    // Blocks a hand-crafted POST from smuggling `../` or an uppercase path in.
    const result = await beginIngest({ ...GOOD_BEGIN, slug: '../etc/passwd' })
    expect(result.ok).toBe(false)
  })

  it('rejects a disallowed mime before issuing any URL', async () => {
    const result = await beginIngest({ ...GOOD_BEGIN, colour: { mime: 'application/pdf', bytes: 10 } })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/JPEG, PNG, TIFF or WebP/)
  })
})

describe('createPhotoDraft', () => {
  const DRAFT = {
    slug: 'evil-lies', title: 'Evil Lies', caption: 'A line', description: 'A page',
    altText: 'A description of the image', collectionId: null,
    colourPath: 'evil-lies/colour.jpg', silverPath: null,
  }

  it('inserts unpublished and not-ready, with the measured values', async () => {
    const result = await createPhotoDraft(DRAFT)
    expect(result.ok).toBe(true)
    const row = db.photos[0]
    expect(row.published).toBe(false)
    expect(row.derivatives_ready).toBe(false)
    expect(row.aspect_ratio).toBe(0.8)
    expect(row.width_px).toBe(6048)
    expect(row.aura).toEqual({ r: 1, g: 2, b: 3 })
    expect(row.original_key).toBe('evil-lies/colour.jpg')
  })

  it('sets has_bw_variant and original_bw_key only when a silver file exists', async () => {
    await createPhotoDraft(DRAFT)
    expect(db.photos[0].has_bw_variant).toBe(false)
    expect(db.photos[0].original_bw_key).toBeNull()

    db.photos = []
    await createPhotoDraft({ ...DRAFT, silverPath: 'evil-lies/silver.tif' })
    expect(db.photos[0].has_bw_variant).toBe(true)
    expect(db.photos[0].original_bw_key).toBe('evil-lies/silver.tif')
  })

  it('rejects an under-width original, creates no row, and deletes the upload', async () => {
    measure.mockResolvedValue({ widthPx: 1200, heightPx: 1500, aspectRatio: 0.8, aura: { r: 0, g: 0, b: 0 } })
    const result = await createPhotoDraft(DRAFT)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/1800/)
    expect(db.photos).toHaveLength(0)
    expect(db.storage.get('originals')?.size ?? 0).toBe(0)
  })
})

describe('generateRegister', () => {
  beforeEach(async () => {
    await createPhotoDraft({
      slug: 'evil-lies', title: 'Evil Lies', caption: null, description: null,
      altText: 'alt', collectionId: null, colourPath: 'evil-lies/colour.jpg', silverPath: 'evil-lies/silver.tif',
    })
  })

  it('uploads one register’s full ladder', async () => {
    const result = await generateRegister({ photoId: 'photo-1', register: 'colour' })
    expect(result.ok).toBe(true)
    const written = [...(db.storage.get('derivatives') ?? [])]
    expect(written).toHaveLength(12)
    expect(written.every((k) => k.startsWith('evil-lies/colour/'))).toBe(true)
  })

  it('does not touch the other register', async () => {
    await generateRegister({ photoId: 'photo-1', register: 'colour' })
    expect([...(db.storage.get('derivatives') ?? [])].some((k) => k.includes('/silver/'))).toBe(false)
  })
})

describe('finishIngest', () => {
  async function draft(hasSilver: boolean) {
    await createPhotoDraft({
      slug: 'evil-lies', title: 'Evil Lies', caption: null, description: null,
      altText: 'alt', collectionId: null, colourPath: 'evil-lies/colour.jpg',
      silverPath: hasSilver ? 'evil-lies/silver.tif' : null,
    })
  }

  it('refuses to publish when an expected object is missing', async () => {
    await draft(true)
    await generateRegister({ photoId: 'photo-1', register: 'colour' })  // silver never generated
    const result = await finishIngest({ photoId: 'photo-1', publish: true })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.missing?.length).toBe(12)
    expect(db.photos[0].derivatives_ready).toBe(false)
    expect(db.photos[0].published).toBe(false)
  })

  it('sets derivatives_ready and publishes when the manifest is complete', async () => {
    await draft(false)
    await generateRegister({ photoId: 'photo-1', register: 'colour' })
    const result = await finishIngest({ photoId: 'photo-1', publish: true })
    expect(result.ok).toBe(true)
    expect(db.photos[0].derivatives_ready).toBe(true)
    expect(db.photos[0].published).toBe(true)
  })

  it('sets derivatives_ready but leaves it a draft when publish is false', async () => {
    await draft(false)
    await generateRegister({ photoId: 'photo-1', register: 'colour' })
    await finishIngest({ photoId: 'photo-1', publish: false })
    expect(db.photos[0].derivatives_ready).toBe(true)
    expect(db.photos[0].published).toBe(false)
  })

  it('refuses to publish without alt text, and says so', async () => {
    await createPhotoDraft({
      slug: 'evil-lies', title: 'Evil Lies', caption: null, description: null,
      altText: null, collectionId: null, colourPath: 'evil-lies/colour.jpg', silverPath: null,
    })
    await generateRegister({ photoId: 'photo-1', register: 'colour' })
    const result = await finishIngest({ photoId: 'photo-1', publish: true })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/alt text/i)
    // derivatives_ready is still true -- it IS true. Only publishing is refused.
    expect(db.photos[0].derivatives_ready).toBe(true)
    expect(db.photos[0].published).toBe(false)
  })

  it('revalidates the storefront caches so publishing needs no redeploy (finish)', async () => {
    // design.md §11.4-G prints "publishing needs no redeploy" as UI copy.
    // product.md §8 q5. This assertion is what stops that copy becoming a lie.
    await draft(false)
    await generateRegister({ photoId: 'photo-1', register: 'colour' })
    await finishIngest({ photoId: 'photo-1', publish: true })
    // Two arguments: the profile is required in Next 16.2.
    expect(revalidateTag).toHaveBeenCalledWith('photos', 'max')
    expect(revalidateTag).toHaveBeenCalledWith('photo:evil-lies', 'max')
    expect(revalidateTag).toHaveBeenCalledWith('collections', 'max')
  })
})

describe('deletePhoto', () => {
  async function draftPhoto(published: boolean) {
    await createPhotoDraft({
      slug: 'evil-lies', title: 'Evil Lies', caption: null, description: null,
      altText: 'alt', collectionId: null, colourPath: 'evil-lies/colour.jpg', silverPath: null,
    })
    if (published) db.photos[0].published = true
  }

  it('deletes an unpublished, never-ordered photograph and its files', async () => {
    await draftPhoto(false)
    await generateRegister({ photoId: 'photo-1', register: 'colour' })
    db.storage.set('originals', new Set(['evil-lies/colour.jpg']))

    const result = await deletePhoto({ photoId: 'photo-1' })
    expect(result.ok).toBe(true)
    expect(db.photos).toHaveLength(0)
    expect(db.storage.get('derivatives')?.size ?? 0).toBe(0)
    expect(db.storage.get('originals')?.size ?? 0).toBe(0)
  })

  it('refuses to delete a published photograph', async () => {
    await draftPhoto(true)
    const result = await deletePhoto({ photoId: 'photo-1' })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/unpublish it first/i)
    expect(db.photos).toHaveLength(1)
  })

  it('refuses to delete a photograph that has been ordered', async () => {
    // product.md §6.2: the lab export pulls the ORIGINAL. order_items.photo_id
    // is `on delete set null`, so the receipt survives -- but the file would
    // not, and the failure surfaces months later at reprint time.
    await draftPhoto(false)
    db.orderItems.push({ photo_id: 'photo-1' })
    const result = await deletePhoto({ photoId: 'photo-1' })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/has been ordered/i)
    expect(db.photos).toHaveLength(1)
  })

  it('fails CLOSED when the order check itself errors', async () => {
    await draftPhoto(false)
    failNext = 'count'
    const result = await deletePhoto({ photoId: 'photo-1' })
    expect(result.ok).toBe(false)
    expect(db.photos).toHaveLength(1)
  })
})
