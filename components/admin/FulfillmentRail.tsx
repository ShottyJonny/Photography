'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  markSubmittedToLab, markShipped, acceptMismatch, markRefunded, markCancelled,
} from '@/lib/admin/order-actions'
import type { OrderStatus } from '@/lib/orders/query'

/**
 * DESIGN.md §11.4-E's fulfillment rail: Paid → Submitted to lab → Shipped.
 *
 * Forward-only, and every step is a button a human presses. No timer, no
 * inference, no optimistic advance: the rail moves only after the server says
 * it moved (product.md §1, §6.1 — the legacy site set `shipped` on a 900ms
 * setTimeout and invented a UPS number to go with it).
 *
 * Timestamps are formatted server-side and passed in; lib/admin/dates.ts is
 * server-only, and a client `new Date()` would hydrate-mismatch the render.
 */
export function FulfillmentRail({
  orderId,
  status,
  submittedLabel,
  shippedLabel,
  trackingNumber,
}: {
  orderId: string
  status: OrderStatus
  submittedLabel: string | null
  shippedLabel: string | null
  trackingNumber: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [notice, setNotice] = useState<string | null>(null)
  const [tracking, setTracking] = useState('')
  const [shipping, setShipping] = useState(false)

  function run(action: () => Promise<{ ok: true } | { ok: false; message: string }>) {
    start(async () => {
      setNotice(null)
      const result = await action()
      if (!result.ok) setNotice(result.message)
      else router.refresh()
    })
  }

  const paidReached = status !== 'pending' && status !== 'amount_mismatch'
  const labReached = status === 'submitted_to_lab' || status === 'shipped'
  const shippedReached = status === 'shipped'

  return (
    <section className="admin-ord-rail" aria-labelledby="rail-head">
      <h2 className="admin-sectionhead" id="rail-head">Fulfillment</h2>

      <ol className="admin-ord-steps">
        <li className={paidReached ? 'admin-ord-step is-done' : 'admin-ord-step'}>
          <span className="admin-ord-stepname">Paid</span>
          <span className="admin-ord-stepmeta">
            {status === 'amount_mismatch'
              ? 'Quarantined — the amount paid does not match the order.'
              : status === 'pending'
                ? 'Payment not confirmed.'
                : 'Confirmed by Stripe.'}
          </span>
        </li>

        <li className={labReached ? 'admin-ord-step is-done' : 'admin-ord-step'}>
          <span className="admin-ord-stepname">Submitted to lab</span>
          <span className="admin-ord-stepmeta">{submittedLabel ?? 'Not yet placed at Nations.'}</span>
          {status === 'paid' ? (
            <button
              type="button"
              className="admin-btn"
              disabled={pending}
              onClick={() => run(() => markSubmittedToLab({ id: orderId }))}
            >
              Mark submitted to lab
            </button>
          ) : null}
        </li>

        <li className={shippedReached ? 'admin-ord-step is-done' : 'admin-ord-step'}>
          <span className="admin-ord-stepname">Shipped</span>
          <span className="admin-ord-stepmeta">
            {shippedLabel ?? 'Not shipped.'}
            {shippedReached && trackingNumber ? ` · tracking ${trackingNumber}` : ''}
          </span>

          {status === 'submitted_to_lab' ? (
            shipping ? (
              <form
                className="admin-ord-tracking"
                onSubmit={(e) => {
                  e.preventDefault()
                  run(() => markShipped({ id: orderId, trackingNumber: tracking }))
                }}
              >
                <label className="admin-ord-finish-label" htmlFor="tracking">Tracking number</label>
                <input
                  id="tracking"
                  className="admin-ord-finish-input"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  required
                />
                <button type="submit" className="admin-btn" disabled={pending || tracking.trim() === ''}>
                  Mark shipped
                </button>
                {/* §6.1: shipped is the only state that may ever display a
                    tracking number, so it is not optional here. */}
                <p className="admin-ord-note">Required — shipped is the only state that shows a tracking number.</p>
              </form>
            ) : (
              <button type="button" className="admin-btn" onClick={() => setShipping(true)}>
                Mark shipped + tracking
              </button>
            )
          ) : null}
        </li>
      </ol>

      {notice ? <p className="admin-ord-error" role="alert">{notice}</p> : null}

      <div className="admin-ord-resolve">
        {status === 'amount_mismatch' ? (
          <div className="admin-ord-resolveitem">
            <button
              type="button"
              className="admin-btn"
              disabled={pending}
              onClick={() => run(() => acceptMismatch({ id: orderId }))}
            >
              Accept as paid
            </button>
            <p className="admin-ord-note">
              Only after confirming in Stripe that the full amount was captured.
            </p>
          </div>
        ) : null}

        {status !== 'pending' && status !== 'refunded' ? (
          <div className="admin-ord-resolveitem">
            <button
              type="button"
              className="admin-ghost"
              disabled={pending}
              onClick={() => run(() => markRefunded({ id: orderId }))}
            >
              Mark refunded
            </button>
            {/* A button that claimed to refund and didn't is product.md §1's
                founding defect. This one records; it does not move money. */}
            <p className="admin-ord-note">Records that you refunded this in Stripe. It does not move money.</p>
          </div>
        ) : null}

        {status !== 'pending' && status !== 'shipped' && status !== 'cancelled' ? (
          <div className="admin-ord-resolveitem">
            <button
              type="button"
              className="admin-ghost"
              disabled={pending}
              onClick={() => run(() => markCancelled({ id: orderId }))}
            >
              Mark cancelled
            </button>
            <p className="admin-ord-note">Records the cancellation here. It does not move money.</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
