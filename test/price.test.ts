import { describe, it, expect } from 'vitest'
import { formatPrice, priceForSize, priceRangeLabel } from '@/lib/format/price'

it('prices a size in cents from the pricing table', () => {
  expect(priceForSize('8x10')).toBe(1500)
})
it('formats the range label from the pricing table', () => {
  expect(priceRangeLabel()).toBe('$5\u2013$65')
})

describe('formatPrice', () => {
  it('drops the cents when they are zero', () => {
    expect(formatPrice(6500)).toBe('$65')
    expect(formatPrice(0)).toBe('$0')
  })

  it('keeps two decimals when there are cents', () => {
    expect(formatPrice(550)).toBe('$5.50')
    expect(formatPrice(4243)).toBe('$42.43')
  })

  // The mismatch line's whole point is that two numbers read differently at a
  // glance: "paid $5.50 · expected $65", not "$5.50 · $65.00".
  it('renders a mismatch pair distinguishably', () => {
    expect(`${formatPrice(550)} · ${formatPrice(6500)}`).toBe('$5.50 · $65')
  })
})
