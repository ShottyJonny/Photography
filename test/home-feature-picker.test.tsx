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
