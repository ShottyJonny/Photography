import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { IngestForm } from '@/components/admin/IngestForm'

vi.mock('@/lib/ingest/actions', () => ({
  beginIngest: vi.fn(),
  createPhotoDraft: vi.fn(),
  generateRegister: vi.fn(),
  finishIngest: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({ supabaseBrowser: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

beforeEach(cleanup)

function renderForm() {
  return render(<IngestForm collections={[{ id: 'c1', name: 'Relics' }]} />)
}

describe('Surface C — the form', () => {
  it('binds every label to its input', () => {
    renderForm()
    for (const name of ['Title', 'Web address', 'Caption', 'Description', 'Alt text']) {
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.includes(name))
      expect(label, `no label for ${name}`).toBeTruthy()
      const id = label!.getAttribute('for')
      expect(id, `label ${name} has no for=`).toBeTruthy()
      expect(document.getElementById(id!), `nothing has id=${id}`).toBeTruthy()
    }
  })

  it('derives the web address from the title', () => {
    // fireEvent.change, NOT `el.value = x` + dispatchEvent: React 19's value
    // tracker sees currentValue === node.value and discards the event, so
    // onChange never fires and the assertion reads ''.
    const { container } = renderForm()
    const title = container.querySelector<HTMLInputElement>('#ingest-title')!
    fireEvent.change(title, { target: { value: 'If Gold Could Rust' } })
    expect(container.querySelector<HTMLInputElement>('#ingest-slug')!.value).toBe('if-gold-could-rust')
  })

  it('warns that the web address is permanent', () => {
    const { container } = renderForm()
    expect(container.textContent).toMatch(/can’t be changed after saving/i)
  })

  it('has no Base price control (product.md §8 q3 — the dead field)', () => {
    const { container } = renderForm()
    expect(container.textContent).not.toMatch(/base price/i)
    expect(container.textContent).not.toMatch(/\$150/)
  })

  it('states the real price ladder, not the prototype’s invented sizes', () => {
    const { container } = renderForm()
    // The prototype offered 24×30 and 32×40, which are not sizes that exist.
    expect(container.textContent).not.toMatch(/24×30|32×40/)
    expect(container.textContent).toMatch(/\$5\s*–\s*\$65|\$5–\$65/)
    expect(container.textContent).toMatch(/all seven sizes/i)
  })

  it('says Draft, never Unlisted (product.md §8 q4)', () => {
    const { container } = renderForm()
    expect(container.textContent).not.toMatch(/unlisted/i)
    expect(container.textContent).not.toMatch(/direct link/i)
    expect(container.textContent).toMatch(/draft/i)
  })

  it('builds no Aura tile (design.md §11.4-C’s own correction)', () => {
    const { container } = renderForm()
    expect(container.textContent).not.toMatch(/aura/i)
  })

  it('offers a silver dropzone only when the toggle is on, and beside it', () => {
    const { container } = renderForm()
    const toggle = container.querySelector('#ingest-silver-toggle')!
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(container.textContent).not.toMatch(/silver original/i)
  })

  it('blocks Save & publish before a file is chosen', () => {
    const { container } = renderForm()
    const publish = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Save & publish'),
    )!
    expect(publish.hasAttribute('disabled')).toBe(true)
  })
})
