import { describe, expect, it } from 'vitest'
import { cropGuide, SIZE_ASPECT } from '@/lib/product/crop'

describe('cropGuide', () => {
  it('returns no crop when 8x10 matches a 4:5 plate', () => {
    const result = cropGuide(0.8, '8x10')
    expect(result.insetPct.top).toBe(0)
    expect(result.insetPct.bottom).toBe(0)
    expect(result.insetPct.left).toBe(0)
    expect(result.insetPct.right).toBe(0)
    expect(result.label).toBe('8×10')
  })

  it('returns no crop when 16x20 matches a 4:5 plate', () => {
    const result = cropGuide(0.8, '16x20')
    expect(result.insetPct.top).toBe(0)
    expect(result.insetPct.bottom).toBe(0)
    expect(result.insetPct.left).toBe(0)
    expect(result.insetPct.right).toBe(0)
    expect(result.label).toBe('16×20')
  })

  it('crops left/right when 4x6 is narrower than a 4:5 plate', () => {
    const result = cropGuide(0.8, '4x6')
    expect(result.insetPct.left).toBeGreaterThan(0)
    expect(result.insetPct.right).toBeGreaterThan(0)
    expect(result.insetPct.top).toBe(0)
    expect(result.insetPct.bottom).toBe(0)
    expect(result.insetPct.left).toBeCloseTo(8.333, 2)
    expect(result.insetPct.right).toBeCloseTo(8.333, 2)
    expect(result.label).toBe('4×6')
  })

  it('crops left/right on a landscape plate when target is narrower', () => {
    const result = cropGuide(1.5, '8x10')
    expect(result.insetPct.left).toBeGreaterThan(0)
    expect(result.insetPct.right).toBeGreaterThan(0)
    expect(result.insetPct.top).toBe(0)
    expect(result.insetPct.bottom).toBe(0)
    expect(result.insetPct.left).toBeCloseTo(8.333, 2)
    expect(result.insetPct.right).toBeCloseTo(8.333, 2)
    expect(result.label).toBe('10×8')
  })

  it('crops top/bottom when target is wider than the plate', () => {
    const result = cropGuide(0.6, '8x10')
    expect(result.insetPct.top).toBeGreaterThan(0)
    expect(result.insetPct.bottom).toBeGreaterThan(0)
    expect(result.insetPct.left).toBe(0)
    expect(result.insetPct.right).toBe(0)
    expect(result.insetPct.top).toBeCloseTo(12.5, 2)
    expect(result.insetPct.bottom).toBeCloseTo(12.5, 2)
    expect(result.label).toBe('8×10')
  })

  it('keeps all insets within [0, 50] for every size on a 4:5 plate', () => {
    for (const size of Object.keys(SIZE_ASPECT)) {
      const { insetPct } = cropGuide(0.8, size)
      for (const inset of Object.values(insetPct)) {
        expect(inset).toBeGreaterThanOrEqual(0)
        expect(inset).toBeLessThanOrEqual(50)
      }
    }
  })

  it('returns zero insets for an unknown size with a best-effort label', () => {
    const result = cropGuide(0.8, '99x99')
    expect(result.insetPct.top).toBe(0)
    expect(result.insetPct.bottom).toBe(0)
    expect(result.insetPct.left).toBe(0)
    expect(result.insetPct.right).toBe(0)
    expect(result.label).toBe('99×99')
  })
})
