# Slice 6a — Collections + Literature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin write surface for collections — create/edit, add photos, drag-reorder, set a cover, and write the literature — assembling collections that render on the live `/collections` storefront.

**Architecture:** Eight Server Actions (`requireAdmin()` first) over `collections`/`collection_photos`, with reordering delegated to a Postgres function that rewrites positions in one transaction (two-phase offset, so the `unique(collection_id, position)` index never collides). Drag reorder via `@dnd-kit`; the reorder *logic* is a pure tested function, the drag *interaction* is verified in the browser.

**Tech Stack:** Next.js 16.2 (App Router), React 19, TS strict, `@supabase/supabase-js`, `@dnd-kit/*`, Vitest 2.1, Node 22.

**Spec:** `docs/superpowers/specs/2026-07-20-collections-literature-design.md`. Read it before starting.

## Global Constraints

Every task's requirements implicitly include this section.

- **Branch `slice-6a` off `develop`.** Never commit to `develop`/`main`. Never `--no-verify`/`--force`.
- **Every commit ends with:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Gate, all green:** `npm run lint` (0 errors AND warnings), `npm run typecheck`, `npm run build`, `npm test`.
- **Baseline: 1791 tests.** Never let it drop.
- **`requireAdmin()` is the first statement of every Server Action and admin read.** From `@/lib/admin/require-admin`. `test/admin-routes.test.ts` walks `lib/admin/`, `lib/ingest/`, `app/admin/`, `components/admin/` for `'use server'` files requiring `requireAdmin` in each `export async function`. **`collection-actions.ts` goes in `lib/admin/` — no walker change, no exemption.**
- **`import 'server-only'`** atop every server-only module. Vitest stubs it.
- **DB is snake_case.** Columns: `collections(id, slug, name, dek, literature, cover_photo_id, featured_on_home, position)`, `collection_photos(collection_id, photo_id, position)`.
- **Money code untouched.** No `lib/pricing.ts`, `lib/checkout/*`, `lib/orders/*`, `app/api/*`.
- **Apostrophes in JSX are `’` (U+2019), never `'`** — 0-warning lint gate.
- **No `@testing-library/jest-dom`** — assert on `document.querySelector`/`textContent`/attributes. Mock `redirect()`/`notFound()` to throw. Never construct a real Supabase client in a test.
- **`revalidateTag` takes TWO args in Next 16.2:** `revalidateTag('collections', 'max')`.
- **Next 16 route params are a Promise:** `params: Promise<{ id: string }>`, `const { id } = await params`.
- **Admin copy is terse.** Form borders `--hairform`; `min-height:44px`; no `outline:none`.
- **Reuse, don't reinvent:** `deriveSlug` (`@/lib/ingest/slug`) for collection slugs; `derivativeSrc` (`@/lib/images/derivatives`) for thumbnails; the `admin-*` field CSS from slice 5a.

### Blocking value — STOP if unapplied

| Value | Used in | Status |
|---|---|---|
| The `reorder_collection_photos` Postgres function + grant, applied to the live project | Task 5's `reorderPhotos` | **`<UNAPPLIED>` — Jon applies it (Task 1 Step 6). The action's test mocks the RPC; the live function is verified manually (§10).** |

---

## File Structure

```
supabase/schema.sql                          MODIFY  + reorder_collection_photos() + grant
package.json                                 MODIFY  + @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
lib/reorder.ts                                NEW  pure applyReorder
lib/data/collections-admin.ts                 NEW  server  listCollectionsAdmin / getCollectionForEdit / listAddablePhotos
lib/admin/collection-actions.ts               NEW  'use server'  eight actions
components/admin/
  CollectionList.tsx                          NEW  the 250px master list
  LiteratureEditor.tsx                        NEW  name(read-only)/dek/literature + word count
  WorksList.tsx                               NEW  @dnd-kit sortable + cover toggle + remove
  PhotoPicker.tsx                             NEW  "＋ Add works"
  CollectionEditor.tsx                        NEW  orchestrates the above + save
  AdminNav.tsx                                MODIFY  Collections live
app/admin/(protected)/collections/
  page.tsx                                    NEW  list + empty state
  new/page.tsx                                NEW  create form
  [id]/page.tsx                               NEW  editor
app/(store)/collections/[slug]/page.tsx       MODIFY  literature -> <p> paragraphs
app/globals.css                              MODIFY  append .admin-col-*
test/
  reorder.test.ts                            NEW
  collection-actions.test.ts                 NEW
  collections-admin-read.test.ts             NEW
  collection-editor.test.tsx                 NEW
  collections-landing.test.tsx               NEW
  collection-literature-render.test.tsx      NEW
  admin-nav.test.tsx                          MODIFY
CLAUDE.md                                     MODIFY  (Task 11)
```

> **Dropped from the spec's file list:** `lib/collections/slug.ts` and `collection-slug.test.ts`. Collection slugs derive identically to photo slugs — reuse `deriveSlug` from `@/lib/ingest/slug` directly (DRY). Recorded here so the deviation is deliberate.

---

## Task 1: Schema function, dnd-kit, reorder helper

**Files:**
- Modify: `supabase/schema.sql`, `package.json`
- Create: `lib/reorder.ts`, `test/reorder.test.ts`

**Interfaces:**
- Produces: `applyReorder<T>(items: T[], from: number, to: number): T[]` (Task 8 consumes); the `reorder_collection_photos` SQL (Task 5 calls via RPC); `@dnd-kit` deps (Task 8).

- [ ] **Step 1: Write the failing test**

`test/reorder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { applyReorder } from '@/lib/reorder'

describe('applyReorder', () => {
  it('moves an item down', () => {
    expect(applyReorder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })
  it('moves an item up', () => {
    expect(applyReorder(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })
  it('is a no-op when from === to', () => {
    expect(applyReorder(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
  })
  it('handles the boundaries', () => {
    expect(applyReorder(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(applyReorder(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })
  it('does not mutate the input', () => {
    const input = ['a', 'b', 'c']
    applyReorder(input, 0, 2)
    expect(input).toEqual(['a', 'b', 'c'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/reorder.test.ts` → FAIL (`@/lib/reorder` unresolved).

- [ ] **Step 3: Write `lib/reorder.ts`**

```ts
/** Pure array move — remove from `from`, insert at `to`. Used by WorksList on drop. */
export function applyReorder<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/reorder.test.ts` → PASS, 5 tests.

- [ ] **Step 5: Add the Postgres function to `supabase/schema.sql`**

Append at the end of the collections section (after the `collection_photos_position` index):

