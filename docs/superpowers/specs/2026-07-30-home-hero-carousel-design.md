# Home hero carousel — design

**Date:** 2026-07-30
**Surface:** `/` (storefront home)
**Design reference:** `design.md` §12.5-A (home), §12.5-E (mobile), §12.6 (motion), §8 (cross-cutting Do/Don't), §9 (regressions not to inherit)

> Two evidence citations below point at §6 and §7. Per `CLAUDE.md`, §2–§7 are a **legacy inventory of the deleted stylesheet and are not design targets** — they are cited here only as the record of what the old site did wrong, which is exactly what §9 ("Regressions the rebuild must not inherit") formalizes.

## The problem

`design.md` §12.5-A specifies the home rail as "an **index list** of works (Playfair, active = ink, rest = dim, hover nudges right)" under a "Featured work · 01/24" counter. An index with an *active* member and a running counter only means something if the active member changes.

What is built instead ([app/(store)/page.tsx](../../../app/(store)/page.tsx)) is six `<Link>`s that navigate away to `/prints/[slug]`. The `is-active` class is computed against a hero that never moves, and the counter's `01` is a hardcoded string. The carousel skeleton is present; nothing drives it.

§12.5-E further specifies **index dots** on mobile — carousel affordance — confirming the surface was designed to cycle.

## Goal

Selecting a title cross-fades the hero to that photograph rather than navigating. The hero auto-advances. The route to a print's page is preserved by the existing "View this print →" CTA, which follows the selection instead of being pinned to the collection cover.

## Non-goals

- **Mobile index dots (§12.5-E).** At ≤900px the rail currently keeps the full title list, which works as the selector. Swapping it for dots is a separate visual change. Follow-up, not this slice.
- **The collection film-strip (§12.5-C).** `/collections/[slug]` renders a horizontal strip of 300px plates that link to the print page. That is what §12.5-C specifies and it is unchanged.
- **`components/store/Plate.tsx`.** Untouched.

## Decisions

### D1 — Component boundary

`app/(store)/page.tsx` stays a Server Component with `export const dynamic = 'force-dynamic'`. It keeps `getFeaturedCollection()`, `pullQuote()`, and the `EmptyHome` guard, and renders a new client component with serializable props.

**New:** `components/store/HomeHero.tsx` (`'use client'`), props:

```ts
{
  photos: FeaturedPhoto[]   // ordered collection members
  initialIndex: number      // index of the cover, or 0
  collectionSlug: string
  collectionName: string
  quote: string | null
}
```

`HomeHero` owns the entire `.home-grid`, not just the plate. Four things move together on selection — the hero plate, the blurred bleed, the `01 / 06` counter, and the "View this print →" href — so a narrower boundary would require lifting state into a provider for no benefit. The `<style>` block moves into `HomeHero`. `EmptyHome` stays in `page.tsx`.

`initialIndex` is resolved server-side using the existing rule at [app/(store)/page.tsx:40](../../../app/(store)/page.tsx#L40): the cover photo if it is a member, else the first member. This preserves current behaviour and keeps the server render deterministic.

### D2 — Cross-fade renders two plates, never six

The naive cross-fade stacks all N plates at `opacity: 0` and toggles. That loads N full-size derivatives on first paint — for a six-photo collection, roughly a megabyte on a page whose LCP element *is* the hero. `loading="lazy"` does not help; every stacked plate is in the viewport.

**Only the current and the outgoing plate are mounted.** The outgoing unmounts when its transition ends. After each settle, the next index is warmed with `new Image().src = derivativeSrc(next.slug, 'colour', 1200, 'webp')` so the advance is seamless.

`priority` / `fetchPriority="high"` stays on the initial plate only — subsequent plates mount after interaction or a timer, so eager loading them is pointless.

The bleed (`derivativeSrc(slug, 'colour', 160, 'webp')`, blurred 90px) is small enough that its cost is immaterial; it cross-fades the same way for consistency.

Under `prefers-reduced-motion: reduce` there is no fade — the outgoing plate unmounts immediately and the swap is instant.

### D3 — Tabs, implemented properly

`design.md` §7 (line 206) faults the legacy home for misusing `role="tablist"` / `role="tab"` "without the ARIA keyboard pattern," and §9 carries it forward as a regression not to inherit. The correction is to implement the pattern, not to avoid the roles.

`role="tablist"` cannot hold `<li>` children without breaking the role structure, so the current `<ul>` / `<li>` markup becomes:

- `<div role="tablist" aria-label="Featured works" aria-orientation="vertical">`
- `<button role="tab">` per photograph, carrying `aria-selected`, `aria-controls="home-hero-panel"`, `id="home-hero-tab-{slug}"`, and roving `tabIndex` (`0` when active, `-1` otherwise)
- the hero wrapper becomes `<div role="tabpanel" id="home-hero-panel" aria-labelledby="home-hero-tab-{activeSlug}" tabindex="0">` — the panel holds only an image, and APG requires a tabpanel with no focusable children to be focusable itself; without it a keyboard user tabbing past the rail skips the photograph entirely and lands on the CTAs

The `border-bottom` currently on `.home-index li` moves to the tab element. Visual result is unchanged: Playfair title, mono index number, active = `--ink`, rest = `--dim`, hover nudges right.

**Keyboard on the tablist:** `ArrowDown` / `ArrowUp` move and select (automatic activation — the panel is a single image, so there is no cost to showing it), `Home` / `End` jump to first / last. Vertical orientation, so Up/Down per APG; Left/Right are not bound.

**Live region:** the panel carries `aria-live="off"` while auto-rotating and `aria-live="polite"` once rotation has stopped. A screen reader is not narrated at by a timer, but is told about changes the user caused.

### D4 — Motion policy

Recorded here because §12.6 requires only that an auto-advancing carousel be "pausable," and the specific policy should not be re-litigated.

The interval runs only when `isPlaying && !hovered && !focusWithin`.

| State | Trigger | Effect |
|---|---|---|
| `isPlaying` | starts `true` | 6s interval, wrapping last → first |
| `isPlaying` → `false` | **any** selection: click or key | stops **permanently** |
| `hovered` | pointer enter / leave | pauses, resumes on leave |
| `focusWithin` | focus / blur within the grid | pauses, resumes on blur |
| `isPlaying` starts `false` | `prefers-reduced-motion: reduce` | never auto-advances |
| `isPlaying` starts `false` | `photos.length < 2` | nothing to cycle |

Reduced motion is read with `matchMedia('(prefers-reduced-motion: reduce)')` inside an effect, so the server render is unaffected and there is no hydration mismatch.

**Why "stops permanently" is load-bearing, not a nicety.** `design.md` §6 (line 193) records that the legacy carousels pause on hover only, calls that a WCAG 2.2.2 (Level A) failure, and adds that "any redesign must fix this rather than inherit it"; §9 carries it as a regression not to inherit. Hover is not a mechanism for keyboard users or touch users. Focus-pause covers keyboard. **Selection-stops-permanently is what covers touch** — on a phone the title list is on screen and tappable ([app/(store)/page.tsx:299](../../../app/(store)/page.tsx#L299) keeps the rail at ≤900px), so tapping any title is a reachable stop for every input type.

It is also the behaviour the surface wants regardless of accessibility: without it, deliberately choosing "Sidelines" gets overridden by the timer six seconds later.

No visible pause control. The three mechanisms above are invisible to a pointer user, so the rail keeps the layout §12.5-A describes.

### D5 — What follows the selection

| Element | Behaviour |
|---|---|
| hero plate | cross-fades to the selected photograph |
| blurred bleed | follows (§12.5-A: "the same plate") |
| counter | `{active+1} / {total}`, zero-padded, existing format |
| "View this print →" | `/prints/{activeSlug}?c={collectionSlug}` |
| "Enter the collection" | static — `/collections/{collectionSlug}` |
| collection kicker, pull-quote | static — properties of the collection, not the photograph |

## Edge cases

| Case | Handling |
|---|---|
| no featured collection, or zero members | `page.tsx` returns `EmptyHome` before `HomeHero` mounts — unchanged |
| exactly one member | tablist renders (an index of one); `isPlaying` starts `false`; no interval |
| cover is not a member | `initialIndex` falls back to `0`, matching today's `?? featured.photos[0]` |
| a derivative 404s | same as today — `Plate` emits the srcset it is given; not a new failure mode |
| rapid clicking mid-transition | outgoing index is replaced, not queued; at most two plates mounted at any time |

## Testing

`test/home.test.tsx` is 14 lines and covers only the empty state — the populated home path has no coverage today. This work closes that.

**New:** `test/home-hero.test.tsx` — Vitest + React Testing Library, fake timers.

1. initial selection is the cover photograph
2. every member renders as a `role="tab"`
3. clicking a tab moves `aria-selected` and the panel's `aria-labelledby`
4. clicking a tab updates the "View this print →" href
5. clicking a tab stops auto-advance — advance 12s, selection unchanged
6. auto-advance steps to the next photograph at 6s
7. auto-advance wraps last → first
8. pointer enter pauses; pointer leave resumes
9. focus within pauses; blur resumes
10. `prefers-reduced-motion: reduce` never auto-advances
11. `ArrowDown` / `ArrowUp` move selection
12. `Home` / `End` jump to first / last
13. the counter tracks the active index
14. a single-photo collection never auto-advances

`test/home.test.tsx`'s existing empty-state test must continue to pass unchanged.

## Files

| File | Change |
|---|---|
| `components/store/HomeHero.tsx` | new — client component, owns `.home-grid` and its styles |
| `app/(store)/page.tsx` | thinned to fetch + `EmptyHome` + `<HomeHero />` |
| `test/home-hero.test.tsx` | new — 14 tests above |
| `design.md` §12.6 | one line recording the D4 motion policy |

## Verification

The four-job gate in `.github/workflows/ci.yml`: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`.

Baseline verified on this branch before any change, 2026-07-30: **78 files, 2006 tests, all passing** (15.6s). Note `CLAUDE.md` states 2005 as of slice 7 — it is one behind; 2006 is the measured figure. The 14 new cases take it to 2020.

Manual: `/` at desktop and ≤900px, keyboard-only pass through the tablist, and one run with `prefers-reduced-motion` forced on.

## Git

Branch `feature/home-hero-carousel` off `develop`, merged back to `develop`. No money-path code is touched, so the `develop → main` gate is not implicated.
