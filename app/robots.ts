import type { MetadataRoute } from 'next'
import { env } from '@/lib/env'

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
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/admin' },
    // Letting crawlers in without saying where the catalogue is leaves them to
    // discover every print page by following links. app/sitemap.ts lists them.
    sitemap: `${env().siteUrl.replace(/\/$/, '')}/sitemap.xml`,
  }
}
