import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { reconcile } from '@/lib/orders/reconcile'

export async function POST(req: Request): Promise<Response> {
  const sig = req.headers.get('stripe-signature') ?? ''
  const raw = await req.text() // raw body required for signature verification

  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(raw, sig, env().STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return Response.json({ error: `Webhook Error: ${(err as Error).message}` }, { status: 400 })
  }

  const db = supabaseAdmin()

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const orderId = session.metadata?.orderId
    if (!orderId) return Response.json({ received: true })

    // Only a genuinely-paid session advances the order. Card is synchronous so this is
    // always 'paid' here; the guard defends against any async/delayed method settling later.
    if (session.payment_status !== 'paid') return Response.json({ received: true })

    const { data: order } = await db.from('orders').select('id, status, total_cents').eq('id', orderId).single()
    // Idempotent: only advance a pending order (Stripe may deliver more than once).
    if (!order || order.status !== 'pending') return Response.json({ received: true })

    const amountTotal = session.amount_total
    if (amountTotal == null) {
      // Anomalous: a paid session with no total. Quarantine without inventing a number.
      await db.from('orders').update({ status: 'amount_mismatch', amount_paid_cents: 0 })
        .eq('id', orderId).eq('status', 'pending')
      return Response.json({ received: true })
    }

    const { status, amountPaidCents } = reconcile(amountTotal, order)
    await db.from('orders').update({
      status,
      amount_paid_cents: amountPaidCents,
      stripe_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    }).eq('id', orderId).eq('status', 'pending')
    return Response.json({ received: true })
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session
    const orderId = session.metadata?.orderId
    if (orderId) {
      await db.from('orders').update({ status: 'cancelled' }).eq('id', orderId).eq('status', 'pending')
    }
    return Response.json({ received: true })
  }

  // payment_intent.payment_failed: leave the order 'pending' (retryable); there is no
  // 'failed' status in the enum. Log-only. (See spec §4.3 open detail.)
  return Response.json({ received: true })
}
