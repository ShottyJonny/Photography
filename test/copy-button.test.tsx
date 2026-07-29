import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from '@/components/admin/CopyButton'

afterEach(cleanup)

function stubClipboard(impl: (text: string) => Promise<void>) {
  const writeText = vi.fn(impl)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

describe('CopyButton', () => {
  it('copies the exact text it was given', async () => {
    const writeText = stubClipboard(async () => {})
    const { container } = render(<CopyButton text={'line one\nline two'} label="⧉ Copy address" />)
    fireEvent.click(container.querySelector('button')!)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('line one\nline two'))
  })

  it('says Copied only after the write resolves', async () => {
    stubClipboard(async () => {})
    const { container } = render(<CopyButton text="x" label="Copy block" />)
    expect(container.textContent).not.toContain('Copied')
    fireEvent.click(container.querySelector('button')!)
    await waitFor(() => expect(container.textContent).toContain('Copied'))
  })

  // "Copied" when nothing reached the clipboard is product.md §1's founding
  // defect in miniature, and writeText really does reject — insecure context,
  // denied permission, no user gesture.
  it('says Copy failed when the clipboard rejects, and never claims success', async () => {
    stubClipboard(async () => { throw new Error('denied') })
    const { container } = render(<CopyButton text="x" label="Copy block" />)
    fireEvent.click(container.querySelector('button')!)
    await waitFor(() => expect(container.textContent).toContain('Copy failed'))
    expect(container.textContent).not.toContain('Copied')
  })

  it('announces the result politely rather than silently', async () => {
    stubClipboard(async () => {})
    const { container } = render(<CopyButton text="x" label="Copy" />)
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull()
  })
})
