import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
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
