import type { MetadataRoute } from 'next'
import { siteOrigin } from '@/lib/env'
import { getPublishedPhotos } from '@/lib/data/photos'
import { getCollections } from '@/lib/data/collections'

/**
 * This route reads the catalogue, so it cannot be prerendered without Supabase
 * credentials -- and `npm run build` runs on a CI runner that has none. /prints
 * solves the identical problem the identical way. Serving it per request also
 * keeps it honest: a photograph published this morning is in it this morning.
 * The underlying reads are `unstable_cache`d for an hour, so this is cheap.
 */
export const dynamic = 'force-dynamic'

/**
 * Paired with app/robots.ts, which lifted the pre-launch crawler block.
 *
 * Both catalogue reads are already visibility-gated -- getPublishedPhotos
 * filters on `published`, and getCollections drops any collection with no
 * published photographs -- so a draft can never reach the sitemap. That gating
 * deliberately lives in the data layer rather than being re-implemented here;
 * a second unfiltered query is exactly how a draft leaks.
 *
 * Absent on purpose: /admin (gated, and disallowed in robots.txt), /checkout
 * and /order/[id] (per-visitor and per-order -- a crawler arriving at either
 * finds an empty cart or someone else's receipt).
 */
const STATIC_PATHS = [
  '/',
  '/prints',
  '/collections',
  '/about',
  '/contact',
  '/shipping',
  '/refunds',
  '/privacy',
  '/terms',
] as const

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteOrigin()
  const [photos, collections] = await Promise.all([getPublishedPhotos(), getCollections()])

  return [
    ...STATIC_PATHS.map((path) => ({ url: `${base}${path}` })),
    ...collections.map((c) => ({ url: `${base}/collections/${c.slug}` })),
    ...photos.map((p) => ({ url: `${base}/prints/${p.slug}` })),
  ]
}
