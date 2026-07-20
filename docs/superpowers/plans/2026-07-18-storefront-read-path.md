# Storefront Read-Path Implementation Plan (slice 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public storefront read surfaces — Home, Prints, Collection (index + detail), Product, Contact — plus the shared header/shell, reading *published* data from Supabase and rendering the pre-generated derivative ladder.

**Architecture:** Next.js 16 App Router on top of slice 1. Server components own privileged reads (`supabaseServer()`, anon/RLS-published) through a small tagged data layer; a hand-rolled `<picture>` (`Plate`) renders the derivative ladder (no `next/image`). The Product page is a **single client-state island** (`ProductInteractive`) that owns `{size, register}` so the plate, crop guide, price, and controls stay in sync. A throwaway service-key seed script populates a few photos + one featured collection + their derivatives so the surfaces render.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, `@supabase/supabase-js` (anon reads + a service-key seed script), Vitest. Fonts/tokens/`ThemeProvider`/`CartContext`/`lib/pricing.ts` come from slice 1.

**Companion spec:** `docs/superpowers/specs/2026-07-17-storefront-read-path-design.md` — **read §11 (post-review corrections) first; it overrides earlier sections.** Where plan and spec disagree, spec+§11 win.

## Global Constraints

- **Runtime:** Node 20.9+; Next 16 / React 19. Base branch: `slice-2-storefront-read-path` off `develop` (which has slice 1 + Next 16). No push. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Never `--no-verify`/`--force`.
- **Reads are published-only.** All storefront reads go through `supabaseServer()` (anon key; RLS returns only `published` photos). No service key in any storefront route/component. The service key is used ONLY by the seed script (a Node script, not app code).
- **Images: `<picture>` over the derivative ladder, never `next/image`** (we own the exact widths; `product.md §3.2`). Key convention (locked, shared with slice 5): `derivatives/<photo-slug>/<register>/<width>.avif` and `.webp`, `register ∈ {colour,silver}`, `width ∈ {160,400,600,960,1200,1800}`. Public bucket base from `NEXT_PUBLIC_SUPABASE_URL`.
- **Alt text is `photos.alt_text`, never the title.** Decorative bleed is `aria-hidden`.
- **Honest function (`product.md §1`):** no dead controls. "Add to cart" is wired to slice 1's `CartContext`; there is **no** "Save to collection" (removed — §11 C3). Collections/photos that aren't published never appear.
- **Focus:** every interactive element gets the hairline ink-ring on `:focus-visible` (`design.md §10 q2`). Motion gated behind `prefers-reduced-motion`; **no auto-advancing carousel** (`design.md §9`).
- **Money is untouched.** `lib/pricing.ts` `PRICE_BY_SIZE` is imported for *display* only; the server remains the sole price authority at checkout.
- **Corrections (spec §11) are binding:** native-aspect Product plate + orientation from `aspect_ratio`; Product as one client-state island; real cart; collections visibility gate; Home empty state; kicker/ordering rules; seed via service key; `<picture>` lazy/LCP/null-dim.

## Corrections from the plan review (applied 2026-07-18)

> A multi-agent review of this plan found 26 verified findings (deduped to 12). **These OVERRIDE the task text below where they conflict — read before implementing any task.**

