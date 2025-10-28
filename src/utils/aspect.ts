import { products as all } from '../data/products'

export type AspectInfo = { id: string; name: string; src: string; w: number; h: number; ratio: number }

export async function measureAspects(products = all): Promise<AspectInfo[]> {
  const loadOne = (src: string) => new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
  const results: AspectInfo[] = []
  for (const p of products) {
    // Use full-size for accurate aspect (thumbs might be cropped)
    const src = p.image || p.thumbnail || ''
    try {
      const { w, h } = await loadOne(src)
      results.push({ id: p.id, name: p.name, src, w, h, ratio: w / h })
    } catch {
      results.push({ id: p.id, name: p.name, src, w: 0, h: 0, ratio: 0 })
    }
  }
  return results
}

export function isFourByFive(ratio: number, tolerance = 0.04) {
  // 4:5 portrait (0.8) or 5:4 landscape (1.25)
  return Math.abs(ratio - 0.8) <= tolerance || Math.abs(ratio - 1.25) <= tolerance
}

export function isTwoByThree(ratio: number, tolerance = 0.04) {
  // 2:3 portrait (~0.6667) or 3:2 landscape (1.5)
  return Math.abs(ratio - (2/3)) <= tolerance || Math.abs(ratio - (3/2)) <= tolerance
}