```sql
-- product.md §5.3: editorial order. Rewrites every position for a collection from an ordered
-- array of photo ids, in ONE transaction. Two-phase offset (n is always << 1000000) so the
-- source and target position ranges never overlap and unique(collection_id, position) cannot
-- collide mid-update, even though the index is not deferrable.
create or replace function reorder_collection_photos(p_collection uuid, p_ordered uuid[])
returns void language plpgsql security invoker as $$
begin
  update collection_photos set position = position + 1000000 where collection_id = p_collection;
  update collection_photos cp
    set position = ord.i - 1
    from (select unnest(p_ordered) as pid, generate_subscripts(p_ordered, 1) as i) ord
    where cp.collection_id = p_collection and cp.photo_id = ord.pid;
end $$;

grant execute on function reorder_collection_photos(uuid, uuid[]) to authenticated;
```

- [ ] **Step 6: Apply the function to the live project (Jon)**

**Jon runs this in the Supabase SQL editor**, then confirms:

```sql
select proname from pg_proc where proname = 'reorder_collection_photos';
```

Expected: one row. Until this exists, `reorderPhotos` fails at runtime (its test mocks the RPC, so the gate stays green — the live function is verified in §10).

- [ ] **Step 7: Install @dnd-kit**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 8: Verify the gate**

Run: `npm run lint && npm run typecheck && npm run build && npm test`
Expected: all green, 1791 + 5 = **1796**.

- [ ] **Step 9: Commit**

```bash
git add supabase/schema.sql package.json package-lock.json lib/reorder.ts test/reorder.test.ts
git commit -m "feat(collections): reorder Postgres function, dnd-kit, applyReorder

The unique(collection_id, position) index makes naïve position rewrites collide.
reorder_collection_photos rewrites all positions in one transaction via a
two-phase offset so source and target ranges never overlap. applyReorder is the
pure client-side move the sortable list uses on drop.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `lib/data/collections-admin.ts` — the reads

**Files:**
- Create: `lib/data/collections-admin.ts`, `test/collections-admin-read.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `createAuthServerClient`.
- Produces:
  - `interface AdminCollectionRow { id; slug; name; count: number; featured_on_home: boolean; coverSlug: string | null }`
  - `interface AdminMember { id; slug; title; published: boolean; position: number }`
  - `interface AdminCollectionDetail { id; slug; name; dek: string | null; literature: string | null; cover_photo_id: string | null; featured_on_home: boolean; members: AdminMember[] }`
  - `interface AddablePhoto { id; slug; title; published: boolean }`
  - `listCollectionsAdmin(): Promise<AdminCollectionRow[] | null>`
  - `getCollectionForEdit(id): Promise<AdminCollectionDetail | null>`
  - `listAddablePhotos(collectionId): Promise<AddablePhoto[] | null>`

- [ ] **Step 1: Write the failing test**

`test/collections-admin-read.test.ts` — mock the client; assert shape and `requireAdmin`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails** → `@/lib/data/collections-admin` unresolved.

- [ ] **Step 3: Write `lib/data/collections-admin.ts`**

```ts
import 'server-only'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

export interface AdminCollectionRow {
  id: string; slug: string; name: string
  count: number; featured_on_home: boolean; coverSlug: string | null
}
export interface AdminMember { id: string; slug: string; title: string; published: boolean; position: number }
export interface AdminCollectionDetail {
  id: string; slug: string; name: string; dek: string | null; literature: string | null
  cover_photo_id: string | null; featured_on_home: boolean; members: AdminMember[]
}
export interface AddablePhoto { id: string; slug: string; title: string; published: boolean }

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function listCollectionsAdmin(): Promise<AdminCollectionRow[] | null> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { data: cols, error } = await db
    .from('collections')
    .select('id, slug, name, featured_on_home, cover_photo_id, position')
    .order('position', { ascending: true })
  if (error) { console.error('[admin] listCollectionsAdmin', error); return null }

  const { data: joins } = await db.from('collection_photos').select('collection_id')
  const counts = new Map<string, number>()
  for (const j of (joins as any[]) ?? []) counts.set(j.collection_id, (counts.get(j.collection_id) ?? 0) + 1)

  // cover slug: resolve cover_photo_id -> photos.slug for the ones that have a cover
  const coverIds = (cols as any[]).map((c) => c.cover_photo_id).filter(Boolean)
  const coverSlug = new Map<string, string>()
  if (coverIds.length) {
    const { data: photos } = await db.from('photos').select('id, slug').in('id', coverIds)
    for (const p of (photos as any[]) ?? []) coverSlug.set(p.id, p.slug)
  }

  return (cols as any[]).map((c) => ({
    id: c.id, slug: c.slug, name: c.name,
    featured_on_home: c.featured_on_home,
    count: counts.get(c.id) ?? 0,
    coverSlug: c.cover_photo_id ? coverSlug.get(c.cover_photo_id) ?? null : null,
  }))
}

export async function getCollectionForEdit(id: string): Promise<AdminCollectionDetail | null> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { data: col, error } = await db
    .from('collections')
    .select('id, slug, name, dek, literature, cover_photo_id, featured_on_home')
    .eq('id', id)
    .maybeSingle()
  if (error) { console.error('[admin] getCollectionForEdit', error); return null }
  if (!col) return null

  const { data: rows } = await db
    .from('collection_photos')
    .select('position, photos!inner(id, slug, title, published)')
    .eq('collection_id', id)
    .order('position', { ascending: true })

  const members: AdminMember[] = ((rows as any[]) ?? []).map((r) => ({
    id: r.photos.id, slug: r.photos.slug, title: r.photos.title,
    published: r.photos.published, position: r.position,
  }))
  return { ...(col as any), members }
}

export async function listAddablePhotos(collectionId: string): Promise<AddablePhoto[] | null> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { data: members } = await db.from('collection_photos').select('photo_id').eq('collection_id', collectionId)
  const inSet = new Set(((members as any[]) ?? []).map((m) => m.photo_id))
  const { data: photos, error } = await db.from('photos').select('id, slug, title, published').order('created_at', { ascending: false })
  if (error) { console.error('[admin] listAddablePhotos', error); return null }
  return ((photos as any[]) ?? []).filter((p) => !inSet.has(p.id)).map((p) => ({ id: p.id, slug: p.slug, title: p.title, published: p.published }))
}
```

- [ ] **Step 4: Run to verify passes** → 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/data/collections-admin.ts test/collections-admin-read.test.ts
git commit -m "feat(collections): admin reads — list, edit-detail, addable pool

getCollectionForEdit returns members in position order INCLUDING drafts (badged
in the UI). listAddablePhotos excludes current members so the picker can't
double-add. null on a PostgREST error (4b §4.2).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `collection-actions.ts` — collection-level (create / meta / literature / delete)

