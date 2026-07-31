# Home Hero Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the home page's featured-work rail select the hero photograph — cross-fading rather than navigating away — and auto-advance it under a motion policy that is pausable by pointer, keyboard, and touch alike.

**Architecture:** `app/(store)/page.tsx` stays a Server Component and keeps all data fetching; everything visual moves into one new client component, `components/store/HomeHero.tsx`, which owns the selected index and the timer. The rail becomes a proper ARIA tablist driving a single tabpanel. Only two hero plates are ever mounted (current + outgoing) so the page does not pay for six full-size derivatives on first paint.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Vitest 2.1.9 + @testing-library/react 16 (jsdom).

**Spec:** [docs/superpowers/specs/2026-07-30-home-hero-carousel-design.md](../specs/2026-07-30-home-hero-carousel-design.md)

## Global Constraints

Every task's requirements implicitly include this section.

**Test harness — these are non-obvious and will silently break work that assumes otherwise:**

- **`@testing-library/jest-dom` is NOT installed.** `toBeInTheDocument()`, `toHaveAttribute()`, `toBeDisabled()` do not exist. Assert with plain Vitest matchers against `container.querySelector(...)` — e.g. `expect(el?.getAttribute('aria-selected')).toBe('true')`. Follow `test/home-feature-picker.test.tsx`.
- **`@testing-library/user-event` is NOT installed.** Use `fireEvent` from `@testing-library/react`.
- **Vitest `globals` is NOT enabled.** Import `describe, it, expect, vi, beforeEach, afterEach` from `vitest` explicitly.
- **RTL auto-cleanup does NOT run** (it needs a global `afterEach`, which this config does not provide). Every test file must call `cleanup()` in its own `beforeEach`.
- **jsdom does not implement `window.matchMedia`.** It appears nowhere in this repo. Any component calling it throws `TypeError: window.matchMedia is not a function` unless stubbed. Tests must stub it; the component must also guard with `typeof window.matchMedia === 'function'`.
- **React event delegation breaks two obvious `fireEvent` calls. Both bite.**
  - `fireEvent.mouseEnter` does **not** trigger React's `onMouseEnter` — React derives enter/leave from `mouseover`/`mouseout`. This plan uses `onMouseOver`/`onMouseOut` in the component and `fireEvent.mouseOver`/`fireEvent.mouseOut` in tests.
  - `fireEvent.focus` / `fireEvent.blur` do **not** trigger React's `onFocus`/`onBlur` — React maps those to the native **`focusin`/`focusout`**, which bubble; a plain `focus` event does not. Tests must use `fireEvent.focusIn` / `fireEvent.focusOut`.
  - **Do not "simplify" either pair back to the obvious form.** The tests will go green-to-red in a way that looks like a component bug and is not.
- Test environment is picked by glob: `test/**/*.test.tsx` → jsdom, everything else → node. New component tests must end in `.tsx`.
- `NEXT_PUBLIC_SUPABASE_URL` is unset in tests, so `derivativeSrc()` returns strings beginning `undefined/storage/...`. Never assert on a full derivative URL; assert on the slug segment only.

**Shell-agnostic commands.** The executing environment may be PowerShell 5.1, which has **no `&&` operator** and no heredocs. Every command in this plan is a single line, run one per line. Never chain with `&&`.

**Project rules:**

