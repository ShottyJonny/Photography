import { computeOrderAmounts } from '@/lib/pricing'
import { priceForSize } from '@/lib/format/price'

export type QuoteLine = { size: string; qty: number; title?: string }
export type QuoteDest = { country: string; region: string }
export type Quote =
  | { complete: true; subtotal: number; shipping: number; tax: number; total: number }
  | { complete: false; subtotal: number }

// A DISPLAY MIRROR of the server's pricing — never a second price authority. Feeds
// computeOrderAmounts the same inputs the checkout route feeds it; on the throw path (e.g. a US
// address with no region) it degrades to a subtotal-only quote. subtotal is always knowable.
export function previewQuote(lines: QuoteLine[], dest: QuoteDest): Quote {
  const subtotal = lines.reduce((sum, l) => sum + priceForSize(l.size) * l.qty, 0)
  try {
    const a = computeOrderAmounts(
      lines.map((l) => ({ size: l.size, qty: l.qty, name: l.title })),
      { country: dest.country, region: dest.region },
    )
    return { complete: true, subtotal: a.subtotal, shipping: a.shipping, tax: a.tax, total: a.total }
  } catch {
    return { complete: false, subtotal }
  }
}
