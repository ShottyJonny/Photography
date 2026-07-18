import { describe, it, expect } from 'vitest'
import { computeOrderAmounts } from '@/lib/pricing'

describe('computeOrderAmounts documented behavior', () => {
  it('prices a US order by size and applies the state rate', () => {
    const r = computeOrderAmounts([{ size: '8x10', qty: 2, name: 'X' }], { country: 'us', region: 'CA' })
    expect(r.subtotal).toBe(3000)          // 1500 * 2
    expect(r.shipping).toBe(995)
    expect(r.tax).toBe(Math.round(3000 * 0.0825)) // 248
    expect(r.total).toBe(3000 + 995 + 248)
  })

  it('applies the 6% fallback for an unlisted US state', () => {
    const r = computeOrderAmounts([{ size: '4x6', qty: 1 }], { country: 'us', region: 'ZZ' })
    expect(r.tax).toBe(Math.round(500 * 0.06)) // 30
  })

  it('applies a flat 12% for non-US destinations', () => {
    const r = computeOrderAmounts([{ size: '4x6', qty: 1 }], { country: 'Canada' })
    expect(r.tax).toBe(Math.round(500 * 0.12)) // 60
  })

  it('throws on an invalid size', () => {
    expect(() => computeOrderAmounts([{ size: '9x12', qty: 1 }], { country: 'us', region: 'CA' })).toThrow(/Invalid item size/)
  })

  it('throws when a US order omits the region', () => {
    expect(() => computeOrderAmounts([{ size: '4x6', qty: 1 }], { country: 'us' })).toThrow(/region is required/)
  })

  it('throws above MAX_QTY (100)', () => {
    expect(() => computeOrderAmounts([{ size: '4x6', qty: 101 }], { country: 'us', region: 'CA' })).toThrow(/exceeds maximum/)
  })
})