- Node 22. Package manager is npm.
- Never commit to `main` or `develop`. All work lands on the existing branch `feature/home-hero-carousel`.
- Never use `--no-verify`, `--force`, or bypass hooks.
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (this repo's stated convention, `CLAUDE.md` §Git workflow).
- TypeScript is strict. `npm run lint` must report 0 errors and 0 warnings.
- The `<style>` blocks in this codebase are plain `<style>{\`...\`}</style>` inside the component. Follow that; do not introduce CSS modules or a styling library.

**Fixed values (copy verbatim):**

- Auto-advance interval: `6000` ms (`ADVANCE_MS`)
- Cross-fade duration: `600` ms (`FADE_MS`) — the CSS animation durations must be kept equal to it by hand
- Tablist label: `Featured works`
- Panel id: `home-hero-panel`
- Tab id pattern: `home-hero-tab-${photo.slug}`

**Baseline:** 78 test files, 2006 tests, all green, measured on this branch 2026-07-30.

---

## File Structure

| File | Responsibility |
|---|---|
| `components/store/HomeHero.tsx` | **Create.** Client component. Owns selected index, timer, cross-fade, tablist, and all home-grid styles. |
| `app/(store)/page.tsx` | **Modify.** Reduced to: fetch, `EmptyHome` guard, compute `initialIndex`, render `<HomeHero />`. |
| `test/home-hero.test.tsx` | **Create.** All carousel behaviour. |
| `test/home.test.tsx` | **Modify.** Keeps its empty-state test; gains coverage of the page's `initialIndex` resolution and its fallbacks. |
| `design.md` | **Modify.** One line in §12.6 recording the motion policy. |

---

## Task 1: Extract HomeHero and make the rail select the hero

The core deliverable: clicking a title changes the hero instead of navigating. No animation and no auto-advance yet — those are Tasks 2 and 4. Swap is instant here.

**Files:**
- Create: `components/store/HomeHero.tsx`
- Modify: `app/(store)/page.tsx` (replace lines 1–109 body; move the whole `<style>` block out)
- Test: `test/home-hero.test.tsx` (create)

**Interfaces:**
- Consumes: `PhotoInCollection` from `@/lib/data/collections`; `Plate` from `@/components/store/Plate`; `derivativeSrc` from `@/lib/images/derivatives`.
- Produces: `export function HomeHero(props: HomeHeroProps)` where

```ts
export interface HomeHeroProps {
  photos: PhotoInCollection[]
  initialIndex: number
  collectionSlug: string
  collectionName: string
  quote: string | null
}
```

  Tasks 2–4 add behaviour to this same component and do not change this signature.

- [ ] **Step 1: Write the failing test**

Create `test/home-hero.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { HomeHero } from '@/components/store/HomeHero'
import type { PhotoInCollection } from '@/lib/data/collections'

function photo(n: number, over: Partial<PhotoInCollection> = {}): PhotoInCollection {
  return {
    id: `p${n}`,
    slug: `photo-${n}`,
    title: `Photo ${n}`,
    alt_text: `Alt for photo ${n}`,
    aspect_ratio: 0.8,
    width_px: 1600,
    height_px: 2000,
    has_bw_variant: true,
    position: n,
    ...over,
  }
}

const six = [photo(1), photo(2), photo(3), photo(4), photo(5), photo(6)]

function stubMatchMedia(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

function mount(props: Partial<Parameters<typeof HomeHero>[0]> = {}) {
  return render(
    <HomeHero
      photos={six}
      initialIndex={0}
      collectionSlug="reliquary"
      collectionName="Reliquary"
      quote="A small cabinet of prints held close."
      {...props}
    />,
  )
}

const tabs = (c: HTMLElement) => [...c.querySelectorAll('[role="tab"]')]
const selected = (c: HTMLElement) => c.querySelector('[role="tab"][aria-selected="true"]')

beforeEach(() => {
  cleanup()
  stubMatchMedia(false)
})

describe('HomeHero — selection', () => {
  it('renders one tab per photograph inside a labelled vertical tablist', () => {
    const { container } = mount()
    const list = container.querySelector('[role="tablist"]')
    expect(list?.getAttribute('aria-label')).toBe('Featured works')
    expect(list?.getAttribute('aria-orientation')).toBe('vertical')
    expect(tabs(container)).toHaveLength(6)
  })

  it('starts on initialIndex, not always the first photograph', () => {
    const { container } = mount({ initialIndex: 2 })
    expect(selected(container)?.textContent).toContain('Photo 3')
  })

  it('gives only the active tab a reachable tab stop (roving tabindex)', () => {
    const { container } = mount()
    const t = tabs(container)
    expect(t[0].getAttribute('tabindex')).toBe('0')
    expect(t[1].getAttribute('tabindex')).toBe('-1')
    expect(t[5].getAttribute('tabindex')).toBe('-1')
  })

  it('clicking a tab moves aria-selected to it', () => {
    const { container } = mount()
    fireEvent.click(tabs(container)[3])
    expect(selected(container)?.textContent).toContain('Photo 4')
    expect(tabs(container)[0].getAttribute('aria-selected')).toBe('false')
  })

  it('points the panel at the active tab and swaps the hero image', () => {
    const { container } = mount()
    const panel = container.querySelector('[role="tabpanel"]')
    expect(panel?.getAttribute('id')).toBe('home-hero-panel')
    expect(panel?.getAttribute('aria-labelledby')).toBe('home-hero-tab-photo-1')
    // APG: a tabpanel with no focusable children must itself be focusable,
    // or a keyboard user tabbing past the rail can never reach the photograph.
    expect(panel?.getAttribute('tabindex')).toBe('0')
    expect(panel?.querySelector('img')?.getAttribute('alt')).toBe('Alt for photo 1')

    fireEvent.click(tabs(container)[3])
    expect(panel?.getAttribute('aria-labelledby')).toBe('home-hero-tab-photo-4')
    expect(panel?.querySelector('img')?.getAttribute('alt')).toBe('Alt for photo 4')
  })

  it('every tab controls the single panel', () => {
    const { container } = mount()
    for (const t of tabs(container)) {
      expect(t.getAttribute('aria-controls')).toBe('home-hero-panel')
    }
  })

  it('updates the "View this print" href to follow the selection', () => {
    const { container } = mount()
    const cta = () => container.querySelector('.home-cta-primary')
    expect(cta()?.getAttribute('href')).toBe('/prints/photo-1?c=reliquary')
    fireEvent.click(tabs(container)[3])
    expect(cta()?.getAttribute('href')).toBe('/prints/photo-4?c=reliquary')
  })

  it('leaves the collection CTA, kicker and quote alone — they belong to the collection', () => {
    const { container } = mount()
    fireEvent.click(tabs(container)[3])
    expect(container.querySelector('.home-cta-ghost')?.getAttribute('href')).toBe('/collections/reliquary')
    expect(container.querySelector('.home-collection-kicker')?.textContent).toBe('Reliquary')
    expect(container.querySelector('.home-quote')?.textContent).toBe('A small cabinet of prints held close.')
  })

  it('tracks the active index in the counter', () => {
    const { container } = mount()
    const kicker = () => container.querySelector('.home-rail-kicker span')
    expect(kicker()?.textContent).toBe('01 / 06')
    fireEvent.click(tabs(container)[3])
    expect(kicker()?.textContent).toBe('04 / 06')
  })

  it('renders no anchor inside the rail — the titles select, they do not navigate', () => {
    const { container } = mount()
    expect(container.querySelectorAll('[role="tablist"] a')).toHaveLength(0)
  })

  it('omits the quote element entirely when there is no quote', () => {
    const { container } = mount({ quote: null })
    expect(container.querySelector('.home-quote')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/home-hero.test.tsx`

Expected: FAIL — cannot resolve `@/components/store/HomeHero`.

- [ ] **Step 3: Create the component**

Create `components/store/HomeHero.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { Plate } from '@/components/store/Plate'
import { derivativeSrc } from '@/lib/images/derivatives'
import type { PhotoInCollection } from '@/lib/data/collections'

export interface HomeHeroProps {
  photos: PhotoInCollection[]
  initialIndex: number
  collectionSlug: string
  collectionName: string
  quote: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')

export function HomeHero({
  photos,
  initialIndex,
  collectionSlug,
  collectionName,
  quote,
}: HomeHeroProps) {
  const [active, setActive] = useState(initialIndex)

  const select = useCallback((next: number) => {
    setActive(next)
  }, [])

  const current = photos[active]

  return (
    <main className="home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        aria-hidden="true"
        alt=""
        className="home-bleed"
        src={derivativeSrc(current.slug, 'colour', 160, 'webp')}
      />

      <div className="home-grid">
        <aside className="home-rail">
          <p className="home-rail-kicker">
            Featured work
            <span>
              {pad(active + 1)} / {pad(photos.length)}
            </span>
          </p>
          <div
            role="tablist"
            aria-label="Featured works"
            aria-orientation="vertical"
            className="home-index"
          >
            {photos.map((photo, i) => {
              const isActive = i === active
              return (
                <button
                  key={photo.id}
                  type="button"
                  role="tab"
                  id={`home-hero-tab-${photo.slug}`}
                  aria-selected={isActive}
                  aria-controls="home-hero-panel"
                  tabIndex={isActive ? 0 : -1}
                  className={`home-index-link${isActive ? ' is-active' : ''}`}
                  onClick={() => select(i)}
                >
                  <span className="home-index-num">{pad(i + 1)}</span>
                  <span className="home-index-title">{photo.title}</span>
                </button>
              )
            })}
          </div>
        </aside>

        <div
          className="home-hero-wrap"
          role="tabpanel"
          id="home-hero-panel"
          aria-labelledby={`home-hero-tab-${current.slug}`}
          tabIndex={0}
        >
          <div className="home-hero-plate">
            <Plate
              photo={current}
              register="colour"
              sizes="(max-width: 900px) 100vw, 820px"
              priority={active === initialIndex}
              className="home-hero-img"
            />
          </div>
        </div>

        <div className="home-copy">
          <p className="home-collection-kicker">{collectionName}</p>
          {quote ? <p className="home-quote">{quote}</p> : null}
          <div className="home-ctas">
            <Link
              href={`/prints/${current.slug}?c=${collectionSlug}`}
              className="home-cta-primary"
            >
              View this print →
            </Link>
            <Link href={`/collections/${collectionSlug}`} className="home-cta-ghost">
              Enter the collection
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        /* MOVED VERBATIM from app/(store)/page.tsx lines 112-334, then edited. See Step 4. */
      `}</style>
    </main>
  )
}
```

- [ ] **Step 4: Move the stylesheet**

Open `app/(store)/page.tsx`. It contains **two** `<style>` blocks: the first (lines 13–28) belongs to `EmptyHome` and **stays where it is**. The one you want is the second — `<style>{\`` on line 111, `\`}</style>` on line 335, so the CSS content is **lines 112–334 inclusive**.

Copy those 223 lines and paste them into `HomeHero.tsx` in place of the `/* MOVED VERBATIM ... */` comment. Verify before moving on: the last rule you pasted must be the closing of the `@media (max-width: 900px)` block. If your paste ends around `.home-cta-ghost`, you have truncated it — go back.

Then apply exactly these four edits to the pasted CSS — no others:

**Edit A** — the rail is a `<div>` now, not a `<ul>`; move the hairline onto the tab and drop the list reset:

```css
/* BEFORE */
.home-index {
  list-style: none;
  margin: 0;
  padding: 0;
}

.home-index li {
  border-bottom: 1px solid var(--hairsoft, var(--hair));
}

/* AFTER */
.home-index {
  margin: 0;
  padding: 0;
}
```

**Edit B** — the tab is a `<button>` now, so it needs a reset. Replace the whole `.home-index-link` rule:

```css
/* BEFORE */
.home-index-link {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  padding: 0.75rem 0;
  text-decoration: none;
  transition: padding-left 0.2s ease;
}

/* AFTER */
.home-index-link {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  width: 100%;
  padding: 0.75rem 0;
  border: 0;
  border-bottom: 1px solid var(--hairsoft, var(--hair));
  background: none;
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition: padding-left 0.2s ease;
}
```

**Edit C** — the plate becomes a stacking context for Task 2's fade layers:

```css
/* BEFORE */
.home-hero-plate {
  width: 100%;
  max-width: 820px;

/* AFTER */
.home-hero-plate {
  position: relative;
  width: 100%;
  max-width: 820px;
```

(leave the rest of that rule untouched)

**Edit D** — append this rule to the end of the block, so the `padding-left` hover nudge is not animated for reduced-motion users:

```css
        @media (prefers-reduced-motion: reduce) {
          .home-index-link {
            transition: none;
          }
        }
```

- [ ] **Step 5: Thin out the page**

Replace the whole of `app/(store)/page.tsx` with:

```tsx
import { HomeHero } from '@/components/store/HomeHero'
import { pullQuote } from '@/lib/collections/pull-quote'
import { getFeaturedCollection } from '@/lib/data/collections'

export const dynamic = 'force-dynamic'

function EmptyHome() {
  return (
    <main className="home-empty">
      <p>Coming soon.</p>
      <style>{`
        .home-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: calc(100vh - 5rem);
          padding: 3rem 1.5rem;
        }
        .home-empty p {
          margin: 0;
          font-family: var(--font-newsreader);
          font-size: 1.125rem;
          font-style: italic;
          color: var(--dim);
        }
      `}</style>
    </main>
  )
}

export default async function Home() {
  const featured = await getFeaturedCollection()
  if (!featured || featured.photos.length === 0) {
    return <EmptyHome />
  }

  const coverIdx = featured.photos.findIndex((p) => p.slug === featured.cover?.slug)

  return (
    <HomeHero
      photos={featured.photos}
      initialIndex={coverIdx >= 0 ? coverIdx : 0}
      collectionSlug={featured.slug}
      collectionName={featured.name}
      quote={pullQuote(featured.dek, featured.literature)}
    />
  )
}
```

