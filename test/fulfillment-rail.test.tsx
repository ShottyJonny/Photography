import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrderStatus } from '@/lib/orders/query'

type ActionResult = { ok: true } | { ok: false; message: string }

// vi.mock factories are hoisted above the file, so the doubles they close over
// have to be hoisted too.
const { actions, refresh } = vi.hoisted(() => {
  const ok = async (): Promise<{ ok: true } | { ok: false; message: string }> => ({ ok: true })
  return {
    actions: {
      markSubmittedToLab: vi.fn(ok),
      markShipped: vi.fn(ok),
      acceptMismatch: vi.fn(ok),
      markRefunded: vi.fn(ok),
      markCancelled: vi.fn(ok),
    },
    refresh: vi.fn(),
  }
})
vi.mock('@/lib/admin/order-actions', () => actions)
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { FulfillmentRail } from '@/components/admin/FulfillmentRail'

function renderRail(status: OrderStatus, over: Partial<Parameters<typeof FulfillmentRail>[0]> = {}) {
  return render(
    <FulfillmentRail
      orderId="o1"
      status={status}
      submittedLabel={null}
      shippedLabel={null}
      trackingNumber={null}
      {...over}
    />,
  )
}

function button(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label))
}

beforeEach(() => { vi.clearAllMocks() })
afterEach(cleanup)

describe('the rail offers only the legal next step', () => {
  it('offers the lab step on a paid order, and not shipping', () => {
    const { container } = renderRail('paid')
    expect(button(container, 'Mark submitted to lab')).toBeDefined()
    expect(button(container, 'Mark shipped')).toBeUndefined()
  })

  it('offers shipping only once the order is at the lab', () => {
    const { container } = renderRail('submitted_to_lab')
    expect(button(container, 'Mark submitted to lab')).toBeUndefined()
    expect(button(container, 'Mark shipped + tracking')).toBeDefined()
  })

  it('offers no advance on a shipped order', () => {
    const { container } = renderRail('shipped')
    expect(button(container, 'Mark submitted to lab')).toBeUndefined()
    expect(button(container, 'Mark shipped')).toBeUndefined()
  })

  it('offers no advance on a quarantined order — it must be resolved first', () => {
    const { container } = renderRail('amount_mismatch')
    expect(button(container, 'Mark submitted to lab')).toBeUndefined()
    expect(button(container, 'Accept as paid')).toBeDefined()
  })

  it('offers nothing at all on an unpaid order', () => {
    const { container } = renderRail('pending')
    expect(button(container, 'Mark submitted to lab')).toBeUndefined()
    expect(button(container, 'Mark refunded')).toBeUndefined()
    expect(button(container, 'Mark cancelled')).toBeUndefined()
  })
})

describe('advancing', () => {
  it('calls the action and refreshes on success', async () => {
    const { container } = renderRail('paid')
    fireEvent.click(button(container, 'Mark submitted to lab')!)
    await waitFor(() => expect(actions.markSubmittedToLab).toHaveBeenCalledWith({ id: 'o1' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('shows the server refusal instead of moving the rail', async () => {
    actions.markSubmittedToLab.mockResolvedValueOnce({ ok: false, message: 'Only a paid order can go to the lab.' } as ActionResult)
    const { container } = renderRail('paid')
    fireEvent.click(button(container, 'Mark submitted to lab')!)
    await waitFor(() => expect(container.textContent).toContain('Only a paid order can go to the lab.'))
    expect(refresh).not.toHaveBeenCalled()
  })

  // §6.1: shipped is the only state that may show a tracking number, so it is
  // required rather than optional.
  it('requires a tracking number before it will ship', async () => {
    const { container } = renderRail('submitted_to_lab')
    fireEvent.click(button(container, 'Mark shipped + tracking')!)

    const input = container.querySelector('#tracking') as HTMLInputElement
    expect(input.required).toBe(true)
    expect(button(container, 'Mark shipped')!.disabled).toBe(true)

    fireEvent.change(input, { target: { value: '1Z999AA10123456784' } })
    expect(button(container, 'Mark shipped')!.disabled).toBe(false)

    fireEvent.submit(container.querySelector('form.admin-ord-tracking')!)
    await waitFor(() =>
      expect(actions.markShipped).toHaveBeenCalledWith({ id: 'o1', trackingNumber: '1Z999AA10123456784' }),
    )
  })

  it('shows the real timestamps once they exist', () => {
    const { container } = renderRail('shipped', {
      submittedLabel: 'Thursday · 16 July 2026',
      shippedLabel: 'Friday · 17 July 2026',
      trackingNumber: '1Z999AA10123456784',
    })
    expect(container.textContent).toContain('Thursday · 16 July 2026')
    expect(container.textContent).toContain('Friday · 17 July 2026')
    expect(container.textContent).toContain('1Z999AA10123456784')
  })

  it('says a step has not happened rather than implying it has', () => {
    const { container } = renderRail('paid')
    expect(container.textContent).toContain('Not yet placed at Nations.')
    expect(container.textContent).toContain('Not shipped.')
  })
})

describe('resolutions', () => {
  it('accepts a mismatch as paid, with the Stripe caveat spelled out', async () => {
    const { container } = renderRail('amount_mismatch')
    expect(container.textContent).toContain('Only after confirming in Stripe that the full amount was captured.')
    fireEvent.click(button(container, 'Accept as paid')!)
    await waitFor(() => expect(actions.acceptMismatch).toHaveBeenCalledWith({ id: 'o1' }))
  })

  // The button records; it does not call Stripe. Saying otherwise would be
  // product.md §1's founding defect.
  it('states outright that refunding here does not move money', () => {
    const { container } = renderRail('paid')
    expect(container.textContent).toContain('Records that you refunded this in Stripe. It does not move money.')
  })

  it('records a refund and a cancellation', async () => {
    const { container } = renderRail('paid')
    fireEvent.click(button(container, 'Mark refunded')!)
    await waitFor(() => expect(actions.markRefunded).toHaveBeenCalledWith({ id: 'o1' }))
    fireEvent.click(button(container, 'Mark cancelled')!)
    await waitFor(() => expect(actions.markCancelled).toHaveBeenCalledWith({ id: 'o1' }))
  })

  it('does not offer to cancel a shipped order — the prints are gone', () => {
    const { container } = renderRail('shipped')
    expect(button(container, 'Mark cancelled')).toBeUndefined()
    expect(button(container, 'Mark refunded')).toBeDefined()
  })

  it('does not offer to re-refund a refunded order', () => {
    const { container } = renderRail('refunded')
    expect(button(container, 'Mark refunded')).toBeUndefined()
  })
})
