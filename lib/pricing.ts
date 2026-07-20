/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
// VERBATIM port of the legacy netlify/functions/lib/pricing.js (spec §4.1).
// Inputs are `any` on purpose: these functions accept UNTRUSTED request data
// and validate it at runtime. Do NOT tighten types into the bodies or change
// any value/branch — the golden equivalence test guards against drift.

const ALL_SIZES = ['4x6', '5x7', '8x10', '11x14', '12x16', '16x20', '20x30']

const PRICE_BY_SIZE: Record<string, number> = {
  '4x6': 500,
  '5x7': 1000,
  '8x10': 1500,
  '11x14': 2000,
  '12x16': 3000,
  '16x20': 3500,
  '20x30': 6500,
}

const US_STATE_RATES: Record<string, number> = {
  CA: 0.0825, NY: 0.0887, WA: 0.092, TX: 0.0825,
  FL: 0.07, IL: 0.1025, PA: 0.06, MA: 0.0625,
}

function isUnitedStates(country: any) {
  const c = String(country).trim().toLowerCase()
  return c === 'united states' || c === 'usa' || c === 'us'
}

function estimateTaxRate(country: any, region?: any) {
  if (!country) return { rate: 0, source: 'none' }
  const c = String(country).trim().toLowerCase()
  if (c === 'united states' || c === 'usa' || c === 'us') {
    const code = String(region || '').trim().toUpperCase()
    if (!code) return { rate: 0, source: 'us-state', note: 'Enter state for estimate' }
    const rate = US_STATE_RATES[code] ?? 0.06 // fallback nominal 6%
    return { rate, source: 'us-state' }
  }
  return { rate: 0.12, source: 'country-flat', note: 'Flat international estimate' }
}

function estimateShipping(subtotalCents: any, country?: any, method?: any) {
  const base = 995
  return { cost: base, free: false, threshold: Infinity, note: undefined as string | undefined }
}

const MAX_QTY = 100
const MAX_NAME_LEN = 200

function computeOrderAmounts(items: any, shippingAddress: any) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Order must include at least one item')
  }

  if (!shippingAddress || typeof shippingAddress !== 'object' || Array.isArray(shippingAddress)) {
    throw new Error('Shipping address is required')
  }
  if (typeof shippingAddress.country !== 'string' || shippingAddress.country.trim() === '') {
    throw new Error('Shipping country is required')
  }
  const country = shippingAddress.country
  const region = typeof shippingAddress.region === 'string' ? shippingAddress.region : ''
  if (isUnitedStates(country) && region.trim() === '') {
    throw new Error('Shipping region is required for US destinations')
  }

  const lineItems = items.map((item: any) => {
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
    const unit = PRICE_BY_SIZE[size]
    const rawName = item && item.name != null ? String(item.name) : 'Print'
    const name = rawName.slice(0, MAX_NAME_LEN)
    return { name, size, qty, unit, amount: unit * qty }
  })

  const subtotal = lineItems.reduce((sum: number, li: any) => sum + li.amount, 0)
  const shippingEst = estimateShipping(subtotal, country)
  const shipping = shippingEst.cost
  const taxRate = estimateTaxRate(country, region)
  const tax = Math.round(subtotal * taxRate.rate)
  const total = subtotal + shipping + tax

  return { lineItems, subtotal, shipping, tax, total }
}

export { ALL_SIZES, PRICE_BY_SIZE, estimateTaxRate, estimateShipping, computeOrderAmounts }