- [ ] **Step 6: Cover the page's index resolution**

`page.tsx` is where the cover photograph becomes an index, including the fallback when the cover is not a member of its own collection — which is reachable, since `cover_photo_id` has no membership constraint in `supabase/schema.sql`. Nothing tests that today.

Replace `test/home.test.tsx` entirely with:

```tsx
import { render, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CollectionDetail, PhotoInCollection } from '@/lib/data/collections'

// Mutable module-scope value, not vi.fn generics: Vitest 2 takes a single
// function-type generic, so the v1 `vi.fn<[], Promise<T>>` form is a type
// error. This is also the pattern test/admin-dashboard.test.tsx already uses.
const featuredValue: { current: CollectionDetail | null } = { current: null }
vi.mock('@/lib/data/collections', () => ({
  getFeaturedCollection: async () => featuredValue.current,
}))

function photo(n: number): PhotoInCollection {
  return {
    id: `p${n}`,
    slug: `photo-${n}`,
    title: `Photo ${n}`,
    alt_text: `Alt for photo ${n}`,
    aspect_ratio: 0.8,
    width_px: 1600,
    height_px: 2000,
    has_bw_variant: true,
    position: n,
  }
}

function featured(over: Partial<CollectionDetail> = {}): CollectionDetail {
  return {
    slug: 'reliquary',
    name: 'Reliquary',
    dek: 'A small cabinet of prints held close.',
    literature: null,
    cover: { slug: 'photo-3', alt: 'Alt for photo 3' },
    photos: [photo(1), photo(2), photo(3)],
    ...over,
  }
}

const renderHome = async () => {
  const Home = (await import('@/app/(store)/page')).default
  return render(await Home())
}

const activeTab = (c: HTMLElement) => c.querySelector('[role="tab"][aria-selected="true"]')

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  featuredValue.current = null
})

describe('Home', () => {
  it('renders the quiet empty state when there is no featured collection', async () => {
    const { container } = await renderHome()
    expect(container.textContent).toContain('Coming soon')
  })

  it('renders the quiet empty state when the featured collection has no photographs', async () => {
    featuredValue.current = featured({ photos: [], cover: null })
    const { container } = await renderHome()
    expect(container.textContent).toContain('Coming soon')
  })

  it('opens on the cover photograph, not on the first member', async () => {
    featuredValue.current = featured()
    const { container } = await renderHome()
    expect(activeTab(container)?.textContent).toContain('Photo 3')
  })

  it('falls back to the first member when the cover is not in the collection', async () => {
    featuredValue.current = featured({ cover: { slug: 'not-a-member', alt: null } })
    const { container } = await renderHome()
    expect(activeTab(container)?.textContent).toContain('Photo 1')
  })

  it('falls back to the first member when there is no cover at all', async () => {
    featuredValue.current = featured({ cover: null })
    const { container } = await renderHome()
    expect(activeTab(container)?.textContent).toContain('Photo 1')
  })
})
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run test/home-hero.test.tsx`
Expected: PASS, 11 tests.

