// Simple utility to determine recommended size based on existing aspect ratio logic
// Since we need this to work synchronously but aspect measurement is async,
// we'll use the same logic as PricingContext but simplified

import { measureAspects, isFourByFive } from './aspect'
import { products } from '../data/products'

// Cache for aspect-based size recommendations
let sizeCache: { [productId: string]: string } = {}
let isInitialized = false

// Initialize size cache based on aspect measurements
async function initSizeCache() {
  if (isInitialized) return
  
  try {
    const aspects = await measureAspects(products)
    aspects.forEach(aspect => {
      // Use same logic as PricingProvider: 4:5 ratio -> 8x10, others -> 4x6
      if (aspect.ratio > 0 && isFourByFive(aspect.ratio)) {
        sizeCache[aspect.id] = '8x10'
      } else {
        sizeCache[aspect.id] = '4x6'
      }
    })
    isInitialized = true
  } catch (error) {
    console.warn('Failed to measure aspects for size recommendations:', error)
    isInitialized = true // Mark as initialized to avoid retries
  }
}

// Get recommended size based on product aspect ratio
export function getRecommendedSize(productId: string): string {
  // If we have cached data, use it
  if (sizeCache[productId]) {
    return sizeCache[productId]
  }
  
  // If not initialized yet, trigger initialization
  if (!isInitialized) {
    initSizeCache() // Fire and forget
  }
  
  // Default fallback (will be updated once aspects are measured)
  return '4x6'
}

// Initialize cache when module loads
initSizeCache()