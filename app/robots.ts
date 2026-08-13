import type { MetadataRoute } from 'next'
import { siteOrigin } from '@/lib/env'

/**
 * The pre-launch blanket `Disallow: /` is gone. It was paired with a `robots`
 * meta tag in app/layout.tsx and both were conditioned on About, Contact and
 * the legal pages shipping (product.md §4) -- they have, so both are lifted.
 *
 * `/admin` stays out. It is already unreachable without a session and carries
 * its own noindex twice over (app/admin/layout.tsx metadata, and an
 * X-Robots-Tag from proxy.ts), but there is no reason to spend crawl budget on
 * a surface that answers every request with a redirect to sign-in.
 */
/**
 * Not prerendered. The sitemap URL needs a site origin, and `lib/env` refuses
 * to invent one in production rather than silently emitting a localhost URL --
 * correct behaviour, but it means a CI runner with an empty environment cannot
 * build this page. `npm run build` must need no secrets, so this is resolved
 * per request instead, where SITE_URL genuinely exists.
 */
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/admin' },
    // Letting crawlers in without saying where the catalogue is leaves them to
    // discover every print page by following links. app/sitemap.ts lists them.
    // siteOrigin(), not env(): this route is prerendered at build time, where
    // there are no secrets to validate. See lib/env.ts.
    sitemap: `${siteOrigin()}/sitemap.xml`,
  }
}