Run: `npx vitest run test/home.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 8: Check types and lint**

Run: `npm run typecheck`
Expected: no output, exit 0.

Run: `npm run lint`
Expected: no errors, no warnings.

- [ ] **Step 9: Commit**

Run: `git add components/store/HomeHero.tsx app/(store)/page.tsx test/home-hero.test.tsx test/home.test.tsx`

Run: `git commit -m "feat(home): the rail selects the hero instead of navigating away" -m "design.md 12.5-A specifies an index list with an active member and a running counter. It was built as six links out, so is-active was computed against a hero that never moved and the counter's 01 was a string literal." -m "Rail becomes a real tablist driving one tabpanel: roving tabindex, aria-selected, aria-controls. The route to a print is not lost -- the View this print CTA follows the selection, which is what 12.5-A meant it for." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`

---

## Task 2: Cross-fade between plates, mounting only two

**Files:**
- Modify: `components/store/HomeHero.tsx`
- Test: `test/home-hero.test.tsx` (append a describe block)

**Interfaces:**
- Consumes: `HomeHero` from Task 1.
- Produces: no new exports. Adds internal state `outgoing: number | null` and the CSS classes `home-hero-layer`, `home-bleed-layer`, `is-fading-in`.

**Why two layers and not six:** stacking all N plates at `opacity: 0` loads every derivative on first paint — for six photographs, roughly a megabyte on a page whose LCP element *is* the hero. `loading="lazy"` does not help, because every stacked plate is inside the viewport. Only the current and the outgoing plate are mounted; the outgoing unmounts when the fade ends.

**How the cross-dissolve works:** the outgoing layer sits below at full opacity and does not animate. The incoming layer sits above and animates `0 → 1`. One animation, no `forwards` fill needed, and nothing to clean up when the class is dropped.

- [ ] **Step 1: Write the failing test**

Append to `test/home-hero.test.tsx` (the file's existing imports already cover this; add `vi`, `afterEach`, and `act` to them so the top line reads
`import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'` and
`import { render, cleanup, fireEvent, act } from '@testing-library/react'`):