1. **Read pages are `force-dynamic`; ISR is deferred to slice 8; there is NO `ci.yml` build-env change.** Tasks 5/9/10 use `export const dynamic = 'force-dynamic'` (NOT `revalidate = 3600`); Prints keeps slice-1's existing `force-dynamic`. Reason: `lib/env.ts` is all-or-nothing (it requires all 5 vars incl. the service key), so ISR-prerendering a read page at `next build` throws and reddens the CI `build` gate (false-green locally where `.env.local` masks it). Force-dynamic keeps the build env-free. **The data layer still uses `unstable_cache` + tags** (invoked only at request time), so slice 8 can wire `revalidateTag`. **Delete Task 2 Step 3** (the CI build-env change); Task 2 = seed script + `.env.example` only.
2. **Crop math — port the ACTUAL legacy formula; the drafted one is inverted.** Do NOT use `((plateAspect/sizeAspect)-1)/2*100` or the `4x6→top/bottom` oracle in Task 6. Port the inset computation faithfully from the quarry `Photography-main/src/pages/Product.tsx:45-63`. `SIZE_ASPECT` uses **exact** per-size w/h (`4x6`=2/3, `5x7`=5/7, `8x10`=4/5, `11x14`=11/14, `12x16`=3/4, `16x20`=4/5, `20x30`=2/3). Corrected oracle: a size **narrower/more-portrait** than the plate crops **left/right** (`4x6` on a 4:5 plate → nonzero **left/right** insets, zero top/bottom); a **wider** size crops top/bottom; `8x10`/`16x20` on a 4:5 plate → zero insets. Orientation still from `aspect_ratio > 1`.
3. **Make the component tests actually run.** The slice-1 `vitest.config.ts` includes only `test/**/*.test.ts` (excludes `.tsx`) with a global `node` env — so the `Plate`/`ProductInteractive` `.tsx` tests silently never run. In Task 3, change include to `['test/**/*.test.{ts,tsx}']`, add `environmentMatchGlobs: [['test/**/*.test.tsx', 'jsdom']]`, and add devDeps `@testing-library/react` + `jsdom`. Confirm the `.tsx` tests execute (not 0 collected).
4. **Cover-by-`cover_photo_id` must be implementable.** Add `id` to `loadDetail`'s embed (`photos!inner(id, slug, …, published)`) and to `PhotoInCollection`; resolve `cover = detail.photos.find(p => p.id === col.cover_photo_id) ?? detail.photos[0]`. Add `cover: {slug, alt} | null` to `CollectionDetail` and carry it through `getFeaturedCollection()`, so Home (Task 5) honors the admin cover, not just `photos[0]`.
5. **`getPhotoBySlug` carries the `photo:<slug>` tag.** Wrap it in `unstable_cache` (per-slug key) with `tags: ['photos', 'photo:'+slug], revalidate: 3600` — the slice-8 invalidation contract the spec mandates.
6. **Data-layer test mock accounts for `unstable_cache`.** `unstable_cache` wraps the fetch fn (passes through in tests); mock `supabaseServer` and shape the `.from().select().eq().order()`/embed chain to the exact calls, asserting real returned data, not mock-call presence.
7. **Seed sample images.** Task 2 sources 3 images from the quarry (`Photography-main/public/images/prints/*.jpg`) copied into a git-ignored `scripts/seed-assets/`; state this so the seed isn't blocked.
8. **Plate register-swap assertion.** `Plate`'s `<img>` uses `src`, not `srcset` (the `srcSet` is on the `<source>`s). The Task 7 register-swap test asserts the AVIF/WebP `<source srcSet>` changes to the `silver` path.
9. **`unstable_cache` revalidate.** Every `unstable_cache` call gets `{ tags: [...], revalidate: 3600 }` so the data cache is bounded.
10. **`NEXT_PUBLIC_SUPABASE_URL` is required for the storefront** (the derivative bucket base in `derivatives.ts`); `env.ts` doesn't validate it and a missing value yields `undefined/storage/...` src. It's in slice-1's `.env.example`; confirm it's set in dev/deploy.
11. **Theme-flash script has a home (Task 4).** Task 4 adds the anti-flash inline `<script>` to `app/layout.tsx`'s `<head>` (reads `localStorage['theme:v1']`, sets `document.documentElement.dataset.theme` before paint; `suppressHydrationWarning` on `<html>`) — closing the slice-1 carried theme-flash now that this slice ships the toggle.
12. **Header "Cart" is a real link.** It links to **`/checkout`** (exists from slice 1) and shows `useCart().lines.length` — a live, honest control, not a dead `#`. (The cart *drawer* is slice 3.)

## File Structure

