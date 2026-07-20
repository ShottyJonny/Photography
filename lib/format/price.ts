import { PRICE_BY_SIZE, ALL_SIZES } from '@/lib/pricing'

export function priceForSize(size: string): number {
  return PRICE_BY_SIZE[size] ?? 0
}

export function priceRangeLabel(): string {
  const vals = ALL_SIZES.map((s) => PRICE_BY_SIZE[s])
  const fmt = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`
  return `${fmt(Math.min(...vals))}\u2013${fmt(Math.max(...vals))}`
}

/**
 * The storefront's money format, extracted. Was copy-pasted verbatim in four
 * files; the admin needed a fifth, which is where a duplicated helper stops
 * being harmless (design.md §11.7).
 *
 * Cents are dropped when zero so "$5.50 · $65" reads as two different numbers
 * at a glance — which is the entire point of the quarantine line.
 */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`
}
