# Slice 6b — Home feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin write surface for the home focal point — a picker that chooses which collection the storefront home opens on, with a live preview, and the "Set as home focal point" action that writes `collections.featured_on_home`. The storefront read side already exists (slice 2's home hero reads `getFeaturedCollection()`); this slice is the only control that sets it.

**Architecture:** One Server Action (`requireAdmin()` first) that writes `featured_on_home` by **clear-then-set** — clear the current feature, then set the new one — so the `collections_one_featured` unique partial index never sees two `true` rows. **No schema change, no migration.** A dedicated admin read (`listCollectionsForFeature`) supplies the picker and the live preview; the preview shares the home's `pullQuote` helper so previewed text is byte-identical to what ships.

**Tech Stack:** Next.js 16.2 (App Router), React 19, TS strict, `@supabase/supabase-js`, Vitest 2.1, Node 22.

**Spec:** `docs/superpowers/specs/2026-07-22-home-feature-design.md`. Read it before starting.

## Global Constraints

Every task's requirements implicitly include this section.

- **Branch `slice-6b` off `develop`.** Never commit to `develop`/`main`. Never `--no-verify`/`--force`.
- **Every commit ends with:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Gate, all green:** `npm run lint` (0 errors AND warnings), `npm run typecheck`, `npm run build`, `npm test`.
- **Baseline: 1822 tests** (CLAUDE.md, as of slice 6a). Confirm with `npm test` at build start; never let it drop.
- **`requireAdmin()` is the first statement of every Server Action and admin read.** From `@/lib/admin/require-admin`. `test/admin-routes.test.ts` walks `lib/admin/`, `lib/ingest/`, `app/admin/`, `components/admin/` for `'use server'` files requiring `requireAdmin` in each `export async function`. **`home-feature-actions.ts` goes in `lib/admin/` — no walker change, no exemption.**
- **`import 'server-only'`** atop every server-only module (reads). Action files begin with `'use server'` instead (already server-only by directive), matching `lib/admin/collection-actions.ts`.
- **DB is snake_case.** Columns touched: `collections(id, slug, name, dek, literature, cover_photo_id, featured_on_home, position)`, `collection_photos(collection_id, photo_id, position)`.
- **Money code untouched.** No `lib/pricing.ts`, `lib/checkout/*`, `lib/orders/*`, `app/api/*`. **Schema untouched.**
- **Apostrophes in JSX are `’` (U+2019), never `'`** — 0-warning lint gate.
- **`revalidateTag` takes TWO args in Next 16.2:** `revalidateTag('collections', 'max')`.
- **No `@testing-library/jest-dom`** — assert on `document.querySelector`/`textContent`/attributes. Mock `useRouter()`; never construct a real Supabase client in a test.
- **Admin copy is terse.** Primary action is `.admin-btn`; empty/error copy is `.admin-empty`; `min-height:44px`; no `outline:none`.
- **Reuse, don't reinvent:** `derivativeSrc` (`@/lib/images/derivatives`, widths `[160,400,600,960,1200,1800]`) for images; `pullQuote` (extracted in Task 1) for the preview text; the `.admin-band`/`.admin-btn`/`.admin-empty` CSS already in `globals.css`.

### Blocking value — none

Unlike slice 6a (which needed the `reorder_collection_photos` function applied to the live project), **6b has no blocking pre-build step.** The clear-then-set write needs no new SQL. This is the payoff of §0's set-mechanism decision.

---

## File Structure

```
lib/collections/pull-quote.ts                 NEW  pure  pullQuote(dek, literature)
app/(store)/page.tsx                          MODIFY  import pullQuote from the shared module
lib/data/collections-admin.ts                 MODIFY  + listCollectionsForFeature() + FeatureCandidate
lib/admin/home-feature-actions.ts             NEW  'use server'  setFeaturedCollection
components/admin/HomeHeroPreview.tsx           NEW  the faithful home-hero preview
components/admin/HomeFeaturePicker.tsx         NEW  'use client'  radio list + Set + live preview
components/admin/AdminNav.tsx                  MODIFY  Home feature href goes live
app/admin/(protected)/home-feature/page.tsx   NEW  the surface (force-dynamic)
app/admin/(protected)/page.tsx                MODIFY  "Change what leads home →" becomes a real link
app/globals.css                               MODIFY  append .admin-hf-* + .admin-sectionhead-link
test/
  pull-quote.test.ts                           NEW
  collections-feature-read.test.ts             NEW
  home-feature-actions.test.ts                 NEW
  home-feature-picker.test.tsx                 NEW
  admin-nav.test.tsx                            MODIFY
  admin-dashboard.test.tsx                      MODIFY
CLAUDE.md                                       MODIFY  (Task 6)
```

