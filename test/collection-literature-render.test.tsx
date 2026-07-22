import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LiteratureBody } from '@/app/(store)/collections/[slug]/page'

describe('LiteratureBody', () => {
  it('splits blank-line-separated text into <p> paragraphs', () => {
    const { container } = render(<LiteratureBody text={'First para.\n\nSecond para.'} />)
    const ps = container.querySelectorAll('p.collection-literature-body')
    expect(ps).toHaveLength(2)
    expect(ps[0].textContent).toBe('First para.')
    expect(ps[1].textContent).toBe('Second para.')
  })
  it('puts the drop-cap class on the first paragraph only', () => {
    const { container } = render(<LiteratureBody text={'One.\n\nTwo.'} />)
    const ps = container.querySelectorAll('p.collection-literature-body')
    expect(ps[0].classList.contains('is-first')).toBe(true)
    expect(ps[1].classList.contains('is-first')).toBe(false)
  })
  it('renders a single paragraph as one <p> with the drop-cap', () => {
    const { container } = render(<LiteratureBody text={'Just one.'} />)
    const ps = container.querySelectorAll('p.collection-literature-body')
    expect(ps).toHaveLength(1)
    expect(ps[0].classList.contains('is-first')).toBe(true)
  })
})
