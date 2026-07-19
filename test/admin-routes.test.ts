import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = process.cwd()

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

describe('admin route structure', () => {
  const files = walk(resolve(ROOT, 'app/admin')).map((f) => f.replace(/\\/g, '/'))

  it('places every page and route handler under (protected), except sign-in', () => {
    const routes = files.filter((f) => /\/(page|route)\.tsx?$/.test(f))
    const unguarded = routes.filter(
      (f) => !f.includes('/(protected)/') && !f.endsWith('/admin/sign-in/page.tsx'),
    )
    expect(unguarded, `unguarded admin routes: ${unguarded.join(', ')}`).toEqual([])
  })

  it('has no app/admin/page.tsx (it would collide with (protected)/page.tsx)', () => {
    expect(existsSync(resolve(ROOT, 'app/admin/page.tsx'))).toBe(false)
  })
})

describe("every 'use server' export guards itself", () => {
  // signIn is public by design; signOut is a no-op when unauthenticated.
  // Listed explicitly so adding a third exemption is a deliberate act.
  const EXEMPT = new Set(['signIn', 'signOut'])

  it('calls requireAdmin, or is a named exemption', () => {
    // Walk all three admin directories: slices 5-7 will add inline 'use server'
    // actions inside components, not only in lib/admin.
    const files = [
      ...walk(resolve(ROOT, 'lib/admin')),
      ...walk(resolve(ROOT, 'app/admin')),
      ...walk(resolve(ROOT, 'components/admin')),
    ].filter((f) => /\.tsx?$/.test(f))
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      if (!/['"]use server['"]/.test(source)) continue

      for (const match of source.matchAll(/export async function (\w+)/g)) {
        const name = match[1]
        if (EXEMPT.has(name)) continue
        const body = source.slice(match.index ?? 0)
        const end = body.indexOf('\nexport ', 1)
        const fnBody = end === -1 ? body : body.slice(0, end)
        if (!fnBody.includes('requireAdmin')) {
          offenders.push(`${file.replace(/\\/g, '/')}: ${name}`)
        }
      }
    }

    expect(offenders, `server actions missing requireAdmin: ${offenders.join(', ')}`).toEqual([])
  })
})
