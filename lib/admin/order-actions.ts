'use server'

import { requireAdmin } from '@/lib/admin/require-admin'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import { DEFAULT_FINISH } from '@/lib/orders/lab-export'
import type { OrderStatus } from '@/lib/orders/query'

export type Result = { ok: true } | { ok: false; message: string }

/**
 * The fulfillment transitions (product.md §6.1, DESIGN.md §11.4-E).
 *
 * Every one of these is a human pressing a button. NOTHING here is called by a
 * timer, a webhook, or a cron: the legacy site set `shipped` on a 900ms
 * setTimeout and generated a fake UPS tracking number for every customer, and
 * this module is the shape that failure is impossible in.
 *
 * Each action RE-READS the current status and gates on it server-side. A
 * Server Action is a public POST endpoint; a stale page must not be able to
 * drive a transition that is no longer legal.
 */

/** Read the row's status, or a message explaining why we can't proceed. */
async function currentStatus(
  db: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  id: string,
): Promise<{ ok: true; status: OrderStatus } | { ok: false; message: string }> {
  const { data, error } = await db.from('orders').select('status').eq('id', id).maybeSingle()
  if (error) return { ok: false, message: 'Couldn’t read that order.' }
  if (!data) return { ok: false, message: 'That order no longer exists.' }
  return { ok: true, status: (data as { status: OrderStatus }).status }
}

async function transition(
  id: string,
  allowed: (status: OrderStatus) => boolean,
  refusal: string,
  patch: Record<string, unknown>,
  failure: string,
): Promise<Result> {
  const db = await createAuthServerClient()
  const current = await currentStatus(db, id)
  if (!current.ok) return current
  if (!allowed(current.status)) return { ok: false, message: refusal }

  const { error } = await db.from('orders').update(patch).eq('id', id)
  if (error) return { ok: false, message: failure }
  return { ok: true }
}

/** paid → submitted_to_lab. Stamps the real time he placed it at Nations. */
export async function markSubmittedToLab(input: { id: string }): Promise<Result> {
  await requireAdmin()
  return transition(
    input.id,
    (status) => status === 'paid',
    'Only a paid order can go to the lab.',
    { status: 'submitted_to_lab', submitted_to_lab_at: new Date().toISOString() },
    'Couldn’t mark it submitted to the lab.',
  )
}

/**
 * submitted_to_lab → shipped, WITH tracking.
 *
 * product.md §6.1 defines shipped as "Jon, manually + tracking" and as the only
 * state that may ever display a tracking number. A shipped row with no tracking
 * is a state whose entire meaning is missing, so this refuses rather than
 * writing the half-truth. (schema.sql's tracking_requires_shipment constraint
 * guards the opposite direction only — it would happily accept a blank.)
 */
export async function markShipped(input: { id: string; trackingNumber: string }): Promise<Result> {
  await requireAdmin()
  const tracking = input.trackingNumber.trim()
  if (tracking === '') return { ok: false, message: 'A tracking number is required to mark it shipped.' }

  return transition(
    input.id,
    (status) => status === 'submitted_to_lab',
    'Only an order at the lab can be marked shipped.',
    { status: 'shipped', shipped_at: new Date().toISOString(), tracking_number: tracking },
    'Couldn’t mark it shipped.',
  )
}

/**
 * amount_mismatch → paid. The one non-forward transition in the slice, and it
 * is deliberate: a human compared the Stripe dashboard against the order and
 * decided the money is right. Nothing automated may do this — the quarantine
 * exists because the failure mode is shipping $65 of prints for $5.50
 * (product.md §6.3).
 */
export async function acceptMismatch(input: { id: string }): Promise<Result> {
  await requireAdmin()
  return transition(
    input.id,
    (status) => status === 'amount_mismatch',
    'Only a quarantined order can be accepted as paid.',
    { status: 'paid' },
    'Couldn’t accept that order as paid.',
  )
}

/**
 * RECORD-KEEPING ONLY. This does not call Stripe and does not move money — the
 * surface says so beside the button. A control that claimed to refund and
 * didn't is product.md §1's founding defect.
 */
export async function markRefunded(input: { id: string }): Promise<Result> {
  await requireAdmin()
  return transition(
    input.id,
    (status) => status !== 'pending' && status !== 'refunded',
    'An unpaid order can’t be refunded.',
    { status: 'refunded' },
    'Couldn’t record the refund.',
  )
}

/** Record-keeping, same as above. A shipped order can't be cancelled — the
 *  prints are gone; that is a refund. */
export async function markCancelled(input: { id: string }): Promise<Result> {
  await requireAdmin()
  return transition(
    input.id,
    (status) => status !== 'pending' && status !== 'shipped' && status !== 'cancelled',
    'That order can’t be cancelled.',
    { status: 'cancelled' },
    'Couldn’t record the cancellation.',
  )
}

/**
 * The finish substituted across the export header. Free text, not an enum:
 * Nations' exact surface/paper vocabulary is still unconfirmed (product.md
 * §6.2), and a dropdown of invented options would encode a guess into a sheet
 * pasted into their real order form.
 */
export async function setLabFinish(input: { id: string; finish: string }): Promise<Result> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const finish = input.finish.trim() || DEFAULT_FINISH
  const { error } = await db.from('orders').update({ lab_finish: finish }).eq('id', input.id)
  if (error) return { ok: false, message: 'Couldn’t save the finish.' }
  return { ok: true }
}
