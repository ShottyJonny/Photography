// Server-side pricing authority for Netlify checkout functions.
//
// CANONICAL SOURCES — this file is a mirror of client-side logic in:
//   - src/context/PricingContext.tsx  (ALL_SIZES, PRICE_BY_SIZE)
//   - src/utils/taxShipping.ts        (estimateTaxRate, estimateShipping)
//
// If either of those files changes, THIS FILE MUST BE UPDATED TO MATCH.
// The client-side values are for display only. This module is the sole
// source of truth for what a customer is actually charged — never trust
// price, unit, or totals fields sent from the browser.

'use strict'

// Mirrors src/context/PricingContext.tsx:12 (ALL_SIZES)
const ALL_SIZES = ['4x6', '5x7', '8x10', '11x14', '12x16', '16x20', '20x30']

// Mirrors src/context/PricingContext.tsx:15-23 (PRICE_BY_SIZE)
// Price is keyed ONLY by size; it does not depend on the product.
const PRICE_BY_SIZE = {
  '4x6': 500,
  '5x7': 1000,
  '8x10': 1500,
  '11x14': 2000,
  '12x16': 3000,
  '16x20': 3500,
  '20x30': 6500,
}

// Mirrors src/utils/taxShipping.ts US_STATE_RATES
const US_STATE_RATES = {
  CA: 0.0825,
  NY: 0.0887,
  WA: 0.092,
  TX: 0.0825,
  FL: 0.07,
  IL: 0.1025,
  PA: 0.06,
  MA: 0.0625,
}

// Mirrors src/utils/taxShipping.ts estimateTaxRate() exactly.
function estimateTaxRate(country, region) {
  if (!country) return { rate: 0, source: 'none' }
  const c = String(country).trim().toLowerCase()
  if (c === 'united states' || c === 'usa' || c === 'us') {
    const code = String(region || '').trim().toUpperCase()
    if (!code) return { rate: 0, source: 'us-state', note: 'Enter state for estimate' }
    const rate = US_STATE_RATES[code] ?? 0.06 // fallback nominal 6%
    return { rate, source: 'us-state' }
  }
  // Simple international flat VAT-style placeholder 12% (could vary by country).
  return { rate: 0.12, source: 'country-flat', note: 'Flat international estimate' }
}

// Mirrors src/utils/taxShipping.ts estimateShipping() exactly.
// NOTE: as of the canonical source, this ALWAYS returns a flat $9.95
// (995 cents) regardless of destination or subtotal. Free shipping is
// disabled there. Do not "improve" this here without updating the client.
function estimateShipping(subtotalCents, country, method) {
  const base = 995
  return {
    cost: base,
    free: false,
    threshold: Infinity,
    note: undefined,
  }
}

const MAX_QTY = 100
const MAX_NAME_LEN = 200

/**
 * computeOrderAmounts(items, shippingAddress) -> { lineItems, subtotal, shipping, tax, total }
 *
 * PURE function. The server-side authority on order pricing.
 *
 * - `item.unit` and any client-supplied `totals` are IGNORED entirely.
 *   Price is derived solely from `item.size` via PRICE_BY_SIZE.
 * - `item.size` MUST be a member of ALL_SIZES or this throws (no silent
 *   fallback to a default size/price, unlike the client's priceForSize()).
 * - `item.qty` MUST be a positive integer, capped at MAX_QTY.
 * - `item.name` is used only as a cosmetic Stripe line-item label.
 * - shipping/tax are computed server-side from `shippingAddress`.
 *
 * Throws Error on any invalid input; callers should treat thrown errors
 * as a 400-worthy validation failure and must not echo raw input back
 * to the client in the response.
 */
function computeOrderAmounts(items, shippingAddress) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Order must include at least one item')
  }

  const addr = shippingAddress && typeof shippingAddress === 'object' ? shippingAddress : {}
  const country = typeof addr.country === 'string' ? addr.country : ''
  const region = typeof addr.region === 'string' ? addr.region : ''

  const lineItems = items.map((item) => {
    const size = item && item.size

    if (typeof size !== 'string' || !ALL_SIZES.includes(size)) {
      throw new Error('Invalid item size')
    }

    const qty = item && item.qty
    if (typeof qty !== 'number' || !Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
      throw new Error('Invalid item quantity')
    }
    if (qty > MAX_QTY) {
      throw new Error('Item quantity exceeds maximum allowed')
    }

    // Price comes ONLY from the server-side size table. item.unit is ignored.
    const unit = PRICE_BY_SIZE[size]

    const rawName = item && item.name != null ? String(item.name) : 'Print'
    const name = rawName.slice(0, MAX_NAME_LEN)

    return {
      name,
      size,
      qty,
      unit,
      amount: unit * qty,
    }
  })

  const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0)

  // totals from the client are never consulted; shipping/tax are recomputed here.
  const shippingEst = estimateShipping(subtotal, country)
  const shipping = shippingEst.cost

  const taxRate = estimateTaxRate(country, region)
  const tax = Math.round(subtotal * taxRate.rate)

  const total = subtotal + shipping + tax

  return { lineItems, subtotal, shipping, tax, total }
}

module.exports = {
  ALL_SIZES,
  PRICE_BY_SIZE,
  estimateTaxRate,
  estimateShipping,
  computeOrderAmounts,
}
