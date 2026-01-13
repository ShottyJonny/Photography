export const LANDSCAPE_PRODUCTS = new Set<string>([
  'print-npl-portfolio-prints-1', // Omniprominence (renamed from Golden Tides)
])

// Canonical 2x3 sizes (portrait-form stored) to consider for flipping
const SIZES_2x3_CANON = ['4x6','8x12','12x18','16x24','20x30','24x36','32x48']

export function displaySize(productId: string, size: string | undefined): string {
  if (!size) return ''
  if (!LANDSCAPE_PRODUCTS.has(productId)) return size
  if (!SIZES_2x3_CANON.includes(size)) return size
  const [a,b] = size.split('x').map(Number)
  if (!a || !b) return size
  if (a > b) return size // already landscape
  return `${b}x${a}`
}

export function landscapeOptionsIfNeeded(productId: string, sizes: readonly string[]): { value: string; label: string }[] {
  return sizes.map(s => ({ value: s, label: displaySize(productId, s) || s }))
}

export function isLandscapeProduct(id: string) {
  return LANDSCAPE_PRODUCTS.has(id)
}
