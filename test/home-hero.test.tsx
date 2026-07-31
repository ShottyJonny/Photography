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