Nothing under `lib/pricing.ts`, `lib/checkout/`, `lib/orders/`, `app/api/*`, `supabase/schema.sql` is modified.

---

## Task 1: Extract `pullQuote` into a shared pure module

**Files:**
- Create: `lib/collections/pull-quote.ts`, `test/pull-quote.test.ts`
- Modify: `app/(store)/page.tsx`

**Interfaces:**
- Produces: `pullQuote(dek: string | null, literature: string | null): string` (Task 2's read + Task 4's preview consume it).

> **Context:** `app/(store)/page.tsx` already has this exact function locally (`:8–15`). Extracting it is behaviour-preserving for the home — the point is that the feature preview reuses the *same* function, so "what Jon previews" is provably "what ships," and `pullQuote` gets tested for the first time.

- [ ] **Step 1: Write the failing test** — `test/pull-quote.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pullQuote } from '@/lib/collections/pull-quote'

describe('pullQuote', () => {
  it('prefers the dek when present', () => {
    expect(pullQuote('A one-line dek.', 'A long essay that should be ignored.')).toBe('A one-line dek.')
  })
  it('returns empty string when there is neither dek nor literature', () => {
    expect(pullQuote(null, null)).toBe('')
    expect(pullQuote(null, '   ')).toBe('')
  })
  it('falls back to the first sentence of the literature', () => {
    expect(pullQuote(null, 'First sentence. Second sentence.')).toBe('First sentence.')
  })
  it('truncates when the first sentence is longer than 200 chars', () => {
    const long = 'x'.repeat(250)               // no sentence punctuation
    const out = pullQuote(null, long)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBe(158)               // 157 chars + ellipsis
  })
  it('returns short unpunctuated literature as-is', () => {
    expect(pullQuote(null, 'no punctuation here')).toBe('no punctuation here')
  })
})
```

- [ ] **Step 2: Run to verify it fails** → `@/lib/collections/pull-quote` unresolved.

- [ ] **Step 3: Write `lib/collections/pull-quote.ts`** — moved verbatim from the page (do NOT change the logic; the equivalence with the home is the whole point):

```ts
/**
 * The one line the home hero shows under the collection name, and the same line
 * the admin home-feature preview shows. Shared so the two can never drift.
 * dek wins; else the first sentence of the literature (if short); else a
 * truncation; else nothing.
 */
export function pullQuote(dek: string | null, literature: string | null): string {
  if (dek) return dek
  if (!literature) return ''
  const trimmed = literature.trim()
  if (!trimmed) return ''
  const sentence = trimmed.match(/^[^.!?]+[.!?]/)?.[0]
  if (sentence && sentence.length <= 200) return sentence
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed
}
```

> Note the added `if (!trimmed) return ''` guard for the whitespace-only case — the home's original returned `''` from the final branch anyway (`'   '.trim()` is `''`, length 0, not > 160), so this is behaviour-preserving and makes the empty-literature test explicit.

- [ ] **Step 4: Rewire `app/(store)/page.tsx`** — delete the local `pullQuote` (`:8–15`) and import the shared one:

```tsx
import { pullQuote } from '@/lib/collections/pull-quote'
```

Leave every call site (`const quote = pullQuote(featured.dek, featured.literature)`) unchanged.

- [ ] **Step 5: Run to verify passes** → 5 tests PASS; the home renders identically (build + existing home tests green).

- [ ] **Step 6: Commit**

```bash
git add lib/collections/pull-quote.ts test/pull-quote.test.ts "app/(store)/page.tsx"
git commit -m "refactor(home): extract pullQuote into a shared pure module

The admin home-feature preview must show the same line the home hero shows.
Moves pullQuote verbatim out of the home page into lib/collections/pull-quote
so both consume one function, and puts it under test for the first time. The
home renders identically.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `listCollectionsForFeature` — the read

**Files:**
- Modify: `lib/data/collections-admin.ts` (append)
- Create: `test/collections-feature-read.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `createAuthServerClient`, `pullQuote` (Task 1).
- Produces:
  - `interface FeatureCandidate { id; slug; name; previewQuote: string; heroSlug: string | null; publishedCount: number; featured_on_home: boolean }`
  - `listCollectionsForFeature(): Promise<FeatureCandidate[] | null>`