```tsx
describe('HomeHero — cross-fade', () => {
  afterEach(() => { vi.useRealTimers() })

  it('mounts only the active plate at rest', () => {
    const { container } = mount()
    expect(container.querySelectorAll('.home-hero-layer')).toHaveLength(1)
  })

  it('mounts exactly two plates mid-transition — never one per photograph', () => {
    vi.useFakeTimers()
    const { container } = mount()
    fireEvent.click(tabs(container)[3])
    const layers = container.querySelectorAll('.home-hero-layer')
    expect(layers).toHaveLength(2)
    expect(layers[0].querySelector('img')?.getAttribute('alt')).toBe('Alt for photo 1')
    expect(layers[1].querySelector('img')?.getAttribute('alt')).toBe('Alt for photo 4')
  })

  it('fades the incoming layer in, and hides the outgoing one from assistive tech', () => {
    vi.useFakeTimers()
    const { container } = mount()
    fireEvent.click(tabs(container)[3])
    const layers = container.querySelectorAll('.home-hero-layer')
    expect(layers[0].getAttribute('aria-hidden')).toBe('true')
    expect(layers[1].className).toContain('is-fading-in')
  })

  it('drops the outgoing layer once the fade is done', () => {
    vi.useFakeTimers()
    const { container } = mount()
    fireEvent.click(tabs(container)[3])
    expect(container.querySelectorAll('.home-hero-layer')).toHaveLength(2)
    act(() => { vi.advanceTimersByTime(600) })
    expect(container.querySelectorAll('.home-hero-layer')).toHaveLength(1)
    expect(container.querySelector('.home-hero-layer img')?.getAttribute('alt')).toBe('Alt for photo 4')
  })

  it('cross-fades the blurred bleed too, so the backdrop does not jump', () => {
    vi.useFakeTimers()
    const { container } = mount()
    fireEvent.click(tabs(container)[3])
    const bleeds = container.querySelectorAll('.home-bleed-layer')
    expect(bleeds).toHaveLength(2)
    expect(bleeds[1].getAttribute('src')).toContain('photo-4')
  })

  it('swaps instantly with no outgoing layer under reduced motion', () => {
    stubMatchMedia(true)
    vi.useFakeTimers()
    const { container } = mount()
    fireEvent.click(tabs(container)[3])
    expect(container.querySelectorAll('.home-hero-layer')).toHaveLength(1)
    expect(container.querySelector('.home-hero-layer img')?.getAttribute('alt')).toBe('Alt for photo 4')
  })

  it('marks only the first-painted plate as priority', () => {
    const { container } = mount()
    expect(container.querySelector('.home-hero-layer img')?.getAttribute('loading')).toBe('eager')
    fireEvent.click(tabs(container)[3])
    const layers = container.querySelectorAll('.home-hero-layer')
    expect(layers[1].querySelector('img')?.getAttribute('loading')).toBe('lazy')
  })

  it('never stacks more than two layers, however fast the clicking', () => {
    vi.useFakeTimers()
    const { container } = mount()
    fireEvent.click(tabs(container)[1])
    fireEvent.click(tabs(container)[2])
    fireEvent.click(tabs(container)[3])
    fireEvent.click(tabs(container)[4])
    expect(container.querySelectorAll('.home-hero-layer')).toHaveLength(2)
    act(() => { vi.advanceTimersByTime(600) })
    expect(container.querySelectorAll('.home-hero-layer')).toHaveLength(1)
    expect(container.querySelector('.home-hero-layer img')?.getAttribute('alt')).toBe('Alt for photo 5')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/home-hero.test.tsx -t "cross-fade"`
Expected: FAIL — no `.home-hero-layer` elements exist.

- [ ] **Step 3: Add the fade state**

In `components/store/HomeHero.tsx`, change the import line to add `useEffect`:

```tsx
import { useCallback, useEffect, useState } from 'react'
```

Add the constant beside `pad`:

```tsx
const FADE_MS = 600
```

Replace the `const [active, setActive] = useState(initialIndex)` line and the `select` callback with:

```tsx
  const [active, setActive] = useState(initialIndex)
  const [outgoing, setOutgoing] = useState<number | null>(null)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduced(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const select = useCallback(
    (next: number) => {
      if (next === active) return
      if (!reduced) setOutgoing(active)
      setActive(next)
    },
    [active, reduced],
  )

  useEffect(() => {
    if (outgoing === null) return
    const id = setTimeout(() => setOutgoing(null), FADE_MS)
    return () => clearTimeout(id)
  }, [outgoing])

  useEffect(() => {
    if (photos.length < 2) return
    if (typeof window === 'undefined' || typeof window.Image !== 'function') return
    const next = photos[(active + 1) % photos.length]
    const img = new window.Image()
    img.src = derivativeSrc(next.slug, 'colour', 1200, 'webp')
  }, [active, photos])
```

- [ ] **Step 4: Render the layers**

Replace the single bleed `<img>` with a layer pair:

```tsx
      {outgoing !== null ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          aria-hidden="true"
          alt=""
          className="home-bleed home-bleed-layer"
          src={derivativeSrc(photos[outgoing].slug, 'colour', 160, 'webp')}
        />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        aria-hidden="true"
        alt=""
        className={`home-bleed home-bleed-layer${outgoing !== null ? ' is-fading-in' : ''}`}
        src={derivativeSrc(current.slug, 'colour', 160, 'webp')}
      />
```

Replace the contents of `.home-hero-plate` with:

```tsx
          <div className="home-hero-plate">
            {outgoing !== null ? (
              <div className="home-hero-layer" aria-hidden="true">
                <Plate
                  photo={photos[outgoing]}
                  register="colour"
                  sizes="(max-width: 900px) 100vw, 820px"
                  className="home-hero-img"
                />
              </div>
            ) : null}
            <div className={`home-hero-layer${outgoing !== null ? ' is-fading-in' : ''}`}>
              <Plate
                photo={current}
                register="colour"
                sizes="(max-width: 900px) 100vw, 820px"
                priority={active === initialIndex}
                className="home-hero-img"
              />
            </div>
          </div>
```

- [ ] **Step 5: Add the fade CSS**

Append to the `<style>` block in `HomeHero.tsx`, before the final `@media (prefers-reduced-motion: reduce)` rule added in Task 1:

```css
        .home-hero-layer {
          position: absolute;
          inset: 0;
        }

        .home-hero-layer.is-fading-in {
          animation: home-hero-fade-in 600ms ease;
        }

        @keyframes home-hero-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .home-bleed-layer.is-fading-in {
          animation: home-bleed-fade-in 600ms ease;
        }

        @keyframes home-bleed-fade-in {
          from { opacity: 0; }
          to { opacity: var(--bleedop, 0.5); }
        }
```

The bleed gets **its own keyframes on purpose.** `.home-bleed` rests at `opacity: var(--bleedop, 0.5)`; animating it to `1` like the hero layer would flash the backdrop to full strength for 600ms on every advance. It must land back on the token, not on `1`.

Then extend the reduced-motion block at the end so it reads:

```css
        @media (prefers-reduced-motion: reduce) {
          .home-index-link {
            transition: none;
          }

          .home-hero-layer.is-fading-in,
          .home-bleed-layer.is-fading-in {
            animation: none;
          }
        }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run test/home-hero.test.tsx`
