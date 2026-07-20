import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const schema = readFileSync(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8')
const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))

describe('photos.derivatives_ready', () => {
  it('adds the column, idempotently', () => {
    expect(schema).toMatch(
      /alter table photos add column if not exists derivatives_ready boolean not null default false/,
    )
  })

  it('gates publishing on it, with a drop-first idempotent constraint', () => {
    expect(schema).toMatch(/drop constraint if exists derivatives_required_when_published/)
    expect(schema).toMatch(
      /add constraint derivatives_required_when_published\s+check \(not published or derivatives_ready\)/,
    )
  })

  it('no longer calls an unpublished photo "unlisted" (product.md §8 q4 closed)', () => {
    // The old comment read: `published ... -- false = unlisted (§8 q4)`.
    // q4 is closed: the state is Draft, which is what RLS already enforces.
    const publishedLine = schema.split('\n').find((l) => /^\s*published\s+boolean/.test(l)) ?? ''
    expect(publishedLine).not.toMatch(/unlisted/)
    expect(publishedLine).toMatch(/draft/)
  })
})

describe('sharp is a runtime dependency', () => {
  it('is in dependencies, not devDependencies', () => {
    // It runs inside a Server Action on the deployed server, so a devDependency
    // is not installed at runtime. It had zero importers before this slice.
    expect(pkg.dependencies).toHaveProperty('sharp')
    expect(pkg.devDependencies ?? {}).not.toHaveProperty('sharp')
  })
})
