import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import * as port from '@/lib/pricing'

const require = createRequire(import.meta.url)
const legacy = require('./fixtures/legacy-pricing.cjs') as typeof port

const sizes = ['4x6', '5x7', '8x10', '11x14', '12x16', '16x20', '20x30']
const countries = ['us', 'usa', 'united states', 'United States', 'Canada', 'germany', '']
const regions = ['CA', 'NY', 'WA', 'TX', 'FL', 'IL', 'PA', 'MA', 'ZZ', ''] // every US_STATE_RATES key + unlisted + empty
const qtys = [1, 2, 100]

describe('pricing port is behaviorally identical to the legacy original', () => {
  for (const size of sizes)
    for (const country of countries)
      for (const region of regions)
        for (const qty of qtys) {
          it(`${size} · ${country} · ${region || '∅'} · x${qty}`, () => {
            const items = [{ name: 'Print', size, qty }]
            const addr = { country, region }
            // Both throw or both return — assert identical behavior either way.
            let a: unknown, b: unknown, ae: string | null = null, be: string | null = null
            try { a = port.computeOrderAmounts(items, addr) } catch (e) { ae = (e as Error).message }
            try { b = legacy.computeOrderAmounts(items, addr) } catch (e) { be = (e as Error).message }
            expect(ae).toBe(be)
            expect(a).toEqual(b)
          })
        }

  it('multi-item order (mixed sizes and quantities) matches the legacy original', () => {
    const items = [
      { name: 'A', size: '4x6', qty: 3 },
      { name: 'B', size: '20x30', qty: 1 },
      { name: 'C', size: '11x14', qty: 2 },
    ]
    const addr = { country: 'us', region: 'NY' }
    expect(port.computeOrderAmounts(items, addr)).toEqual(legacy.computeOrderAmounts(items, addr))
  })
})