Expected: PASS, 19 tests.

- [ ] **Step 7: Check types and lint**

Run: `npm run typecheck`
Expected: no output, exit 0.

Run: `npm run lint`
Expected: no errors, no warnings.

- [ ] **Step 8: Commit**

Run: `git add components/store/HomeHero.tsx test/home-hero.test.tsx`

Run: `git commit -m "feat(home): cross-fade the hero, mounting two plates rather than six" -m "The obvious implementation stacks every plate at opacity 0 and toggles. That loads six full-size derivatives on first paint, on a page whose LCP element is the hero, and lazy loading saves nothing because all of them are in the viewport." -m "Only the current and outgoing plate are mounted. The outgoing sits below at full opacity, the incoming fades in over it, and the outgoing unmounts when the fade ends. Reduced motion skips the outgoing layer entirely and swaps instantly." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`

---

## Task 3: Keyboard navigation across the tablist

**Files:**
- Modify: `components/store/HomeHero.tsx`
- Test: `test/home-hero.test.tsx` (append a describe block)

**Interfaces:**
- Consumes: `select` from Task 1, `HomeHeroProps` unchanged.
- Produces: no new exports. Adds a `tabRefs` ref array and an `onKeyDown` handler on the tablist.

`design.md` §7 faults the legacy home for using `role="tab"` *without* the keyboard pattern, and §9 carries it as a regression not to inherit. This task is that correction. Orientation is vertical, so Up/Down are the bound keys per APG; Left/Right are deliberately not bound.

Activation is automatic (moving focus also selects) because the panel is a single image — there is no cost to showing it.

- [ ] **Step 1: Write the failing test**

Append to `test/home-hero.test.tsx`:

```tsx
describe('HomeHero — keyboard', () => {
  const list = (c: HTMLElement) => c.querySelector('[role="tablist"]')!

  it('ArrowDown moves selection to the next photograph', () => {
    const { container } = mount()
    fireEvent.keyDown(list(container), { key: 'ArrowDown' })
    expect(selected(container)?.textContent).toContain('Photo 2')
  })

  it('ArrowUp moves selection to the previous photograph', () => {
    const { container } = mount({ initialIndex: 2 })
    fireEvent.keyDown(list(container), { key: 'ArrowUp' })
    expect(selected(container)?.textContent).toContain('Photo 2')
  })

  it('ArrowDown wraps from the last photograph to the first', () => {
    const { container } = mount({ initialIndex: 5 })
    fireEvent.keyDown(list(container), { key: 'ArrowDown' })
    expect(selected(container)?.textContent).toContain('Photo 1')
  })

  it('ArrowUp wraps from the first photograph to the last', () => {
    const { container } = mount()
    fireEvent.keyDown(list(container), { key: 'ArrowUp' })
    expect(selected(container)?.textContent).toContain('Photo 6')
  })

  it('Home and End jump to the ends', () => {
    const { container } = mount({ initialIndex: 2 })
    fireEvent.keyDown(list(container), { key: 'End' })
    expect(selected(container)?.textContent).toContain('Photo 6')
    fireEvent.keyDown(list(container), { key: 'Home' })
    expect(selected(container)?.textContent).toContain('Photo 1')
  })

  it('moves focus with the selection, so the roving tab stop follows', () => {
    const { container } = mount()
    fireEvent.keyDown(list(container), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(tabs(container)[1])
    expect(tabs(container)[1].getAttribute('tabindex')).toBe('0')
    expect(tabs(container)[0].getAttribute('tabindex')).toBe('-1')
  })

  it('ignores keys it does not bind, including Left and Right', () => {
    const { container } = mount()
    fireEvent.keyDown(list(container), { key: 'ArrowRight' })
    fireEvent.keyDown(list(container), { key: 'ArrowLeft' })
    fireEvent.keyDown(list(container), { key: 'a' })
    expect(selected(container)?.textContent).toContain('Photo 1')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/home-hero.test.tsx -t "keyboard"`
Expected: FAIL — selection stays on Photo 1; no key handler exists.

- [ ] **Step 3: Implement the handler**

In `components/store/HomeHero.tsx`, add `useRef` to the React import:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
```

Add the ref beside the other state declarations:

```tsx
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
```

Add the handler immediately after the `select` callback:

```tsx
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const last = photos.length - 1
      let next: number
      if (e.key === 'ArrowDown') next = active === last ? 0 : active + 1
      else if (e.key === 'ArrowUp') next = active === 0 ? last : active - 1
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = last
      else return
      e.preventDefault()
      select(next)
      tabRefs.current[next]?.focus()
    },
    [active, photos.length, select],
  )
```

Wire it to the tablist and register the refs. Change the tablist opening tag to:

```tsx
          <div
            role="tablist"
            aria-label="Featured works"
            aria-orientation="vertical"
            className="home-index"
            onKeyDown={onKeyDown}
          >
```

and add a `ref` to the tab button, immediately after its `key` prop:

```tsx
                  ref={(el) => {
                    tabRefs.current[i] = el
                  }}
```

The braces matter: React 19 rejects a ref callback that returns a value, and `(el) => tabRefs.current[i] = el` returns the element.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/home-hero.test.tsx`
Expected: PASS, 26 tests.

- [ ] **Step 5: Check types and lint**

Run: `npm run typecheck`
Expected: no output, exit 0.

Run: `npm run lint`
Expected: no errors, no warnings.

- [ ] **Step 6: Commit**

Run: `git add components/store/HomeHero.tsx test/home-hero.test.tsx`

Run: `git commit -m "feat(home): give the tablist the keyboard pattern it claims" -m "design.md 7 faults the legacy home for using role=tab without the ARIA keyboard pattern, and 9 carries it as a regression not to inherit. The fix is to implement the pattern, not to drop the roles." -m "Vertical orientation, so Up/Down move and select and Home/End jump to the ends; Left/Right are deliberately unbound. Focus follows the selection so the roving tab stop stays on the active tab." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`