- [ ] **Step 1: Write the failing test** — `test/collections-feature-read.test.ts`. Mock the client to return canned rows per table (same fake shape as `test/collections-admin-read.test.ts`):

```ts
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
```

- [ ] **Step 2: Run to verify fails** → `listCollectionsForFeature` unresolved.

- [ ] **Step 3: Append to `lib/data/collections-admin.ts`** — add the import and the function (the file already has `import 'server-only'`, `requireAdmin`, `createAuthServerClient`):

```ts
import { pullQuote } from '@/lib/collections/pull-quote'

export interface FeatureCandidate {
  id: string
  slug: string
  name: string
  previewQuote: string
  heroSlug: string | null
  publishedCount: number
  featured_on_home: boolean
}

export async function listCollectionsForFeature(): Promise<FeatureCandidate[] | null> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { data: cols, error } = await db
    .from('collections')
    .select('id, slug, name, dek, literature, cover_photo_id, featured_on_home, position')
    .order('position', { ascending: true })
  if (error) { console.error('[admin] listCollectionsForFeature', error); return null }

  const { data: joins } = await db
    .from('collection_photos')
    .select('collection_id, position, photos!inner(id, slug, published)')
    .order('position', { ascending: true })

  // Published members per collection, in position order (the global position sort
  // preserves each collection's relative order).
  const published = new Map<string, { id: string; slug: string }[]>()
  for (const j of ((joins as any[]) ?? [])) {
    if (!j.photos?.published) continue
    const arr = published.get(j.collection_id) ?? []
    arr.push({ id: j.photos.id, slug: j.photos.slug })
    published.set(j.collection_id, arr)
  }

  return (cols as any[]).map((c) => {
    const members = published.get(c.id) ?? []
    // Same hero rule the home uses (app/(store)/page.tsx:47): the cover if it is
    // itself a published member, else the first published member.
    const cover = c.cover_photo_id ? members.find((p) => p.id === c.cover_photo_id) : undefined
    const hero = cover ?? members[0]
    return {
      id: c.id, slug: c.slug, name: c.name,
      previewQuote: pullQuote(c.dek, c.literature),
      heroSlug: hero?.slug ?? null,
      publishedCount: members.length,
      featured_on_home: c.featured_on_home,
    }
  })
}
```

> Uses the file's existing `/* eslint-disable @typescript-eslint/no-explicit-any */` block for the `any[]` casts (same as the other reads in this module).

- [ ] **Step 4: Run to verify passes** → 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/data/collections-admin.ts test/collections-feature-read.test.ts
git commit -m "feat(home-feature): listCollectionsForFeature read

Returns every collection with its published-only hero and count and the shared
pullQuote line, so the picker can show honest counts and the preview can show
exactly what the home will render. null on a PostgREST error.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `setFeaturedCollection` — the write

**Files:**
- Create: `lib/admin/home-feature-actions.ts`, `test/home-feature-actions.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `createAuthServerClient`, `revalidateTag`.
- Produces: `setFeaturedCollection(input: { collectionId: string | null }): Promise<{ ok: true } | { ok: false; message: string }>`

- [ ] **Step 1: Write the failing test** — `test/home-feature-actions.test.ts`. The fake records each `update` op (patch + predicates) in call order, so the test can assert **clear happens before set**:

```ts
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
```

- [ ] **Step 2: Run to verify fails** → `@/lib/admin/home-feature-actions` unresolved.

- [ ] **Step 3: Write `lib/admin/home-feature-actions.ts`**:

```ts
'use server'

import { revalidateTag } from 'next/cache'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

export type Result = { ok: true } | { ok: false; message: string }

/**
 * Sets which collection leads the home page. collectionId null clears it (home
 * renders "Coming soon.").
 *
 * Clear-then-set, in THIS order: the collections_one_featured unique partial
 * index rejects two rows with featured_on_home = true, so we clear whatever
 * leads home now before setting the new one. At no instant are two rows true,
 * so no Postgres function / transaction is needed (spec §3.1).
 */