**Files:**
- Create: `lib/admin/collection-actions.ts`, `test/collection-actions.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `createAuthServerClient`, `revalidateTag`, `deriveSlug` (`@/lib/ingest/slug`).
- Produces (Task 5 appends the join-level actions to the same file):
  - `type Result = { ok: true } | { ok: false; message: string }`
  - `createCollection({ name }): Promise<{ ok: true; id: string } | { ok: false; message: string }>`
  - `updateCollectionMeta({ id, name, slug, dek }): Promise<Result>`
  - `updateLiterature({ id, literature }): Promise<Result>`
  - `deleteCollection({ id }): Promise<Result>`

- [ ] **Step 1: Write the failing test**

`test/collection-actions.test.ts`. This file's COMPLETE fake client is defined here (Task 4 appends only *test cases*, never touches the fake). It supports every chain both tasks' actions build: `select().eq().maybeSingle()`, `select().order().limit().maybeSingle()`, `select().eq().order()` (list), `insert(row).select().single()`, `insert(rows[])` awaited, `update().eq()` (one predicate) awaited, `delete().eq()` and `delete().eq().eq()` (two predicates) awaited, and `rpc()`. Predicates accumulate on `.eq()`; terminals are **lazy thenables** (`then` runs only on await, so `.eq().eq()` never double-applies).

```ts
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
```

- [ ] **Step 2: Run to verify fails** → `@/lib/admin/collection-actions` unresolved.

- [ ] **Step 3: Write `lib/admin/collection-actions.ts`** (Task 5 appends the join actions)

```ts
'use server'

import { revalidateTag } from 'next/cache'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import { deriveSlug } from '@/lib/ingest/slug'

export type Result = { ok: true } | { ok: false; message: string }

function blank(v: string | null): boolean { return v === null || v.trim() === '' }
function clean(v: string | null): string | null { return blank(v) ? null : v!.trim() }

function revalidateCollections(): void {
  revalidateTag('collections', 'max')
}

export async function createCollection(input: { name: string }): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  await requireAdmin()
  if (blank(input.name)) return { ok: false, message: 'A name is required.' }
  const slug = deriveSlug(input.name)
  if (!slug) return { ok: false, message: 'That name has no usable web address.' }

  const db = await createAuthServerClient()
  const { data: existing } = await db.from('collections').select('id').eq('slug', slug).maybeSingle()
  if (existing) return { ok: false, message: 'A collection already uses that web address.' }

  const { data: last } = await db.from('collections').select('position').order('position', { ascending: false }).limit(1).maybeSingle()
  const position = (((last as { position?: number } | null)?.position) ?? 0) + 1

  const { data: row, error } = await db
    .from('collections')
    .insert({ slug, name: input.name.trim(), position })
    .select()
    .single()
  if (error || !row) return { ok: false, message: 'Couldn’t create the collection.' }

  revalidateCollections()
  return { ok: true, id: (row as { id: string }).id }
}

export async function updateCollectionMeta(input: { id: string; name: string; slug: string; dek: string | null }): Promise<Result> {
  await requireAdmin()
  if (blank(input.name)) return { ok: false, message: 'A name is required.' }
  // Public POST guard (slice 4a §3.2): slug must be the canonical derivation of itself.
  if (!input.slug || deriveSlug(input.slug) !== input.slug) {
    return { ok: false, message: 'That web address isn’t usable. Use letters, numbers and hyphens.' }
  }

  const db = await createAuthServerClient()
  const { data: clash } = await db.from('collections').select('id').eq('slug', input.slug).maybeSingle()
  if (clash && (clash as { id: string }).id !== input.id) {
    return { ok: false, message: 'Another collection already uses that web address.' }
  }

  const { error } = await db.from('collections').update({ name: input.name.trim(), slug: input.slug, dek: clean(input.dek) }).eq('id', input.id)
  if (error) return { ok: false, message: 'Couldn’t save the collection.' }
  revalidateCollections()
  return { ok: true }
}

export async function updateLiterature(input: { id: string; literature: string | null }): Promise<Result> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { error } = await db.from('collections').update({ literature: clean(input.literature) }).eq('id', input.id)
  if (error) return { ok: false, message: 'Couldn’t save the literature.' }
  revalidateCollections()
  return { ok: true }
}

export async function deleteCollection(input: { id: string }): Promise<Result> {
  await requireAdmin()
  const db = await createAuthServerClient()
  // collection_photos cascade-deletes (schema). Photos are untouched.
  const { error } = await db.from('collections').delete().eq('id', input.id)
  if (error) return { ok: false, message: 'Couldn’t delete the collection.' }
  revalidateCollections()
  return { ok: true }
}
```

- [ ] **Step 4: Run to verify passes** → PASS. Also run `npx vitest run test/admin-routes.test.ts` → still green (no exemption).

- [ ] **Step 5: Commit**

```bash
git add lib/admin/collection-actions.ts test/collection-actions.test.ts
git commit -m "feat(collections): create / meta / literature / delete actions

requireAdmin first in each; slug must be the canonical derivation of itself
(public POST guard); duplicate slug rejected against OTHER collections. Delete
cascades the join, leaves photos. Revalidates collections.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Join-level actions (addPhotos / removePhoto / reorderPhotos / setCover)

**Files:**
- Modify: `lib/admin/collection-actions.ts` (append)
- Modify: `test/collection-actions.test.ts` (append)

**Interfaces:**
- Produces:
  - `addPhotos({ collectionId, photoIds }): Promise<Result>`
  - `removePhoto({ collectionId, photoId }): Promise<Result>`
  - `reorderPhotos({ collectionId, orderedPhotoIds }): Promise<Result>`
  - `setCover({ collectionId, photoId }): Promise<Result>` (photoId `string | null`)

- [ ] **Step 1: Append the failing tests** to `test/collection-actions.test.ts`

```ts
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
```

> **The Task 3 fake already supports all of this** (`insert(array)`, `delete().eq().eq()`, `rpc`) — do NOT modify `fake()`. Task 4 appends only the test cases below.

- [ ] **Step 2: Run to verify fails** → the four new exports unresolved.

- [ ] **Step 3: Append to `lib/admin/collection-actions.ts`**