| File | Responsibility |
|---|---|
| `lib/images/derivatives.ts` | `derivativeSrc`/`derivativeSrcSet` — the key convention |
| `lib/data/photos.ts` | `getPublishedPhotos()` (ordered), `getPhotoBySlug()` — tagged |
| `lib/data/collections.ts` | `getCollections()`/`getCollectionBySlug()`/`getFeaturedCollection()` — visibility-gated, tagged |
| `lib/format/price.ts` | `priceForSize`, `priceRangeLabel` (display over `PRICE_BY_SIZE`) |
| `lib/product/crop.ts` | pure crop-guide math (native-aspect, orientation from `aspect_ratio`, size-label flip) |
| `components/store/Plate.tsx` | `<picture>` AVIF+WebP renderer (lazy/eager, null-dim guard) |
| `components/store/Header.tsx` | header lockup (client — theme toggle) |
| `components/product/ProductInteractive.tsx` | client island owning `{size,register}` |
| `components/product/CropGuide.tsx` | client crop overlay |
| `app/(store)/layout.tsx` | MODIFY: add `<Header/>` |
| `app/(store)/page.tsx` | Home §12.5-A (moves home into the store shell) |
| `app/page.tsx` | DELETE (home now lives under `(store)`) |
| `app/(store)/prints/page.tsx` | REPLACE slice-1 stub — Prints grid §12.5-B |
| `app/(store)/prints/[slug]/page.tsx` | Product §12.5-D (server wrapper) |
| `app/(store)/collections/page.tsx` | Collections index (derived) |
| `app/(store)/collections/[slug]/page.tsx` | Collection detail §12.5-C |
| `app/(store)/contact/page.tsx` | minimal honest Contact |
| `app/globals.css` | MODIFY: `:focus-visible` ring + reduced-motion base |
| `scripts/seed-storefront.mjs` | throwaway service-key seed (rows + derivatives) |
| `.github/workflows/ci.yml` | MODIFY: give `build` job the two public Supabase vars (§11 C7) |
| `test/**` | data layer, derivatives, crop math, price |

---

## Task 1: Data layer + derivatives + price display

**Files:** Create `lib/images/derivatives.ts`, `lib/data/photos.ts`, `lib/data/collections.ts`, `lib/format/price.ts`. Test: `test/derivatives.test.ts`, `test/data-layer.test.ts`, `test/price.test.ts`.

**Interfaces — Produces:**
- `derivativeSrc(slug, register, width): string`, `derivativeSrcSet(slug, register, ext): string`, `DERIVATIVE_WIDTHS = [160,400,600,960,1200,1800]`.
- `getPublishedPhotos(): Promise<Photo[]>` (order `created_at asc`), `getPhotoBySlug(slug): Promise<Photo|null>` (published only).
- `getCollections(): Promise<CollectionCard[]>` (only collections with ≥1 published photo; cover resolved), `getCollectionBySlug(slug): Promise<CollectionDetail|null>` (photos ordered by `collection_photos.position`, published only; null if none), `getFeaturedCollection(): Promise<CollectionDetail|null>` (featured + ≥1 published, else null).
- `priceForSize(size): number` (cents), `priceRangeLabel(): string` (e.g. `"$5–$65"`).
- Types `Photo` (`{id,slug,title,caption,description,alt_text,aspect_ratio,width_px,height_px,has_bw_variant}`), `CollectionCard` (`{slug,name,dek,coverSlug|null,coverAlt|null,count}`), `CollectionDetail` (`{slug,name,dek,literature,photos: PhotoInCollection[]}`, `PhotoInCollection` adds `position`).

**Consumes:** `supabaseServer()` (slice 1), `PRICE_BY_SIZE`/`ALL_SIZES` from `lib/pricing.ts` (slice 1, importable client-side — no `server-only`).

- [ ] **Step 1: `lib/images/derivatives.ts`** (pure; no test yet beyond Step 2)

```ts
export const DERIVATIVE_WIDTHS = [160, 400, 600, 960, 1200, 1800] as const
const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/derivatives`