export async function setFeaturedCollection(input: { collectionId: string | null }): Promise<Result> {
  await requireAdmin()
  const db = await createAuthServerClient()

  const { error: clearErr } = await db
    .from('collections')
    .update({ featured_on_home: false })
    .eq('featured_on_home', true)
  if (clearErr) return { ok: false, message: 'Couldn’t update the home feature.' }

  if (input.collectionId) {
    const { error: setErr } = await db
      .from('collections')
      .update({ featured_on_home: true })
      .eq('id', input.collectionId)
    if (setErr) return { ok: false, message: 'Couldn’t set the home feature.' }
  }

  revalidateTag('collections', 'max')
  return { ok: true }
}
```

- [ ] **Step 4: Run to verify passes** → 2 tests PASS. Also run `npx vitest run test/admin-routes.test.ts` → still green (the walker sees `requireAdmin` first; no exemption).

- [ ] **Step 5: Commit**

```bash
git add lib/admin/home-feature-actions.ts test/home-feature-actions.test.ts
git commit -m "feat(home-feature): setFeaturedCollection action (clear-then-set)

requireAdmin first; clears the current feature before setting the new one so
the collections_one_featured unique index never sees two true rows — no schema
change, no migration. collectionId null clears the feature. Revalidates
collections; home and dashboard are force-dynamic so both reflect it with no
redeploy.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `HomeHeroPreview` + `HomeFeaturePicker` + CSS

**Files:**
- Create: `components/admin/HomeHeroPreview.tsx`, `components/admin/HomeFeaturePicker.tsx`
- Modify: `app/globals.css`
- Test: covered by Task 5's `home-feature-picker.test.tsx`.

**Interfaces:**
- Consumes: `derivativeSrc`, `setFeaturedCollection`, `FeatureCandidate`.
- Produces:
  - `HomeHeroPreview({ name, quote, heroSlug, empty })`
  - `HomeFeaturePicker({ candidates })`

- [ ] **Step 1: Write `components/admin/HomeHeroPreview.tsx`** — the faithful approximation of the built home (spec D30): image-dominant, collection-name kicker, the shared quote, a static CTA; the "Coming soon." empty state when there is nothing to show.

