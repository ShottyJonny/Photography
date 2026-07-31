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

---

## Built — amendments (2026-07-31)

The plan executed as written. Three things were found afterwards, in the browser, that the spec had not anticipated. All three are shipped and recorded in `design.md` §12.6.

### A1 — The bleed cross-fade swelled, then snapped

**D2 above was wrong about the bleed.** It said the bleed "cross-fades the same way for consistency," and the implementation gave each layer `opacity: var(--bleedop, 0.5)`. The outgoing layer then held at 0.5 while the incoming faded `0 → 0.5` *over* it — and because 0.5 never occludes anything, the two **composited** rather than one replacing the other.

Measured through one fade:

| Time | Layers | Composite |
|---|---|---|
| rest | `0.500` | 0.500 |
| 150ms | `0.500` + `0.262` | 0.631 |
| 300ms | `0.500` + `0.421` | 0.710 |
| 450ms | `0.500` + `0.490` | **0.745** |
| 590ms | `0.500` | 0.500 ← hard cut |

The hero layers never had this problem because their incoming layer reaches opacity `1` and fully covers the outgoing one.

**Fix:** the dimming moved onto a `.home-bleed-stack` wrapper. Inside it both layers sit at opacity `1` and cross-dissolve exactly like the hero; the group is dimmed once. The swell is now impossible by construction — layers inside a wrapper cannot composite above the wrapper's own opacity. The separate `home-bleed-fade-in` keyframes are gone; both stacks share `home-hero-fade-in`.

> An earlier "fix" gave the bleed its own keyframes ending at `var(--bleedop)`. That addressed the wrong half: it stopped the incoming layer flashing to full strength but left the two compositing, which is what was actually visible.

### A2 — The pause region was the whole page

D4's pause handlers sat on `.home-grid`, which measures **~90% of the viewport at 998px wide and ~76% at 1440×900**. A cursor resting over the copy, or crossing the page toward the tab bar, froze the carousel indefinitely. "Pause on hover" was meant to mean hovering the carousel; it meant hovering the page, and read as the carousel being stuck.

**Fix:** handlers stay delegated on the grid but test the event target against refs on the rail and the hero panel. At 1440×900 the pause region drops **75.7% → 57.0%**, of which the hero plate is 48.8% and *should* pause — §12.5-A specifies a full-height 820×900 plate, so the photograph genuinely is half the page. This removes the accidental pauses, not the deliberate one.

### A3 — Dwell progress on the index list

Added after the plan, at the point where the carousel's state became hard to read: each row's existing hairline doubles as its dwell track. No new chrome.

- Story-style: rows shown in the current pass hold a full line at 0.45 opacity, the active row fills over the 6s dwell, upcoming rows stay empty.
- **The pass boundary is the pass's own starting photograph, not index 0.** The cover can sit anywhere in the list, so a pass beginning at 05 runs 05, 06, 01, 02, 03, 04 through the numeric wrap before starting clean. A first implementation reset at index 0 and would have blanked the trail mid-pass for any collection whose cover is not the first photograph.
- **The countdown now resumes rather than restarting.** Elapsed dwell is banked on pause; only the remainder is scheduled on resume, and the bar pauses in step via `animation-play-state`, so the visible fill and the timer cannot disagree. This also closes the wart noted during planning, where repeated hovering could stall an advance indefinitely.
- **No bar is drawn unless an advance is pending.** After a selection stops auto-advance, and under reduced motion, the track is absent rather than frozen — a stopped bar implies a countdown that will never fire (`product.md §1`).
- Duration comes from `ADVANCE_MS` through an inline style, so there is one source of truth. `FADE_MS` still duplicates its value into the CSS; that pairing is unchanged and remains a hand-sync.

### Final state

79 test files, **2059 tests**, all green. `npm run lint`, `npm run typecheck` clean.

Verified in a real browser rather than only jsdom: selection without navigation, the hero fade mid-animation at opacity 0.071 under `home-hero-fade-in 0.6s`, the bleed settling back to exactly 0.5, the pause-region geometry, and the progress bar's placement and 6s linear timing.

**Not verified:** how the fill and the fade *look* in motion. The Browser pane was hidden throughout, so the page never composited frames and CSS animations did not advance. Structure, computed styles and timing are confirmed; visual weight is not. Two judgement calls deserve an eye — whether a full-strength `--ink` bar is too heavy against the dark theme, and whether 0.45 is right for the completed trail.

### Still open

- Mobile index dots (§12.5-E) remain unbuilt; the rail keeps its full title list at ≤900px and works as the selector there.
- The Reliquary collection's `literature` is still the 184-character slice-6a placeholder, now sitting under six real photographs.
