// Simple estimation utilities for tax and shipping.
// These are NOT production-accurate; they provide reasonable demo behavior.

// Basic US state estimated combined rates (subset + default).
const US_STATE_RATES: Record<string, number> = {
  CA: 0.0825,
  NY: 0.0887,
  WA: 0.092,
  TX: 0.0825,
  FL: 0.07,
  IL: 0.1025,
  PA: 0.06,
  MA: 0.0625,
  // default fallback handled below
}

export type TaxEstimate = { rate: number; source: string; note?: string }

export function estimateTaxRate(country: string, region: string): TaxEstimate {
  if (!country) return { rate: 0, source: 'none' }
  const c = country.trim().toLowerCase()
  if (c === 'united states' || c === 'usa' || c === 'us') {
    const code = (region || '').trim().toUpperCase()
    if (!code) return { rate: 0, source: 'us-state', note: 'Enter state for estimate' }
    const rate = US_STATE_RATES[code] ?? 0.06 // fallback nominal 6%
    return { rate, source: 'us-state' }
  }
  // Simple international flat VAT-style placeholder 12% (could vary by country).
  return { rate: 0.12, source: 'country-flat', note: 'Flat international estimate' }
}

export type ShippingMethod = 'standard'
export type ShippingEstimate = { cost: number; free: boolean; threshold: number; note?: string }

export function estimateShipping(subtotalCents: number, country: string, method: ShippingMethod = 'standard'): ShippingEstimate {
  const domestic = /^(united states|usa|us)$/i.test(country.trim())
  // Free shipping disabled; flat base costs.
  const threshold = Infinity
  // Base cost: standard = $9.95 everywhere.
  const base = 995
  const free = false
  return {
    cost: base,
    free,
    threshold,
    note: undefined
  }
}

function fmtCurrency(cents: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100)
}