```tsx
'use client'

import { derivativeSrc } from '@/lib/images/derivatives'

export function HomeHeroPreview({
  name, quote, heroSlug, empty,
}: {
  name: string
  quote: string
  heroSlug: string | null
  empty: boolean
}) {
  if (empty || !heroSlug) {
    return (
      <div className="admin-hf-preview is-empty">
        <p className="admin-hf-preview-empty">Coming soon.</p>
      </div>
    )
  }
  return (
    <div className="admin-hf-preview">
      {/* eslint-disable-next-line @next/next/no-img-element -- public derivative URL; preview only */}
      <img className="admin-hf-preview-img" src={derivativeSrc(heroSlug, 'colour', 1200)} alt="" />
      <div className="admin-hf-preview-scrim" aria-hidden="true" />
      <div className="admin-hf-preview-copy">
        <p className="admin-hf-preview-kicker">From the {name} collection</p>
        {quote ? <p className="admin-hf-preview-quote">{quote}</p> : null}
        <span className="admin-hf-preview-cta">Enter the collection →</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `components/admin/HomeFeaturePicker.tsx`**:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { derivativeSrc } from '@/lib/images/derivatives'
import { setFeaturedCollection } from '@/lib/admin/home-feature-actions'
import { HomeHeroPreview } from '@/components/admin/HomeHeroPreview'
import type { FeatureCandidate } from '@/lib/data/collections-admin'

const NONE = '__none__'

export function HomeFeaturePicker({ candidates }: { candidates: FeatureCandidate[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const current = candidates.find((c) => c.featured_on_home)?.id ?? NONE
  const [selected, setSelected] = useState<string>(current)
  const [notice, setNotice] = useState<string | null>(null)

  const selectedCandidate = selected === NONE ? null : candidates.find((c) => c.id === selected) ?? null
  const selectedEmpty = selectedCandidate !== null && selectedCandidate.publishedCount === 0
  const canSet = !pending && selected !== current && !selectedEmpty

  function save() {
    start(async () => {
      setNotice(null)
      const r = await setFeaturedCollection({ collectionId: selected === NONE ? null : selected })
      if (!r.ok) setNotice(r.message)
      else router.refresh()
    })
  }

  return (
    <div className="admin-hf-body">
      <div className="admin-hf-picker" role="radiogroup" aria-label="Home focal point">
        <div className="admin-hf-label">Choose a focal point</div>
        {notice ? <p className="admin-empty" role="alert">{notice}</p> : null}

        <button
          type="button" role="radio" aria-checked={selected === NONE}
          className={`admin-hf-opt${selected === NONE ? ' is-selected' : ''}`}
          onClick={() => setSelected(NONE)}
        >
          <span className="admin-hf-opt-thumb is-empty" aria-hidden="true" />
          <span className="admin-hf-opt-body">
            <span className="admin-hf-opt-name">No feature</span>
            <span className="admin-hf-opt-meta">Home shows “Coming soon.”</span>
          </span>
          <span className="admin-hf-radio" aria-hidden="true" />
        </button>

        {candidates.map((c) => {
          const disabled = c.publishedCount === 0
          const isSel = selected === c.id
          return (
            <button
              key={c.id} type="button" role="radio" aria-checked={isSel} aria-disabled={disabled}
              className={`admin-hf-opt${isSel ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
              onClick={() => { if (!disabled) setSelected(c.id) }}
            >
              {c.heroSlug ? (
                /* eslint-disable-next-line @next/next/no-img-element -- public derivative URL */
                <img className="admin-hf-opt-thumb" src={derivativeSrc(c.heroSlug, 'colour', 160)} alt="" />
              ) : (
                <span className="admin-hf-opt-thumb is-empty" aria-hidden="true" />
              )}
              <span className="admin-hf-opt-body">
                <span className="admin-hf-opt-name">{c.name}</span>
                <span className="admin-hf-opt-meta">
                  {disabled
                    ? 'No published works — can’t lead home'
                    : `${c.publishedCount} ${c.publishedCount === 1 ? 'work' : 'works'}`}
                </span>
              </span>
              <span className="admin-hf-radio" aria-hidden="true" />
            </button>
          )
        })}

        <button type="button" className="admin-btn admin-hf-set" disabled={!canSet} onClick={save}>
          Set as home focal point
        </button>
        <p className="admin-hf-note">Publishes on save — no redeploy. The change is live within a minute.</p>
      </div>

      <div className="admin-hf-previewwrap">
        <div className="admin-hf-label">Live preview — home hero</div>
        <HomeHeroPreview
          name={selectedCandidate?.name ?? ''}
          quote={selectedCandidate?.previewQuote ?? ''}
          heroSlug={selectedCandidate?.heroSlug ?? null}
          empty={selected === NONE || selectedEmpty}
        />
      </div>
    </div>
  )
}
```

> Each option is a `<button role="radio">`, so the radiogroup is keyboard-reachable and the focus ring (`§11.5`, inherited) shows. A disabled option is `aria-disabled` (not native `disabled`) so it stays announced; the click handler no-ops on it.

- [ ] **Step 3: Append `app/globals.css`** — the `.admin-hf-*` classes (Surface G geometry, prototype `:521–570`) and the dashboard `.admin-sectionhead-link` used in Task 6:

```css
/* Slice 6b — Home feature (Surface G). Measurements from the prototype (:521–570). */
.admin-hf-body { display: grid; grid-template-columns: 360px 1fr; gap: 44px; align-items: start; padding: 30px 36px 40px; }
.admin-hf-label { font-family: var(--font-mono); font-weight: 500; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--dim); margin-bottom: 14px; }
.admin-hf-picker { min-width: 0; }
.admin-hf-opt { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; padding: 14px; margin-bottom: 12px; border: 1px solid var(--hair); background: none; color: inherit; cursor: pointer; min-height: 44px; }
.admin-hf-opt.is-selected { border-color: var(--ink); }
.admin-hf-opt.is-disabled { cursor: not-allowed; opacity: 0.55; }
.admin-hf-opt-thumb { width: 52px; height: 66px; object-fit: cover; flex: none; }
.admin-hf-opt-thumb.is-empty { background: var(--panel2); }
.admin-hf-opt-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.admin-hf-opt-name { font-family: var(--font-playfair); font-size: 20px; line-height: 1.05; color: var(--dim); }
.admin-hf-opt.is-selected .admin-hf-opt-name { color: var(--ink); }
.admin-hf-opt-meta { font-family: var(--font-mono); font-weight: 500; font-size: 10px; letter-spacing: 0.04em; color: var(--faint); }
.admin-hf-radio { width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid var(--hair); flex: none; display: grid; place-items: center; }
.admin-hf-opt.is-selected .admin-hf-radio { border-color: var(--ink); }
.admin-hf-opt.is-selected .admin-hf-radio::after { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--ink); }
.admin-hf-set { display: block; width: 100%; text-align: center; margin-top: 8px; }
.admin-hf-note { font-family: var(--font-mono); font-weight: 500; font-size: 10px; letter-spacing: 0.04em; color: var(--faint); margin: 12px 0 0; line-height: 1.6; }

