import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
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
    // Target the layer that is NOT aria-hidden. Once the cross-fade lands, two
    // plates are mounted mid-transition and a bare querySelector('img') would
    // return the outgoing one.
    const shown = () => panel?.querySelector('.home-hero-layer:not([aria-hidden]) img')
    expect(shown()?.getAttribute('alt')).toBe('Alt for photo 1')

    fireEvent.click(tabs(container)[3])
    expect(panel?.getAttribute('aria-labelledby')).toBe('home-hero-tab-photo-4')
    expect(shown()?.getAttribute('alt')).toBe('Alt for photo 4')
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

  // Regression: both bleed layers must live inside a single wrapper that
  // carries var(--bleedop). With the token on each layer instead, the outgoing
  // one stays at 0.5 while the incoming fades 0 -> 0.5 over it; because 0.5
  // never occludes, they composite and the backdrop swells to ~0.75 before
  // snapping back when the outgoing unmounts. Measured in-browser before the
  // fix: 0.500 -> 0.631 -> 0.710 -> 0.745 -> hard cut to 0.500.
  it('keeps the bleed opacity on one wrapper so the two layers cannot composite', () => {
    vi.useFakeTimers()
    const { container } = mount()
    fireEvent.click(tabs(container)[3])
    const stack = container.querySelector('.home-bleed-stack')
    expect(stack).not.toBeNull()
    expect(stack?.querySelectorAll('.home-bleed-layer')).toHaveLength(2)
    expect(container.querySelectorAll('.home-bleed-layer')).toHaveLength(2)
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

  it('pauses while the carousel itself is hovered, and resumes on leave', () => {
    vi.useFakeTimers()
    const { container } = mount()
    const rail = container.querySelector('[role="tablist"]')!
    fireEvent.mouseOver(rail)
    act(() => { vi.advanceTimersByTime(60000) })
    expect(selected(container)?.textContent).toContain('Photo 1')
    fireEvent.mouseOut(rail, { relatedTarget: container.querySelector('.home-copy') })
    act(() => { vi.advanceTimersByTime(6000) })
    expect(selected(container)?.textContent).toContain('Photo 2')
  })

  it('pauses when the hero plate is hovered, not just the rail', () => {
    vi.useFakeTimers()
    const { container } = mount()
    fireEvent.mouseOver(container.querySelector('.home-hero-plate')!)
    act(() => { vi.advanceTimersByTime(60000) })
    expect(selected(container)?.textContent).toContain('Photo 1')
  })

  // The grid is ~90% of the viewport. Pausing on any hover within it meant a
  // cursor parked over the copy — or merely crossing the page — froze the
  // carousel indefinitely, which reads as "it gets stuck". The pause region is
  // the rail and the hero panel, not the whole grid.
  it('does NOT pause when the pointer is over the copy block', () => {
    vi.useFakeTimers()
    const { container } = mount()
    fireEvent.mouseOver(container.querySelector('.home-copy')!)
    act(() => { vi.advanceTimersByTime(6000) })
    expect(selected(container)?.textContent).toContain('Photo 2')
  })

  it('does NOT pause when the pointer is over the grid but outside the carousel', () => {
    vi.useFakeTimers()
    const { container } = mount()
    fireEvent.mouseOver(grid(container))
    act(() => { vi.advanceTimersByTime(6000) })
    expect(selected(container)?.textContent).toContain('Photo 2')
  })

  // focusIn/focusOut, NOT focus/blur. React maps onFocus/onBlur to the native
  // focusin/focusout events; a non-bubbling `focus` event never reaches the
  // handler on .home-grid. Same delegation trap as mouseEnter — see Global
  // Constraints. Do not "simplify" these to fireEvent.focus/blur.
  it('pauses while focus is inside the carousel, and resumes on blur', () => {
    vi.useFakeTimers()
    const { container } = mount()
    fireEvent.focusIn(tabs(container)[0])
    act(() => { vi.advanceTimersByTime(60000) })
    expect(selected(container)?.textContent).toContain('Photo 1')
    fireEvent.focusOut(tabs(container)[0], { relatedTarget: container.querySelector('.home-cta-primary') })
    act(() => { vi.advanceTimersByTime(6000) })
    expect(selected(container)?.textContent).toContain('Photo 2')
  })

  it('does NOT pause when focus is on the CTAs below the carousel', () => {
    vi.useFakeTimers()
    const { container } = mount()
    fireEvent.focusIn(container.querySelector('.home-cta-primary')!)
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

describe('HomeHero — dwell progress', () => {
  afterEach(() => { vi.useRealTimers() })

  const bars = (c: HTMLElement) => [...c.querySelectorAll('.home-index-progress')]
  const running = (c: HTMLElement) => c.querySelector('.home-index-progress.is-running')
  const complete = (c: HTMLElement) => [...c.querySelectorAll('.home-index-progress.is-complete')]
  const rowOf = (el: Element) => el.closest('[role="tab"]')?.textContent

  it('runs a bar on the active row only, before anything has advanced', () => {
    vi.useFakeTimers()
    const { container } = mount()
    expect(bars(container)).toHaveLength(1)
    expect(rowOf(running(container)!)).toContain('Photo 1')
    expect(complete(container)).toHaveLength(0)
  })

  it('leaves a full bar behind on rows already shown, and none on upcoming rows', () => {
    vi.useFakeTimers()
    const { container } = mount()
    act(() => { vi.advanceTimersByTime(6000) })
    act(() => { vi.advanceTimersByTime(6000) })
    expect(rowOf(running(container)!)).toContain('Photo 3')
    expect(complete(container).map(rowOf)).toEqual([
      expect.stringContaining('Photo 1'),
      expect.stringContaining('Photo 2'),
    ])
    expect(bars(container)).toHaveLength(3)
  })

  // The pass boundary is the starting photograph, not index 0. A cover at 05
  // runs 05, 06, 01, 02, 03, 04 and only then begins a new pass — the trail
  // must survive the numeric wrap in the middle of that.
  it('carries the trail through the numeric wrap', () => {
    vi.useFakeTimers()
    const { container } = mount({ initialIndex: 4 })
    act(() => { vi.advanceTimersByTime(6000) }) // -> Photo 6
    act(() => { vi.advanceTimersByTime(6000) }) // -> Photo 1, across the wrap
    expect(rowOf(running(container)!)).toContain('Photo 1')
    expect(complete(container).map(rowOf)).toEqual([
      expect.stringContaining('Photo 5'),
      expect.stringContaining('Photo 6'),
    ])
  })

  it('clears the trail when the pass returns to where it started', () => {
    vi.useFakeTimers()
    const { container } = mount({ initialIndex: 4 })
    for (let i = 0; i < 5; i += 1) act(() => { vi.advanceTimersByTime(6000) })
    expect(complete(container)).toHaveLength(5)
    act(() => { vi.advanceTimersByTime(6000) }) // back to Photo 5 — new pass
    expect(rowOf(running(container)!)).toContain('Photo 5')
    expect(complete(container)).toHaveLength(0)
  })

  // Honest function: a bar implies a pending advance. Once auto-advance is
  // stopped there is nothing pending, so it must not be on screen at all.
  it('shows no bars at all once a click has stopped auto-advance', () => {
    vi.useFakeTimers()
    const { container } = mount()
    act(() => { vi.advanceTimersByTime(6000) })
    expect(bars(container).length).toBeGreaterThan(0)
    fireEvent.click(tabs(container)[3])
    expect(bars(container)).toHaveLength(0)
  })

  it('shows no bars under prefers-reduced-motion, where nothing advances', () => {
    stubMatchMedia(true)
    vi.useFakeTimers()
    const { container } = mount()
    expect(bars(container)).toHaveLength(0)
  })

  it('freezes the bar while hovered rather than letting it run on', () => {
    vi.useFakeTimers()
    const { container } = mount()
    fireEvent.mouseOver(container.querySelector('[role="tablist"]')!)
    expect(running(container)?.getAttribute('style')).toContain('paused')
  })

  it('resumes the countdown where it left off instead of restarting it', () => {
    vi.useFakeTimers()
    const { container } = mount()
    const rail = container.querySelector('[role="tablist"]')!
    act(() => { vi.advanceTimersByTime(4000) })
    fireEvent.mouseOver(rail)
    act(() => { vi.advanceTimersByTime(60000) })
    expect(selected(container)?.textContent).toContain('Photo 1')
    fireEvent.mouseOut(rail, { relatedTarget: container.querySelector('.home-copy') })
    // 2s of the 6s remained. A restart would need the full 6s.
    act(() => { vi.advanceTimersByTime(2000) })
    expect(selected(container)?.textContent).toContain('Photo 2')
  })

  it('gives the bar the same duration as the advance interval, from one source', () => {
    vi.useFakeTimers()
    const { container } = mount()
    expect(running(container)?.getAttribute('style')).toContain('6000ms')
  })
})

// DESIGN.md §12.5-E. At <=900px the six-title rail is 308px tall and pushes the
// photograph to y581 on a 375x812 phone -- 231px of a 487px image above the
// fold, against §8's "give the photograph the dominant share". The rail
// collapses to a dot row plus the active work's name, which puts the whole
// photograph on the first screen while keeping the work named.
describe('HomeHero — the mobile selector', () => {
  const label = (c: HTMLElement) => c.querySelector('.home-active-label')

  it('names the active work beside its number', () => {
    const { container } = mount({ initialIndex: 3 })
    expect(label(container)?.textContent).toContain('04')
    expect(label(container)?.textContent).toContain('Photo 4')
  })

  it('follows the selection', () => {
    const { container } = mount()
    expect(label(container)?.textContent).toContain('Photo 1')
    fireEvent.click(tabs(container)[4])
    expect(label(container)?.textContent).toContain('05')
    expect(label(container)?.textContent).toContain('Photo 5')
  })

  it('follows an auto-advance too', () => {
    vi.useFakeTimers()
    const { container } = mount()
    act(() => { vi.advanceTimersByTime(6000) })
    expect(label(container)?.textContent).toContain('Photo 2')
  })

  // The tabs already carry every title, so an exposed label would make a screen
  // reader announce the active work twice.
  it('is hidden from assistive tech, which reads the tabs instead', () => {
    const { container } = mount()
    expect(label(container)?.getAttribute('aria-hidden')).toBe('true')
  })

  // The dots layout hides the titles with CSS. If it removed them from the DOM
  // the tabs would lose their accessible names entirely.
  it('leaves every tab its title text for its accessible name', () => {
    const { container } = mount()
    for (const [i, t] of tabs(container).entries()) {
      expect(t.textContent).toContain(`Photo ${i + 1}`)
    }
  })
})

describe('HomeHero — the <=900px stylesheet', () => {
  const source = readFileSync(resolve(process.cwd(), 'components/store/HomeHero.tsx'), 'utf8')
  const mobile = (() => {
    const i = source.indexOf('@media (max-width: 900px)')
    if (i === -1) throw new Error('no <=900px block')
    // The block's closing brace is the first one at its own indentation level.
    const end = source.indexOf('\n        }', i)
    return source.slice(i, end)
  })()

  it('lays the index out as a row of dots rather than a stack', () => {
    expect(mobile).toMatch(/\.home-index\s*\{[^}]*display:\s*flex/)
  })

  it('keeps each dot at a 44px touch target, not the 7px it looks like', () => {
    const link = mobile.match(/\.home-index-link\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(link).toMatch(/min-height:\s*44px/)
    expect(link).toMatch(/min-width:\s*44px/)
  })

  // display:none would strip the tab's accessible name. The title has to stay
  // in the accessibility tree while leaving the layout.
  it('clips the titles out of sight without removing them from the a11y tree', () => {
    const title = mobile.match(/\.home-index-title[^{]*\{([^}]*)\}/)?.[1] ?? ''
    expect(title).not.toMatch(/display:\s*none/)
    expect(title).toMatch(/clip-path|clip:/)
  })

  it('shows the active label, which is absent on desktop', () => {
    expect(mobile).toMatch(/\.home-active-label\s*\{[^}]*display:\s*(flex|block)/)
    const desktop = source.slice(0, source.indexOf('@media (max-width: 900px)'))
    expect(desktop).toMatch(/\.home-active-label\s*\{[^}]*display:\s*none/)
  })
})