```ts
export async function addPhotos(input: { collectionId: string; photoIds: string[] }): Promise<Result> {
  await requireAdmin()
  if (input.photoIds.length === 0) return { ok: true }
  const db = await createAuthServerClient()
  const { data: last } = await db
    .from('collection_photos')
    .select('position')
    .eq('collection_id', input.collectionId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  let position = (((last as { position?: number } | null)?.position) ?? -1) + 1
  const rows = input.photoIds.map((photo_id) => ({ collection_id: input.collectionId, photo_id, position: position++ }))
  const { error } = await db.from('collection_photos').insert(rows)
  if (error) return { ok: false, message: 'Couldn’t add the works.' }
  revalidateCollections()
  return { ok: true }
}

export async function removePhoto(input: { collectionId: string; photoId: string }): Promise<Result> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { error } = await db.from('collection_photos').delete().eq('collection_id', input.collectionId).eq('photo_id', input.photoId)
  if (error) return { ok: false, message: 'Couldn’t remove the work.' }
  // If it was the cover, clear the cover.
  const { data: col } = await db.from('collections').select('cover_photo_id').eq('id', input.collectionId).maybeSingle()
  if ((col as { cover_photo_id?: string } | null)?.cover_photo_id === input.photoId) {
    await db.from('collections').update({ cover_photo_id: null }).eq('id', input.collectionId)
  }
  revalidateCollections()
  return { ok: true }
}

export async function reorderPhotos(input: { collectionId: string; orderedPhotoIds: string[] }): Promise<Result> {
  await requireAdmin()
  const db = await createAuthServerClient()
  // The ordered set must be EXACTLY the current membership — no adds/drops smuggled in.
  const { data: members } = await db.from('collection_photos').select('photo_id').eq('collection_id', input.collectionId)
  const current = new Set(((members as { photo_id: string }[]) ?? []).map((m) => m.photo_id))
  const given = new Set(input.orderedPhotoIds)
  // Array length too, not just Set membership — a payload like [a,b,a] has the
  // same Set as {a,b} but its duplicate would join two rows in the RPC's unnest.
  if (input.orderedPhotoIds.length !== current.size || current.size !== given.size || [...current].some((id) => !given.has(id))) {
    return { ok: false, message: 'The order doesn’t match the collection’s works.' }
  }
  const { error } = await db.rpc('reorder_collection_photos', { p_collection: input.collectionId, p_ordered: input.orderedPhotoIds })
  if (error) return { ok: false, message: 'Couldn’t save the order.' }
  revalidateCollections()
  return { ok: true }
}

export async function setCover(input: { collectionId: string; photoId: string | null }): Promise<Result> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { error } = await db.from('collections').update({ cover_photo_id: input.photoId }).eq('id', input.collectionId)
  if (error) return { ok: false, message: 'Couldn’t set the cover.' }
  revalidateCollections()
  return { ok: true }
}
```

- [ ] **Step 4: Run to verify passes** → all `collection-actions` tests PASS; `admin-routes` still green.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/collection-actions.ts test/collection-actions.test.ts
git commit -m "feat(collections): membership actions — add / remove / reorder / cover

reorderPhotos validates the id set matches current membership exactly (no
adds/drops via a crafted POST) before calling the reorder RPC. removePhoto
clears the cover if it removed the cover. addPhotos appends at the end.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: The storefront literature paragraphs

**Files:**
- Modify: `app/(store)/collections/[slug]/page.tsx`
- Test: `test/collection-literature-render.test.tsx`

**Interfaces:** none new. Pure rendering change.

> **Context:** the body currently renders `{detail.literature}` in one `<div>` with `white-space: pre-wrap`, so paragraphs already show *visually*. This change makes them semantic `<p>` elements (screen-reader paragraph structure, §8) and keeps the drop-cap on the first paragraph only. Not a visual fix — a semantic one.

- [ ] **Step 1: Write the failing test**

`test/collection-literature-render.test.tsx` — render the page's literature section with a two-paragraph string. Since the page is an async server component reading data, test the **rendering** by extracting a small pure helper. Add the helper to the page and test it:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LiteratureBody } from '@/app/(store)/collections/[slug]/page'

