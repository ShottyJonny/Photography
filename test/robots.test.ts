import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// app/robots.ts reads env() for the sitemap URL; lib/env throws without a real
// SITE_URL, which is deliberate (a misconfigured deploy should die loudly).
vi.mock('@/lib/env', () => ({
  env: () => ({ siteUrl: 'https://www.jonhoffmanphotography.com' }),
}))

const { default: robots } = await import('@/app/robots')

/**
 * Replaces test/noindex.test.ts, which guarded the pre-launch blanket
 * `Disallow: /` and was written to be deleted once About, Contact and the legal
 * pages shipped. They shipped; the block is lifted. The guard is inverted
 * rather than dropped, so a noindex cannot creep back in unnoticed.
 *
 * These read source text, so they strip comments first. The predecessor did
 * not, and a comment *describing* the removal satisfied its regex -- the guard
 * passed against prose while the code it guarded was already gone.
 */
const withoutComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const source = (p: string) => withoutComments(readFileSync(resolve(process.cwd(), p), 'utf8'))

describe('robots', () => {
  it('lets crawlers into the site', () => {
    const { rules } = robots()
    const rule = Array.isArray(rules) ? rules[0] : rules
    expect(rule.userAgent).toBe('*')
    expect(rule.allow).toBe('/')
    expect(rule.disallow).not.toBe('/')
  })

  it('keeps /admin out of the crawl', () => {
    const { rules } = robots()
    const rule = Array.isArray(rules) ? rules[0] : rules
    expect(rule.disallow).toBe('/admin')
  })

  // Allowing crawlers in without telling them where the catalogue is leaves
  // them to find 24 print pages by following links. app/sitemap.ts lists them.
  it('points crawlers at the sitemap', () => {
    expect(robots().sitemap).toMatch(/^https?:\/\/.+\/sitemap\.xml$/)
  })

  it('declares no crawler restriction in the root layout', () => {
    // Its absence is what makes the site indexable; a re-added `robots` key
    // would silently un-launch the site with every check still green.
    expect(source('app/layout.tsx')).not.toMatch(/robots:/)
  })

  it('leaves the admin its own noindex', () => {
    // proxy.ts also sets X-Robots-Tag. Lifting the site-wide block must not
    // reach the admin, which is noindex on its own terms.
    expect(source('app/admin/layout.tsx')).toMatch(/index:\s*false/)
  })
})
