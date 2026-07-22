import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { CollectionList } from '@/components/admin/CollectionList'
import type { AdminCollectionRow } from '@/lib/data/collections-admin'

beforeEach(cleanup)
const rows: AdminCollectionRow[] = [
  { id: 'c1', slug: 'relics', name: 'Relics', count: 6, featured_on_home: true, coverSlug: 'a' },
  { id: 'c2', slug: 'urban', name: 'Urban', count: 7, featured_on_home: false, coverSlug: null },
]

describe('CollectionList', () => {
  it('distinguishes empty from unreadable', () => {
    const empty = render(<CollectionList collections={[]} activeId={null} />)
    expect(empty.container.textContent).toMatch(/No collections yet/i)
    cleanup()
    const broken = render(<CollectionList collections={null} activeId={null} />)
    expect(broken.container.textContent).toMatch(/couldn’t read/i)
  })
  it('links each row to its editor and tags the featured one', () => {
    const { container } = render(<CollectionList collections={rows} activeId="c1" />)
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(links).toContain('/admin/collections/c1')
    expect(container.textContent).toMatch(/Featured/)
    expect(container.textContent).toMatch(/6 works/)
  })
  it('links the ＋ to /new', () => {
    const { container } = render(<CollectionList collections={rows} activeId={null} />)
    expect([...container.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/admin/collections/new')).toBe(true)
  })
})