---

## Task 4: Auto-advance, and the motion policy that makes it pausable

**Files:**
- Modify: `components/store/HomeHero.tsx`
- Modify: `design.md` (§12.6)
- Test: `test/home-hero.test.tsx` (append a describe block)

**Interfaces:**
- Consumes: `select`, `reduced`, `active` from Tasks 1–3.
- Produces: no new exports. Adds state `playing`, `hovered`, `focusWithin` and the `ADVANCE_MS` constant.

**The policy.** The timer runs only when `playing && !reduced && !hovered && !focusWithin && photos.length > 1`.

| State | Trigger | Effect |
|---|---|---|
| `playing` | starts `true` | advances every 6000 ms, wrapping last → first |
| `playing` → `false` | **any** selection — click or key | stops **permanently** |
| `hovered` | `mouseover` / `mouseout` on the grid | pauses; resumes on leave |
| `focusWithin` | `focus` / `blur` within the grid | pauses; resumes on blur |
| `playing` starts `false` | `prefers-reduced-motion: reduce` | never advances |
| `playing` starts `false` | `photos.length < 2` | nothing to cycle |

**Why "stops permanently" is load-bearing.** `design.md` §6 records that the legacy carousels pause on hover only and calls it a WCAG 2.2.2 (Level A) failure that a redesign must fix rather than inherit. Hover is not a mechanism for keyboard or touch users. Focus-pause covers keyboard. **Stop-on-select is what covers touch** — the rail keeps its full title list at ≤900px, so tapping any title is a reachable stop on a phone. It is also correct behaviour on its own terms: without it, deliberately choosing a photograph gets overridden six seconds later.

There is no visible pause control; all three mechanisms are invisible to a pointer user, so the rail keeps the layout §12.5-A describes.

Implementation note: this uses a re-armed `setTimeout` keyed on `active`, not a long-lived `setInterval`. An interval would need a functional state updater, and calling `setOutgoing` inside one is a side effect in a place React requires to be pure.

- [ ] **Step 1: Write the failing test**

Append to `test/home-hero.test.tsx`:

```tsx
describe('HomeHero — auto-advance', () => {
  afterEach(() => { vi.useRealTimers() })

  const grid = (c: HTMLElement) => c.querySelector('.home-grid')!

  it('advances to the next photograph after 6s', () => {
    vi.useFakeTimers()
    const { container } = mount()
    act(() => { vi.advanceTimersByTime(6000) })
    expect(selected(container)?.textContent).toContain('Photo 2')
  })

  it('keeps advancing, and wraps at the end', () => {
    vi.useFakeTimers()
    const { container } = mount({ initialIndex: 4 })
    act(() => { vi.advanceTimersByTime(6000) })
    expect(selected(container)?.textContent).toContain('Photo 6')
    act(() => { vi.advanceTimersByTime(6000) })
    expect(selected(container)?.textContent).toContain('Photo 1')
  })

  it('stops for good once a title is clicked', () => {
    vi.useFakeTimers()
    const { container } = mount()
    fireEvent.click(tabs(container)[3])
    act(() => { vi.advanceTimersByTime(60000) })
    expect(selected(container)?.textContent).toContain('Photo 4')
  })

  it('stops for good once a key is used — the touch and keyboard stop mechanism', () => {
    vi.useFakeTimers()
    const { container } = mount()
    fireEvent.keyDown(container.querySelector('[role="tablist"]')!, { key: 'ArrowDown' })
    act(() => { vi.advanceTimersByTime(60000) })
    expect(selected(container)?.textContent).toContain('Photo 2')
  })

  it('pauses while hovered and resumes on leave', () => {
    vi.useFakeTimers()
    const { container } = mount()
    fireEvent.mouseOver(grid(container))
    act(() => { vi.advanceTimersByTime(60000) })
    expect(selected(container)?.textContent).toContain('Photo 1')
    fireEvent.mouseOut(grid(container))
    act(() => { vi.advanceTimersByTime(6000) })
    expect(selected(container)?.textContent).toContain('Photo 2')
  })

  // focusIn/focusOut, NOT focus/blur. React maps onFocus/onBlur to the native
  // focusin/focusout events; a non-bubbling `focus` event never reaches the
  // handler on .home-grid. Same delegation trap as mouseEnter — see Global
  // Constraints. Do not "simplify" these to fireEvent.focus/blur.
  it('pauses while focus is inside, and resumes on blur', () => {
    vi.useFakeTimers()
    const { container } = mount()
    fireEvent.focusIn(grid(container))
    act(() => { vi.advanceTimersByTime(60000) })
    expect(selected(container)?.textContent).toContain('Photo 1')
    fireEvent.focusOut(grid(container))
    act(() => { vi.advanceTimersByTime(6000) })
    expect(selected(container)?.textContent).toContain('Photo 2')
  })

  it('never advances under prefers-reduced-motion', () => {
    stubMatchMedia(true)
    vi.useFakeTimers()
    const { container } = mount()
    act(() => { vi.advanceTimersByTime(60000) })
    expect(selected(container)?.textContent).toContain('Photo 1')
  })

  it('never advances a single-photograph collection', () => {
    vi.useFakeTimers()
    const { container } = mount({ photos: [photo(1)] })
    act(() => { vi.advanceTimersByTime(60000) })
    expect(selected(container)?.textContent).toContain('Photo 1')
    expect(tabs(container)).toHaveLength(1)
  })

  it('silences the panel live region while rotating, and opens it once stopped', () => {
    vi.useFakeTimers()
    const { container } = mount()
    const panel = () => container.querySelector('[role="tabpanel"]')
    expect(panel()?.getAttribute('aria-live')).toBe('off')
    fireEvent.click(tabs(container)[3])
    expect(panel()?.getAttribute('aria-live')).toBe('polite')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/home-hero.test.tsx -t "auto-advance"`
Expected: FAIL — selection never moves; no timer exists.