export function derivativeSrc(slug: string, register: 'colour' | 'silver', width: number, ext: 'avif' | 'webp' = 'avif') {
  return `${BASE}/${slug}/${register}/${width}.${ext}`
}
export function derivativeSrcSet(slug: string, register: 'colour' | 'silver', ext: 'avif' | 'webp') {
  return DERIVATIVE_WIDTHS.map((w) => `${derivativeSrc(slug, register, w, ext)} ${w}w`).join(', ')
}
```

- [ ] **Step 2: Failing test for derivatives** (`test/derivatives.test.ts`)

```ts
import { describe, it, expect, beforeAll } from 'vitest'
beforeAll(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co' })
it('builds keyed srcset for both formats', async () => {
  const { derivativeSrcSet, derivativeSrc } = await import('@/lib/images/derivatives')
  expect(derivativeSrc('relic', 'silver', 600, 'webp')).toBe('https://x.supabase.co/storage/v1/object/public/derivatives/relic/silver/600.webp')
  const set = derivativeSrcSet('relic', 'colour', 'avif')
  expect(set).toContain('/relic/colour/160.avif 160w')
  expect(set).toContain('/relic/colour/1800.avif 1800w')
})
```
Run `npx vitest run test/derivatives.test.ts` → PASS.

- [ ] **Step 3: `lib/format/price.ts`**

```ts
import { PRICE_BY_SIZE, ALL_SIZES } from '@/lib/pricing'
export function priceForSize(size: string): number { return PRICE_BY_SIZE[size] ?? 0 }
export function priceRangeLabel(): string {
  const vals = ALL_SIZES.map((s) => PRICE_BY_SIZE[s])
  const fmt = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`
  return `${fmt(Math.min(...vals))}–${fmt(Math.max(...vals))}`
}
```
Test `test/price.test.ts`: `expect(priceForSize('8x10')).toBe(1500)`; `expect(priceRangeLabel()).toBe('$5–$65')`. Run → PASS.

- [ ] **Step 4: `lib/data/photos.ts`** (tagged; ordered)

```ts
import 'server-only'
import { unstable_cache } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'

export interface Photo {
  id: string; slug: string; title: string; caption: string | null; description: string | null
  alt_text: string | null; aspect_ratio: number | null; width_px: number | null; height_px: number | null
  has_bw_variant: boolean
}
const COLS = 'id, slug, title, caption, description, alt_text, aspect_ratio, width_px, height_px, has_bw_variant'

export const getPublishedPhotos = unstable_cache(async (): Promise<Photo[]> => {
  const { data } = await supabaseServer().from('photos').select(COLS).eq('published', true).order('created_at', { ascending: true })
  return (data ?? []) as Photo[]
}, ['published-photos'], { tags: ['photos'] })

export async function getPhotoBySlug(slug: string): Promise<Photo | null> {
  const { data } = await supabaseServer().from('photos').select(COLS).eq('slug', slug).eq('published', true).maybeSingle()
  return (data as Photo) ?? null
}
```
> `getPhotoBySlug` is per-slug; tag it via the page's `revalidate`/tag wiring in its task. `order('created_at')` gives the stable grid/index order (§11 C6).

- [ ] **Step 5: `lib/data/collections.ts`** (visibility gate + cover fallback — §11 C4/C5)

```ts
import 'server-only'
import { unstable_cache } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'

export interface CollectionCard { slug: string; name: string; dek: string | null; coverSlug: string | null; coverAlt: string | null; count: number }
export interface PhotoInCollection { slug: string; title: string; alt_text: string | null; aspect_ratio: number | null; width_px: number | null; height_px: number | null; has_bw_variant: boolean; position: number }
export interface CollectionDetail { slug: string; name: string; dek: string | null; literature: string | null; photos: PhotoInCollection[] }

// A collection is visible only if it has >=1 PUBLISHED photo. Cover = cover_photo_id if published, else first published photo.
export const getCollections = unstable_cache(async (): Promise<CollectionCard[]> => {
  const db = supabaseServer()
  const { data: cols } = await db.from('collections').select('slug, name, dek, cover_photo_id, position').order('position', { ascending: true })
  const cards: CollectionCard[] = []
  for (const c of cols ?? []) {
    const detail = await loadDetail(c.slug)
    if (!detail || detail.photos.length === 0) continue // visibility gate
    const coverFromId = c.cover_photo_id ? detail.photos.find((p) => /* cover resolved below */ false) : undefined
    const cover = detail.photos[0] // fallback; replaced by cover_photo_id match if published (see loadDetail note)
    cards.push({ slug: c.slug, name: c.name, dek: c.dek, coverSlug: cover.slug, coverAlt: cover.alt_text, count: detail.photos.length })
  }
  return cards
}, ['collections'], { tags: ['collections'] })

async function loadDetail(slug: string): Promise<CollectionDetail | null> {
  const db = supabaseServer()
  const { data: col } = await db.from('collections').select('slug, name, dek, literature, id, cover_photo_id').eq('slug', slug).maybeSingle()
  if (!col) return null
  const { data: rows } = await db.from('collection_photos')
    .select('position, photos!inner(slug, title, alt_text, aspect_ratio, width_px, height_px, has_bw_variant, published)')
    .eq('collection_id', col.id).order('position', { ascending: true })
  const photos = (rows ?? [])
    .map((r: any) => ({ ...r.photos, position: r.position }))
    .filter((p: any) => p.published)
    .map(({ published, ...p }: any) => p) as PhotoInCollection[]
  return { slug: col.slug, name: col.name, dek: col.dek, literature: col.literature, photos }
}

export async function getCollectionBySlug(slug: string): Promise<CollectionDetail | null> {
  const d = await loadDetail(slug)
  return d && d.photos.length > 0 ? d : null // 404 if no published works
}
export async function getFeaturedCollection(): Promise<CollectionDetail | null> {
  const { data: col } = await supabaseServer().from('collections').select('slug').eq('featured_on_home', true).maybeSingle()
  if (!col) return null
  return getCollectionBySlug(col.slug) // null if 0 published works (§11 C5)
}
```
> **Implementer note:** finish the cover-by-`cover_photo_id` resolution — if `cover_photo_id`'s photo is in `detail.photos` (i.e. published), use it as cover; otherwise `detail.photos[0]`. The stub above always uses `[0]`; wire the id match. Keep the visibility filter (`p.published`) — it's the §11 C4 gate.

- [ ] **Step 6: data-layer test** (`test/data-layer.test.ts`) — mock `supabaseServer` to return: a collection with 2 photos (1 published, 1 not) and an empty collection. Assert `getCollections()` includes only the non-empty one with `count: 1`; `getCollectionBySlug('empty')` returns `null`; `getFeaturedCollection()` returns null when the featured collection has 0 published photos. (Mock the `.from().select().eq()...` chains as in slice-1's route tests.) Run → PASS.

- [ ] **Step 7: gate + commit**

```bash
npm run lint && npm run typecheck && npm test
git add lib/images lib/data lib/format test/derivatives.test.ts test/data-layer.test.ts test/price.test.ts
git commit -m "feat: storefront data layer (visibility-gated), derivatives + price helpers" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Seed fixture (service key) + CI build env

**Files:** Create `scripts/seed-storefront.mjs`. Modify `.github/workflows/ci.yml`, `.env.example`.

**Interfaces — Produces:** a runnable `node scripts/seed-storefront.mjs` that inserts ~3 photos + 1 `featured_on_home` collection + `collection_photos`, populates `aspect_ratio/width_px/height_px/alt_text`, and uploads the 6-width AVIF+WebP ladder for each (both registers where `has_bw_variant`) to the public `derivatives` bucket.

- [ ] **Step 1: Write `scripts/seed-storefront.mjs`** — uses `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY` (admin, RLS-bypassing; §11 C8). Reads ~3 sample images from a local `scripts/seed-assets/` dir, uses `sharp` to emit the 6 widths × {avif,webp}, uploads to `derivatives/<slug>/<register>/<w>.<ext>`, and upserts `photos` (published:true, with measured `aspect_ratio`/dims/`alt_text`) + one `collections` (`featured_on_home:true`) + `collection_photos` with `position`. Idempotent (`upsert` on slug; `upsert` storage with `{ upsert: true }`). Add `sharp` as a **devDependency** (`npm i -D sharp`) — it's a build/dev tool for the seed, not shipped.
  > Print a clear summary (rows + object counts). This is a throwaway dev fixture (§7/§11 C8), NOT slice 5's ingest — do not import it from app code.

- [ ] **Step 2: `.env.example`** — add a comment that `SUPABASE_SERVICE_ROLE_KEY` is required to run the seed. No new required app var.

- [ ] **Step 3: CI `build` job env (§11 C7).** In `.github/workflows/ci.yml`, add to the **`build`** job's `npm run build` step (only that job):
```yaml
      - run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ vars.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ vars.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
```
Use GitHub **`vars`** (not `secrets`) — both are public by design (the anon key ships in the browser bundle). Add a comment: build now prerenders the ISR read pages, which need the public Supabase URL + anon key; the service key is NOT here and never in the browser. Keep the job id `build` (status-check contract).

- [ ] **Step 4: Verify + commit.** `npm run build` still passes locally (with `.env.local` present it prerenders; without, note that the static read pages need the two public vars — Task 5+ pages must handle a build with no data by rendering empty states, which they do). Commit:
```bash
git add scripts/seed-storefront.mjs .env.example .github/workflows/ci.yml package.json package-lock.json
git commit -m "chore: service-key storefront seed fixture + public Supabase vars for CI build" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `Plate` — the `<picture>` renderer

**Files:** Create `components/store/Plate.tsx`. Test: `test/plate.test.tsx` (Vitest + jsdom; add `@testing-library/react`, `jsdom` as devDeps and a `jsdom` test env for this file).

**Interfaces — Produces:** `<Plate photo={{slug, alt_text, width_px, height_px, aspect_ratio}} register sizes priority? />` rendering `<picture>` with AVIF+WebP `<source>` (via `derivativeSrcSet`) + `<img>` fallback.

- [ ] **Step 1: failing test** — render `<Plate>` for a photo; assert: the `<img>` `alt` equals `photo.alt_text` (NOT title); an AVIF `<source>` and a WebP `<source>` are present with `srcSet` containing `1200w`; `loading="lazy"` by default; with `priority`, `loading="eager"` and `fetchpriority="high"`; when `width_px`/`height_px` are null, no `width`/`height` attributes are emitted (no NaN) — a fallback aspect-ratio style is used instead.

- [ ] **Step 2: implement `components/store/Plate.tsx`**

```tsx
import { derivativeSrcSet, derivativeSrc } from '@/lib/images/derivatives'

export function Plate({ photo, register = 'colour', sizes, priority = false, className }: {
  photo: { slug: string; alt_text: string | null; width_px: number | null; height_px: number | null; aspect_ratio: number | null }
  register?: 'colour' | 'silver'; sizes: string; priority?: boolean; className?: string
}) {
  const hasDims = photo.width_px != null && photo.height_px != null
  const ar = photo.aspect_ratio ?? (hasDims ? photo.width_px! / photo.height_px! : 0.8) // fallback 4:5
  return (
    <picture>
      <source type="image/avif" srcSet={derivativeSrcSet(photo.slug, register, 'avif')} sizes={sizes} />
      <source type="image/webp" srcSet={derivativeSrcSet(photo.slug, register, 'webp')} sizes={sizes} />
      <img
        src={derivativeSrc(photo.slug, register, 1200, 'webp')}
        alt={photo.alt_text ?? ''} className={className}
        {...(hasDims ? { width: photo.width_px!, height: photo.height_px! } : { style: { aspectRatio: String(ar), width: '100%' } })}
        loading={priority ? 'eager' : 'lazy'} decoding="async"
        {...(priority ? { fetchPriority: 'high' as const } : {})}
      />
    </picture>
  )
}
```
Run the test → PASS. Then `npm run lint && npm run typecheck`.

- [ ] **Step 3: commit** `git add components/store/Plate.tsx test/plate.test.tsx vitest.config.ts package.json package-lock.json && git commit -m "feat: Plate <picture> renderer (lazy/LCP, alt_text, null-dim guard)" -m "Co-Authored-By: ..."`

---

## Task 4: Store shell — Header, layout, focus/motion globals, Contact

**Files:** Create `components/store/Header.tsx`, `app/(store)/contact/page.tsx`. Modify `app/(store)/layout.tsx`, `app/globals.css`.

**Behavior:** `Header` (client) is the lockup — cloud mark (calls `useTheme().toggle`), Playfair "Jon Hoffman" wordmark → `/`, mono "PHOTOGRAPHS & PRINTS" kicker, nav = **Prints · Collections · Contact · Cart** (Cart shows the slice-1 `useCart().lines.length`, links to a cart route stub or `#` — do not fabricate a count). `layout.tsx` renders `<Header/>` above `{children}` inside the existing `ThemeProvider>CartProvider`. `globals.css` adds `:focus-visible { outline: 1px solid var(--ink); outline-offset: 2px; }` on interactive elements and an `@media (prefers-reduced-motion: reduce)` block zeroing transitions. `contact/page.tsx` is a minimal honest page: Newsreader copy in the Relics-essay voice + a real `mailto:jonhoffmanbusiness@gmail.com`; no form, no dead social links.

- [ ] Steps: write `globals.css` additions → write `Header.tsx` (uses slice-1 `useTheme`, `useCart`) → wire `layout.tsx` → write `contact/page.tsx` → `npm run build && npm run lint && npm run typecheck && npm test` all green → commit. (No unit test; the gate + a manual `npm run dev` check of the header + `/contact` is the verification. Confirm focus rings are visible via keyboard tab.)

---

## Task 5: Home (§12.5-A)

**Files:** Create `app/(store)/page.tsx`. Delete `app/page.tsx`.

**Behavior:** `getFeaturedCollection()`. If null → quiet empty state ("Coming soon.") — **no broken plate/rail** (§11 C5). Else: 820×900 right-aligned `Plate` (`priority` — this is the LCP; `object-position:center 40%`, 150px gradient mask) at the featured collection's cover/first work; a blurred 160-width bleed behind (`aria-hidden`, `blur(90px) scale(1.12)`); left rail = the featured collection's works as an **index of links** (Playfair, active=ink/rest=dim, hover nudges right — CSS only, **no auto-advance**); mono collection kicker → Newsreader pull-quote → primary "View this print →" (first work's product page, carrying the collection slug — §11 C6) + ghost "Enter the collection" (→ detail). `export const revalidate = 3600` + tag the fetch (`tags: ['home','collections']`). Server component (rail is static links; only the header's theme toggle is client).

- [ ] Steps: write the page (data + empty state + layout) → `npm run build` (needs the two public Supabase vars in `.env.local`; with a seeded featured collection the plate renders) → manual `dev` check → gate green → commit. Include a small unit test asserting the empty-state branch renders when `getFeaturedCollection()` returns null (mock the data fn).

---

## Task 6: Crop-guide math (`lib/product/crop.ts`) — pure

**Files:** Create `lib/product/crop.ts`. Test: `test/crop.test.ts`.

**Interfaces — Produces:** `cropGuide(plateAspect: number, size: string): { insetPct: { top:number;bottom:number;left:number;right:number }, label: string }` — given the plate's native aspect (`width/height`) and a print size, returns the centered-inscribed crop rectangle as percent insets over the *native-aspect* plate, plus the display label (orientation-flipped for landscape). Orientation from `plateAspect > 1` (§11 C1); size aspect from a `SIZE_ASPECT` table (`4x6`→2:3, `5x7`, `8x10`→4:5, `11x14`, `12x16`→3:4, `16x20`→4:5, `20x30`→2:3). Landscape flips the size aspect (portrait size on a landscape plate) and the label (`8x10`→`10x8`).

- [ ] **Step 1: failing tests** covering: `8x10` (4:5) on a 4:5 plate → zero insets, label `8×10`; `4x6` (2:3, taller) on a 4:5 plate → nonzero top/bottom insets; a landscape plate (`plateAspect=1.5`) with `8x10` → the size aspect is inverted and label is `10×8`; each of the 7 sizes yields a rectangle within [0,50] insets. (Port the inset formula from the quarry `Photography-main/src/pages/Product.tsx` crop logic — inset = `((plateAspect/sizeAspect) - 1)/2 * 100` on the dominant axis — adapt, don't copy the dead product-ID orientation code; re-derive orientation from `plateAspect`.)

- [ ] **Step 2: implement** the pure functions; run tests → PASS. `npm run lint && npm run typecheck`.

- [ ] **Step 3: commit.**

---

## Task 7: `ProductInteractive` — the client-state island (§11 C2)

**Files:** Create `components/product/ProductInteractive.tsx`, `components/product/CropGuide.tsx`. Test: `test/product-interactive.test.tsx` (jsdom).

**Interfaces — Consumes:** `Plate` (Task 3), `cropGuide` (Task 6), `priceForSize` (Task 1), slice-1 `useCart` + `CartLine`, `ALL_SIZES`. **Produces:** `<ProductInteractive photo={Photo} />` (client) owning `useState` for `size` (default `'8x10'`) and `register` (default `'colour'`), rendering: `Plate` with the selected `register` (image swaps on toggle — the §1 duality), `CropGuide` (overlay keyed to `size` via `cropGuide(photo.aspect_ratio ?? width/height, size)`), a `SizePicker` (chips over `ALL_SIZES`, selected=ink), a `RegisterToggle` (Colour/Silver, disabled when `!photo.has_bw_variant`), the Playfair price from `priceForSize(size)`, and an **"Add to cart"** button calling `useCart().add({ photoId: photo.id, title: photo.title, size, register, qty: 1 })`. **No "Save to collection."** All in one client component so the four pieces share `{size,register}`.

- [ ] **Step 1: failing test** — render `<ProductInteractive>` (wrapped in slice-1 `CartProvider`); assert: changing the size select updates the displayed price; selecting silver swaps the plate `<img srcset>` to the `silver` register; clicking "Add to cart" pushes a line with the current size+register into the cart context; the silver toggle is disabled when `has_bw_variant` is false; there is **no** "Save to collection" control.

- [ ] **Step 2: implement** the component + `CropGuide` (positions dimmed side/top panels from `cropGuide().insetPct`, caption "Guides show the N×M crop"). Run test → PASS. Gate.

- [ ] **Step 3: commit.**

---

## Task 8: Product page (server wrapper) — `prints/[slug]`

**Files:** Create `app/(store)/prints/[slug]/page.tsx`.

**Behavior:** `async function Product({ params, searchParams })` — `const { slug } = await params` (Next 16 async params); `getPhotoBySlug(slug)` → `notFound()` if null. Reads optional `?c=<collectionSlug>` from `searchParams` (the collection context a collection-detail link carries) to render the "No. NN · Collection" kicker: if `c` present, look up the photo's `position` in that collection for "No. NN"; if absent (reached from Prints), **omit** the kicker line (§11 C6). Renders the kicker + `<ProductInteractive photo={photo} />`. Dynamic route (no `generateStaticParams`) → renders on-demand, needs no build data (§11 C7). `alt` etc. come from the photo.

- [ ] Steps: write the page → `npm run build` → manual `dev` check on a seeded slug (size/register/crop/add-to-cart all live) → gate green → commit.

---

## Task 9: Prints (§12.5-B)

**Files:** Modify `app/(store)/prints/page.tsx` (replace the slice-1 stub).

**Behavior:** `getPublishedPhotos()` (ordered). 3-col 4:5 grid of cards: `Plate` (sizes `"(max-width:720px) 100vw, 33vw"`, hover brightens), Playfair title, **quiet** price (`priceForSize` of the smallest size or `priceRangeLabel()` — "from $5"), mono index + size-range meta. Title leads, price recedes. Filter by collection via `searchParams.c` (server-filtered using the `collection_photos` join — §11 C6); links to a product page carry `?c=` only when filtering by a collection. Replace slice-1's `export const dynamic = 'force-dynamic'` with `export const revalidate = 3600` + tagged fetch. Product links from Prints carry **no** `?c=` (kicker omitted there).

- [ ] Steps: write the grid + filter → `npm run build` → manual check → gate → commit.

---

## Task 10: Collections index + detail

**Files:** Create `app/(store)/collections/page.tsx`, `app/(store)/collections/[slug]/page.tsx`.

**Behavior:**
- **Index:** `getCollections()` (visibility-gated). Grid of collection cards: cover `Plate` (from `coverSlug`/`coverAlt`, with the null→first-published fallback baked into the data layer), Playfair name, mono count ("Six photographs"), Newsreader dek → detail. `revalidate` + tag `collections`.
- **Detail:** `const { slug } = await params`; `getCollectionBySlug(slug)` → `notFound()` if null (no published works — §11 C4). Centered masthead (mono "Collection No. NN · N photographs", Playfair name, Newsreader italic dek) → the **literature** at ~640px reading measure with a Playfair drop-cap + signature → "The works" as a horizontal film-strip of 300px `Plate`s → each links to `prints/<slug>?c=<collectionSlug>` (carries collection context for the Product kicker, §11 C6). Dynamic `[slug]` route → on-demand.

- [ ] Steps: write both pages → `npm run build` → manual check (a draft/empty collection must NOT appear on the index and its detail 404s) → gate → commit.

---

## Self-Review — spec coverage

- Nav / shell / focus / Contact — Task 4. Home §12.5-A + empty state (§11 C5) — Task 5. Prints §12.5-B + ordering/filter (§11 C6) — Tasks 1, 9. Product §12.5-D + native-aspect plate + shared client state + real cart + no Save-to-collection (§11 C1/C2/C3) — Tasks 3, 6, 7, 8. Collections index+detail + visibility gate + cover fallback (§11 C4) — Tasks 1, 10. Derivatives ladder / `<picture>` lazy+LCP+null-dim (§11 C8) — Tasks 1, 3. Data layer + tags — Task 1. Seed via service key + ISR-vs-CI build env (§11 C7/C8) — Task 2. Price display single-source — Task 1.
- **Deferred (not this slice):** real `revalidateTag` invalidation (slice 8 — this slice defines the tags), the derivative *pipeline* (slice 5 — this slice seeds a fixture), cart drawer/visual polish (slice 3), About/legal/footer (slice 9), the `ThemeProvider` theme-flash fix (carried from slice 1 — fix when the toggle ships; **note: this slice ships the toggle in the Header, so the pre-hydration anti-flash script SHOULD be added in Task 4** — implementer: add the inline `<script>` in `app/layout.tsx` that reads `localStorage['theme:v1']` and sets `data-theme` before paint).
- **Type consistency:** `Photo`/`CollectionCard`/`CollectionDetail` shapes, `register` union, `cropGuide` signature, and `derivativeSrcSet` are used identically across tasks.

**Build order = task order** (matches spec §8 chunks: 1–3 substrate, 4 shell, 5 Home, 6–9 shop path, 10 collections). Each task ends independently testable; Tasks 1, 3, 6, 7 have unit tests, the surface tasks gate on `build`+manual.
