import { computeOrderAmounts } from '@/lib/pricing'

export interface ResolvedItem {
  photoId: string
  title: string
  originalKey: string | null
  size: string
  register: 'colour' | 'silver'
  qty: number
}

export interface ShippingAddress {
  name: string; street: string; city: string; region: string; postalCode: string; country: string
}

export function buildCheckout(items: ResolvedItem[], shipping: ShippingAddress) {
  const amounts = computeOrderAmounts(
    items.map((i) => ({ size: i.size, qty: i.qty, name: i.title })),
    { country: shipping.country, region: shipping.region },
  )

  const orderItems = items.map((i, idx) => ({
    photo_id: i.photoId,
    title: i.title,
    size: i.size,
    register: i.register,
    qty: i.qty,
    unit_cents: amounts.lineItems[idx].unit,
    original_key: i.originalKey,
  }))

  const stripeLineItems = amounts.lineItems.map((li) => ({
    price_data: {
      currency: 'usd',
      product_data: { name: li.name, description: `Size: ${li.size}` },
      unit_amount: li.unit,
    },
    quantity: li.qty,
  }))
  if (amounts.shipping > 0) {
    stripeLineItems.push({
      price_data: { currency: 'usd', product_data: { name: 'Shipping', description: 'Standard shipping' }, unit_amount: amounts.shipping },
      quantity: 1,
    })
  }
  if (amounts.tax > 0) {
    stripeLineItems.push({
      price_data: { currency: 'usd', product_data: { name: 'Tax', description: 'Sales tax' }, unit_amount: amounts.tax },
      quantity: 1,
    })
  }

  return { amounts, orderItems, stripeLineItems }
}
