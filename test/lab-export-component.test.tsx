import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { setLabFinish, refresh } = vi.hoisted(() => ({
  setLabFinish: vi.fn(async (): Promise<{ ok: true } | { ok: false; message: string }> => ({ ok: true })),
  refresh: vi.fn(),
}))
vi.mock('@/lib/admin/order-actions', () => ({ setLabFinish }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { LabExport } from '@/components/admin/LabExport'

const BLOCK = 'ORDER  o1\nDATE   2026-07-16\nLAB    Nations Photo Lab'

beforeEach(() => { vi.clearAllMocks() })
afterEach(cleanup)

describe('LabExport', () => {
  it('renders the block verbatim in a pre, so what is read is what is copied', () => {
    const { container } = render(<LabExport orderId="o1" block={BLOCK} finish="Lustre" />)
    expect(container.querySelector('pre')?.textContent).toBe(BLOCK)
  })

  it('offers a copy control for the whole block', () => {
    const { container } = render(<LabExport orderId="o1" block={BLOCK} finish="Lustre" />)
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.includes('Copy block'))).toBe(true)
  })

  // product.md §6.2: Nations' vocabulary is unconfirmed, so this is a text
  // field, never a select of invented finishes.
  it('edits the finish as free text, not a select', () => {
    const { container } = render(<LabExport orderId="o1" block={BLOCK} finish="Lustre" />)
    expect(container.querySelector('select')).toBeNull()
    expect((container.querySelector('#lab-finish') as HTMLInputElement).value).toBe('Lustre')
  })

  it('keeps Save inert until the finish actually changes', async () => {
    const { container } = render(<LabExport orderId="o1" block={BLOCK} finish="Lustre" />)
    const save = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Save finish'))!
    expect(save.disabled).toBe(true)

    fireEvent.change(container.querySelector('#lab-finish')!, { target: { value: 'Metallic' } })
    expect(save.disabled).toBe(false)

    fireEvent.click(save)
    await waitFor(() => expect(setLabFinish).toHaveBeenCalledWith({ id: 'o1', finish: 'Metallic' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('surfaces a save failure rather than pretending it saved', async () => {
    setLabFinish.mockResolvedValueOnce({ ok: false, message: 'Couldn’t save the finish.' })
    const { container } = render(<LabExport orderId="o1" block={BLOCK} finish="Lustre" />)
    fireEvent.change(container.querySelector('#lab-finish')!, { target: { value: 'Metallic' } })
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Save finish'))!)
    await waitFor(() => expect(container.textContent).toContain('Couldn’t save the finish.'))
    expect(refresh).not.toHaveBeenCalled()
  })

  it('says where the download links are, since they are deliberately not in the block', () => {
    const { container } = render(<LabExport orderId="o1" block={BLOCK} finish="Lustre" />)
    expect(container.textContent).toContain('Download links are on the line items, not in the block.')
  })
})
