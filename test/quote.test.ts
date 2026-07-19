import { describe, it, expect } from 'vitest'
import { previewQuote } from '@/lib/format/quote'
import { computeOrderAmounts } from '@/lib/pricing'

const lines = [{ size: '8x10', qty: 2 }] // 2 * 1500 = 3000 subtotal

describe('previewQuote', () => {
  it('returns an exact quote for a complete US address', () => {
    const q = previewQuote(lines, { country: 'US', region: 'CA' })
    expect(q.complete).toBe(true)
    if (q.complete) {
      expect(q.subtotal).toBe(3000)
      expect(q.shipping).toBe(995)
      expect(q.tax).toBe(Math.round(3000 * 0.0825))
      expect(q.total).toBe(3000 + 995 + Math.round(3000 * 0.0825))
    }
  })

  it('returns subtotal-only for a US address with no region', () => {
    expect(previewQuote(lines, { country: 'US', region: '' })).toEqual({ complete: false, subtotal: 3000 })
  })

  it('quotes a non-US address at the flat international rate', () => {
    const q = previewQuote(lines, { country: 'GB', region: '' })
    expect(q.complete).toBe(true)
    if (q.complete) {
      expect(q.tax).toBe(Math.round(3000 * 0.12))
      expect(q.shipping).toBe(995)
    }
  })

  it('uses the 6% fallback for an unknown US state code', () => {
    const q = previewQuote(lines, { country: 'US', region: 'ZZ' })
    expect(q.complete).toBe(true)
    if (q.complete) expect(q.tax).toBe(Math.round(3000 * 0.06))
  })

  it('is subtotal-only for an empty cart', () => {
    expect(previewQuote([], { country: 'US', region: 'CA' })).toEqual({ complete: false, subtotal: 0 })
  })

  it('mirrors computeOrderAmounts exactly for the same inputs', () => {
    const dest = { country: 'US', region: 'NY' }
    const a = computeOrderAmounts(lines.map((l) => ({ size: l.size, qty: l.qty })), dest)
    const q = previewQuote(lines, dest)
    expect(q).toMatchObject({ complete: true, subtotal: a.subtotal, shipping: a.shipping, tax: a.tax, total: a.total })
  })
})
