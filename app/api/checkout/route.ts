import { checkoutSchema, toStoredShippingAddress } from '@/lib/checkout/schema'
import { buildCheckout, type ResolvedItem } from '@/lib/checkout/build'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { env } from '@/lib/env'

export async function POST(req: Request): Promise<Response> {
  let json: unknown
  try { json = await req.json() } catch { return Response.json({ error: 'Invalid request body' }, { status: 400 }) }

  const parsed = checkoutSchema.safeParse(json)
  if (!parsed.success) return Response.json({ error: 'Invalid order' }, { status: 400 })
  const { items, customer, shippingAddress } = parsed.data

  const db = supabaseAdmin()

  // Resolve each cart item against photos: exists + published; snapshot title/original_key.
  const ids = items.map((i) => i.photoId)
  const { data: photos, error: photoErr } = await db
    .from('photos').select('id, title, published, has_bw_variant, original_key, original_bw_key').in('id', ids)
  if (photoErr) return Response.json({ error: 'Could not validate your order' }, { status: 400 })

  const byId = new Map((photos ?? []).map((p) => [p.id, p]))
  const resolved: ResolvedItem[] = []
  for (const i of items) {
    const p = byId.get(i.photoId)
    if (!p || !p.published) return Response.json({ error: 'A selected print is unavailable' }, { status: 400 })
    if (i.register === 'silver' && !p.has_bw_variant) return Response.json({ error: 'Silver variant unavailable' }, { status: 400 })
    // Silver orders must snapshot the B&W master (original_bw_key), not the colour original.
    const originalKey = i.register === 'silver' ? p.original_bw_key : p.original_key
    if (i.register === 'silver' && !originalKey) return Response.json({ error: 'Silver variant unavailable' }, { status: 400 })
    resolved.push({ photoId: p.id, title: p.title, originalKey, size: i.size, register: i.register, qty: i.qty })
  }

  // computeOrderAmounts (inside buildCheckout) throws on invalid size / missing destination.
  let built
  try { built = buildCheckout(resolved, shippingAddress) } catch { return Response.json({ error: 'Could not validate your order' }, { status: 400 }) }
  const { amounts, orderItems, stripeLineItems } = built

  // Insert the order (pending) with the COMPLETE shipping address and server-derived cents.
  const { data: order, error: orderErr } = await db.from('orders').insert({
    customer_email: customer.email,
    customer_name: customer.name,
    shipping_address: toStoredShippingAddress(shippingAddress), // snake_case at the boundary
    status: 'pending',
    subtotal_cents: amounts.subtotal,
    shipping_cents: amounts.shipping,
    tax_cents: amounts.tax,
    total_cents: amounts.total,
  }).select('id').single()
  if (orderErr || !order) return Response.json({ error: 'Could not start checkout' }, { status: 500 })

  const { error: itemsErr } = await db.from('order_items')
    .insert(orderItems.map((oi) => ({ ...oi, order_id: order.id })))
  if (itemsErr) {
    await db.from('orders').delete().eq('id', order.id) // don't leave an orphan pending order
    return Response.json({ error: 'Could not start checkout' }, { status: 500 })
  }

  const base = env().siteUrl
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'], // synchronous card only (matches legacy); no async/delayed methods
    line_items: stripeLineItems,
    customer_email: customer.email,
    billing_address_collection: 'required',
    // NO shipping_address_collection — we own the shipping address (Global Constraints).
    success_url: `${base}/order/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/checkout?canceled=1`,
    metadata: { orderId: order.id },
    payment_intent_data: { receipt_email: customer.email, metadata: { orderId: order.id } },
  })

  return Response.json({ url: session.url })
}