.admin-hf-previewwrap { min-width: 0; }
.admin-hf-preview { position: relative; width: 100%; height: 520px; overflow: hidden; border: 1px solid var(--hair); }
.admin-hf-preview.is-empty { display: grid; place-items: center; background: var(--panel2); }
.admin-hf-preview-empty { margin: 0; font-family: var(--font-newsreader); font-style: italic; font-size: 1.125rem; color: var(--dim); }
.admin-hf-preview-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 40%; }
.admin-hf-preview-scrim { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(11, 11, 11, 0.9) 0%, rgba(11, 11, 11, 0.55) 38%, transparent 70%); }
.admin-hf-preview-copy { position: absolute; left: 30px; bottom: 34px; max-width: 420px; }
.admin-hf-preview-kicker { margin: 0 0 14px; font-family: var(--font-mono); font-weight: 500; font-size: 10px; letter-spacing: 0.28em; text-transform: uppercase; color: var(--dim); }
.admin-hf-preview-quote { margin: 0 0 22px; font-family: var(--font-newsreader); font-size: 17px; line-height: 1.5; color: var(--ink); }
.admin-hf-preview-cta { font-family: var(--font-mono); font-weight: 500; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--btnink); background: var(--btnbg); padding: 12px 20px; }

/* Task 6: the dashboard "Home focal point" railcard link, now live. */
.admin-sectionhead-link { font-family: var(--font-mono); font-weight: 500; font-size: 11px; letter-spacing: 0.06em; color: var(--dim); }
.admin-sectionhead-link:hover { color: var(--ink); }

