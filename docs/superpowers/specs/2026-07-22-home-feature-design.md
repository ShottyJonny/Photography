# Slice 6b — Home feature picker (design spec)

**Date:** 2026-07-22
**Surface:** `design.md §11.4-G`, measurements from `design/Jon Hoffman Admin.dc.html` Surface G
**Status:** approved (brainstorm), ready for writing-plans

## Goal

Give the admin a control to choose which collection the public home page opens on —
i.e. to set `collections.featured_on_home`. The storefront home already *consumes* the
featured collection (`app/(store)/page.tsx` → `getFeaturedCollection`); everything read-side
exists. 6b is only the admin **picker** that writes the flag, a **live home-hero preview**,
and making the last `Home feature` nav item live.

This is the final admin surface. Nothing here touches the money path or the schema (the
`featured_on_home` column and the `collections_one_featured` partial unique index are
already applied and live).

## Decisions (locked in brainstorm)

1. **Preview is literal to the mock, wired to real data.** The right-hand preview reproduces
   Surface G's stylized home hero (cover image + left gradient + decorative top-nav + eyebrow
   + big title + dek line + "Enter the collection →"). Its *content* is real: the actual cover
   photo the home will lead with, the real collection name, and the same pull-quote the home
   computes. The faux top-nav and "From the {name} collection" eyebrow are decorative preview
   chrome, not claims.
2. **Only featurable collections appear.** The picker lists only collections with ≥1
   **published** photo. A draft-only collection cannot be selected, because featuring it would
   blank the home to "Coming soon" (see Hazard). Such collections are simply absent from the
   list — not shown-and-disabled.
3. **Always exactly one.** Pure radio; no clear-to-none affordance. You pick one collection and
   commit it. The "nothing featured" state can still exist upstream (fresh DB, before the first
   pick) and the home handles it, but the picker's only job is to point at one collection.

## The hazard this surface must respect

The home renders `EmptyHome` ("Coming soon") when the featured collection has **zero published
photos** — `loadDetail` (`lib/data/collections.ts`) filters `.photos` to `published` only, and
`app/(store)/page.tsx` bails to `EmptyHome` when `featured.photos.length === 0`. Total
work-count ≠ publishable count: a collection can hold 6 works with 0 published. Decision 2
prevents the footgun at the list level; the write action re-checks it server-side (never trust
the client).

## Route & files

New route: `app/admin/(protected)/home/page.tsx` → `/admin/home` (short; it *is* the home's
control surface).

| File | Change |
|---|---|
| `app/admin/(protected)/home/page.tsx` | **new** — server page; `requireAdmin()`, calls the read, renders the picker |
| `lib/data/collections-admin.ts` | **add** `listFeaturableCollections()` |
| `lib/admin/home-feature-actions.ts` | **new** — `setHomeFeature()` Server Action |
| `components/admin/HomeFeaturePicker.tsx` | **new** — client component (radio list + live preview) |
| `lib/collections/quote.ts` | **new** — `pullQuote()` extracted from `app/(store)/page.tsx` |
| `app/(store)/page.tsx` | import `pullQuote` from the shared module (delete the local copy) |
| `components/admin/AdminNav.tsx` | `Home feature` → `href: '/admin/home'` |
| `app/globals.css` | add `.admin-feat-*` classes under the `[data-admin]` scope |

## The read — `listFeaturableCollections()`

Add to `lib/data/collections-admin.ts`, following the existing admin-read pattern
(`import 'server-only'`, `await requireAdmin()` first, `createAuthServerClient()` — reads as the
logged-in user under RLS).

Returns collections that have **≥1 published photo**, ordered by `position`:

```ts
export interface FeaturableCollection {
  id: string
  name: string
  slug: string
  publishedCount: number
  hasLiterature: boolean
  heroSlug: string          // the photo that will actually lead the home
  heroAlt: string | null
  quote: string             // pullQuote(dek, literature) — same as the home
  featured: boolean         // current featured_on_home
}
export interface FeaturableList {
  collections: FeaturableCollection[]
  // The currently-featured collection *if* it is NOT in `collections`
  // (i.e. it has 0 published photos → the live home is showing "Coming soon").
  orphanFeatured: { id: string; name: string } | null
}
```

