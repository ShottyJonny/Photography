import { describe, it, expect } from 'vitest'
import { derivativeSrc, DERIVATIVE_WIDTHS } from '@/lib/images/derivatives'
import { originalKey, derivativeKey, ORIGINALS_BUCKET, DERIVATIVES_BUCKET } from '@/lib/ingest/keys'
import { derivativePlan, expectedObjects, QUALITY } from '@/lib/ingest/plan'

describe('storage keys', () => {
  it('names the two buckets from schema.sql', () => {
    expect(ORIGINALS_BUCKET).toBe('originals')
    expect(DERIVATIVES_BUCKET).toBe('derivatives')
  })

  it('builds a bucket-relative original key', () => {
    expect(originalKey('evil-lies', 'colour', 'jpg')).toBe('evil-lies/colour.jpg')
    expect(originalKey('evil-lies', 'silver', 'tif')).toBe('evil-lies/silver.tif')
  })

  it('normalises the extension to lowercase and strips a leading dot', () => {
    expect(originalKey('evil-lies', 'colour', '.JPG')).toBe('evil-lies/colour.jpg')
  })

  it('builds a bucket-relative derivative key', () => {
    expect(derivativeKey('evil-lies', 'colour', 1800, 'avif')).toBe('evil-lies/colour/1800.avif')
    expect(derivativeKey('evil-lies', 'silver', 160, 'webp')).toBe('evil-lies/silver/160.webp')
  })
})

describe('the anti-drift lock against the storefront read path', () => {
  // components/store/Plate.tsx requests these URLs unconditionally. If ingest
  // writes anywhere else, every photograph is a srcset of 404s and nothing logs.
  it('derivativeKey is exactly the tail of what derivativeSrc requests', () => {
    for (const width of DERIVATIVE_WIDTHS) {
      for (const format of ['avif', 'webp'] as const) {
        for (const register of ['colour', 'silver'] as const) {
          const url = derivativeSrc('evil-lies', register, width, format)
          const key = derivativeKey('evil-lies', register, width, format)
          expect(url.endsWith(`/${key}`)).toBe(true)
        }
      }
    }
  })
})

describe('derivativePlan', () => {
  it('emits one job per width per format', () => {
    const jobs = derivativePlan('evil-lies', 'colour')
    expect(jobs).toHaveLength(DERIVATIVE_WIDTHS.length * 2)
  })

  it('covers every width in both formats exactly once', () => {
    const jobs = derivativePlan('evil-lies', 'colour')
    for (const width of DERIVATIVE_WIDTHS) {
      expect(jobs.filter((j) => j.width === width && j.format === 'avif')).toHaveLength(1)
      expect(jobs.filter((j) => j.width === width && j.format === 'webp')).toHaveLength(1)
    }
  })

  it('gives the small widths a cheaper quality than the plate widths', () => {
    const jobs = derivativePlan('evil-lies', 'colour')
    const q = (w: number, f: 'avif' | 'webp') =>
      jobs.find((j) => j.width === w && j.format === f)!.quality
    // 160 is the home bleed: blurred 90px and scaled 1.12 (product.md §3.2).
    expect(q(160, 'avif')).toBe(QUALITY.small.avif)
    expect(q(1800, 'avif')).toBe(QUALITY.plate.avif)
    expect(q(160, 'avif')).toBeLessThan(q(1800, 'avif'))
  })
})

describe('expectedObjects', () => {
  it('is 12 objects for a colour-only photo', () => {
    expect(expectedObjects('evil-lies', false)).toHaveLength(12)
  })

  it('is 24 objects when a silver variant exists', () => {
    expect(expectedObjects('evil-lies', true)).toHaveLength(24)
  })

  it('contains no silver key when there is no silver variant', () => {
    expect(expectedObjects('evil-lies', false).some((k) => k.includes('/silver/'))).toBe(false)
  })

  it('matches derivativePlan key-for-key', () => {
    const fromPlan = [
      ...derivativePlan('evil-lies', 'colour').map((j) => j.key),
      ...derivativePlan('evil-lies', 'silver').map((j) => j.key),
    ].sort()
    expect(expectedObjects('evil-lies', true).slice().sort()).toEqual(fromPlan)
  })
})
