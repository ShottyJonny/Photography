import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/env', async (orig) => {
  const actual = await orig<typeof import('@/lib/env')>()
  return { ...actual, siteOrigin: () => 'https://www.jonhoffmanphotography.com' }
})

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

// CLAUDE.md's gate table promises `npm run build` "needs no secrets". robots.txt
// is a STATIC route, so Next prerenders it at build time -- anything it reads is
// read on a CI runner with an empty environment. Calling env() there pulls in the
// Supabase and Stripe validation and breaks the build. It did exactly that.
describe('robots — buildable without secrets', () => {
  const SECRETS = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ]
  let saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    saved = {}
    for (const k of SECRETS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
  })
  afterEach(() => {
    for (const k of SECRETS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('renders with every secret absent, as a CI runner has them', async () => {
    vi.resetModules()
    process.env.SITE_URL = 'https://www.jonhoffmanphotography.com'
    const mod = await import('@/app/robots')
    expect(() => mod.default()).not.toThrow()
    expect(mod.default().sitemap).toBe('https://www.jonhoffmanphotography.com/sitemap.xml')
  })
})

// Neither route can be prerendered. robots.txt needs a site origin, and lib/env
// rightly refuses to invent one in production rather than emit a localhost URL;
// sitemap.xml additionally reads the catalogue. A CI runner has neither, so both
// resolve per request. /prints solves the identical problem the identical way.
describe('neither crawler route is prerendered', () => {
  it.each([
    ['robots', () => import('@/app/robots')],
    ['sitemap', () => import('@/app/sitemap')],
  ])('%s is force-dynamic, so the build never needs env', async (_name, load) => {
    const mod = (await load()) as { dynamic?: string }
    expect(mod.dynamic).toBe('force-dynamic')
  })
})
