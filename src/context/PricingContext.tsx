import React, { createContext, useContext, useMemo, useEffect, useState } from 'react'
import { products } from '../data/products'
import { measureAspects, isFourByFive } from '../utils/aspect'

type Product = typeof products[number]

type Ctx = { priced: Product[] }

const PricingCtx = createContext<Ctx>({ priced: products })

// Fixed, global sizes and prices (in cents)
export const ALL_SIZES = ['4x6', '5x7', '8x10', '11x14', '12x16', '16x20', '20x30'] as const
export type PrintSize = typeof ALL_SIZES[number]

export const PRICE_BY_SIZE: Record<PrintSize, number> = {
  '4x6': 500,
  '5x7': 1000,
  '8x10': 1500,
  '11x14': 2000,
  '12x16': 3000,
  '16x20': 3500,
  '20x30': 6500,
}

export function priceForSize(size: PrintSize | string): number {
  const key = String(size).toLowerCase() as PrintSize
  return (PRICE_BY_SIZE as any)[key] ?? PRICE_BY_SIZE['8x10']
}

export function PricingProvider({ children }: { children: React.ReactNode }) {
  // Start with lowest size for display; update to 8x10 for any 4:5 images once measured
  const [priced, setPriced] = useState(() => products.map(p => ({ ...p, price: PRICE_BY_SIZE['4x6'] })))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const aspects = await measureAspects(products)
        const is4x5 = new Set(aspects.filter(a => a.ratio > 0 && isFourByFive(a.ratio)).map(a => a.id))
        if (cancelled) return
        setPriced(products.map(p => ({
          ...p,
          price: is4x5.has(p.id) ? PRICE_BY_SIZE['8x10'] : PRICE_BY_SIZE['4x6'],
        })))
      } catch {
        // ignore errors; keep default 4x6 pricing
      }
    })()
    return () => { cancelled = true }
  }, [])

  const value = useMemo<Ctx>(() => ({ priced }), [priced])
  return <PricingCtx.Provider value={value}>{children}</PricingCtx.Provider>
}

export function usePricing() { return useContext(PricingCtx) }