Rules:
- **Featurable predicate:** a collection is included iff it has ≥1 published photo.
- **Hero resolution — identical to the home.** Resolve the hero the way `loadDetail` +
  `app/(store)/page.tsx` do: the collection's `cover_photo_id` photo **if that photo is
  published**, otherwise the first published photo (by `position`). `heroSlug`/`heroAlt` come
  from that resolved photo. This guarantees the preview shows the photo the home will lead with.
- **`quote`** = `pullQuote(dek, literature)` (the shared module). May be `''`.
- **`hasLiterature`** = `literature` is non-empty (drives the "· the essay leads" meta suffix).
- **`orphanFeatured`:** if the DB-featured collection has 0 published photos, it won't be in
  `collections`; return its `{id, name}` here so the page can state the live home currently has
  no publishable feature. Null in the normal case.

## The write — `setHomeFeature()`

New file `lib/admin/home-feature-actions.ts` (`'use server'`), following `collection-actions.ts`
(same `Result` type, same `revalidateTag('collections', 'max')` helper).

```ts
export async function setHomeFeature(input: { collectionId: string }): Promise<Result>
```

1. `await requireAdmin()` — first line (Server Actions are public POSTs; the DAL is the guard).
2. **Re-validate featurability server-side.** Confirm the target exists and has ≥1 published
   photo. A stale form could submit an un-featurable id — reject with a terse message, do not
   write.
3. **Idempotent short-circuit:** if the target is already `featured_on_home`, return `{ ok: true }`
   without writing.
4. **Clear-then-set — two updates, in this order** (the `collections_one_featured` partial unique
   index forbids two rows with `featured_on_home = true`, so order is load-bearing):
   1. `update collections set featured_on_home = false where featured_on_home = true`
   2. `update collections set featured_on_home = true where id = <target>`
   Clearing first means we never transiently hold two featured rows (which would trip the unique
   index). **Do not** use a single `set featured_on_home = (id = $target)` statement — a single
   UPDATE can violate a non-deferrable unique index mid-statement even when the final state is
   valid. **No Postgres function** — two plain updates.
5. **Non-atomic window (accepted):** supabase-js issues these as two statements, not one
   transaction. If step 4.2 fails after 4.1 succeeds, the DB is left with *nothing* featured →
   the home degrades to "Coming soon" (safe, not a crash), and the action returns an error so
   Jon can retry. This is the documented cost of "no Postgres function."
6. `revalidateTag('collections', 'max')`. The home is `force-dynamic`, so it reflects the change
   on the next request regardless; the revalidate covers the cached `/collections` listing and
   keeps parity with the 6a actions.
7. Return `{ ok: true }`.

## The picker — `components/admin/HomeFeaturePicker.tsx` (client)

Props: `{ collections: FeaturableCollection[]; orphanFeatured: {id;name}|null }`.
Two-column grid `360px 1fr`, gap `44px`, `align-items: start` (Surface G).

**Left column — "Choose a focal point":**
- Radio rows, one per featurable collection. Each row (Surface G measurements):
  cover `<img>` 52×66 (`object-fit: cover`, via `derivativeSrc(heroSlug, 'colour', 400, 'webp')`,
  `alt={heroAlt ?? ''}`), name in Playfair 20, meta line in mono 10 (`{publishedCount} works` +
  ` · the essay leads` when `hasLiterature`), radio dot 16px (inner 8px). Active row border
  `--ink`; rest `--hair`.
  Rows are `<button>` / proper radio semantics (keyboard-navigable, `role="radio"`/radiogroup).
- Selection is local state, initialized to the collection where `featured === true` (or the
  first collection if none is featured / the feature is orphaned).
- **Set button** (`--btnbg`/`--btnink`, mono 11 uppercase, padding 14, full width). Disabled when
  the selection equals the currently-featured collection (nothing to save) or while the action is
  pending. Label: "Set as home focal point"; when selection == current, "Current focal point"
  (disabled). Uses `useTransition`; on success calls `router.refresh()` so the server re-reads
  and the button/preview settle to the new current. Terse error line on failure.
