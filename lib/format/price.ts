import { PRICE_BY_SIZE, ALL_SIZES } from '@/lib/pricing'

export function priceForSize(size: string): number {
  return PRICE_BY_SIZE[size] ?? 0
}

export function priceRangeLabel(): string {
  const vals = ALL_SIZES.map((s) => PRICE_BY_SIZE[s])
  const fmt = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`
  return `${fmt(Math.min(...vals))}\u2013${fmt(Math.max(...vals))}`
}