describe('LiteratureBody', () => {
  it('splits blank-line-separated text into <p> paragraphs', () => {
    const { container } = render(<LiteratureBody text={'First para.\n\nSecond para.'} />)
    const ps = container.querySelectorAll('p.collection-literature-body')
    expect(ps).toHaveLength(2)
    expect(ps[0].textContent).toBe('First para.')
    expect(ps[1].textContent).toBe('Second para.')
  })
  it('puts the drop-cap class on the first paragraph only', () => {
    const { container } = render(<LiteratureBody text={'One.\n\nTwo.'} />)
    const ps = container.querySelectorAll('p.collection-literature-body')
    expect(ps[0].classList.contains('is-first')).toBe(true)
    expect(ps[1].classList.contains('is-first')).toBe(false)
  })
  it('renders a single paragraph as one <p> with the drop-cap', () => {
    const { container } = render(<LiteratureBody text={'Just one.'} />)
    const ps = container.querySelectorAll('p.collection-literature-body')
    expect(ps).toHaveLength(1)
    expect(ps[0].classList.contains('is-first')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify fails** → `LiteratureBody` not exported.

- [ ] **Step 3: Edit `app/(store)/collections/[slug]/page.tsx`**

Add an exported helper near the top (after imports):

```tsx
export function LiteratureBody({ text }: { text: string }) {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return (
    <>
      {paras.map((para, i) => (
        <p key={i} className={i === 0 ? 'collection-literature-body is-first' : 'collection-literature-body'}>
          {para}
        </p>
      ))}
    </>
  )
}
```

Replace the body render:

```tsx
          <div className="collection-literature-body">{detail.literature}</div>
```
with:
```tsx
          <LiteratureBody text={detail.literature} />
```

Update the CSS: change the `::first-letter` selector to target only the first paragraph, and drop `white-space: pre-wrap` (no longer needed — real paragraphs), keeping paragraph spacing:

```css
        .collection-literature-body {
          font-family: var(--font-newsreader);
          font-size: 1.125rem;
          line-height: 1.75;
          color: var(--ink);
          margin: 0 0 1.25rem;
        }
        .collection-literature-body.is-first::first-letter {
          float: left;
          margin: 0.05em 0.12em 0 0;
          font-family: var(--font-playfair);
          font-size: 3.75rem;
          line-height: 0.85;
          font-weight: 400;
        }
```

- [ ] **Step 4: Run to verify passes** → 3 tests PASS.

- [ ] **Step 5: Verify the gate**

Run: `npm run lint && npm run typecheck && npm run build && npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add "app/(store)/collections/[slug]/page.tsx" test/collection-literature-render.test.tsx
git commit -m "feat(collections): render literature as semantic paragraphs

Splits blank-line-separated literature into real <p> elements (screen-reader
paragraph structure, §8) with the drop-cap on the first only. Replaces the
single pre-wrap <div>; the visual result is the same, the semantics better.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `LiteratureEditor` + `WorksList` + `PhotoPicker` components

**Files:**
- Create: `components/admin/LiteratureEditor.tsx`, `components/admin/WorksList.tsx`, `components/admin/PhotoPicker.tsx`
- Modify: `app/globals.css`
- Test: covered by Task 7's `collection-editor.test.tsx`.

**Interfaces:**
- Consumes: `applyReorder`, `derivativeSrc`, `AdminMember`/`AddablePhoto`, `@dnd-kit/*`.
- Produces:
  - `LiteratureEditor({ name, dek, literature, onDek, onLiterature })`
  - `WorksList({ members, coverId, onReorder, onSetCover, onRemove })` — `onReorder(orderedIds: string[])`
  - `PhotoPicker({ options, onAdd, onClose })`

- [ ] **Step 1: Write `components/admin/LiteratureEditor.tsx`**

```tsx
'use client'

export function LiteratureEditor({
  name, dek, literature, onDek, onLiterature,
}: {
  name: string
  dek: string
  literature: string
  onDek: (v: string) => void
  onLiterature: (v: string) => void
}) {
  const words = literature.trim() ? literature.trim().split(/\s+/).length : 0
  return (
    <div>
      <div className="admin-col-litheader">The literature</div>
      <div className="admin-col-litcard">
        <div className="admin-col-litname">{name}</div>
        <textarea
          className="admin-col-litdek" value={dek} rows={2}
          placeholder="A one-line definition or subtitle" aria-label="Dek"
          onChange={(e) => onDek(e.target.value)}
        />
        <textarea
          className="admin-col-litbody" value={literature} rows={12}
          placeholder="The essay. A blank line starts a new paragraph." aria-label="Literature"
          onChange={(e) => onLiterature(e.target.value)}
        />
        <div className="admin-col-litfoot">Newsreader · {words} {words === 1 ? 'word' : 'words'}</div>
      </div>
      <p className="admin-col-litnote">
        This is where the site’s voice lives. If it stops sounding like this essay, the site is wrong.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Write `components/admin/WorksList.tsx`** (the @dnd-kit sortable)

```tsx
'use client'

import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { applyReorder } from '@/lib/reorder'
import { derivativeSrc } from '@/lib/images/derivatives'
import type { AdminMember } from '@/lib/data/collections-admin'

function Row({ m, isCover, onSetCover, onRemove }: { m: AdminMember; isCover: boolean; onSetCover: (id: string) => void; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: m.id })
  return (
    <div ref={setNodeRef} className="admin-col-row" style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button type="button" className="admin-col-handle" aria-label={`Reorder ${m.title}`} {...attributes} {...listeners}>⠿</button>
      {/* eslint-disable-next-line @next/next/no-img-element -- public derivative URL; Plate.tsx sets the raw-<img> precedent */}
      <img className="admin-col-thumb" src={derivativeSrc(m.slug, 'colour', 160)} alt="" />
      <span className="admin-col-name">
        {m.title}
        {!m.published ? <span className="admin-col-draft">DRAFT</span> : null}
      </span>
      <button type="button" className="admin-col-star" aria-label={isCover ? 'Cover' : 'Set as cover'} aria-pressed={isCover} onClick={() => onSetCover(m.id)}>
        {isCover ? '★' : '☆'}
      </button>
      <button type="button" className="admin-col-remove" aria-label={`Remove ${m.title}`} onClick={() => onRemove(m.id)}>✕</button>
    </div>
  )
}

export function WorksList({
  members, coverId, onReorder, onSetCover, onRemove,
}: {
  members: AdminMember[]
  coverId: string | null
  onReorder: (orderedIds: string[]) => void
  onSetCover: (id: string) => void
  onRemove: (id: string) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const ids = members.map((m) => m.id)

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = ids.indexOf(active.id as string)
    const to = ids.indexOf(over.id as string)
    onReorder(applyReorder(ids, from, to))
  }

  return (
    <div>
      <div className="admin-col-worksheader"><span>Works — drag to order</span><span className="admin-col-coverlabel">cover ★</span></div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {members.map((m) => (
            <Row key={m.id} m={m} isCover={coverId === m.id} onSetCover={onSetCover} onRemove={onRemove} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}
```

- [ ] **Step 3: Write `components/admin/PhotoPicker.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { AddablePhoto } from '@/lib/data/collections-admin'

export function PhotoPicker({ options, onAdd, onClose }: { options: AddablePhoto[]; onAdd: (ids: string[]) => void; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  function toggle(id: string) {
    // if/else, not a ternary-for-side-effect: the ternary trips
    // @typescript-eslint/no-unused-expressions (a 0-warning gate failure).
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  return (
    <div className="admin-col-picker" role="dialog" aria-label="Add works">
      {options.length === 0 ? (
        <p className="admin-empty">Every photograph is already in this collection.</p>
      ) : (
        <ul className="admin-col-pickerlist">
          {options.map((p) => (
            <li key={p.id}>
              <label className="admin-col-pickeritem">
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                <span>{p.title}{!p.published ? <span className="admin-col-draft">DRAFT</span> : null}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="admin-actions">
        <button type="button" className="admin-btn" disabled={selected.size === 0} onClick={() => onAdd([...selected])}>Add</button>
        <button type="button" className="admin-btn2" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Append `app/globals.css`** — the `.admin-col-*` classes, Surface F geometry

```css
/* Slice 6a — Collections (Surface F). Measurements from the prototype. */
.admin-col-shell { display: grid; grid-template-columns: 250px 1fr; min-height: 0; }
.admin-col-list { border-right: 1px solid var(--hair); padding: 28px 20px; display: flex; flex-direction: column; gap: 6px; }
.admin-col-listhead { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; font-family: var(--font-mono); font-weight: 500; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--dim); }
.admin-col-listrow { display: flex; align-items: center; gap: 12px; padding: 12px 10px; cursor: pointer; background: none; border: 0; text-align: left; width: 100%; }
.admin-col-listrow:hover { background: rgba(239, 234, 224, 0.045); }
.admin-col-listrow.is-active { background: rgba(239, 234, 224, 0.07); }
.admin-col-listthumb { width: 38px; height: 48px; object-fit: cover; flex: none; }
.admin-col-listname { font-family: var(--font-playfair); font-size: 17px; line-height: 1.1; }
.admin-col-listmeta { font-family: var(--font-mono); font-weight: 500; font-size: 9px; letter-spacing: 0.06em; color: var(--faint); margin-top: 4px; }
.admin-col-listmeta.is-featured { color: var(--ok); }

.admin-col-editor { padding: 30px 36px 40px; }
.admin-col-edithead { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
.admin-col-title { font-family: var(--font-playfair); font-size: 38px; line-height: 1; background: none; border: 0; color: var(--ink); width: 100%; }
.admin-col-featured { font-family: var(--font-mono); font-weight: 500; font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ok); border: 1px solid var(--ok); padding: 4px 9px; }
.admin-col-subhead { font-family: var(--font-mono); font-weight: 500; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); margin-top: 8px; }
.admin-col-slug { font-family: var(--font-mono); font-size: 13px; min-height: 44px; border: 1px solid var(--hairform); background: transparent; color: var(--ink); padding: 10px 12px; margin-top: 10px; }
.admin-col-slugnote { font-size: 11px; color: var(--faint); margin: 6px 0 0; }

.admin-col-body { display: grid; grid-template-columns: 1fr 1fr; gap: 34px; align-items: start; }
.admin-col-worksheader, .admin-col-litheader { display: flex; justify-content: space-between; font-family: var(--font-mono); font-weight: 500; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--dim); margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--hair); }
.admin-col-coverlabel { color: var(--faint); }
.admin-col-row { display: grid; grid-template-columns: 20px 46px 1fr auto auto; gap: 12px; align-items: center; padding: 9px 6px; }
.admin-col-row:hover { background: rgba(239, 234, 224, 0.045); }
.admin-col-handle { cursor: grab; color: var(--faint); font-family: var(--font-mono); background: none; border: 0; min-height: 44px; }
.admin-col-thumb { width: 46px; height: 58px; object-fit: cover; }
.admin-col-name { font-family: var(--font-playfair); font-size: 16px; display: flex; align-items: center; gap: 8px; }
.admin-col-draft { font-family: var(--font-mono); font-weight: 500; font-size: 9px; letter-spacing: 0.1em; color: var(--faint); border: 1px solid var(--hairform); padding: 1px 5px; }
.admin-col-star { background: none; border: 0; color: var(--warn); font-size: 16px; cursor: pointer; min-height: 44px; }
.admin-col-star[aria-pressed='false'] { color: var(--faint); }
.admin-col-remove { background: none; border: 0; color: var(--faint); cursor: pointer; min-height: 44px; }
.admin-col-remove:hover { color: var(--alert); }
.admin-col-add { display: block; text-align: center; font-family: var(--font-mono); font-weight: 500; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--dim); border: 1px dashed var(--hairform); padding: 12px; margin-top: 12px; background: none; width: 100%; cursor: pointer; }

.admin-col-litcard { border: 1px solid var(--hairform); padding: 22px; background: var(--panel2); }
.admin-col-litname { font-family: var(--font-playfair); font-size: 20px; margin-bottom: 6px; }
.admin-col-litdek { width: 100%; font-family: var(--font-newsreader), serif; font-style: italic; font-size: 15px; color: var(--dim); background: transparent; border: 0; resize: vertical; margin-bottom: 12px; }
.admin-col-litbody { width: 100%; font-family: var(--font-newsreader), serif; font-size: 15px; line-height: 1.7; color: var(--ink); background: transparent; border: 0; resize: vertical; min-height: 200px; }
.admin-col-litfoot { display: flex; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--hairsoft); font-family: var(--font-mono); font-weight: 500; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dim); }
.admin-col-litnote { font-family: var(--font-mono); font-weight: 500; font-size: 10px; letter-spacing: 0.04em; color: var(--faint); margin-top: 12px; line-height: 1.6; }

.admin-col-picker { border: 1px solid var(--hairform); background: var(--panel); padding: 16px; margin-top: 12px; }
.admin-col-pickerlist { list-style: none; margin: 0 0 12px; padding: 0; max-height: 320px; overflow: auto; }
.admin-col-pickeritem { display: flex; align-items: center; gap: 10px; padding: 8px 4px; font-size: 14px; cursor: pointer; }

@media (max-width: 900px) { .admin-col-shell { grid-template-columns: 1fr; } .admin-col-body { grid-template-columns: 1fr; } }
```

- [ ] **Step 5: Verify typecheck/lint** (components compile; tested via Task 7)

Run: `npm run typecheck && npm run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add components/admin/LiteratureEditor.tsx components/admin/WorksList.tsx components/admin/PhotoPicker.tsx app/globals.css
git commit -m "feat(collections): literature editor, dnd-kit works list, photo picker

WorksList is @dnd-kit sortable with a keyboard sensor (accessible drag, §8),
using applyReorder on drop. Draft members carry a DRAFT marker. LiteratureEditor
is plain prose with a live word count — no formatting toolbar (D26). Thumbnails
via the existing derivativeSrc 160 rung.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `CollectionEditor` orchestrator + the `[id]` and `new` pages

**Files:**
- Create: `components/admin/CollectionEditor.tsx`, `app/admin/(protected)/collections/[id]/page.tsx`, `app/admin/(protected)/collections/new/page.tsx`
- Test: `test/collection-editor.test.tsx`

**Interfaces:**
- Consumes: all Task 3–6 exports; `getCollectionForEdit`, `listAddablePhotos`.
- Produces: the editor route + create route.

- [ ] **Step 1: Write the failing test**

`test/collection-editor.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { CollectionEditor } from '@/components/admin/CollectionEditor'
import type { AdminCollectionDetail } from '@/lib/data/collections-admin'

vi.mock('@/lib/admin/collection-actions', () => ({
  updateCollectionMeta: vi.fn(async () => ({ ok: true })),
  updateLiterature: vi.fn(async () => ({ ok: true })),
  addPhotos: vi.fn(async () => ({ ok: true })),
  removePhoto: vi.fn(async () => ({ ok: true })),
  reorderPhotos: vi.fn(async () => ({ ok: true })),
  setCover: vi.fn(async () => ({ ok: true })),
  deleteCollection: vi.fn(async () => ({ ok: true })),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const detail: AdminCollectionDetail = {
  id: 'c1', slug: 'relics', name: 'Relics', dek: 'A definition', literature: 'Para one.\n\nPara two.',
  cover_photo_id: 'p1', featured_on_home: false,
  members: [
    { id: 'p1', slug: 'a', title: 'A', published: true, position: 0 },
    { id: 'p2', slug: 'b', title: 'B', published: false, position: 1 },
  ],
}

beforeEach(cleanup)

describe('CollectionEditor', () => {
  it('prefills name, slug, dek, literature', () => {
    const { container } = render(<CollectionEditor detail={detail} addable={[]} />)
    expect(container.querySelector<HTMLInputElement>('.admin-col-title')!.value).toBe('Relics')
    expect(container.querySelector<HTMLInputElement>('.admin-col-slug')!.value).toBe('relics')
    expect(container.querySelector<HTMLTextAreaElement>('.admin-col-litbody')!.value).toContain('Para one.')
  })
  it('shows a live word count', () => {
    const { container } = render(<CollectionEditor detail={detail} addable={[]} />)
    expect(container.textContent).toMatch(/4 words/)
  })
  it('badges a draft member', () => {
    const { container } = render(<CollectionEditor detail={detail} addable={[]} />)
    expect(container.textContent).toMatch(/DRAFT/)
  })
  it('warns the slug is public and link-breaking', () => {
    const { container } = render(<CollectionEditor detail={detail} addable={[]} />)
    expect(container.textContent).toMatch(/\/collections\/relics/)
    expect(container.textContent).toMatch(/breaks existing links|changes the/i)
  })
  it('carries the voice-lives note', () => {
    const { container } = render(<CollectionEditor detail={detail} addable={[]} />)
    expect(container.textContent).toMatch(/where the site’s voice lives/i)
  })
})
```

- [ ] **Step 2: Run to verify fails** → `CollectionEditor` unresolved.

- [ ] **Step 3: Write `components/admin/CollectionEditor.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { WorksList } from '@/components/admin/WorksList'
import { LiteratureEditor } from '@/components/admin/LiteratureEditor'
import { PhotoPicker } from '@/components/admin/PhotoPicker'
import {
  updateCollectionMeta, updateLiterature, addPhotos, removePhoto, reorderPhotos, setCover, deleteCollection,
} from '@/lib/admin/collection-actions'
import type { AdminCollectionDetail, AddablePhoto } from '@/lib/data/collections-admin'
import { deriveSlug } from '@/lib/ingest/slug'

export function CollectionEditor({ detail, addable }: { detail: AdminCollectionDetail; addable: AddablePhoto[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [name, setName] = useState(detail.name)
  const [slug, setSlug] = useState(detail.slug)
  const [dek, setDek] = useState(detail.dek ?? '')
  const [literature, setLiterature] = useState(detail.literature ?? '')
  const [notice, setNotice] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    start(async () => { setNotice(null); const r = await fn(); if (!r.ok) setNotice(r.message ?? 'Something went wrong.'); else router.refresh() })
  }

  function save() {
    run(async () => {
      const meta = await updateCollectionMeta({ id: detail.id, name, slug, dek: dek.trim() || null })
      if (!meta.ok) return meta
      return updateLiterature({ id: detail.id, literature: literature.trim() || null })
    })
  }

  return (
    <div className="admin-col-editor">
      {notice ? <p className="admin-empty" role="alert">{notice}</p> : null}
      <div className="admin-col-edithead">
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input className="admin-col-title" value={name} aria-label="Collection name" onChange={(e) => setName(e.target.value)} />
            {detail.featured_on_home ? <span className="admin-col-featured">Featured on home</span> : null}
          </div>
          <div className="admin-col-subhead">{detail.members.length} {detail.members.length === 1 ? 'photograph' : 'photographs'}</div>
          <input className="admin-col-slug" value={slug} aria-label="Web address"
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-'))}
            onBlur={(e) => setSlug(deriveSlug(e.target.value))} />
          <p className="admin-col-slugnote">/collections/{slug || '…'} — changing this changes the public address and breaks existing links.</p>
        </div>
        <button type="button" className="admin-btn" disabled={pending} onClick={save}>Save collection</button>
      </div>

      <div className="admin-col-body">
        <div>
          <WorksList
            members={detail.members} coverId={detail.cover_photo_id}
            onReorder={(ids) => run(() => reorderPhotos({ collectionId: detail.id, orderedPhotoIds: ids }))}
            onSetCover={(id) => run(() => setCover({ collectionId: detail.id, photoId: id === detail.cover_photo_id ? null : id }))}
            onRemove={(id) => run(() => removePhoto({ collectionId: detail.id, photoId: id }))}
          />
          {picking ? (
            <PhotoPicker options={addable}
              onAdd={(ids) => { setPicking(false); run(() => addPhotos({ collectionId: detail.id, photoIds: ids })) }}
              onClose={() => setPicking(false)} />
          ) : (
            <button type="button" className="admin-col-add" onClick={() => setPicking(true)}>＋ Add works</button>
          )}
        </div>
        <LiteratureEditor name={name} dek={dek} literature={literature} onDek={setDek} onLiterature={setLiterature} />
      </div>

      <div className="admin-actions" style={{ marginTop: 24 }}>
        <button type="button" className="admin-btn2" disabled={pending}
          onClick={() => { if (window.confirm(`Delete “${name}”? Its photographs are not deleted.`)) run(async () => { const r = await deleteCollection({ id: detail.id }); if (r.ok) router.push('/admin/collections'); return r }) }}>
          Delete collection
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify passes** → 5 tests PASS.

- [ ] **Step 5: Write the pages**

`app/admin/(protected)/collections/[id]/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCollectionForEdit, listAddablePhotos } from '@/lib/data/collections-admin'
import { CollectionEditor } from '@/components/admin/CollectionEditor'

export const dynamic = 'force-dynamic'

export default async function CollectionEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getCollectionForEdit(id)
  if (!detail) notFound()
  const addable = (await listAddablePhotos(id)) ?? []
  return (
    <>
      <nav className="admin-crumb" aria-label="Breadcrumb">
        <Link href="/admin/collections">← Collections</Link>
        <span className="admin-crumb-sep" aria-hidden="true">/</span>
        <span className="admin-crumb-here">{detail.name}</span>
      </nav>
      <CollectionEditor detail={detail} addable={addable} />
    </>
  )
}
```

`app/admin/(protected)/collections/new/page.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createCollection } from '@/lib/admin/collection-actions'

export default function NewCollectionPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function create() {
    start(async () => {
      setError(null)
      const r = await createCollection({ name })
      if (!r.ok) return setError(r.message)
      router.push(`/admin/collections/${r.id}`)
    })
  }

  return (
    <>
      <nav className="admin-crumb" aria-label="Breadcrumb">
        <Link href="/admin/collections">← Collections</Link>
        <span className="admin-crumb-sep" aria-hidden="true">/</span>
        <span className="admin-crumb-here">New collection</span>
      </nav>
      <div className="admin-landing">
        <label className="admin-formfield" htmlFor="new-collection-name">
          <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 9 }}>Name</span>
        </label>
        <input id="new-collection-name" className="admin-input is-title" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 480 }} />
        {error ? <p className="admin-slugnote" role="alert">{error}</p> : null}
        <button type="button" className="admin-btn" disabled={pending || name.trim() === ''} onClick={create}>Create collection</button>
      </div>
    </>
  )
}
```

- [ ] **Step 6: Verify the gate**

Run: `npm run lint && npm run typecheck && npm run build && npm test`
Expected: green; both collection routes compile.

- [ ] **Step 7: Commit**

```bash
git add components/admin/CollectionEditor.tsx "app/admin/(protected)/collections/[id]/page.tsx" "app/admin/(protected)/collections/new/page.tsx" test/collection-editor.test.tsx
git commit -m "feat(collections): the editor orchestrator + edit/new routes

CollectionEditor wires the works list, literature editor and picker to the
actions; Save persists meta + literature; slug edits live with the
link-breaking warning. /collections/[id] loads via getCollectionForEdit
(requireAdmin, 404 on unknown); /new creates and redirects to the editor.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: The Collections landing + nav live + docs

**Files:**
- Create: `components/admin/CollectionList.tsx`, `app/admin/(protected)/collections/page.tsx`
- Modify: `components/admin/AdminNav.tsx`, `test/admin-nav.test.tsx`, `CLAUDE.md`
- Test: `test/collections-landing.test.tsx`

**Interfaces:**
- Consumes: `listCollectionsAdmin`, `derivativeSrc`.

- [ ] **Step 1: Write the failing test**

`test/collections-landing.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { CollectionList } from '@/components/admin/CollectionList'
import type { AdminCollectionRow } from '@/lib/data/collections-admin'

beforeEach(cleanup)
const rows: AdminCollectionRow[] = [
  { id: 'c1', slug: 'relics', name: 'Relics', count: 6, featured_on_home: true, coverSlug: 'a' },
  { id: 'c2', slug: 'urban', name: 'Urban', count: 7, featured_on_home: false, coverSlug: null },
]

describe('CollectionList', () => {
  it('distinguishes empty from unreadable', () => {
    const empty = render(<CollectionList collections={[]} activeId={null} />)
    expect(empty.container.textContent).toMatch(/No collections yet/i)
    cleanup()
    const broken = render(<CollectionList collections={null} activeId={null} />)
    expect(broken.container.textContent).toMatch(/couldn’t read/i)
  })
  it('links each row to its editor and tags the featured one', () => {
    const { container } = render(<CollectionList collections={rows} activeId="c1" />)
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(links).toContain('/admin/collections/c1')
    expect(container.textContent).toMatch(/Featured/)
    expect(container.textContent).toMatch(/6 works/)
  })
  it('links the ＋ to /new', () => {
    const { container } = render(<CollectionList collections={rows} activeId={null} />)
    expect([...container.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/admin/collections/new')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify fails** → `CollectionList` unresolved.

- [ ] **Step 3: Write `components/admin/CollectionList.tsx`**

```tsx
import Link from 'next/link'
import { derivativeSrc } from '@/lib/images/derivatives'
import type { AdminCollectionRow } from '@/lib/data/collections-admin'

export function CollectionList({ collections, activeId }: { collections: AdminCollectionRow[] | null; activeId: string | null }) {
  return (
    <div className="admin-col-list">
      <div className="admin-col-listhead">
        <span>Collections</span>
        <Link href="/admin/collections/new" aria-label="New collection" style={{ fontSize: 16 }}>＋</Link>
      </div>
      {collections === null ? (
        <p className="admin-empty">Couldn’t read the collections.</p>
      ) : collections.length === 0 ? (
        <p className="admin-empty">No collections yet.</p>
      ) : (
        collections.map((c) => (
          <Link key={c.id} href={`/admin/collections/${c.id}`} className={`admin-col-listrow${c.id === activeId ? ' is-active' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- public derivative URL */}
            {c.coverSlug ? <img className="admin-col-listthumb" src={derivativeSrc(c.coverSlug, 'colour', 160)} alt="" /> : <span className="admin-col-listthumb" style={{ background: 'var(--panel2)' }} />}
            <span>
              <span className="admin-col-listname">{c.name}</span>
              <span className={`admin-col-listmeta${c.featured_on_home ? ' is-featured' : ''}`} style={{ display: 'block' }}>
                {c.featured_on_home ? 'Featured · ' : ''}{c.count} {c.count === 1 ? 'work' : 'works'}
              </span>
            </span>
          </Link>
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 4: Write `app/admin/(protected)/collections/page.tsx`**

```tsx
import { listCollectionsAdmin } from '@/lib/data/collections-admin'
import { CollectionList } from '@/components/admin/CollectionList'

export const dynamic = 'force-dynamic'

export default async function CollectionsPage() {
  const collections = await listCollectionsAdmin()
  return (
    <>
      <div className="admin-band">
        <div>
          <p className="admin-band-kicker">The library</p>
          <h1 className="admin-band-h1">Collections</h1>
          <p className="admin-meta">{collections === null ? 'Count unavailable' : `${collections.length} ${collections.length === 1 ? 'collection' : 'collections'}`}</p>
        </div>
      </div>
      <CollectionList collections={collections} activeId={null} />
    </>
  )
}
```

- [ ] **Step 5: Make the nav item live** — in `components/admin/AdminNav.tsx`, change the Collections entry:

```ts
  { label: 'Collections', href: '/admin/collections' },
```

- [ ] **Step 6: Update `test/admin-nav.test.tsx`** — three live links now, two marked:

- Change the "two live links" test to expect `['Dashboard', 'Photographs', 'Collections']` with hrefs `['/admin', '/admin/photographs', '/admin/collections']`.
- Change the marks assertion from `toHaveLength(3)` to `toHaveLength(2)`.
- Change the `span.admin-navitem` count from `toBe(3)` to `toBe(2)`.

- [ ] **Step 7: Update `CLAUDE.md`** — real test count; add the collections routes and `lib/admin/collection-actions.ts` to the tree; mark **Slice 6a — Collections: DONE** in the roadmap.

- [ ] **Step 8: Verify the gate**

Run: `npm run lint && npm run typecheck && npm run build && npm test`
Expected: all green; record the final count.

- [ ] **Step 9: Commit**

```bash
git add components/admin/CollectionList.tsx "app/admin/(protected)/collections/page.tsx" components/admin/AdminNav.tsx test/admin-nav.test.tsx test/collections-landing.test.tsx CLAUDE.md
git commit -m "feat(collections): the landing, and the nav goes live

/admin/collections lists the collections (cover thumb, count, featured tag);
the ＋ creates one. Collections becomes the third live nav item.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done

Slice 6a is complete when the four gate checks are green and §10's manual checks pass — the load-bearing ones: a collection assembled in the admin renders on the live `/collections/<slug>` in the order you dragged it (keyboard reorder too), a draft member stays off the storefront until published, the cover ★ drives the masthead, and two-paragraph literature renders as two `<p>`s with the drop-cap on the first.
