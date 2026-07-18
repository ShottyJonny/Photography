import { supabaseAdmin } from '@/lib/supabase/admin'

export default async function OrderConfirmation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: order } = await supabaseAdmin()
    .from('orders').select('id, status, total_cents, customer_name').eq('id', id).single()

  if (!order) return <main style={{ padding: 24 }}><p>We couldn’t find that order.</p></main>

  // Honest function: only true states. No fake tracking, no "email sent"; Stripe's receipt
  // is the only receipt. Cancelled/refunded orders never show a thank-you.
  const active = order.status === 'paid' || order.status === 'amount_mismatch' || order.status === 'pending'
  const message =
    order.status === 'paid' ? 'Your order is confirmed. Your receipt comes from Stripe.'
    : order.status === 'cancelled' ? 'This order was cancelled.'
    : order.status === 'refunded' ? 'This order was refunded.'
    : active ? 'We’ve received your order and are reviewing it. Your receipt comes from Stripe.'
    : 'This order is no longer active.'

  return (
    <main style={{ padding: 24 }}>
      <p style={{ fontFamily: 'var(--font-mono)' }}>{order.id}</p>
      <h1 style={{ fontFamily: 'var(--font-playfair)' }}>{active ? 'Thank you.' : 'Order update'}</h1>
      <p style={{ fontFamily: 'var(--font-newsreader)' }}>{message}</p>
    </main>
  )
}
