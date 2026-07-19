import { it, expect } from 'vitest'
import { priceForSize, priceRangeLabel } from '@/lib/format/price'

it('prices a size in cents from the pricing table', () => {
  expect(priceForSize('8x10')).toBe(1500)
})
it('formats the range label from the pricing table', () => {
  expect(priceRangeLabel()).toBe('$5\u2013$65')
})