- Helper line under the button (mono 10 faint): **"Live on the home page immediately."**
  (Honest-copy tweak — the mock's "the change is live within a minute" understates
  `force-dynamic`, which is next-request.)

**Right column — "Live preview — home hero":**
- Reproduce Surface G's hero box: `position: relative; height: 520px; border: 1px solid --hair;
  overflow: hidden`. Cover image absolute-filled, `object-position: center 40%`
  (`derivativeSrc(selected.heroSlug, 'colour', 1200, 'webp')`, `alt=""` — decorative in preview).
  Left-to-right gradient scrim `linear-gradient(90deg, rgba(11,11,11,.9) 0%, rgba(11,11,11,.55)
  38%, transparent 70%)`. Decorative top row (wordmark + faux nav). Bottom-left block: eyebrow
  "From the {name} collection" (mono 10, `.28em`), title = collection **name** (Playfair 52),
  dek line = `quote` (Newsreader 17, `--dim`) — omit the `<p>` entirely when `quote === ''`,
  decorative "Enter the collection →" pill.
- Updates live as the radio selection changes (client state only — no server round-trip until
  Set).

**Styling:** add `.admin-feat-*` classes to `app/globals.css` under the `[data-admin]` scope,
mirroring the `.admin-col-*` convention already there. Admin is dark-only.

## Empty / edge states

- **Zero featurable collections** (no collection has any published photo): the page replaces the
  picker+preview with a single honest line — e.g. *"No collection has a published work yet."* —
  and a link to `/admin/photographs`. No radio, no preview.
- **Orphaned feature** (`orphanFeatured` set): render the normal picker (selection defaults to the
  first featurable), plus a one-line note that the live home currently features a collection with
  no published works and is showing "Coming soon" until one is published or a new focal point is
  set. Terse, honest, no alarm.

## Shared refactor — `pullQuote`

Extract `pullQuote(dek, literature)` verbatim from `app/(store)/page.tsx` into
`lib/collections/quote.ts` and import it in both the home page and `listFeaturableCollections()`.
Rationale (honest-function): the preview's quote must be byte-identical to what the home renders;
sharing the function guarantees it and gives `pullQuote` a unit-testable home. No behaviour change.

## Nav

`components/admin/AdminNav.tsx`: change `{ label: 'Home feature', href: null }` to
`{ label: 'Home feature', href: '/admin/home' }`. This flips the existing nav test
(`test/admin-nav.test.tsx`) — `Home feature` is no longer `NOT BUILT`; update that expectation.

## Tests (TDD — Composer-ready)

- **`setHomeFeature`:** features a featurable collection (target true, prior feature cleared);
  clear-then-set ordering; rejects an un-featurable (0-published) id without writing; idempotent
  on the already-featured target; `requireAdmin` gate (unauthenticated → throws/blocked).
- **`listFeaturableCollections`:** returns only ≥1-published collections; excludes draft-only;
  hero resolution (published cover → cover; unpublished cover → first published); `quote` via
  `pullQuote`; `hasLiterature` flag; `featured` flag; `orphanFeatured` populated when the
  DB-featured collection has 0 published.
- **`pullQuote` units:** dek wins; first-sentence extraction; ≤200-char sentence guard; 160-char
  truncation with ellipsis; empty in / empty out.
- **`AdminNav`:** `Home feature` is live (href set), no longer `NOT BUILT`.
- **`HomeFeaturePicker`:** renders one row per featurable collection; selecting a row updates the
  preview (name, title, quote, image); Set disabled when selection == current; empty-state message
  when `collections` is empty; orphan note when `orphanFeatured` set.

## Out of scope / untouched

- Money path, Stripe, checkout, webhook, `lib/pricing.ts` — untouched.
- Schema — `featured_on_home` column + `collections_one_featured` index already live; no migration.
- No clear-to-none, no scheduling, no multi-feature. YAGNI.