@media (max-width: 900px) {
  .admin-hf-body { grid-template-columns: 1fr; }
  .admin-hf-preview { height: 360px; }
}
```

> The preview text resolves against the admin dark tokens (`--ink`/`--dim` are light in `[data-admin]`); the left-to-right scrim keeps them legible over any photo.

- [ ] **Step 4: Verify typecheck/lint** — Run: `npm run typecheck && npm run lint` → 0 errors, 0 warnings (components compile; behaviour tested in Task 5).

---

## Task 5: The `/admin/home-feature` route + the picker test

**Files:**
- Create: `app/admin/(protected)/home-feature/page.tsx`, `test/home-feature-picker.test.tsx`

**Interfaces:**
- Consumes: `listCollectionsForFeature` (Task 2), `HomeFeaturePicker` (Task 4).

- [ ] **Step 1: Write the failing test** — `test/home-feature-picker.test.tsx`. Covers the component's behaviour and the page's unreadable branch:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { HomeFeaturePicker } from '@/components/admin/HomeFeaturePicker'
import type { FeatureCandidate } from '@/lib/data/collections-admin'

const setFeaturedCollection = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/admin/home-feature-actions', () => ({ setFeaturedCollection: (...a: unknown[]) => setFeaturedCollection(...(a as [])) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const candidates: FeatureCandidate[] = [
  { id: 'c1', slug: 'relics', name: 'Relics', previewQuote: 'Objects that survive.', heroSlug: 'a', publishedCount: 6, featured_on_home: true },
  { id: 'c2', slug: 'urban', name: 'Urban', previewQuote: 'The city, close up.', heroSlug: 'b', publishedCount: 7, featured_on_home: false },
  { id: 'c3', slug: 'empty', name: 'Empty', previewQuote: '', heroSlug: null, publishedCount: 0, featured_on_home: false },
]

beforeEach(() => { cleanup(); vi.clearAllMocks() })

describe('HomeFeaturePicker', () => {
  it('preselects the current featured collection', () => {
    const { container } = render(<HomeFeaturePicker candidates={candidates} />)
    const checked = container.querySelector('[role="radio"][aria-checked="true"]')
    expect(checked?.textContent).toContain('Relics')
  })
  it('previews the current selection: name kicker + shared quote', () => {
    const { container } = render(<HomeFeaturePicker candidates={candidates} />)
    expect(container.querySelector('.admin-hf-preview-kicker')?.textContent).toBe('From the Relics collection')
    expect(container.querySelector('.admin-hf-preview-quote')?.textContent).toBe('Objects that survive.')
  })
  it('Set is disabled on a no-op (selection equals current)', () => {
    const { container } = render(<HomeFeaturePicker candidates={candidates} />)
    const set = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Set as home focal point'))!
    expect((set as HTMLButtonElement).disabled).toBe(true)
  })
  it('selecting another collection swaps the preview and enables Set', () => {
    const { container } = render(<HomeFeaturePicker candidates={candidates} />)
    const urban = [...container.querySelectorAll('[role="radio"]')].find((el) => el.textContent?.includes('Urban'))!
    fireEvent.click(urban)
    expect(container.querySelector('.admin-hf-preview-kicker')?.textContent).toBe('From the Urban collection')
    const set = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Set as home focal point'))!
    expect((set as HTMLButtonElement).disabled).toBe(false)
  })
  it('a 0-published collection is disabled and never selectable; its preview is the empty state', () => {
    const { container } = render(<HomeFeaturePicker candidates={candidates} />)
    const empty = [...container.querySelectorAll('[role="radio"]')].find((el) => el.textContent?.includes('Empty'))!
    expect(empty.getAttribute('aria-disabled')).toBe('true')
    expect(empty.textContent).toContain('can’t lead home')
    fireEvent.click(empty)
    expect(container.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toContain('Relics') // unchanged
  })
  it('the "No feature" option previews "Coming soon." and clears on Set', () => {
    const { container } = render(<HomeFeaturePicker candidates={candidates} />)
    const none = [...container.querySelectorAll('[role="radio"]')].find((el) => el.textContent?.includes('No feature'))!
    fireEvent.click(none)
    expect(container.querySelector('.admin-hf-preview-empty')?.textContent).toBe('Coming soon.')
    const set = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Set as home focal point'))!
    fireEvent.click(set)
    expect(setFeaturedCollection).toHaveBeenCalledWith({ collectionId: null })
  })
  it('carries the no-redeploy note', () => {
    const { container } = render(<HomeFeaturePicker candidates={candidates} />)
    expect(container.textContent).toMatch(/no redeploy/i)
  })
})

describe('HomeFeaturePage (unreadable)', () => {
  it('shows the honest empty state when the read fails', async () => {
    vi.doMock('@/lib/admin/require-admin', () => ({ requireAdmin: async () => ({ id: 'admin' }) }))
    vi.doMock('@/lib/data/collections-admin', () => ({ listCollectionsForFeature: async () => null }))
    const { default: HomeFeaturePage } = await import('@/app/admin/(protected)/home-feature/page')
    const { container } = render(await HomeFeaturePage())
    expect(container.textContent).toMatch(/couldn’t read/i)
  })
})
```

- [ ] **Step 2: Run to verify fails** → `HomeFeaturePicker` / the page unresolved.

- [ ] **Step 3: Write `app/admin/(protected)/home-feature/page.tsx`**:

```tsx
import { listCollectionsForFeature } from '@/lib/data/collections-admin'
import { HomeFeaturePicker } from '@/components/admin/HomeFeaturePicker'

export const dynamic = 'force-dynamic'

export default async function HomeFeaturePage() {
  const candidates = await listCollectionsForFeature()
  return (
    <>
      <div className="admin-band">
        <div>
          <p className="admin-band-kicker">What the home page opens on</p>
          <h1 className="admin-band-h1">Home feature</h1>
        </div>
      </div>
      {candidates === null ? (
        // D7-style honest failure: no picker rather than an empty radio list that
        // would read as "no collections exist".
        <p className="admin-empty">Couldn’t read the collections. Nothing is shown rather than guessed.</p>
      ) : (
        <HomeFeaturePicker candidates={candidates} />
      )}
    </>
  )
}
```

- [ ] **Step 4: Run to verify passes** → all `home-feature-picker` tests PASS.

- [ ] **Step 5: Verify the gate** — Run: `npm run lint && npm run typecheck && npm run build && npm test` → all green; the route compiles.

- [ ] **Step 6: Commit**

