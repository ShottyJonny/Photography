import type { MetadataRoute } from 'next'

/**
 * TEMPORARY -- remove when the site is ready to be found.
 *
 * The storefront is live at a public Vercel URL but is not finished: the nav
 * links to About and Contact, neither of which exists, and there are no legal
 * pages (product.md §4). Stripe also expects a refund policy before real money.
 * Indexing it now publishes a site that cannot keep its own nav's promises.
 *
 * Paired with the `robots` metadata in app/layout.tsx -- robots.txt asks
 * crawlers not to fetch, the meta tag tells the ones that fetch anyway not to
 * index. Neither alone is sufficient.
 *
 * REMOVE BOTH when About, Contact and the legal pages ship.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  }
}
