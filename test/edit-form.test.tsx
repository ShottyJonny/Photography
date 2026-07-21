import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { EditForm } from '@/components/admin/EditForm'
import type { EditablePhoto } from '@/lib/data/photos-admin'

vi.mock('@/lib/admin/photo-actions', () => ({ updatePhoto: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const PUBLISHED: EditablePhoto = {
  id: 'p1', slug: 'grand-ring', title: 'Grand Ring',
  caption: 'a line', description: 'a page', alt_text: 'alt here', published: true,
}

beforeEach(cleanup)

describe('EditForm', () => {
  it('prefills every field from the photo', () => {
    const { container } = render(<EditForm photo={PUBLISHED} />)
    expect(container.querySelector<HTMLInputElement>('#edit-title')!.value).toBe('Grand Ring')
    expect(container.querySelector<HTMLInputElement>('#edit-caption')!.value).toBe('a line')
    expect(container.querySelector<HTMLTextAreaElement>('#edit-description')!.value).toBe('a page')
    expect(container.querySelector<HTMLTextAreaElement>('#edit-alt')!.value).toBe('alt here')
  })

  it('binds every label to its input', () => {
    render(<EditForm photo={PUBLISHED} />)
    for (const name of ['Title', 'Caption', 'Description', 'Alt text']) {
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.includes(name))
      expect(label, `no label for ${name}`).toBeTruthy()
      expect(document.getElementById(label!.getAttribute('for')!)).toBeTruthy()
    }
  })

  it('shows the slug read-only and permanent', () => {
    const { container } = render(<EditForm photo={PUBLISHED} />)
    expect(container.textContent).toMatch(/grand-ring/)
    expect(container.textContent).toMatch(/can’t be changed/i)
  })

  it('disables Save when a published photo’s alt is emptied', () => {
    const { container } = render(<EditForm photo={PUBLISHED} />)
    const save = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!
    expect(save.hasAttribute('disabled')).toBe(false)
    fireEvent.change(container.querySelector('#edit-alt')!, { target: { value: '' } })
    expect(save.hasAttribute('disabled')).toBe(true)
  })

  it('allows an empty alt on a draft', () => {
    const { container } = render(<EditForm photo={{ ...PUBLISHED, published: false, alt_text: '' }} />)
    const save = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!
    expect(save.hasAttribute('disabled')).toBe(false)
  })
})
