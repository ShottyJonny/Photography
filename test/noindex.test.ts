import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import robots from '@/app/robots'

/**
 * Guards the TEMPORARY pre-launch noindex (app/robots.ts, app/layout.tsx).
 *
 * When About, Contact and the legal pages ship, this whole file is deleted
 * alongside them -- it exists so the noindex cannot be dropped by accident
 * before then, and so removing it is a deliberate act with a failing test to
 * point at.
 */
describe('pre-launch noindex', () => {
  it('robots.txt disallows every crawler from the whole site', () => {
    const { rules } = robots()
    const rule = Array.isArray(rules) ? rules[0] : rules
    expect(rule.userAgent).toBe('*')
    expect(rule.disallow).toBe('/')
  })

  it('the root layout also declares noindex, nofollow', () => {
    // robots.txt asks crawlers not to fetch; the meta tag covers the ones that
    // fetch anyway. A crawler ignoring the first would otherwise index freely.
    const layout = readFileSync(resolve(process.cwd(), 'app/layout.tsx'), 'utf8')
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/)
  })

  it('does not weaken the admin’s own noindex', () => {
    // proxy.ts sets X-Robots-Tag and app/admin/layout.tsx sets its own metadata.
    // The site-wide rule is additive; the admin must stay noindex after removal.
    const adminLayout = readFileSync(resolve(process.cwd(), 'app/admin/layout.tsx'), 'utf8')
    expect(adminLayout).toMatch(/index:\s*false/)
  })
})