- [ ] **Step 3: Add the timer state**

In `components/store/HomeHero.tsx`, add the constant beside `FADE_MS`:

```tsx
const ADVANCE_MS = 6000
```

Add to the state declarations:

```tsx
  const [playing, setPlaying] = useState(photos.length > 1)
  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
```

In the reduced-motion effect, stop playback when the preference is on. Replace the `apply` function body:

```tsx
    const apply = () => {
      setReduced(mq.matches)
      if (mq.matches) setPlaying(false)
    }
```

Change `select` so every selection stops playback permanently — note `setPlaying(false)` runs **before** the no-op early return, because pressing `Home` while already on the first photograph is still a deliberate interaction:

```tsx
  const select = useCallback(
    (next: number) => {
      setPlaying(false)
      if (next === active) return
      if (!reduced) setOutgoing(active)
      setActive(next)
    },
    [active, reduced],
  )
```

Add the advance effect after the preload effect:

```tsx
  useEffect(() => {
    if (!playing || reduced || hovered || focusWithin) return
    if (photos.length < 2) return
    const id = setTimeout(() => {
      setOutgoing(active)
      setActive((active + 1) % photos.length)
    }, ADVANCE_MS)
    return () => clearTimeout(id)
  }, [playing, reduced, hovered, focusWithin, active, photos.length])
```

- [ ] **Step 4: Wire the pause handlers and the live region**

Change the `.home-grid` opening tag to:

```tsx
      <div
        className="home-grid"
        onMouseOver={() => setHovered(true)}
        onMouseOut={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHovered(false)
        }}
        onFocus={() => setFocusWithin(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false)
        }}
      >
```

`onMouseOver`/`onMouseOut` rather than enter/leave is deliberate — see Global Constraints. The `relatedTarget` guard stops the boolean flapping as the pointer crosses descendants.

Add `aria-live` to the tabpanel:

```tsx
          aria-live={playing ? 'off' : 'polite'}
```

A screen reader is not narrated at by a timer, but is told about changes the user caused.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/home-hero.test.tsx`
Expected: PASS, 35 tests.

- [ ] **Step 6: Record the policy in design.md**

In `design.md` §12.6, find this line:

```
- **Motion:** hovers `.18–.2s` (index-row slide, image brighten, nav ink); theme flip is instant (asset + tokens swap). Keep any auto-advancing carousel **pausable** and gate motion behind `prefers-reduced-motion` — the current site fails both (§8, §9).
```

Append immediately after it:

```
  **Home hero carousel — decided 2026-07-30.** 6s advance, 600ms cross-fade. It pauses on hover and on focus, and **stops permanently on any selection**. Reduced motion disables auto-advance and makes the swap instant. Stop-on-select is the load-bearing one: hover is no mechanism for keyboard or touch, and it is what makes the surface pass WCAG 2.2.2 without putting a pause button in the rail §12.5-A describes.
```

- [ ] **Step 7: Check types and lint**

Run: `npm run typecheck`
Expected: no output, exit 0.

Run: `npm run lint`
Expected: no errors, no warnings.

- [ ] **Step 8: Commit**

Run: `git add components/store/HomeHero.tsx test/home-hero.test.tsx design.md`

Run: `git commit -m "feat(home): auto-advance the hero, pausable by pointer, keyboard and touch" -m "design.md 6 calls the legacy carousel a WCAG 2.2.2 Level A failure -- it paused on hover only -- and says a redesign must fix it rather than inherit it. Hover is no mechanism for keyboard or touch users." -m "So: pause on hover, pause on focus, and stop permanently on any selection. That last one is what covers touch, since the rail keeps its full title list at 900px and under. It is also just correct -- without it, deliberately choosing a photograph gets overridden six seconds later. None of the three is visible to a pointer user, so the rail keeps the layout 12.5-A describes." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`

---

## Task 5: Full gate and manual verification

**Files:** none modified unless the gate fails.

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: 79 files, 2045 tests, all passing. (Baseline 78 files / 2006 tests, plus 35 new in `test/home-hero.test.tsx` and a net 4 more in `test/home.test.tsx`.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors, no warnings.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build completes. `/` stays listed as a dynamic route (`ƒ`), not static — `force-dynamic` is still on the page.

- [ ] **Step 5: Manual pass**

Run: `npm run dev`

Then check, at `http://localhost:3000`:

1. The hero advances on its own roughly every 6 seconds, cross-fading rather than cutting.
2. Hovering anywhere over the grid stops it; moving the pointer away restarts it.
3. Clicking a title selects that photograph and it **never moves again**.
4. `Tab` reaches the rail as **one** stop, not six. Then `↓`/`↑` move through the photographs, `Home`/`End` jump to the ends, and auto-advance is stopped from the first key. Pressing `Tab` again lands on the photograph itself (the panel is focusable) rather than skipping straight to the CTAs.
5. "View this print →" goes to the photograph currently shown, not always the cover.
6. The counter reads `01 / 06` through `06 / 06` as the selection moves.
7. Narrow the window below 900px: the title list is still there and still selects.
8. In DevTools, Rendering → **Emulate `prefers-reduced-motion: reduce`**, reload: nothing auto-advances and clicking a title swaps instantly with no fade.
9. Network tab on a cold load: **one** large hero derivative, not six.

- [ ] **Step 6: Commit any fixes**

Only if steps 1–5 turned up problems. Otherwise skip.

Run: `git add -A`

Run: `git commit -m "fix(home): <what the manual pass found>" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`

---

## Notes for the reviewer

- **Not in scope, deliberately:** mobile index dots (`design.md` §12.5-E) — the rail keeps its full title list at ≤900px and works as the selector there. Recorded as a follow-up in the spec, not built here.
- **Not touched:** `components/store/Plate.tsx`; the collection film-strip at `/collections/[slug]` (§12.5-C specifies a strip of links, and that is correct as built).
- **No money-path code is touched**, so the `develop → main` manual verification gate is not implicated.