```bash
git add "app/admin/(protected)/home-feature/page.tsx" components/admin/HomeHeroPreview.tsx components/admin/HomeFeaturePicker.tsx app/globals.css test/home-feature-picker.test.tsx
git commit -m "feat(home-feature): the picker surface + live preview

Surface G: a radiogroup of collections (published count, disabled when a
collection has no published works), a live home-hero preview sharing the home's
pullQuote, a 'No feature' option that clears the focal point, and Set — disabled
on a no-op or an ineligible collection. The preview mirrors the built home
(D30), not the prototype's superseded pane.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Nav live + dashboard link live + docs

**Files:**
- Modify: `components/admin/AdminNav.tsx`, `app/admin/(protected)/page.tsx`, `test/admin-nav.test.tsx`, `test/admin-dashboard.test.tsx`, `CLAUDE.md`

- [ ] **Step 1: Make the nav item live** — in `components/admin/AdminNav.tsx`, change the Home feature entry (leave Orders `null`):

```ts
  { label: 'Home feature', href: '/admin/home-feature' },
```

- [ ] **Step 2: Update `test/admin-nav.test.tsx`** — four live links, one mark:

- The "lists the five items in the prototype order" test is unchanged (still five labels).
- Rename the "three live links" test to **four**: expect labels `['Dashboard', 'Photographs', 'Collections', 'Home feature']` with hrefs `['/admin', '/admin/photographs', '/admin/collections', '/admin/home-feature']`.
- The "marks the two remaining unbuilt items" test → **one**: `marks` `toHaveLength(1)`; the mark is on Orders.
- The "renders the two unbuilt items as non-interactive text" test → **one**: `span.admin-navitem` length `toBe(1)`; assert its text contains `Orders`.
- The "renders no count pill on the marked Orders item" test is unchanged.

- [ ] **Step 3: Make the dashboard focal link live** — in `app/admin/(protected)/page.tsx`, add `import Link from 'next/link'` and replace the "Home focal point" railcard's marked link:

```tsx
// before
<MarkedLink label="Change what leads home →" />
// after
<Link href="/admin/home-feature" className="admin-sectionhead-link">Change what leads home →</Link>
```

Leave the other two `MarkedLink`s (`All orders →`, `Recent uploads`) as-is — they land in slices 7 / 5b. `MarkedLink` stays imported.

- [ ] **Step 4: Update `test/admin-dashboard.test.tsx`** — the focal link is now live:

- In the "marks every control whose action lands in a later slice" test, the `Change what leads home →` text remains present but is no longer a marked control. Add an assertion that it is now a real anchor:

```tsx
const focal = container.querySelector('a[href="/admin/home-feature"]')
expect(focal?.textContent).toContain('Change what leads home →')
```

- The existing button-loop assertion (every `<button>` is `aria-disabled`) still holds — the live focal link is an `<a>`, and the only remaining marked *button* is `＋ Post a photo`. Keep the `All orders →` text assertion (still marked). The "Recent uploads" railcard mark assertion (`rail[1]` contains `NOT BUILT`) is unchanged.

- [ ] **Step 5: Update `CLAUDE.md`** — record the slice:
  - Roadmap: mark **Slice 6b — Home feature: DONE**; drop 6b from "next".
  - Architecture tree: add `home-feature/page.tsx`, `lib/admin/home-feature-actions.ts`, `lib/collections/pull-quote.ts`, `components/admin/{HomeFeaturePicker,HomeHeroPreview}.tsx`, and `listCollectionsForFeature` under `lib/data/collections-admin.ts`.
  - Note the admin nav now has **four** live items; **Orders** is the last marked one (slice 7).
  - Update the test count baseline to the real post-6b number.

- [ ] **Step 6: Verify the gate** — Run: `npm run lint && npm run typecheck && npm run build && npm test` → all green; record the final count.

- [ ] **Step 7: Commit**

```bash
git add components/admin/AdminNav.tsx "app/admin/(protected)/page.tsx" test/admin-nav.test.tsx test/admin-dashboard.test.tsx CLAUDE.md
git commit -m "feat(home-feature): nav + dashboard go live

/admin/home-feature is now the fourth live nav item; the dashboard's 'Change
what leads home →' becomes a real link. Orders is the last remaining marked
item (slice 7).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done

Slice 6b is complete when the four gate checks are green and §8.2's manual checks pass — the load-bearing ones: setting a collection in `/admin/home-feature` makes the live storefront home open on it (hero, kicker, quote) with **no redeploy**; "No feature" returns the home to "Coming soon."; a collection with no published works is disabled and previews the empty state; and `select count(*) from collections where featured_on_home` is never greater than 1 across repeated switches (the unique index the clear-then-set write is built around).
