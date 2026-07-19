import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const pathname = { value: '/admin' }
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }))

afterEach(() => { cleanup(); pathname.value = '/admin' })

async function renderNav() {
  const { AdminNav } = await import('@/components/admin/AdminNav')
  return render(<AdminNav />)
}

describe('AdminNav', () => {
  it('lists the five items in the prototype order', async () => {
    const { container } = await renderNav()
    const labels = [...container.querySelectorAll('.admin-navitem')].map(
      (el) => (el.textContent ?? '').replace('NOT BUILT', '').trim(),
    )
    expect(labels).toEqual(['Dashboard', 'Photographs', 'Collections', 'Orders', 'Home feature'])
  })

  it('makes exactly one item a link, and it is Dashboard', async () => {
    const { container } = await renderNav()
    const links = container.querySelectorAll('a.admin-navitem')
    expect(links.length).toBe(1)
    expect(links[0].getAttribute('href')).toBe('/admin')
    expect(links[0].textContent).toContain('Dashboard')
  })

  it('renders the four unbuilt items as non-interactive text carrying the marker', async () => {
    const { container } = await renderNav()
    const marked = [...container.querySelectorAll('span.admin-navitem')]
    expect(marked.length).toBe(4)
    for (const el of marked) {
      expect(el.textContent).toContain('NOT BUILT')
      expect(el.hasAttribute('href')).toBe(false)
      expect(el.hasAttribute('tabindex')).toBe(false)
      expect(el.getAttribute('role')).toBeNull()
    }
  })

  it('marks the active item and only the active item', async () => {
    const { container } = await renderNav()
    const active = container.querySelectorAll('.admin-navitem.is-active')
    expect(active.length).toBe(1)
    expect(active[0].textContent).toContain('Dashboard')
  })

  it('does not mark Dashboard active on another admin path', async () => {
    pathname.value = '/admin/orders'
    const { container } = await renderNav()
    expect(container.querySelectorAll('.admin-navitem.is-active').length).toBe(0)
  })

  // §11.3's Orders count pill is deferred (D8): a pill on a dead item
  // advertises a queue that cannot be opened.
  it('renders no count pill on the marked Orders item', async () => {
    const { container } = await renderNav()
    expect(container.textContent).not.toMatch(/Orders\s*\d/)
  })
})

describe('MarkedControl', () => {
  it('renders a marked button that is focusable and announced as disabled', async () => {
    const { MarkedButton } = await import('@/components/admin/MarkedControl')
    const { container } = render(<MarkedButton label="＋ Post a photo" />)
    const button = container.querySelector('button')
    expect(button?.getAttribute('aria-disabled')).toBe('true')
    // NOT the native attribute — that would remove it from the tab order, so
    // nobody navigating by keyboard would ever hear the marker.
    expect(button?.hasAttribute('disabled')).toBe(false)
    expect(button?.getAttribute('type')).toBe('button')
    expect(button?.textContent).toContain('＋ Post a photo')
    expect(button?.textContent).toContain('NOT BUILT')
  })

  it('renders a marked link as inert text, never as an anchor', async () => {
    const { MarkedLink } = await import('@/components/admin/MarkedControl')
    const { container } = render(<MarkedLink label="All orders →" />)
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).toContain('All orders →')
    expect(container.textContent).toContain('NOT BUILT')
  })
})
