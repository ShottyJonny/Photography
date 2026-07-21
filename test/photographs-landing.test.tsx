import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { PhotoList } from '@/components/admin/PhotoList'
import type { AdminPhoto } from '@/lib/data/photos-admin'

vi.mock('@/lib/ingest/actions', () => ({
  generateRegister: vi.fn(),
  finishIngest: vi.fn(),
  setPublished: vi.fn(),
  deletePhoto: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

beforeEach(cleanup)

const base: AdminPhoto = {
  id: 'p1', slug: 'evil-lies', title: 'Evil Lies',
  published: true, derivatives_ready: true, has_bw_variant: false,
  created_at: '2026-07-19T12:00:00Z',
}

describe('PhotoList', () => {
  it('distinguishes an empty library from an unreadable one', () => {
    const empty = render(<PhotoList photos={[]} />)
    expect(empty.container.textContent).toMatch(/No photographs yet/i)
    cleanup()
    const broken = render(<PhotoList photos={null} />)
    expect(broken.container.textContent).toMatch(/couldn’t read/i)
    expect(broken.container.textContent).not.toMatch(/No photographs yet/i)
  })

  it('labels status as text, never colour alone', () => {
    const { container } = render(<PhotoList photos={[base, { ...base, id: 'p2', slug: 'draft-one', published: false }]} />)
    expect(container.textContent).toMatch(/Published/)
    expect(container.textContent).toMatch(/Draft/)
  })

  it('never says Unlisted (product.md §8 q4)', () => {
    const { container } = render(<PhotoList photos={[{ ...base, published: false }]} />)
    expect(container.textContent).not.toMatch(/unlisted/i)
  })

  it('flags an incomplete ladder and offers a retry', () => {
    const { container } = render(<PhotoList photos={[{ ...base, published: false, derivatives_ready: false }]} />)
    expect(container.textContent).toMatch(/Derivatives incomplete/i)
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.match(/Retry/i))).toBe(true)
  })

  it('shows no retry when the ladder is complete', () => {
    const { container } = render(<PhotoList photos={[base]} />)
    expect(container.textContent).not.toMatch(/Derivatives incomplete/i)
  })

  it('offers Delete on a draft but not on a published photograph', () => {
    // The server refuses independently; the control simply does not appear
    // rather than appearing and then refusing (product.md §1).
    const draft = render(<PhotoList photos={[{ ...base, published: false }]} />)
    expect([...draft.container.querySelectorAll('button')].some((b) => b.textContent === 'Delete')).toBe(true)
    cleanup()
    const live = render(<PhotoList photos={[base]} />)
    expect([...live.container.querySelectorAll('button')].some((b) => b.textContent === 'Delete')).toBe(false)
  })

  it('offers an Edit link per row pointing at the edit page', () => {
    const { container } = render(<PhotoList photos={[base]} />)
    const edit = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Edit')
    expect(edit, 'no Edit link').toBeTruthy()
    expect(edit!.getAttribute('href')).toBe('/admin/photographs/p1/edit')
  })
})
