# Slice 5a — Admin Ingest Pipeline + Surface C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A photograph goes in through the browser — original stored privately, derivative ladder generated, row written — and appears on the live storefront.

**Architecture:** The browser uploads originals **directly to Supabase Storage** via a server-issued signed upload URL, because Vercel caps serverless request bodies at 4.5 MB and originals are 30–40 MB. Four Server Actions then do the rest, each calling `requireAdmin()` as its first statement. Derivative generation is **staged one call per register** for I/O headroom and resumability. A `derivatives_ready` column plus a Postgres `check` constraint make publishing an incomplete ladder impossible.

**Tech Stack:** Next.js 16.2 (App Router, Turbopack), React 19, TypeScript strict, `@supabase/supabase-js` 2.76, `@supabase/ssr`, `@supabase/storage-js` 2.110.7, `sharp` 0.35.3, Vitest 2.1, zod 3.24.

**Spec:** `docs/superpowers/specs/2026-07-19-admin-ingest-design.md`. Read it before starting.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Branch `slice-5`**, off `develop` at `6b1d563`. Never commit to `develop` or `main`. Never `--no-verify`, `--force`, or bypass hooks.
- **Every commit message ends with:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **The gate is four checks, all must stay green:** `npm run lint` (0 errors AND 0 warnings), `npm run typecheck` (0 errors), `npm run build`, `npm test`.
- **Test baseline: 1687 passing in 37 files.** Never let this number go down. (`CLAUDE.md` says 1498 — stale. Ignore it.)
- **`requireAdmin()` is the first statement of every Server Action and every admin data read.** Import from `@/lib/admin/require-admin`. `test/admin-routes.test.ts` enforces this by walking `lib/admin/`, `app/admin/` and `components/admin/` for files containing `'use server'` and requiring the literal string `requireAdmin` inside each `export async function` body. **Do not add an exemption to that test.**
- **`import 'server-only'` at the top of every server-only module.** Vitest neutralises it via `test/stubs/server-only.ts`.
- **DB is snake_case, no exceptions.**
- **Money code is untouched.** Do not edit `lib/pricing.ts`, `lib/checkout/*`, `lib/orders/*`, `app/api/checkout/*`, `app/api/stripe-webhook/*`.
- **Storefront read path is untouched.** Do not edit `lib/images/derivatives.ts`, `components/store/Plate.tsx`, `lib/product/crop.ts`, `components/product/CropGuide.tsx`, `lib/data/photos.ts`, `lib/data/collections.ts`.
- **Apostrophes in JSX are `’` (U+2019), never `'`.** `react/no-unescaped-entities` ships in `eslint-config-next` and lint is a 0-warning gate.
- **No `@testing-library/jest-dom`.** `.toBeInTheDocument()` etc. do not exist. Assert on `document.querySelector`, `textContent`, `getAttribute`.
- **Never construct a real Supabase client in a test.** Node 20 (CI) has no global `WebSocket`; it passes locally on Node 22 and fails on CI. Mock the module.
- **Mock `redirect()` to *throw*** a `NEXT_REDIRECT`-shaped error, never a no-op.
- **Admin token scope:** all styling lives under `[data-admin]` in `app/globals.css`, appended after the existing admin block. Class names are prefixed `admin-`. Form-control borders use `--hairform`, never `--hair`. `min-height: 44px` on every interactive control. **No rule may set `outline: none`** — `test/admin-tokens.test.ts` fails if one does.
- **Labels are written sentence case in JSX and uppercased by CSS `text-transform`**, so tests query sentence case.
- **Vitest config:** `environment: 'node'`, with `jsdom` applied to `test/**/*.test.tsx` via `environmentMatchGlobs`. Alias `@` → repo root.

### Blocking values — STOP if these are unfilled

Two values come from Jon's Supabase dashboard. **They are not yet recorded.** If you reach a task that needs one and it still reads `<UNFILLED>`, **stop and ask** — do not guess.

| Value | Used in | Status |
|---|---|---|
| `select count(*) as total, count(*) filter (where published) as published from photos;` | Task 1 — a `check` constraint validates existing rows, so a published row with no derivatives makes the migration fail | **`<UNFILLED>` — hard blocker** |
| The `originals` bucket file-size limit (Supabase dashboard → Storage → originals → Settings) | Task 4 — becomes `MAX_UPLOAD_BYTES` | **Not blocking.** Task 4 uses Supabase's documented default of 50 MB; verify and correct |

---

## File Structure

```
supabase/schema.sql                              MODIFY  derivatives_ready + constraint + 3 comment fixes
package.json                                     MODIFY  sharp devDependencies → dependencies
next.config.ts                                   MODIFY  serverExternalPackages: ['sharp']; delete stale comment

lib/ingest/slug.ts                               NEW  pure   deriveSlug
lib/ingest/keys.ts                               NEW  pure   originalKey / derivativeKey  (paths WITHIN a bucket)
lib/ingest/plan.ts                               NEW  pure   derivativePlan / expectedObjects / QUALITY
lib/ingest/validate.ts                           NEW  pure   mime allowlist, size cap, MIN_WIDTH, rejection copy
lib/ingest/process.ts                            NEW  server  sharp: measure / encodeLadder
lib/ingest/actions.ts                            NEW  'use server'  the five actions
lib/ingest/types.ts                              NEW  shared types (no 'use server' — see Task 6)
lib/data/photos-admin.ts                         NEW  server  admin photo reads

components/admin/Dropzone.tsx                    NEW  'use client'
components/admin/CropPreview.tsx                 NEW  'use client'
components/admin/IngestProgress.tsx              NEW  'use client'
components/admin/IngestForm.tsx                  NEW  'use client'  orchestrates the four actions
components/admin/PhotoList.tsx                   NEW  server
components/admin/AdminNav.tsx                    MODIFY  Photographs becomes live

app/admin/(protected)/photographs/page.tsx       NEW  the landing
app/admin/(protected)/photographs/new/page.tsx   NEW  Surface C
app/globals.css                                  MODIFY  append .admin-ingest-* / .admin-photolist-*
CLAUDE.md                                        MODIFY  baseline, lib/ingest layer
design.md / product.md / supabase/schema.sql     MODIFY  writeback (Task 11)

test/ingest-schema.test.ts        NEW
test/ingest-slug.test.ts          NEW
test/ingest-core.test.ts          NEW  keys + plan + the anti-drift assertion
test/ingest-validate.test.ts      NEW
test/ingest-pipeline.test.ts      NEW  REAL sharp
test/ingest-actions.test.ts       NEW
test/ingest-surface.test.tsx      NEW
test/photographs-landing.test.tsx NEW
test/admin-nav.test.tsx           MODIFY  two live links now
```

**Key boundary decision:** `keys.ts` returns paths **within** a bucket, not including the bucket name. `lib/images/derivatives.ts` already builds its public URL as `${SUPABASE_URL}/storage/v1/object/public/derivatives` + `/${slug}/${register}/${width}.${ext}`, and `supabase.storage.from('derivatives').upload(path)` takes the same bucket-relative path. `product.md §3.2` writes the keys bucket-first as prose; the code splits them. Task 3's anti-drift test locks the two together.

---

## Task 1: Schema migration, dependencies, config

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `package.json`
- Modify: `next.config.ts`
- Test: `test/ingest-schema.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: the `photos.derivatives_ready` column and the `derivatives_required_when_published` constraint, relied on by Task 6. `sharp` importable from server code, relied on by Task 5.

> **STOP GATE.** This task applies a `check` constraint, which validates existing rows. Read the blocking value for the `photos` count above. If it is `<UNFILLED>`, stop and ask Jon to run:
> ```sql
> select count(*) as total, count(*) filter (where published) as published from photos;
> ```
> If `published > 0`, **stop and ask** — do not write a migration that flips `derivatives_ready` to `true` on existing rows. That would defeat the constraint on its first day, on exactly the rows whose derivatives are least likely to exist.

- [ ] **Step 1: Write the failing test**

Create `test/ingest-schema.test.ts`. This mirrors the existing `test/admin-tokens.test.ts` pattern of asserting on a source file's text, which is how a non-executable artifact gets test coverage in this repo.

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ingest-schema.test.ts`
Expected: FAIL — all five assertions fail (no column, no constraint, comment still says "unlisted", sharp in devDependencies).

- [ ] **Step 3: Apply the schema change**

In `supabase/schema.sql`, find the `photos` table's `published` column line:

```sql
  published       boolean not null default false,  -- false = unlisted (§8 q4)
```

Replace it with:

```sql
  published       boolean not null default false,  -- false = draft (§8 q4 CLOSED)
```

Then find the `aura` comment block that begins `-- \`aura\` is SPECULATIVE, not a feature` and append to the end of that block:

```sql
-- RESOLVED 2026-07-19 (design.md §10 q3, slice 5a): the column IS written at
-- ingest, as the single {r,g,b} sharp's stats().dominant returns -- which is
-- also the shape legacy averageColor() returned, so the mock's THREE swatches
-- are reconciled by dropping them, not by inventing two more. Nothing reads it,
-- deliberately, and design.md §11.4-C's "Aura -- computed" tile is NOT built.
```

Then, immediately after the `create table if not exists photos (...)` statement and before the `aura` comment block, add:

```sql
-- product.md §3.2 / slice 5a. The sibling of alt_text_required_when_published,
-- and it exists for the same reason: Postgres refusing the bad state beats
-- trusting the UI to prevent it.
--
-- components/store/Plate.tsx emits all six srcset widths in BOTH formats
-- unconditionally. A published photo with a half-built ladder is therefore a
-- srcset of 404s -- a broken gallery, live, with nothing logging an error.
-- derivatives_ready is set only after finishIngest verifies every expected
-- object actually exists in the bucket.
alter table photos add column if not exists derivatives_ready boolean not null default false;

alter table photos drop constraint if exists derivatives_required_when_published;
alter table photos add constraint derivatives_required_when_published
  check (not published or derivatives_ready);
```

Also update the `aspect_ratio` inline comment from `-- measured once, at ingest` to `-- measured once, at ingest (slice 5a writes it)`.

- [ ] **Step 4: Move sharp to dependencies**

In `package.json`, remove `"sharp": "^0.35.3"` from `devDependencies` and add it to `dependencies`, keeping both blocks alphabetically ordered. `dependencies` becomes:

```json
  "dependencies": {
    "@supabase/ssr": "^0.7.0",
    "@supabase/supabase-js": "^2.76.1",
    "next": "^16.2.10",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "server-only": "^0.0.1",
    "sharp": "^0.35.3",
    "stripe": "^19.1.0",
    "ws": "^8.21.1",
    "zod": "^3.24.1"
  },
```

Note: keep the `@supabase/ssr` version at whatever is currently in the file — do not change it.

Then run `npm install` to refresh the lockfile.

- [ ] **Step 5: Update next.config.ts**

Replace the whole file. The `remotePatterns` comment is stale — `Plate.tsx` uses a raw `<picture>`, not `next/image`, so no remote pattern is ever needed.

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // sharp is a native binary. It must not be bundled by the server compiler --
  // it is required at runtime from node_modules instead. Verified present in
  // Next 16's config types (config-shared.d.ts: serverExternalPackages?: string[]).
  serverExternalPackages: ['sharp'],
  images: {
    // Intentionally empty. The storefront renders photographs through a raw
    // <picture> (components/store/Plate.tsx), never next/image, so the
    // derivatives bucket needs no remote pattern.
    remotePatterns: [],
  },
}

export default nextConfig
```

- [ ] **Step 6: Run the test and the gate**

Run: `npx vitest run test/ingest-schema.test.ts`
Expected: PASS, 5 tests.

Run: `npm run typecheck && npm run lint && npm run build && npm test`
Expected: all green, test count 1687 + 5 = **1692**.

- [ ] **Step 7: Apply the migration to Supabase**

**Jon runs this, not the agent** — a DDL statement against the live database is not an agent's to execute. Paste the two `alter table` statements into the Supabase SQL editor and run them. Confirm with:

```sql
select column_name, data_type, column_default from information_schema.columns
where table_name = 'photos' and column_name = 'derivatives_ready';
```

Expected: one row, `boolean`, default `false`.

- [ ] **Step 8: Commit**

```bash
git add supabase/schema.sql package.json package-lock.json next.config.ts test/ingest-schema.test.ts
git commit -m "feat(ingest): derivatives_ready gate, sharp as a runtime dep

Plate.tsx emits all six srcset widths in both formats unconditionally, so a
published photo with a half-built ladder is a srcset of 404s. The check
constraint makes that state unreachable, as alt_text_required_when_published
already does for missing alt text.

sharp moves devDependencies -> dependencies: it runs inside a Server Action,
where a devDependency is not installed. It had zero importers before now.

Also closes product.md §8 q4 in the schema comments (the state is Draft, not
unlisted) and records design.md §10 q3's resolution on the aura column.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `lib/ingest/slug.ts`

**Files:**
- Create: `lib/ingest/slug.ts`
- Test: `test/ingest-slug.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `deriveSlug(title: string): string`. Used by Task 6 (`beginIngest` validation) and Task 9 (the form derives the slug as the title is typed).

Slugs are load-bearing here in a way they usually are not: **storage is slug-keyed**, so the slug is frozen after save. `originals/<slug>/colour.jpg` and `derivatives/<slug>/colour/1800.avif` both embed it.

- [ ] **Step 1: Write the failing test**

Create `test/ingest-slug.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deriveSlug } from '@/lib/ingest/slug'

describe('deriveSlug', () => {
  it('lowercases and hyphenates a normal title', () => {
    expect(deriveSlug('If Gold Could Rust')).toBe('if-gold-could-rust')
  })

  it('strips diacritics rather than dropping the letter', () => {
    expect(deriveSlug('Café Solitude')).toBe('cafe-solitude')
    expect(deriveSlug('Æther Naïve')).toBe('aether-naive')
  })

  it('collapses runs of separators', () => {
    expect(deriveSlug('Evil   Lies')).toBe('evil-lies')
    expect(deriveSlug('Fly-by  —  Night')).toBe('fly-by-night')
  })

  it('drops punctuation entirely', () => {
    expect(deriveSlug("Don't Look Back!")).toBe('dont-look-back')
    expect(deriveSlug('20x30 (Portrait)')).toBe('20x30-portrait')
  })

  it('trims leading and trailing separators', () => {
    expect(deriveSlug('  --Gathering--  ')).toBe('gathering')
  })

  it('returns an empty string when nothing survives', () => {
    // The caller must treat '' as invalid; it must never become a storage path.
    expect(deriveSlug('!!!')).toBe('')
    expect(deriveSlug('   ')).toBe('')
    expect(deriveSlug('')).toBe('')
  })

  it('never emits a path separator, dot segment, or space', () => {
    // A slug becomes a storage path. These are the characters that would let a
    // title escape its own prefix.
    for (const evil of ['../../etc/passwd', 'a/b/c', 'a\\b', '...', 'a.b']) {
      const s = deriveSlug(evil)
      expect(s).not.toMatch(/[/\\.\s]/)
    }
  })

  it('is idempotent — slugifying a slug returns it unchanged', () => {
    expect(deriveSlug('if-gold-could-rust')).toBe('if-gold-could-rust')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ingest-slug.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/ingest/slug"`.

- [ ] **Step 3: Write the implementation**

Create `lib/ingest/slug.ts`:

```ts
/**
 * A slug is a STORAGE PATH SEGMENT, not merely a URL nicety.
 *
 * product.md §3.2 keys both buckets by slug -- originals/<slug>/<register>.<ext>
 * and derivatives/<slug>/<register>/<width>.<fmt> -- so anything that survives
 * this function ends up in an object key. It must therefore never emit `/`,
 * `\`, `.` or whitespace, or a title could escape its own prefix.
 *
 * It is also why the slug is frozen after save: renaming a photo later would
 * orphan every derivative, silently.
 */
export function deriveSlug(title: string): string {
  return title
    .normalize('NFKD')                  // é -> e + combining acute
    .replace(/[̀-ͯ]/g, '')    // drop the combining marks
    .replace(/æ/gi, 'ae')               // NFKD does not decompose these ligatures
    .replace(/œ/gi, 'oe')
    .replace(/ø/gi, 'o')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')        // everything else becomes a separator
    .replace(/-+/g, '-')                // collapse runs
    .replace(/^-|-$/g, '')              // trim
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/ingest-slug.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/slug.ts test/ingest-slug.test.ts
git commit -m "feat(ingest): deriveSlug, hardened as a storage path segment

A slug is not a URL nicety here -- product.md §3.2 keys both buckets by it,
so anything surviving this function lands in an object key. It can never emit
a path separator, dot segment, or whitespace.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `lib/ingest/keys.ts` + `lib/ingest/plan.ts`

**Files:**
- Create: `lib/ingest/keys.ts`
- Create: `lib/ingest/plan.ts`
- Test: `test/ingest-core.test.ts` (create)

**Interfaces:**
- Consumes: `DERIVATIVE_WIDTHS` from `@/lib/images/derivatives` (do **not** redeclare the widths).
- Produces:
  - `type Register = 'colour' | 'silver'`
  - `type DerivativeFormat = 'avif' | 'webp'`
  - `originalKey(slug: string, register: Register, ext: string): string`
  - `derivativeKey(slug: string, register: Register, width: number, format: DerivativeFormat): string`
  - `ORIGINALS_BUCKET`, `DERIVATIVES_BUCKET` constants
  - `derivativePlan(slug: string, register: Register): DerivativeJob[]` where `DerivativeJob = { key: string; width: number; format: DerivativeFormat; quality: number }`
  - `expectedObjects(slug: string, hasBwVariant: boolean): string[]`

The anti-drift test in this task is the most important assertion in the slice: it locks `derivativeKey` to what `lib/images/derivatives.ts` already requests. If the two ever diverge, ingest writes files the storefront never asks for and every photograph silently 404s.

- [ ] **Step 1: Write the failing test**

Create `test/ingest-core.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { derivativeSrc, DERIVATIVE_WIDTHS } from '@/lib/images/derivatives'
import { originalKey, derivativeKey, ORIGINALS_BUCKET, DERIVATIVES_BUCKET } from '@/lib/ingest/keys'
import { derivativePlan, expectedObjects, QUALITY } from '@/lib/ingest/plan'

describe('storage keys', () => {
  it('names the two buckets from schema.sql', () => {
    expect(ORIGINALS_BUCKET).toBe('originals')
    expect(DERIVATIVES_BUCKET).toBe('derivatives')
  })

  it('builds a bucket-relative original key', () => {
    expect(originalKey('evil-lies', 'colour', 'jpg')).toBe('evil-lies/colour.jpg')
    expect(originalKey('evil-lies', 'silver', 'tif')).toBe('evil-lies/silver.tif')
  })

  it('normalises the extension to lowercase and strips a leading dot', () => {
    expect(originalKey('evil-lies', 'colour', '.JPG')).toBe('evil-lies/colour.jpg')
  })

  it('builds a bucket-relative derivative key', () => {
    expect(derivativeKey('evil-lies', 'colour', 1800, 'avif')).toBe('evil-lies/colour/1800.avif')
    expect(derivativeKey('evil-lies', 'silver', 160, 'webp')).toBe('evil-lies/silver/160.webp')
  })
})

describe('the anti-drift lock against the storefront read path', () => {
  // components/store/Plate.tsx requests these URLs unconditionally. If ingest
  // writes anywhere else, every photograph is a srcset of 404s and nothing logs.
  it('derivativeKey is exactly the tail of what derivativeSrc requests', () => {
    for (const width of DERIVATIVE_WIDTHS) {
      for (const format of ['avif', 'webp'] as const) {
        for (const register of ['colour', 'silver'] as const) {
          const url = derivativeSrc('evil-lies', register, width, format)
          const key = derivativeKey('evil-lies', register, width, format)
          expect(url.endsWith(`/${key}`)).toBe(true)
        }
      }
    }
  })
})

describe('derivativePlan', () => {
  it('emits one job per width per format', () => {
    const jobs = derivativePlan('evil-lies', 'colour')
    expect(jobs).toHaveLength(DERIVATIVE_WIDTHS.length * 2)
  })

  it('covers every width in both formats exactly once', () => {
    const jobs = derivativePlan('evil-lies', 'colour')
    for (const width of DERIVATIVE_WIDTHS) {
      expect(jobs.filter((j) => j.width === width && j.format === 'avif')).toHaveLength(1)
      expect(jobs.filter((j) => j.width === width && j.format === 'webp')).toHaveLength(1)
    }
  })

  it('gives the small widths a cheaper quality than the plate widths', () => {
    const jobs = derivativePlan('evil-lies', 'colour')
    const q = (w: number, f: 'avif' | 'webp') =>
      jobs.find((j) => j.width === w && j.format === f)!.quality
    // 160 is the home bleed: blurred 90px and scaled 1.12 (product.md §3.2).
    expect(q(160, 'avif')).toBe(QUALITY.small.avif)
    expect(q(1800, 'avif')).toBe(QUALITY.plate.avif)
    expect(q(160, 'avif')).toBeLessThan(q(1800, 'avif'))
  })
})

describe('expectedObjects', () => {
  it('is 12 objects for a colour-only photo', () => {
    expect(expectedObjects('evil-lies', false)).toHaveLength(12)
  })

  it('is 24 objects when a silver variant exists', () => {
    expect(expectedObjects('evil-lies', true)).toHaveLength(24)
  })

  it('contains no silver key when there is no silver variant', () => {
    expect(expectedObjects('evil-lies', false).some((k) => k.includes('/silver/'))).toBe(false)
  })

  it('matches derivativePlan key-for-key', () => {
    const fromPlan = [
      ...derivativePlan('evil-lies', 'colour').map((j) => j.key),
      ...derivativePlan('evil-lies', 'silver').map((j) => j.key),
    ].sort()
    expect(expectedObjects('evil-lies', true).slice().sort()).toEqual(fromPlan)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ingest-core.test.ts`
Expected: FAIL — cannot resolve `@/lib/ingest/keys`.

- [ ] **Step 3: Write `lib/ingest/keys.ts`**

```ts
/**
 * Bucket-relative object paths.
 *
 * These deliberately do NOT include the bucket name. supabase.storage
 * .from('derivatives').upload(path) takes a bucket-relative path, and
 * lib/images/derivatives.ts already builds its public URL as
 * `.../object/public/derivatives` + `/${slug}/${register}/${width}.${ext}`.
 * product.md §3.2 writes them bucket-first as prose; the code splits them.
 * test/ingest-core.test.ts locks the two representations together.
 */
export const ORIGINALS_BUCKET = 'originals'
export const DERIVATIVES_BUCKET = 'derivatives'

export type Register = 'colour' | 'silver'
export type DerivativeFormat = 'avif' | 'webp'

export function originalKey(slug: string, register: Register, ext: string): string {
  const clean = ext.replace(/^\./, '').toLowerCase()
  return `${slug}/${register}.${clean}`
}

export function derivativeKey(
  slug: string,
  register: Register,
  width: number,
  format: DerivativeFormat,
): string {
  return `${slug}/${register}/${width}.${format}`
}
```

- [ ] **Step 4: Write `lib/ingest/plan.ts`**

```ts
import { DERIVATIVE_WIDTHS } from '@/lib/images/derivatives'
import { derivativeKey, type DerivativeFormat, type Register } from '@/lib/ingest/keys'

/**
 * Encode quality, split by what the width is actually FOR.
 *
 * sharp's AVIF default is q50, which is visibly soft on an 1800px plate for a
 * print portfolio. The 160 is the home bleed -- blurred 90px and scaled 1.12
 * (product.md §3.2) -- where quality is invisible and bytes are not.
 */
export const QUALITY = {
  small: { avif: 45, webp: 72 },
  plate: { avif: 62, webp: 82 },
} as const

/** Widths at or below this use the cheaper quality tier. */
const SMALL_MAX_WIDTH = 400

export interface DerivativeJob {
  key: string
  width: number
  format: DerivativeFormat
  quality: number
}

export function derivativePlan(slug: string, register: Register): DerivativeJob[] {
  const jobs: DerivativeJob[] = []
  for (const width of DERIVATIVE_WIDTHS) {
    const tier = width <= SMALL_MAX_WIDTH ? QUALITY.small : QUALITY.plate
    for (const format of ['avif', 'webp'] as const) {
      jobs.push({ key: derivativeKey(slug, register, width, format), width, format, quality: tier[format] })
    }
  }
  return jobs
}

/**
 * The manifest finishIngest checks the bucket against before it will set
 * derivatives_ready. This is what makes "every derivative exists" a verifiable
 * claim rather than an assumption.
 */
export function expectedObjects(slug: string, hasBwVariant: boolean): string[] {
  const registers: Register[] = hasBwVariant ? ['colour', 'silver'] : ['colour']
  return registers.flatMap((register) => derivativePlan(slug, register).map((job) => job.key))
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/ingest-core.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/ingest/keys.ts lib/ingest/plan.ts test/ingest-core.test.ts
git commit -m "feat(ingest): storage keys and the derivative plan, locked to the read path

The anti-drift test is the load-bearing one: derivativeKey must be exactly the
tail of what lib/images/derivatives.ts already requests. If they diverge,
ingest writes files the storefront never asks for and every photograph becomes
a srcset of 404s with nothing logging an error.

expectedObjects is the manifest finishIngest verifies the bucket against, which
is what makes derivatives_ready mean something.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `lib/ingest/validate.ts`

**Files:**
- Create: `lib/ingest/validate.ts`
- Test: `test/ingest-validate.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MIN_WIDTH_PX = 1800`, `MAX_UPLOAD_BYTES`, `ALLOWED_MIME`
  - `type Rejection = { ok: false; message: string }`
  - `type Accepted = { ok: true }`
  - `validateUpload(input: { mime: string; bytes: number }): Accepted | Rejection`
  - `validateDimensions(widthPx: number): Accepted | Rejection`
  - `extensionFor(mime: string): string`

> **`MAX_UPLOAD_BYTES` must equal the `originals` bucket's configured file-size limit.** The code below uses **52_428_800 (50 MB)** — Supabase's documented default — so this task is not hard-blocked. **Check the real value** (Storage → originals → Settings) and correct the constant if it differs. Too high and the rejection happens *after* a 40 MB transfer with an opaque storage error, which is the worst possible place for it; too low and legitimate print originals are refused.

- [ ] **Step 1: Write the failing test**

Create `test/ingest-validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  validateUpload,
  validateDimensions,
  extensionFor,
  MIN_WIDTH_PX,
  MAX_UPLOAD_BYTES,
  ALLOWED_MIME,
} from '@/lib/ingest/validate'

describe('validateUpload', () => {
  it('accepts every allowed image type', () => {
    for (const mime of ALLOWED_MIME) {
      expect(validateUpload({ mime, bytes: 1_000_000 }).ok).toBe(true)
    }
  })

  it('rejects a type sharp cannot read, naming what is accepted', () => {
    const result = validateUpload({ mime: 'application/pdf', bytes: 1000 })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/JPEG, PNG, TIFF or WebP/)
  })

  it('rejects an empty file', () => {
    expect(validateUpload({ mime: 'image/jpeg', bytes: 0 }).ok).toBe(false)
  })

  it('rejects a file over the bucket limit BEFORE it is uploaded', () => {
    const result = validateUpload({ mime: 'image/jpeg', bytes: MAX_UPLOAD_BYTES + 1 })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/too large/i)
  })

  it('accepts a file exactly at the limit', () => {
    expect(validateUpload({ mime: 'image/jpeg', bytes: MAX_UPLOAD_BYTES }).ok).toBe(true)
  })
})

describe('validateDimensions', () => {
  it('rejects anything narrower than the top of the ladder', () => {
    // Below 1800 the top rung would be an UPSCALE and the srcset `w` descriptor
    // would lie about what it serves.
    const result = validateDimensions(MIN_WIDTH_PX - 1)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/1800/)
  })

  it('accepts exactly the minimum', () => {
    expect(validateDimensions(MIN_WIDTH_PX).ok).toBe(true)
  })

  it('accepts a real print original', () => {
    expect(validateDimensions(6048).ok).toBe(true)
  })
})

describe('extensionFor', () => {
  it('maps every allowed mime to the extension the original is stored under', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg')
    expect(extensionFor('image/png')).toBe('png')
    expect(extensionFor('image/tiff')).toBe('tif')
    expect(extensionFor('image/webp')).toBe('webp')
  })

  it('falls back to bin for an unknown type rather than emitting an empty extension', () => {
    expect(extensionFor('application/octet-stream')).toBe('bin')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ingest-validate.test.ts`
Expected: FAIL — cannot resolve `@/lib/ingest/validate`.

- [ ] **Step 3: Write the implementation**

Create `lib/ingest/validate.ts`. `MAX_UPLOAD_BYTES` below is Supabase's documented 50 MB default — **check the real bucket limit and correct it if it differs**:

```ts
/**
 * The top of the derivative ladder is 1800px (product.md §3.2). An original
 * narrower than that would make the top rung an UPSCALE, and the srcset `w`
 * descriptor would then lie about the file it serves. Print originals are
 * 6000px+, so this rejects nothing real.
 */
export const MIN_WIDTH_PX = 1800

/**
 * MUST equal the `originals` bucket's configured file-size limit in Supabase.
 * 50MB is Supabase's documented default -- VERIFY it against the dashboard
 * (Storage -> originals -> Settings) and correct this if it differs.
 *
 * Checked BEFORE the signed URL is issued, so an oversize file is refused in a
 * millisecond instead of after a 40MB transfer with an opaque storage error.
 */
export const MAX_UPLOAD_BYTES = 52_428_800

/** Everything sharp can decode and we are willing to store. */
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/tiff', 'image/webp'] as const

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/tiff': 'tif',
  'image/webp': 'webp',
}

export type Accepted = { ok: true }
export type Rejection = { ok: false; message: string }

function mb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(0)} MB`
}

export function validateUpload({ mime, bytes }: { mime: string; bytes: number }): Accepted | Rejection {
  if (!(ALLOWED_MIME as readonly string[]).includes(mime)) {
    return { ok: false, message: 'That file isn’t an image this can read. Use JPEG, PNG, TIFF or WebP.' }
  }
  if (bytes <= 0) {
    return { ok: false, message: 'That file is empty.' }
  }
  if (bytes > MAX_UPLOAD_BYTES) {
    return { ok: false, message: `That file is too large — the limit is ${mb(MAX_UPLOAD_BYTES)}.` }
  }
  return { ok: true }
}

export function validateDimensions(widthPx: number): Accepted | Rejection {
  if (widthPx < MIN_WIDTH_PX) {
    return {
      ok: false,
      message: `That photograph is ${widthPx}px wide. The largest size served is ${MIN_WIDTH_PX}px, so anything narrower would be scaled up. Upload the full-resolution original.`,
    }
  }
  return { ok: true }
}

export function extensionFor(mime: string): string {
  return EXTENSION[mime] ?? 'bin'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/ingest-validate.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/validate.ts test/ingest-validate.test.ts
git commit -m "feat(ingest): upload and dimension validation

MIN_WIDTH_PX exists because Plate.tsx emits a 1800w srcset entry
unconditionally -- an original narrower than that makes the top rung an
upscale and the w descriptor a lie.

MAX_UPLOAD_BYTES mirrors the bucket's own limit so an oversize file is refused
before the transfer rather than after it with an opaque storage error.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `lib/ingest/process.ts` — the sharp pipeline

**Files:**
- Create: `lib/ingest/process.ts`
- Test: `test/ingest-pipeline.test.ts` (create)

**Interfaces:**
- Consumes: `derivativePlan` (Task 3), `Register`/`DerivativeFormat` (Task 3).
- Produces:
  - `interface Measured { widthPx: number; heightPx: number; aspectRatio: number; aura: { r: number; g: number; b: number } }`
  - `measure(input: Buffer): Promise<Measured>`
  - `interface EncodedObject { key: string; body: Buffer; contentType: string }`
  - `encodeLadder(input: Buffer, slug: string, register: Register): Promise<EncodedObject[]>`

**On colour management, read this before writing the test.** The spec's §6 was **downgraded on evidence**: the real archive is already sRGB (`space: srgb`, profiles 3144B where present). The sRGB conversion is one line of insurance against a future P3 export, not a fix for a present defect. **Do not write a wide-gamut pixel-value assertion** — a synthetic P3 source built with `withMetadata({ icc: 'p3' })` only tags a profile without making the pixels P3-encoded, so such a test cannot fail and proves nothing. Assert sRGB round-trip integrity instead.

- [ ] **Step 1: Write the failing test**

Create `test/ingest-pipeline.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import sharp from 'sharp'
import { measure, encodeLadder } from '@/lib/ingest/process'
import { DERIVATIVE_WIDTHS } from '@/lib/images/derivatives'

// 2400x3000 (4:5). Above MIN_WIDTH_PX so the full ladder is a genuine
// downscale, small enough that the whole suite stays fast.
let source: Buffer

beforeAll(async () => {
  source = await sharp({
    create: { width: 2400, height: 3000, channels: 3, background: { r: 120, g: 90, b: 60 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer()
}, 30_000)

describe('measure', () => {
  it('reports the real pixel dimensions', async () => {
    const m = await measure(source)
    expect(m.widthPx).toBe(2400)
    expect(m.heightPx).toBe(3000)
  })

  it('computes aspect ratio as width/height, so portrait is < 1', async () => {
    // lib/product/crop.ts treats plateAspect > 1 as landscape. Inverting this
    // would rotate every crop guide on the storefront.
    const m = await measure(source)
    expect(m.aspectRatio).toBeCloseTo(0.8, 4)
  })

  it('returns the aura as a single {r,g,b}', async () => {
    // design.md §10 q3: the shape legacy averageColor() returned. Nothing reads
    // it; it is stored because the file is in hand.
    const m = await measure(source)
    expect(Object.keys(m.aura).sort()).toEqual(['b', 'g', 'r'])
    for (const channel of ['r', 'g', 'b'] as const) {
      expect(m.aura[channel]).toBeGreaterThanOrEqual(0)
      expect(m.aura[channel]).toBeLessThanOrEqual(255)
    }
  })
})

describe('encodeLadder', () => {
  let objects: Awaited<ReturnType<typeof encodeLadder>>

  beforeAll(async () => {
    objects = await encodeLadder(source, 'evil-lies', 'colour')
  }, 60_000)

  it('emits every width in both formats', () => {
    expect(objects).toHaveLength(DERIVATIVE_WIDTHS.length * 2)
  })

  it('writes to the keys the storefront requests', () => {
    expect(objects.map((o) => o.key)).toContain('evil-lies/colour/1800.avif')
    expect(objects.map((o) => o.key)).toContain('evil-lies/colour/160.webp')
  })

  it('sets a content type matching the format', () => {
    expect(objects.find((o) => o.key.endsWith('.avif'))!.contentType).toBe('image/avif')
    expect(objects.find((o) => o.key.endsWith('.webp'))!.contentType).toBe('image/webp')
  })

  it('EVERY output decodes to exactly the width in its filename', async () => {
    // The upscale trap. Six files existing does not mean six correct files, and
    // a srcset `w` descriptor that disagrees with the actual pixel width makes
    // the browser choose wrong on every viewport.
    for (const object of objects) {
      const declared = Number(object.key.match(/\/(\d+)\.(?:avif|webp)$/)![1])
      const meta = await sharp(object.body).metadata()
      expect(meta.width, `${object.key} decoded to ${meta.width}, declared ${declared}`).toBe(declared)
    }
  }, 60_000)

  it('preserves aspect ratio at every rung', async () => {
    for (const object of objects) {
      const meta = await sharp(object.body).metadata()
      expect(meta.width! / meta.height!).toBeCloseTo(0.8, 2)
    }
  }, 60_000)

  it('round-trips an sRGB source without corrupting it', async () => {
    // NOT a wide-gamut assertion -- see the note in the plan and spec §6. A
    // synthetic P3 source cannot be built with withMetadata({icc:'p3'}), so
    // such a test cannot fail. This one can: it catches a colour-space
    // conversion that mangles ordinary sRGB input.
    const plate = objects.find((o) => o.key === 'evil-lies/colour/1800.webp')!
    const meta = await sharp(plate.body).metadata()
    expect(meta.space).toBe('srgb')

    const { data } = await sharp(plate.body).resize(1, 1).raw().toBuffer({ resolveWithObject: true })
    // The source is a flat (120, 90, 60). Allow generous slack for lossy encode.
    expect(Math.abs(data[0] - 120)).toBeLessThan(12)
    expect(Math.abs(data[1] - 90)).toBeLessThan(12)
    expect(Math.abs(data[2] - 60)).toBeLessThan(12)
  }, 30_000)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ingest-pipeline.test.ts`
Expected: FAIL — cannot resolve `@/lib/ingest/process`.

- [ ] **Step 3: Write the implementation**

Create `lib/ingest/process.ts`:

```ts
import 'server-only'
import sharp from 'sharp'
import { derivativePlan } from '@/lib/ingest/plan'
import type { DerivativeFormat, Register } from '@/lib/ingest/keys'

export interface Measured {
  widthPx: number
  heightPx: number
  aspectRatio: number
  aura: { r: number; g: number; b: number }
}

export interface EncodedObject {
  key: string
  body: Buffer
  contentType: string
}

const CONTENT_TYPE: Record<DerivativeFormat, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
}

/**
 * Measured once, at ingest -- which is the whole reason this slice exists for
 * the crop guide. lib/product/crop.ts has been running on Plate.tsx's hardcoded
 * 0.8 fallback because nothing ever wrote photos.aspect_ratio.
 *
 * aspectRatio is width/height, so portrait is < 1. crop.ts reads `> 1` as
 * landscape; inverting this rotates every crop guide on the storefront.
 */
export async function measure(input: Buffer): Promise<Measured> {
  const image = sharp(input, { limitInputPixels: false })
  const meta = await image.metadata()
  if (!meta.width || !meta.height) {
    throw new Error('Could not read the image’s dimensions.')
  }
  const stats = await image.stats()
  const { r, g, b } = stats.dominant
  return {
    widthPx: meta.width,
    heightPx: meta.height,
    aspectRatio: meta.width / meta.height,
    aura: { r, g, b },
  }
}

/**
 * One register's full ladder, in memory. The caller uploads them.
 *
 * Sequential, not Promise.all: sharp already uses a thread pool per operation,
 * and twelve concurrent decodes of a 40MB source is how a serverless function
 * meets its memory limit instead of its time limit.
 *
 * .toColourspace('srgb') is INSURANCE, not a fix -- spec §6 measured the real
 * archive as already sRGB. It costs one line and covers the day an export
 * arrives in Display P3, which fails silently rather than loudly.
 */
export async function encodeLadder(
  input: Buffer,
  slug: string,
  register: Register,
): Promise<EncodedObject[]> {
  const objects: EncodedObject[] = []

  for (const job of derivativePlan(slug, register)) {
    const pipeline = sharp(input, { limitInputPixels: false })
      // withoutEnlargement is belt-and-braces: validateDimensions already
      // guarantees the source is >= 1800px, so no rung should ever upscale.
      .resize(job.width, null, { withoutEnlargement: true })
      .toColourspace('srgb')

    const body =
      job.format === 'avif'
        ? await pipeline.avif({ quality: job.quality }).toBuffer()
        : await pipeline.webp({ quality: job.quality }).toBuffer()

    objects.push({ key: job.key, body, contentType: CONTENT_TYPE[job.format] })
  }

  return objects
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/ingest-pipeline.test.ts`
Expected: PASS, 10 tests. Runtime under ~30s.

> If any output's decoded width does **not** match its filename, do not relax the assertion — it is catching a real defect. The likeliest cause is `withoutEnlargement` silently clamping because the synthetic source is smaller than a rung; confirm the source is 2400px wide.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/process.ts test/ingest-pipeline.test.ts
git commit -m "feat(ingest): sharp measure and encodeLadder

measure writes photos.aspect_ratio, which nothing has ever written -- the
storefront crop guide has been running on Plate.tsx's hardcoded 0.8 fallback
since slice 2. aspectRatio is width/height so portrait is < 1, matching what
lib/product/crop.ts reads.

encodeLadder is sequential rather than Promise.all: twelve concurrent decodes
of a 40MB source is how a serverless function meets its memory limit.

The test asserts every output DECODES to the width in its filename, not merely
that six files exist -- a w descriptor disagreeing with actual pixel width
makes the browser choose wrong on every viewport.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `lib/ingest/actions.ts` — the four Server Actions

**Files:**
- Create: `lib/ingest/types.ts`
- Create: `lib/ingest/actions.ts`
- Test: `test/ingest-actions.test.ts` (create)

**Interfaces:**
- Consumes: `requireAdmin` (`@/lib/admin/require-admin`), `createAuthServerClient` (`@/lib/supabase/auth-server`), everything from Tasks 2–5.
- Produces, all called from `IngestForm` (Task 9):
  - `beginIngest(input: BeginInput): Promise<BeginResult>`
  - `createPhotoDraft(input: DraftInput): Promise<DraftResult>`
  - `generateRegister(input: { photoId: string; register: Register }): Promise<StepResult>`
  - `finishIngest(input: { photoId: string; publish: boolean }): Promise<FinishResult>`
  - `deletePhoto(input: { photoId: string }): Promise<DeleteResult>` — used by Task 10

> **A `'use server'` module may export only async functions.** Types and constants therefore live in `lib/ingest/types.ts`. An `export type` or `export const` in a `'use server'` file is a build error. This is the same split slice 4a made for `lib/admin/auth-state.ts`.

> **`test/admin-routes.test.ts` slices each function's body from `export async function` to the next `\nexport `, and requires the literal string `requireAdmin` inside.** Put `await requireAdmin()` as the first statement of each of the **five**. Do not add any of them to the `EXEMPT` set.

- [ ] **Step 1: Write `lib/ingest/types.ts`**

No test of its own — it is types and one constant, exercised by every test below.

```ts
import type { Register } from '@/lib/ingest/keys'

export interface UploadDeclaration {
  mime: string
  bytes: number
}

export interface BeginInput {
  slug: string
  title: string
  colour: UploadDeclaration
  silver?: UploadDeclaration
}

export interface SignedTarget {
  register: Register
  bucketPath: string
  token: string
  signedUrl: string
}

export type BeginResult =
  | { ok: true; targets: SignedTarget[] }
  | { ok: false; message: string }

export interface DraftInput {
  slug: string
  title: string
  caption: string | null
  description: string | null
  altText: string | null
  collectionId: string | null
  colourExt: string
  silverExt: string | null
}

export type DraftResult =
  | { ok: true; photoId: string; widthPx: number; heightPx: number; aspectRatio: number }
  | { ok: false; message: string }

export type StepResult = { ok: true } | { ok: false; message: string }

export type FinishResult =
  | { ok: true; published: boolean; slug: string }
  | { ok: false; message: string; missing?: string[] }

export type DeleteResult = { ok: true } | { ok: false; message: string }
```

- [ ] **Step 2: Write the failing test**

Create `test/ingest-actions.test.ts`. Everything external is mocked — no real Supabase client, no real sharp call.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAdmin = vi.fn(async () => ({ id: 'admin-uid', email: 'jon@example.com' }))
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin }))

const revalidateTag = vi.fn()
vi.mock('next/cache', () => ({ revalidateTag }))

const measure = vi.fn()
const encodeLadder = vi.fn()
vi.mock('@/lib/ingest/process', () => ({ measure, encodeLadder }))

// A minimal fake of the parts of the Supabase client the actions touch.
const db = {
  photos: [] as Record<string, unknown>[],
  orderItems: [] as { photo_id: string }[],
  storage: new Map<string, Set<string>>(),
}
let failNext: string | null = null

function fakeClient() {
  return {
    from: (table: string) => ({
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        const chain = (val: unknown) => ({
          maybeSingle: async () =>
            table === 'photos'
              ? { data: db.photos.find((p) => p.slug === val || p.id === val) ?? null, error: null }
              : { data: null, error: null },
          // collection_photos position lookup: .order().limit().maybeSingle()
          order: () => ({
            limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        })
        return {
          eq: (_col: string, val: unknown) =>
            // order_items count uses head:true, which resolves directly rather
            // than continuing the chain.
            opts?.head
              ? Promise.resolve(
                  failNext === 'count'
                    ? { count: null, error: { message: 'count failed' } }
                    : { count: db.orderItems.filter((i) => i.photo_id === val).length, error: null },
                )
              : chain(val),
        }
      },
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            if (failNext === 'insert') return { data: null, error: { message: 'insert failed' } }
            const created = { id: 'photo-1', ...row }
            db.photos.push(created)
            return { data: created, error: null }
          },
        }),
        // collection_photos inserts are awaited directly, with no .select()
        then: (resolve: (v: unknown) => void) => resolve({ error: null }),
      }),
      delete: () => ({
        eq: async (_col: string, id: string) => {
          db.photos = db.photos.filter((p) => p.id !== id)
          return { error: null }
        },
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          if (failNext === 'update') return { error: { message: 'update failed' } }
          const row = db.photos.find((p) => p.id === id)
          if (row) Object.assign(row, patch)
          return { error: null }
        },
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: async (path: string) =>
          failNext === 'sign'
            ? { data: null, error: { message: 'sign failed' } }
            : { data: { signedUrl: `https://x/${path}`, token: 'tok', path }, error: null },
        download: async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null }),
        upload: async (key: string) => {
          const set = db.storage.get(bucket) ?? new Set()
          set.add(key)
          db.storage.set(bucket, set)
          return { error: null }
        },
        list: async (prefix: string) => {
          const set = db.storage.get(bucket) ?? new Set()
          const names = [...set]
            .filter((k) => k.startsWith(`${prefix}/`))
            .map((k) => ({ name: k.slice(prefix.length + 1) }))
          return { data: names, error: null }
        },
        remove: async (keys: string[]) => {
          const set = db.storage.get(bucket) ?? new Set()
          keys.forEach((k) => set.delete(k))
          return { error: null }
        },
      }),
    },
  }
}

vi.mock('@/lib/supabase/auth-server', () => ({
  createAuthServerClient: async () => fakeClient(),
}))

import {
  beginIngest, createPhotoDraft, generateRegister, finishIngest, deletePhoto,
} from '@/lib/ingest/actions'
import { expectedObjects } from '@/lib/ingest/plan'

const GOOD_BEGIN = {
  slug: 'evil-lies',
  title: 'Evil Lies',
  colour: { mime: 'image/jpeg', bytes: 5_000_000 },
}

beforeEach(() => {
  db.photos = []
  db.orderItems = []
  db.storage = new Map()
  failNext = null
  vi.clearAllMocks()
  measure.mockResolvedValue({
    widthPx: 6048,
    heightPx: 7560,
    aspectRatio: 0.8,
    aura: { r: 1, g: 2, b: 3 },
  })
  encodeLadder.mockImplementation(async (_buf: Buffer, slug: string, register: string) =>
    expectedObjects(slug, true)
      .filter((k) => k.includes(`/${register}/`))
      .map((key) => ({ key, body: Buffer.from('x'), contentType: 'image/avif' })),
  )
})

describe('every action guards itself', () => {
  it('calls requireAdmin before doing anything', async () => {
    await beginIngest(GOOD_BEGIN)
    await createPhotoDraft({
      slug: 'evil-lies', title: 'Evil Lies', caption: null, description: null,
      altText: null, collectionId: null, colourExt: 'jpg', silverExt: null,
    })
    await generateRegister({ photoId: 'photo-1', register: 'colour' })
    await finishIngest({ photoId: 'photo-1', publish: false })
    await deletePhoto({ photoId: 'photo-1' })
    expect(requireAdmin).toHaveBeenCalledTimes(5)
  })
})

describe('beginIngest', () => {
  it('returns a signed target for the colour original', async () => {
    const result = await beginIngest(GOOD_BEGIN)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.targets).toHaveLength(1)
    expect(result.targets[0].register).toBe('colour')
    expect(result.targets[0].bucketPath).toBe('evil-lies/colour.jpg')
    expect(result.targets[0].token).toBe('tok')
  })

  it('returns two targets when a silver original is declared', async () => {
    const result = await beginIngest({ ...GOOD_BEGIN, silver: { mime: 'image/tiff', bytes: 30_000_000 } })
    expect(result.ok && result.targets.map((t) => t.bucketPath)).toEqual([
      'evil-lies/colour.jpg',
      'evil-lies/silver.tif',
    ])
  })

  it('rejects a duplicate slug rather than overwriting an existing photograph', async () => {
    db.photos.push({ id: 'existing', slug: 'evil-lies' })
    const result = await beginIngest(GOOD_BEGIN)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/already/i)
  })

  it('rejects an empty slug — it would become a storage path', async () => {
    const result = await beginIngest({ ...GOOD_BEGIN, slug: '' })
    expect(result.ok).toBe(false)
  })

  it('rejects a slug that is not the canonical derivation of itself', async () => {
    // Blocks a hand-crafted POST from smuggling `../` or an uppercase path in.
    const result = await beginIngest({ ...GOOD_BEGIN, slug: '../etc/passwd' })
    expect(result.ok).toBe(false)
  })

  it('rejects a disallowed mime before issuing any URL', async () => {
    const result = await beginIngest({ ...GOOD_BEGIN, colour: { mime: 'application/pdf', bytes: 10 } })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/JPEG, PNG, TIFF or WebP/)
  })
})

describe('createPhotoDraft', () => {
  const DRAFT = {
    slug: 'evil-lies', title: 'Evil Lies', caption: 'A line', description: 'A page',
    altText: 'A description of the image', collectionId: null,
    colourExt: 'jpg', silverExt: null,
  }

  it('inserts unpublished and not-ready, with the measured values', async () => {
    const result = await createPhotoDraft(DRAFT)
    expect(result.ok).toBe(true)
    const row = db.photos[0]
    expect(row.published).toBe(false)
    expect(row.derivatives_ready).toBe(false)
    expect(row.aspect_ratio).toBe(0.8)
    expect(row.width_px).toBe(6048)
    expect(row.aura).toEqual({ r: 1, g: 2, b: 3 })
    expect(row.original_key).toBe('evil-lies/colour.jpg')
  })

  it('sets has_bw_variant and original_bw_key only when a silver file exists', async () => {
    await createPhotoDraft(DRAFT)
    expect(db.photos[0].has_bw_variant).toBe(false)
    expect(db.photos[0].original_bw_key).toBeNull()

    db.photos = []
    await createPhotoDraft({ ...DRAFT, silverExt: 'tif' })
    expect(db.photos[0].has_bw_variant).toBe(true)
    expect(db.photos[0].original_bw_key).toBe('evil-lies/silver.tif')
  })

  it('rejects an under-width original, creates no row, and deletes the upload', async () => {
    measure.mockResolvedValue({ widthPx: 1200, heightPx: 1500, aspectRatio: 0.8, aura: { r: 0, g: 0, b: 0 } })
    const result = await createPhotoDraft(DRAFT)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/1800/)
    expect(db.photos).toHaveLength(0)
    expect(db.storage.get('originals')?.size ?? 0).toBe(0)
  })
})

describe('generateRegister', () => {
  beforeEach(async () => {
    await createPhotoDraft({
      slug: 'evil-lies', title: 'Evil Lies', caption: null, description: null,
      altText: 'alt', collectionId: null, colourExt: 'jpg', silverExt: 'tif',
    })
  })

  it('uploads one register’s full ladder', async () => {
    const result = await generateRegister({ photoId: 'photo-1', register: 'colour' })
    expect(result.ok).toBe(true)
    const written = [...(db.storage.get('derivatives') ?? [])]
    expect(written).toHaveLength(12)
    expect(written.every((k) => k.startsWith('evil-lies/colour/'))).toBe(true)
  })

  it('does not touch the other register', async () => {
    await generateRegister({ photoId: 'photo-1', register: 'colour' })
    expect([...(db.storage.get('derivatives') ?? [])].some((k) => k.includes('/silver/'))).toBe(false)
  })
})

describe('finishIngest', () => {
  async function draft(hasSilver: boolean) {
    await createPhotoDraft({
      slug: 'evil-lies', title: 'Evil Lies', caption: null, description: null,
      altText: 'alt', collectionId: null, colourExt: 'jpg',
      silverExt: hasSilver ? 'tif' : null,
    })
  }

  it('refuses to publish when an expected object is missing', async () => {
    await draft(true)
    await generateRegister({ photoId: 'photo-1', register: 'colour' })  // silver never generated
    const result = await finishIngest({ photoId: 'photo-1', publish: true })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.missing?.length).toBe(12)
    expect(db.photos[0].derivatives_ready).toBe(false)
    expect(db.photos[0].published).toBe(false)
  })

  it('sets derivatives_ready and publishes when the manifest is complete', async () => {
    await draft(false)
    await generateRegister({ photoId: 'photo-1', register: 'colour' })
    const result = await finishIngest({ photoId: 'photo-1', publish: true })
    expect(result.ok).toBe(true)
    expect(db.photos[0].derivatives_ready).toBe(true)
    expect(db.photos[0].published).toBe(true)
  })

  it('sets derivatives_ready but leaves it a draft when publish is false', async () => {
    await draft(false)
    await generateRegister({ photoId: 'photo-1', register: 'colour' })
    await finishIngest({ photoId: 'photo-1', publish: false })
    expect(db.photos[0].derivatives_ready).toBe(true)
    expect(db.photos[0].published).toBe(false)
  })

  it('refuses to publish without alt text, and says so', async () => {
    await createPhotoDraft({
      slug: 'evil-lies', title: 'Evil Lies', caption: null, description: null,
      altText: null, collectionId: null, colourExt: 'jpg', silverExt: null,
    })
    await generateRegister({ photoId: 'photo-1', register: 'colour' })
    const result = await finishIngest({ photoId: 'photo-1', publish: true })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/alt text/i)
    // derivatives_ready is still true -- it IS true. Only publishing is refused.
    expect(db.photos[0].derivatives_ready).toBe(true)
    expect(db.photos[0].published).toBe(false)
  })

  it('revalidates the storefront caches so publishing needs no redeploy (finish)', async () => {
    // design.md §11.4-G prints "publishing needs no redeploy" as UI copy.
    // product.md §8 q5. This assertion is what stops that copy becoming a lie.
    await draft(false)
    await generateRegister({ photoId: 'photo-1', register: 'colour' })
    await finishIngest({ photoId: 'photo-1', publish: true })
    expect(revalidateTag).toHaveBeenCalledWith('photos')
    expect(revalidateTag).toHaveBeenCalledWith('photo:evil-lies')
    expect(revalidateTag).toHaveBeenCalledWith('collections')
  })
})

describe('deletePhoto', () => {
  async function draftPhoto(published: boolean) {
    await createPhotoDraft({
      slug: 'evil-lies', title: 'Evil Lies', caption: null, description: null,
      altText: 'alt', collectionId: null, colourExt: 'jpg', silverExt: null,
    })
    if (published) db.photos[0].published = true
  }

  it('deletes an unpublished, never-ordered photograph and its files', async () => {
    await draftPhoto(false)
    await generateRegister({ photoId: 'photo-1', register: 'colour' })
    db.storage.set('originals', new Set(['evil-lies/colour.jpg']))

    const result = await deletePhoto({ photoId: 'photo-1' })
    expect(result.ok).toBe(true)
    expect(db.photos).toHaveLength(0)
    expect(db.storage.get('derivatives')?.size ?? 0).toBe(0)
    expect(db.storage.get('originals')?.size ?? 0).toBe(0)
  })

  it('refuses to delete a published photograph', async () => {
    await draftPhoto(true)
    const result = await deletePhoto({ photoId: 'photo-1' })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/unpublish it first/i)
    expect(db.photos).toHaveLength(1)
  })

  it('refuses to delete a photograph that has been ordered', async () => {
    // product.md §6.2: the lab export pulls the ORIGINAL. order_items.photo_id
    // is `on delete set null`, so the receipt survives -- but the file would
    // not, and the failure surfaces months later at reprint time.
    await draftPhoto(false)
    db.orderItems.push({ photo_id: 'photo-1' })
    const result = await deletePhoto({ photoId: 'photo-1' })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/has been ordered/i)
    expect(db.photos).toHaveLength(1)
  })

  it('fails CLOSED when the order check itself errors', async () => {
    await draftPhoto(false)
    failNext = 'count'
    const result = await deletePhoto({ photoId: 'photo-1' })
    expect(result.ok).toBe(false)
    expect(db.photos).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/ingest-actions.test.ts`
Expected: FAIL — cannot resolve `@/lib/ingest/actions`.

- [ ] **Step 4: Write the implementation**

Create `lib/ingest/actions.ts`:

```ts
'use server'

import { revalidateTag } from 'next/cache'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import { deriveSlug } from '@/lib/ingest/slug'
import {
  DERIVATIVES_BUCKET,
  ORIGINALS_BUCKET,
  derivativeKey,
  originalKey,
  type Register,
} from '@/lib/ingest/keys'
import { expectedObjects } from '@/lib/ingest/plan'
import { extensionFor, validateDimensions, validateUpload } from '@/lib/ingest/validate'
import { encodeLadder, measure } from '@/lib/ingest/process'
import type {
  BeginInput, BeginResult, DraftInput, DraftResult, FinishResult, SignedTarget, StepResult,
} from '@/lib/ingest/types'

/** Invalidate every cache the storefront reads a photo through (product.md §8 q5). */
function revalidatePhoto(slug: string): void {
  revalidateTag('photos')
  revalidateTag(`photo:${slug}`)
  revalidateTag('collections')
}

export async function beginIngest(input: BeginInput): Promise<BeginResult> {
  await requireAdmin()

  // The slug must be the canonical derivation of ITSELF. A Server Action is a
  // reachable public POST endpoint (slice 4a §3.2), so a hand-crafted request
  // could otherwise smuggle `../` or an uppercase segment into a storage path.
  if (!input.slug || deriveSlug(input.slug) !== input.slug) {
    return { ok: false, message: 'That web address isn’t usable. Use letters, numbers and hyphens.' }
  }

  const colour = validateUpload(input.colour)
  if (!colour.ok) return { ok: false, message: colour.message }
  if (input.silver) {
    const silver = validateUpload(input.silver)
    if (!silver.ok) return { ok: false, message: silver.message }
  }

  const db = await createAuthServerClient()

  const { data: existing } = await db.from('photos').select('id').eq('slug', input.slug).maybeSingle()
  if (existing) {
    return { ok: false, message: 'A photograph already uses that web address. Change the title or the address.' }
  }

  const declared: { register: Register; mime: string }[] = [
    { register: 'colour', mime: input.colour.mime },
    ...(input.silver ? [{ register: 'silver' as const, mime: input.silver.mime }] : []),
  ]

  const targets: SignedTarget[] = []
  for (const { register, mime } of declared) {
    const bucketPath = originalKey(input.slug, register, extensionFor(mime))
    const { data, error } = await db.storage.from(ORIGINALS_BUCKET).createSignedUploadUrl(bucketPath)
    if (error || !data) {
      return { ok: false, message: 'Couldn’t start the upload. Nothing was saved.' }
    }
    targets.push({ register, bucketPath, token: data.token, signedUrl: data.signedUrl })
  }

  return { ok: true, targets }
}

export async function createPhotoDraft(input: DraftInput): Promise<DraftResult> {
  await requireAdmin()
  const db = await createAuthServerClient()

  const colourPath = originalKey(input.slug, 'colour', input.colourExt)
  const silverPath = input.silverExt ? originalKey(input.slug, 'silver', input.silverExt) : null

  // Download the colour original once, to measure it and to enforce MIN_WIDTH
  // before any row exists. Costs one extra download (generateRegister pulls it
  // again) and buys: an invalid file never becomes a row.
  const { data: blob, error: downloadError } = await db.storage.from(ORIGINALS_BUCKET).download(colourPath)
  if (downloadError || !blob) {
    return { ok: false, message: 'The uploaded file couldn’t be read back. Try the upload again.' }
  }

  let measured
  try {
    measured = await measure(Buffer.from(await blob.arrayBuffer()))
  } catch {
    return { ok: false, message: 'That file couldn’t be read as an image.' }
  }

  const dimensions = validateDimensions(measured.widthPx)
  if (!dimensions.ok) {
    // Leave nothing behind: no row, and no orphaned original.
    const orphans = silverPath ? [colourPath, silverPath] : [colourPath]
    await db.storage.from(ORIGINALS_BUCKET).remove(orphans)
    return { ok: false, message: dimensions.message }
  }

  const { data: row, error } = await db
    .from('photos')
    .insert({
      slug: input.slug,
      title: input.title,
      caption: input.caption,
      description: input.description,
      alt_text: input.altText,
      aspect_ratio: measured.aspectRatio,
      width_px: measured.widthPx,
      height_px: measured.heightPx,
      aura: measured.aura,
      published: false,
      derivatives_ready: false,
      has_bw_variant: silverPath !== null,
      original_key: colourPath,
      original_bw_key: silverPath,
    })
    .select()
    .single()

  if (error || !row) {
    return { ok: false, message: 'Couldn’t save the photograph. Nothing was published.' }
  }

  if (input.collectionId) {
    // Appended at the end. Editorial reordering is product.md §5.3's point and
    // belongs to slice 6; this only files the photo somewhere.
    const { data: last } = await db
      .from('collection_photos')
      .select('position')
      .eq('collection_id', input.collectionId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()
    const position = ((last as { position?: number } | null)?.position ?? 0) + 1
    await db.from('collection_photos').insert({
      collection_id: input.collectionId,
      photo_id: row.id,
      position,
    })
  }

  return {
    ok: true,
    photoId: row.id as string,
    widthPx: measured.widthPx,
    heightPx: measured.heightPx,
    aspectRatio: measured.aspectRatio,
  }
}

export async function generateRegister(input: {
  photoId: string
  register: Register
}): Promise<StepResult> {
  await requireAdmin()
  const db = await createAuthServerClient()

  const { data: photo } = await db
    .from('photos')
    .select('slug, original_key, original_bw_key')
    .eq('id', input.photoId)
    .maybeSingle()
  if (!photo) return { ok: false, message: 'That photograph no longer exists.' }

  const row = photo as { slug: string; original_key: string | null; original_bw_key: string | null }
  const path = input.register === 'colour' ? row.original_key : row.original_bw_key
  if (!path) return { ok: false, message: `There is no ${input.register} original to work from.` }

  const { data: blob, error: downloadError } = await db.storage.from(ORIGINALS_BUCKET).download(path)
  if (downloadError || !blob) {
    return { ok: false, message: 'Couldn’t read the original back from storage.' }
  }

  let objects
  try {
    objects = await encodeLadder(Buffer.from(await blob.arrayBuffer()), row.slug, input.register)
  } catch {
    return { ok: false, message: `Couldn’t generate the ${input.register} sizes.` }
  }

  for (const object of objects) {
    const { error } = await db.storage
      .from(DERIVATIVES_BUCKET)
      .upload(object.key, object.body, { contentType: object.contentType, upsert: true })
    if (error) {
      // Partial is fine and expected: the photo stays a draft and Retry diffs
      // the manifest, so only what is missing is redone.
      return { ok: false, message: `Couldn’t store the ${input.register} sizes.` }
    }
  }

  return { ok: true }
}

export async function finishIngest(input: {
  photoId: string
  publish: boolean
}): Promise<FinishResult> {
  await requireAdmin()
  const db = await createAuthServerClient()

  const { data: photo } = await db
    .from('photos')
    .select('slug, alt_text, has_bw_variant')
    .eq('id', input.photoId)
    .maybeSingle()
  if (!photo) return { ok: false, message: 'That photograph no longer exists.' }

  const row = photo as { slug: string; alt_text: string | null; has_bw_variant: boolean }

  // Verify against the bucket, never against "we think we uploaded them".
  const registers: Register[] = row.has_bw_variant ? ['colour', 'silver'] : ['colour']
  const present = new Set<string>()
  for (const register of registers) {
    const prefix = `${row.slug}/${register}`
    const { data: listed } = await db.storage.from(DERIVATIVES_BUCKET).list(prefix)
    for (const entry of listed ?? []) present.add(`${prefix}/${entry.name}`)
  }
  const missing = expectedObjects(row.slug, row.has_bw_variant).filter((key) => !present.has(key))
  if (missing.length > 0) {
    return {
      ok: false,
      message: `${missing.length} of the required sizes are missing. The photograph stays a draft.`,
      missing,
    }
  }

  const { error: readyError } = await db
    .from('photos')
    .update({ derivatives_ready: true })
    .eq('id', input.photoId)
  if (readyError) return { ok: false, message: 'Couldn’t record that the sizes are ready.' }

  if (!input.publish) {
    revalidatePhoto(row.slug)
    return { ok: true, published: false, slug: row.slug }
  }

  // The database enforces this too (alt_text_required_when_published). Checking
  // here buys a sentence that explains itself instead of a constraint violation.
  if (!row.alt_text || row.alt_text.trim() === '') {
    return {
      ok: false,
      message: 'Add alt text before publishing — it’s what describes the photograph to someone who can’t see it.',
    }
  }

  const { error: publishError } = await db
    .from('photos')
    .update({ published: true })
    .eq('id', input.photoId)
  if (publishError) return { ok: false, message: 'Couldn’t publish. The photograph is still a draft.' }

  revalidatePhoto(row.slug)
  return { ok: true, published: true, slug: row.slug }
}

/**
 * Restricted by design (spec §8).
 *
 * Deleting a photograph removes its ORIGINAL from storage, and product.md §6.2
 * requires the lab export to pull that original for fulfillment. order_items
 * .photo_id is `on delete set null`, so the receipt row would survive -- but
 * the file it needs would not. The failure would surface months later, when a
 * reprint is requested and the file is gone.
 *
 * So: unpublished, and never ordered. Both checks, in that order.
 */
export async function deletePhoto(input: { photoId: string }): Promise<DeleteResult> {
  await requireAdmin()
  const db = await createAuthServerClient()

  const { data: photo } = await db
    .from('photos')
    .select('slug, published, has_bw_variant, original_key, original_bw_key')
    .eq('id', input.photoId)
    .maybeSingle()
  if (!photo) return { ok: false, message: 'That photograph no longer exists.' }

  const row = photo as {
    slug: string
    published: boolean
    has_bw_variant: boolean
    original_key: string | null
    original_bw_key: string | null
  }

  if (row.published) {
    return { ok: false, message: 'Unpublish it first. A published photograph can’t be deleted outright.' }
  }

  const { count, error: countError } = await db
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('photo_id', input.photoId)
  // Fail CLOSED: an unknown count must never read as safe to delete.
  if (countError) {
    return { ok: false, message: 'Couldn’t check whether this photograph has been ordered. Nothing was deleted.' }
  }
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      message: 'This photograph has been ordered. Deleting it would remove the original the lab needs.',
    }
  }

  const derivatives = expectedObjects(row.slug, row.has_bw_variant)
  if (derivatives.length > 0) await db.storage.from(DERIVATIVES_BUCKET).remove(derivatives)

  const originals = [row.original_key, row.original_bw_key].filter((k): k is string => k !== null)
  if (originals.length > 0) await db.storage.from(ORIGINALS_BUCKET).remove(originals)

  const { error } = await db.from('photos').delete().eq('id', input.photoId)
  if (error) return { ok: false, message: 'Couldn’t delete the photograph.' }

  revalidatePhoto(row.slug)
  return { ok: true }
}
```

Add `DeleteResult` to the type import list at the top of the file.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/ingest-actions.test.ts test/admin-routes.test.ts`
Expected: both PASS. `admin-routes` must still show 3 passing tests with **no new exemption**.

- [ ] **Step 6: Commit**

```bash
git add lib/ingest/types.ts lib/ingest/actions.ts test/ingest-actions.test.ts
git commit -m "feat(ingest): the five Server Actions

requireAdmin() is the first statement in each -- a 'use server' export is a
reachable public POST endpoint whether or not the UI calls it (slice 4a §3.2).

beginIngest requires the slug to be the canonical derivation of itself, so a
hand-crafted POST cannot smuggle ../ into a storage path.

createPhotoDraft measures before inserting, so an under-width original never
becomes a row and leaves no orphaned upload behind.

finishIngest verifies against the BUCKET, not against what we think we
uploaded, and refuses to publish when anything is missing. It revalidates
'photos', 'photo:<slug>' and 'collections' -- which is what makes
design.md §11.4-G's 'publishing needs no redeploy' copy true rather than a
promise (product.md §8 q5).

deletePhoto refuses a published or previously-ordered photograph and fails
CLOSED when the order check itself errors. Deleting removes the ORIGINAL the
lab export pulls (product.md §6.2); order_items.photo_id is `on delete set
null`, so the receipt would survive while the file it needs would not, and the
failure would only surface at reprint time.

Types live in lib/ingest/types.ts: a 'use server' module may export only async
functions, so an export type there is a build error.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `lib/data/photos-admin.ts` + the ingest stylesheet

**Files:**
- Create: `lib/data/photos-admin.ts`
- Modify: `app/globals.css`
- Test: covered by Tasks 9 and 10; no test of its own beyond typecheck.

**Interfaces:**
- Consumes: `requireAdmin`, `createAuthServerClient`.
- Produces:
  - `interface AdminPhoto { id, slug, title, published, derivatives_ready, has_bw_variant, created_at }`
  - `interface AdminCollection { id: string; name: string }`
  - `listPhotos(): Promise<AdminPhoto[] | null>` — `null` means the read failed
  - `listCollections(): Promise<AdminCollection[] | null>`

**No `unstable_cache`.** Slice 4b §4.2 established this: those reads are per-session and not shared, and a cross-request cache over a per-session read is a leak seam.

- [ ] **Step 1: Write `lib/data/photos-admin.ts`**

```ts
import 'server-only'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

export interface AdminPhoto {
  id: string
  slug: string
  title: string
  published: boolean
  derivatives_ready: boolean
  has_bw_variant: boolean
  created_at: string
}

export interface AdminCollection {
  id: string
  name: string
}

const PHOTO_COLS = 'id, slug, title, published, derivatives_ready, has_bw_variant, created_at'

/** null means the read FAILED. An empty array means there are no photographs. */
export async function listPhotos(): Promise<AdminPhoto[] | null> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { data, error } = await db
    .from('photos')
    .select(PHOTO_COLS)
    .order('created_at', { ascending: false })
  // Keyed on `error`, never on falsy data -- slice 4b §4.2. Distinguishing
  // "none" from "unreadable" is the whole point (4b D7).
  if (error) {
    console.error('[admin] listPhotos failed', error)
    return null
  }
  return (data ?? []) as AdminPhoto[]
}

export async function listCollections(): Promise<AdminCollection[] | null> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { data, error } = await db.from('collections').select('id, name').order('name')
  if (error) {
    console.error('[admin] listCollections failed', error)
    return null
  }
  return (data ?? []) as AdminCollection[]
}

```

> **Deliberately no `countOrderItemsForPhoto` here.** An earlier draft of this plan put one in, then `deletePhoto` (Task 6) did its own count inline so it could fail closed with a specific message — leaving an exported function nothing called. That is the `products.ts:price` pattern, and this repo has three separate warnings about it. The order-items check lives in `deletePhoto` alone.

- [ ] **Step 2: Append the stylesheet**

Append to the end of `app/globals.css`. Every class is prefixed `admin-`; borders on controls use `--hairform`; nothing sets `outline: none`.

```css
/* --------------------------------------------------------------------------
   Slice 5a — ingest (design.md §11.4-C) and the Photographs landing.
   Measurements from design/Jon Hoffman Admin.dc.html, Surface C.
   -------------------------------------------------------------------------- */

.admin-crumb { display: flex; align-items: center; gap: 12px; padding: 28px 40px 22px; border-bottom: 1px solid var(--hair); font-family: var(--font-mono); font-weight: 500; font-size: 11px; }
.admin-crumb a { color: var(--dim); }
.admin-crumb a:hover { color: var(--ink); }
.admin-crumb-sep { color: var(--faint); }
.admin-crumb-here { color: var(--ink); }

.admin-ingest { padding: 34px 40px 40px; display: grid; grid-template-columns: 480px 1fr; gap: 44px; align-items: start; }
@media (max-width: 900px) { .admin-ingest { grid-template-columns: 1fr; gap: 28px; } }

.admin-drop { border: 1.5px dashed var(--hairform); position: relative; display: block; width: 100%; transition: border-color 0.2s, background 0.2s; }
.admin-drop:hover, .admin-drop.is-over { border-color: var(--dim); background: rgba(239, 234, 224, 0.03); }
.admin-drop img { width: 100%; height: auto; display: block; }
.admin-drop-choose { display: block; width: 100%; min-height: 44px; border: none; border-top: 1px solid var(--hairsoft); background: transparent; color: var(--ink); font-family: var(--font-mono); font-weight: 500; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; padding: 12px; }
.admin-drop-choose:hover { background: rgba(239, 234, 224, 0.05); }
.admin-drop-choose:disabled { opacity: 0.45; cursor: not-allowed; }
.admin-drop-empty { min-height: 240px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 32px; text-align: center; }
.admin-drop-empty strong { font-family: var(--font-mono); font-weight: 500; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink); }
.admin-drop-empty span { font-size: 12px; color: var(--faint); }
.admin-drop-replace { position: absolute; top: 12px; right: 12px; font-family: var(--font-mono); font-weight: 500; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; background: rgba(11, 11, 11, 0.72); color: var(--ink); padding: 6px 10px; }
.admin-drop-file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

.admin-crop { position: relative; }
.admin-crop-shade { position: absolute; background: rgba(0, 0, 0, 0.35); pointer-events: none; }
.admin-crop-rule { position: absolute; background: var(--ink); opacity: 0.6; pointer-events: none; }
.admin-crop-sizes { display: flex; gap: 9px; flex-wrap: wrap; margin-top: 12px; }
.admin-crop-size { min-height: 44px; padding: 10px 15px; border: 1px solid var(--hairform); background: transparent; color: var(--dim); font-family: var(--font-mono); font-weight: 500; font-size: 12px; cursor: pointer; border-radius: 0; }
.admin-crop-size.is-active { background: var(--btnbg); border-color: var(--btnbg); color: var(--btnink); }
.admin-crop-caption { margin: 10px 0 0; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.06em; color: var(--faint); }

.admin-detected { border: 1px solid var(--hair); padding: 13px 15px; margin-top: 16px; }
.admin-detected-label { margin: 0 0 7px; font-family: var(--font-mono); font-weight: 500; font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--faint); }
.admin-detected-line { margin: 0; font-family: var(--font-mono); font-weight: 500; font-size: 12px; color: var(--ink); }
.admin-detected-sub { margin: 3px 0 0; font-family: var(--font-mono); font-weight: 500; font-size: 11px; color: var(--faint); }

.admin-ingest-note { margin: 14px 0 0; font-family: var(--font-mono); font-weight: 500; font-size: 10px; letter-spacing: 0.06em; line-height: 1.7; color: var(--faint); }

.admin-form { display: flex; flex-direction: column; gap: 26px; }
.admin-formfield > label { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-family: var(--font-mono); font-weight: 500; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--dim); margin-bottom: 9px; }
.admin-formhint { text-transform: none; letter-spacing: 0; font-size: 10px; color: var(--faint); }
.admin-formhint.is-a11y { color: var(--ok); }
.admin-input { width: 100%; min-height: 44px; border: 1px solid var(--hairform); border-radius: 0; background: transparent; color: var(--ink); padding: 15px 16px; }
.admin-input.is-title { font-family: var(--font-playfair); font-size: 22px; }
.admin-input.is-slug { font-family: var(--font-mono); font-size: 13px; padding: 14px 16px; }
.admin-input.is-prose { font-family: var(--font-newsreader), serif; font-size: 16px; padding: 14px 16px; }
.admin-input.is-prose-long { font-family: var(--font-newsreader), serif; font-size: 16px; line-height: 1.6; min-height: 74px; padding: 14px 16px; }
.admin-input.is-alt { font-size: 14px; line-height: 1.55; padding: 14px 16px; }
.admin-input:disabled { opacity: 0.5; }
.admin-select { width: 100%; min-height: 44px; border: 1px solid var(--hairform); border-radius: 0; background: transparent; color: var(--ink); padding: 14px 16px; font-size: 14px; }
.admin-slugnote { margin: 6px 0 0; font-size: 11px; color: var(--faint); }

.admin-ladder { margin: 0; font-family: var(--font-mono); font-weight: 500; font-size: 12px; line-height: 1.6; color: var(--dim); }

.admin-toggles { display: flex; flex-direction: column; border-top: 1px solid var(--hair); border-bottom: 1px solid var(--hair); }
.admin-toggle { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 2px; }
.admin-toggle + .admin-toggle { border-top: 1px solid var(--hairsoft); }
.admin-toggle-copy strong { display: block; font-size: 14px; font-weight: 400; color: var(--ink); }
.admin-toggle-copy span { display: block; font-size: 12px; color: var(--faint); margin-top: 3px; }
.admin-switch { flex: none; width: 40px; height: 22px; min-height: 22px; border-radius: 999px; border: none; background: rgba(239, 234, 224, 0.16); position: relative; cursor: pointer; transition: background 0.2s; padding: 0; }
.admin-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #efeae0; transition: transform 0.2s; }
.admin-switch[aria-checked='true'] { background: var(--ok); }
.admin-switch[aria-checked='true']::after { transform: translateX(18px); }

.admin-actions { display: flex; gap: 12px; padding-top: 4px; flex-wrap: wrap; }
.admin-btn.is-wide { padding: 15px 30px; }
/* 4b's .admin-btn was written for <button>. The landing's primary action is a
   next/link <a>, where padding alone will not honour min-height. Additive --
   4b's rule is not modified. */
a.admin-btn { display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
.admin-btn2 { min-height: 44px; padding: 15px 24px; background: transparent; color: var(--ink); border: 1px solid var(--hairform); border-radius: 0; font-family: var(--font-mono); font-weight: 500; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; }
.admin-btn2:hover { opacity: 0.88; }
.admin-btn2:active { transform: translateY(1px); }
.admin-btn2:disabled { opacity: 0.45; cursor: not-allowed; }

.admin-progress { margin-top: 20px; border: 1px solid var(--hair); padding: 16px 18px; }
.admin-progress-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.admin-progress-step { display: flex; align-items: center; gap: 10px; font-family: var(--font-mono); font-size: 11px; color: var(--faint); }
.admin-progress-step.is-active { color: var(--ink); }
.admin-progress-step.is-done { color: var(--ok); }
.admin-progress-step.is-failed { color: var(--alert); }
.admin-progress-message { margin: 12px 0 0; font-size: 12px; line-height: 1.5; color: var(--ink); }
.admin-progress-message.is-failed { color: var(--alert); }

.admin-photolist { list-style: none; margin: 0; padding: 0 40px 40px; }
.admin-photorow { display: grid; grid-template-columns: 1fr auto auto auto; gap: 16px; align-items: center; padding: 14px 10px; border-bottom: 1px solid var(--hairsoft); }
.admin-photorow-title { font-family: var(--font-playfair); font-size: 18px; color: var(--ink); }
.admin-photorow-sub { font-family: var(--font-mono); font-size: 11px; color: var(--faint); margin-top: 3px; }
.admin-status { font-family: var(--font-mono); font-weight: 500; font-size: 11px; letter-spacing: 0.06em; padding: 4px 9px; border: 1px solid currentColor; }
.admin-status.is-live { color: var(--ok); }
.admin-status.is-draft { color: var(--faint); }
.admin-status.is-incomplete { color: var(--alert); }
.admin-empty { padding: 0 40px 40px; font-size: 13px; color: var(--faint); }
```

- [ ] **Step 3: Verify the gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green. Test count still 1692 + Tasks 2–6's additions.

- [ ] **Step 4: Commit**

```bash
git add lib/data/photos-admin.ts app/globals.css
git commit -m "feat(admin): photo reads and the ingest stylesheet

listPhotos returns null for a FAILED read and [] for no photographs -- slice
4b's D7 distinction, keyed on the PostgREST error object rather than on falsy
data.

No unstable_cache -- these reads are per-session, and a cross-request cache
over a per-session read is a leak seam (4b §4.2).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `Dropzone.tsx` + `CropPreview.tsx`

**Files:**
- Create: `components/admin/Dropzone.tsx`
- Create: `components/admin/CropPreview.tsx`
- Test: covered by `test/ingest-surface.test.tsx` in Task 9.

**Interfaces:**
- Consumes: `cropGuide`, `SIZE_ASPECT` from `@/lib/product/crop` — **import, never reimplement.**
- Produces:
  - `Dropzone({ label, hint, file, onFile, disabled })`
  - `CropPreview({ src, aspectRatio, alt })`

**Do not edit `lib/product/crop.ts` or `components/product/CropGuide.tsx`.** The admin reuses the storefront's own geometry so the preview and the customer's promise cannot drift. `CropGuide.tsx` is a storefront component with storefront class names; `CropPreview` is a thin admin-styled sibling that calls the same `cropGuide()` function.

- [ ] **Step 1: Write `components/admin/Dropzone.tsx`**

```tsx
'use client'

import { useId, useRef, useState, type ReactNode } from 'react'

/**
 * The prototype has NO <input type="file"> anywhere in its 729 lines, and no
 * empty state -- it renders the post-upload view only. Both are built here.
 *
 * The drop target is a <div>, NOT a <button>. It has to contain the preview,
 * and the preview contains the crop-size chips -- interactive elements nested
 * inside a button are invalid HTML and a keyboard trap. The file picker is an
 * explicit button instead, which is also the more legible affordance.
 */
export function Dropzone({
  label,
  hint,
  file,
  hasPreview,
  onFile,
  disabled = false,
  children,
}: {
  label: string
  hint: string
  file: File | null
  hasPreview: boolean
  onFile: (file: File | null) => void
  disabled?: boolean
  children?: ReactNode
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOver, setIsOver] = useState(false)

  function take(list: FileList | null) {
    const next = list?.[0] ?? null
    if (next) onFile(next)
  }

  return (
    <div
      className={`admin-drop${isOver ? ' is-over' : ''}`}
      onDragOver={(event) => {
        if (disabled) return
        event.preventDefault()
        setIsOver(true)
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        if (disabled) return
        event.preventDefault()
        setIsOver(false)
        take(event.dataTransfer.files)
      }}
    >
      <label className="admin-sr-only" htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        ref={inputRef}
        className="admin-drop-file"
        type="file"
        accept="image/jpeg,image/png,image/tiff,image/webp"
        disabled={disabled}
        onChange={(event) => take(event.target.files)}
      />

      {hasPreview ? (
        children
      ) : file ? (
        <div className="admin-drop-empty">
          <strong>{file.name}</strong>
          <span>{(file.size / 1_048_576).toFixed(1)} MB · no preview for this format</span>
        </div>
      ) : (
        <div className="admin-drop-empty">
          <strong>{label}</strong>
          <span>{hint}</span>
        </div>
      )}

      <button
        type="button"
        className="admin-drop-choose"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {file ? 'Replace ↺' : 'Choose a file'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Write `components/admin/CropPreview.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { cropGuide, SIZE_ASPECT } from '@/lib/product/crop'

const SIZES = Object.keys(SIZE_ASPECT)

/**
 * The SAME cropGuide() the product page uses (components/product/ProductInteractive.tsx),
 * so what Jon sees at ingest and what the customer is promised cannot drift.
 *
 * The prototype's plate is a hardcoded aspect-ratio:4/5 with object-fit:cover,
 * which silently misrepresents any photograph that is not 4:5. This renders the
 * NATIVE aspect and draws the crop on top -- the same correction slice 2's
 * review already forced on the storefront.
 *
 * The crop is CENTRED. Nations permits any crop; centre-cropping there is what
 * keeps the promise the storefront already made.
 */
export function CropPreview({ src, aspectRatio }: { src: string; aspectRatio: number | null }) {
  const [size, setSize] = useState<string>('8x10')

  if (aspectRatio === null) {
    return (
      <>
        <img src={src} alt="" style={{ width: '100%', display: 'block' }} />
        <p className="admin-crop-caption">Crop guides appear once the dimensions are measured.</p>
      </>
    )
  }

  const { insetPct, label } = cropGuide(aspectRatio, size)
  const { top, bottom, left, right } = insetPct

  return (
    <>
      <div className="admin-crop">
        <img src={src} alt="" style={{ width: '100%', display: 'block', aspectRatio: String(aspectRatio) }} />
        {top > 0 && <span className="admin-crop-shade" style={{ top: 0, left: 0, right: 0, height: `${top}%` }} />}
        {bottom > 0 && <span className="admin-crop-shade" style={{ bottom: 0, left: 0, right: 0, height: `${bottom}%` }} />}
        {left > 0 && <span className="admin-crop-shade" style={{ top: `${top}%`, bottom: `${bottom}%`, left: 0, width: `${left}%` }} />}
        {right > 0 && <span className="admin-crop-shade" style={{ top: `${top}%`, bottom: `${bottom}%`, right: 0, width: `${right}%` }} />}
        {top > 0 && <span className="admin-crop-rule" style={{ top: `${top}%`, left: 0, right: 0, height: 1 }} />}
        {bottom > 0 && <span className="admin-crop-rule" style={{ bottom: `${bottom}%`, left: 0, right: 0, height: 1 }} />}
        {left > 0 && <span className="admin-crop-rule" style={{ top: `${top}%`, bottom: `${bottom}%`, left: `${left}%`, width: 1 }} />}
        {right > 0 && <span className="admin-crop-rule" style={{ top: `${top}%`, bottom: `${bottom}%`, right: `${right}%`, width: 1 }} />}
      </div>
      <div className="admin-crop-sizes" role="group" aria-label="Preview the crop for a size">
        {SIZES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={`admin-crop-size${candidate === size ? ' is-active' : ''}`}
            aria-pressed={candidate === size}
            onClick={() => setSize(candidate)}
          >
            {candidate.replace('x', '×')}
          </button>
        ))}
      </div>
      <p className="admin-crop-caption">
        Guides show the {label} crop, centred — the same crop the print’s page shows a customer.
      </p>
    </>
  )
}
```

- [ ] **Step 3: Verify the gate**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add components/admin/Dropzone.tsx components/admin/CropPreview.tsx
git commit -m "feat(ingest): dropzone and crop preview

The prototype has no <input type=file> anywhere in its 729 lines and no empty
state -- it renders the post-upload view only. Both are built here.

CropPreview imports the storefront's own cropGuide(), so the admin preview and
the customer's promise cannot drift. It renders the NATIVE aspect rather than
the prototype's hardcoded 4:5 object-fit:cover, which misrepresents any
photograph that is not 4:5 -- the same correction slice 2's review forced on
the storefront.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: `IngestProgress.tsx`, `IngestForm.tsx`, and Surface C

**Files:**
- Create: `components/admin/IngestProgress.tsx`
- Create: `components/admin/IngestForm.tsx`
- Create: `app/admin/(protected)/photographs/new/page.tsx`
- Test: `test/ingest-surface.test.tsx` (create)

**Interfaces:**
- Consumes: everything from Tasks 6, 7, 8; `supabaseBrowser` from `@/lib/supabase/client`; `ALL_SIZES`/`PRICE_BY_SIZE` via `priceRangeLabel` from `@/lib/format/price`.
- Produces: the `/admin/photographs/new` route.

**The upload uses `supabaseBrowser().storage.from('originals').uploadToSignedUrl(path, token, file)` — not a hand-rolled fetch.** `uploadToSignedUrl` wraps a `Blob` body in `FormData` with `cacheControl` appended and PUTs to `/object/upload/sign/<path>?token=`; a plain `fetch(signedUrl, { body: file })` does not match that contract. `lib/supabase/client.ts` already exists and has had **zero consumers** since slice 1 — this is its first. This is *not* the thing slice 4a avoided: 4a avoided `createBrowserClient` from `@supabase/ssr`, the cookie-bound **auth** client. Here the signed token is the authorisation and no session is involved.

- [ ] **Step 1: Write the failing test**

Create `test/ingest-surface.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { IngestForm } from '@/components/admin/IngestForm'

vi.mock('@/lib/ingest/actions', () => ({
  beginIngest: vi.fn(),
  createPhotoDraft: vi.fn(),
  generateRegister: vi.fn(),
  finishIngest: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({ supabaseBrowser: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

beforeEach(cleanup)

function renderForm() {
  return render(<IngestForm collections={[{ id: 'c1', name: 'Relics' }]} />)
}

describe('Surface C — the form', () => {
  it('binds every label to its input', () => {
    renderForm()
    for (const name of ['Title', 'Web address', 'Caption', 'Description', 'Alt text']) {
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.includes(name))
      expect(label, `no label for ${name}`).toBeTruthy()
      const id = label!.getAttribute('for')
      expect(id, `label ${name} has no for=`).toBeTruthy()
      expect(document.getElementById(id!), `nothing has id=${id}`).toBeTruthy()
    }
  })

  it('derives the web address from the title', () => {
    const { container } = renderForm()
    const title = container.querySelector<HTMLInputElement>('#ingest-title')!
    const slug = container.querySelector<HTMLInputElement>('#ingest-slug')!
    title.value = 'If Gold Could Rust'
    title.dispatchEvent(new Event('input', { bubbles: true }))
    expect(slug.value).toBe('if-gold-could-rust')
  })

  it('warns that the web address is permanent', () => {
    const { container } = renderForm()
    expect(container.textContent).toMatch(/can’t be changed after saving/i)
  })

  it('has no Base price control (product.md §8 q3 — the dead field)', () => {
    const { container } = renderForm()
    expect(container.textContent).not.toMatch(/base price/i)
    expect(container.textContent).not.toMatch(/\$150/)
  })

  it('states the real price ladder, not the prototype’s invented sizes', () => {
    const { container } = renderForm()
    // The prototype offered 24×30 and 32×40, which are not sizes that exist.
    expect(container.textContent).not.toMatch(/24×30|32×40/)
    expect(container.textContent).toMatch(/\$5\s*–\s*\$65|\$5–\$65/)
    expect(container.textContent).toMatch(/all seven sizes/i)
  })

  it('says Draft, never Unlisted (product.md §8 q4)', () => {
    const { container } = renderForm()
    expect(container.textContent).not.toMatch(/unlisted/i)
    expect(container.textContent).not.toMatch(/direct link/i)
    expect(container.textContent).toMatch(/draft/i)
  })

  it('builds no Aura tile (design.md §11.4-C’s own correction)', () => {
    const { container } = renderForm()
    expect(container.textContent).not.toMatch(/aura/i)
  })

  it('offers a silver dropzone only when the toggle is on, and beside it', () => {
    const { container } = renderForm()
    const toggle = container.querySelector('#ingest-silver-toggle')!
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(container.textContent).not.toMatch(/silver original/i)
  })

  it('blocks Save & publish before a file is chosen', () => {
    const { container } = renderForm()
    const publish = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Save & publish'),
    )!
    expect(publish.hasAttribute('disabled')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ingest-surface.test.tsx`
Expected: FAIL — cannot resolve `@/components/admin/IngestForm`.

- [ ] **Step 3: Write `components/admin/IngestProgress.tsx`**

```tsx
'use client'

export type StepKey = 'upload' | 'colour' | 'silver' | 'finish'
export type StepState = 'pending' | 'active' | 'done' | 'failed'

export const STEP_LABELS: Record<StepKey, string> = {
  upload: 'Uploading the original',
  colour: 'Generating the colour sizes',
  silver: 'Generating the silver sizes',
  finish: 'Checking every size exists',
}

/**
 * product.md §1. A bare spinner claims nothing while thirty seconds pass, and a
 * premature "Saved" is the Order.tsx 900ms-setTimeout defect wearing new
 * clothes. Each step names what is actually happening, and a failure says which
 * step failed rather than reporting success for a photograph that is not there.
 */
export function IngestProgress({
  steps,
  message,
  failed,
}: {
  steps: { key: StepKey; state: StepState }[]
  message: string | null
  failed: boolean
}) {
  return (
    <div className="admin-progress" role="status" aria-live="polite">
      <ul className="admin-progress-steps">
        {steps.map(({ key, state }) => (
          <li key={key} className={`admin-progress-step is-${state}`}>
            <span aria-hidden="true">
              {state === 'done' ? '✓' : state === 'failed' ? '✕' : state === 'active' ? '…' : '·'}
            </span>
            {STEP_LABELS[key]}
          </li>
        ))}
      </ul>
      {message ? (
        <p className={`admin-progress-message${failed ? ' is-failed' : ''}`}>{message}</p>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Write `components/admin/IngestForm.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { deriveSlug } from '@/lib/ingest/slug'
import { priceRangeLabel } from '@/lib/format/price'
import { supabaseBrowser } from '@/lib/supabase/client'
import { beginIngest, createPhotoDraft, generateRegister, finishIngest } from '@/lib/ingest/actions'
import { ORIGINALS_BUCKET } from '@/lib/ingest/keys'
import type { AdminCollection } from '@/lib/data/photos-admin'
import { Dropzone } from '@/components/admin/Dropzone'
import { CropPreview } from '@/components/admin/CropPreview'
import { IngestProgress, type StepKey, type StepState } from '@/components/admin/IngestProgress'

interface Measured {
  widthPx: number
  heightPx: number
  aspectRatio: number
}

export function IngestForm({ collections }: { collections: AdminCollection[] }) {
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [caption, setCaption] = useState('')
  const [description, setDescription] = useState('')
  const [altText, setAltText] = useState('')
  const [collectionId, setCollectionId] = useState('')

  const [colourFile, setColourFile] = useState<File | null>(null)
  const [colourUrl, setColourUrl] = useState<string | null>(null)
  const [silverOn, setSilverOn] = useState(false)
  const [silverFile, setSilverFile] = useState<File | null>(null)
  const [publishNow, setPublishNow] = useState(false)

  const [measured, setMeasured] = useState<Measured | null>(null)
  const [busy, setBusy] = useState(false)
  const [steps, setSteps] = useState<{ key: StepKey; state: StepState }[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const ladder = useMemo(() => priceRangeLabel(), [])

  function chooseColour(file: File | null) {
    setColourFile(file)
    setMeasured(null)
    if (!file) {
      setColourUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setColourUrl(url)
    // Browser-side measurement is a COURTESY so the crop guides appear at once.
    // TIFF cannot be decoded here; the server measures on save and is always
    // authoritative. Nothing is claimed until one of them has really measured.
    const probe = new Image()
    probe.onload = () =>
      setMeasured({
        widthPx: probe.naturalWidth,
        heightPx: probe.naturalHeight,
        aspectRatio: probe.naturalWidth / probe.naturalHeight,
      })
    probe.src = url
  }

  function setStep(key: StepKey, state: StepState) {
    setSteps((prev) => (prev ?? []).map((s) => (s.key === key ? { ...s, state } : s)))
  }

  function fail(text: string, key: StepKey) {
    setStep(key, 'failed')
    setMessage(text)
    setFailed(true)
    setBusy(false)
  }

  async function save(publish: boolean) {
    if (!colourFile) return
    const useSilver = silverOn && silverFile !== null

    setBusy(true)
    setFailed(false)
    setMessage(null)
    setSteps([
      { key: 'upload', state: 'active' },
      { key: 'colour', state: 'pending' },
      ...(useSilver ? ([{ key: 'silver' as const, state: 'pending' as const }]) : []),
      { key: 'finish', state: 'pending' },
    ])

    const begun = await beginIngest({
      slug,
      title,
      colour: { mime: colourFile.type, bytes: colourFile.size },
      ...(useSilver ? { silver: { mime: silverFile!.type, bytes: silverFile!.size } } : {}),
    })
    if (!begun.ok) return fail(begun.message, 'upload')

    const storage = supabaseBrowser().storage.from(ORIGINALS_BUCKET)
    for (const target of begun.targets) {
      const file = target.register === 'colour' ? colourFile : silverFile!
      // uploadToSignedUrl, NOT a hand-rolled fetch: it wraps a Blob body in
      // FormData with cacheControl and PUTs to /object/upload/sign/<path>?token=.
      const { error } = await storage.uploadToSignedUrl(target.bucketPath, target.token, file)
      if (error) return fail('The upload didn’t finish. Nothing was saved.', 'upload')
    }
    setStep('upload', 'done')

    setStep('colour', 'active')
    const draft = await createPhotoDraft({
      slug,
      title,
      caption: caption.trim() || null,
      description: description.trim() || null,
      altText: altText.trim() || null,
      collectionId: collectionId || null,
      colourExt: colourFile.name.split('.').pop() ?? 'jpg',
      silverExt: useSilver ? (silverFile!.name.split('.').pop() ?? 'jpg') : null,
    })
    if (!draft.ok) return fail(draft.message, 'colour')
    setMeasured({ widthPx: draft.widthPx, heightPx: draft.heightPx, aspectRatio: draft.aspectRatio })

    const colourStep = await generateRegister({ photoId: draft.photoId, register: 'colour' })
    if (!colourStep.ok) return fail(`${colourStep.message} It’s saved as a draft — retry from Photographs.`, 'colour')
    setStep('colour', 'done')

    if (useSilver) {
      setStep('silver', 'active')
      const silverStep = await generateRegister({ photoId: draft.photoId, register: 'silver' })
      if (!silverStep.ok) return fail(`${silverStep.message} It’s saved as a draft — retry from Photographs.`, 'silver')
      setStep('silver', 'done')
    }

    setStep('finish', 'active')
    const finished = await finishIngest({ photoId: draft.photoId, publish })
    if (!finished.ok) return fail(`${finished.message} It’s saved as a draft — retry from Photographs.`, 'finish')
    setStep('finish', 'done')

    router.push('/admin/photographs')
    router.refresh()
  }

  const canSave = colourFile !== null && slug !== '' && title.trim() !== '' && !busy
  const canPublish = canSave && altText.trim() !== ''

  return (
    <div className="admin-ingest">
      <div>
        <Dropzone
          label="The colour original"
          hint="Drag it in, or choose a file. JPEG, PNG, TIFF or WebP, at least 1800px wide."
          file={colourFile}
          hasPreview={colourUrl !== null}
          onFile={chooseColour}
          disabled={busy}
        >
          {colourUrl ? <CropPreview src={colourUrl} aspectRatio={measured?.aspectRatio ?? null} /> : null}
        </Dropzone>

        <div className="admin-toggles" style={{ marginTop: 16 }}>
          <div className="admin-toggle">
            <span className="admin-toggle-copy">
              <strong>Offer a silver (B&amp;W) variant</strong>
              <span>Your own conversion, uploaded separately. Nothing is desaturated for you.</span>
            </span>
            <button
              id="ingest-silver-toggle"
              type="button"
              role="switch"
              aria-checked={silverOn}
              aria-label="Offer a silver (B&W) variant"
              className="admin-switch"
              disabled={busy}
              onClick={() => setSilverOn((on) => !on)}
            />
          </div>
        </div>

        {silverOn ? (
          <div style={{ marginTop: 16 }}>
            <Dropzone
              label="The silver original"
              hint="Your hand-converted black-and-white file."
              file={silverFile}
              hasPreview={false}
              onFile={setSilverFile}
              disabled={busy}
            />
          </div>
        ) : null}

        <div className="admin-detected">
          <p className="admin-detected-label">Detected</p>
          {colourFile ? (
            <>
              <p className="admin-detected-line">{colourFile.name}</p>
              <p className="admin-detected-sub">
                {(colourFile.size / 1_048_576).toFixed(1)} MB
                {measured ? ` · ${measured.widthPx} × ${measured.heightPx}` : ' · dimensions measured on save'}
              </p>
            </>
          ) : (
            <p className="admin-detected-sub">Nothing chosen yet.</p>
          )}
        </div>

        <p className="admin-ingest-note">
          On save: the original is stored privately · six widths in AVIF and WebP are generated once
          per register · nothing is published until every one of them exists.
        </p>
      </div>

      <div className="admin-form">
        <div className="admin-formfield">
          <label htmlFor="ingest-title">Title</label>
          <input
            id="ingest-title" className="admin-input is-title" value={title} disabled={busy}
            onChange={(e) => {
              setTitle(e.target.value)
              if (!slugTouched) setSlug(deriveSlug(e.target.value))
            }}
          />
        </div>

        <div className="admin-formfield">
          <label htmlFor="ingest-slug">
            Web address<span className="admin-formhint">where the print lives</span>
          </label>
          <input
            id="ingest-slug" className="admin-input is-slug" value={slug} disabled={busy}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(deriveSlug(e.target.value))
            }}
          />
          <p className="admin-slugnote">
            /prints/{slug || '…'} — this can’t be changed after saving, because the stored files are
            named after it.
          </p>
        </div>

        <div className="admin-formfield">
          <label htmlFor="ingest-caption">
            Caption<span className="admin-formhint">short line on the card</span>
          </label>
          <input id="ingest-caption" className="admin-input is-prose" value={caption} disabled={busy}
            onChange={(e) => setCaption(e.target.value)} />
        </div>

        <div className="admin-formfield">
          <label htmlFor="ingest-description">
            Description<span className="admin-formhint">the print’s page</span>
          </label>
          <textarea id="ingest-description" className="admin-input is-prose-long" value={description}
            disabled={busy} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="admin-formfield">
          <label htmlFor="ingest-alt">
            Alt text
            <span className="admin-formhint is-a11y">describes the image — accessibility</span>
          </label>
          <textarea id="ingest-alt" className="admin-input is-alt" value={altText} disabled={busy}
            onChange={(e) => setAltText(e.target.value)} />
        </div>

        <div className="admin-formfield">
          <label htmlFor="ingest-collection">Collection</label>
          <select id="ingest-collection" className="admin-select" value={collectionId} disabled={busy}
            onChange={(e) => setCollectionId(e.target.value)}>
            <option value="">{collections.length ? 'None' : 'No collections yet'}</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="admin-formfield">
          <p className="admin-detected-label" style={{ marginBottom: 9 }}>Sizes and price</p>
          <p className="admin-ladder">
            Every photograph is offered in all seven sizes, {ladder}, priced by size.
          </p>
        </div>

        <div className="admin-toggles">
          <div className="admin-toggle">
            <span className="admin-toggle-copy">
              <strong>Publish now</strong>
              <span>Off saves it as a draft — not visible to anyone.</span>
            </span>
            <button id="ingest-publish-toggle" type="button" role="switch" aria-checked={publishNow}
              aria-label="Publish now" className="admin-switch" disabled={busy}
              onClick={() => setPublishNow((on) => !on)} />
          </div>
        </div>

        <div className="admin-actions">
          <button type="button" className="admin-btn is-wide" disabled={!canPublish}
            onClick={() => save(true)}>
            Save &amp; publish
          </button>
          <button type="button" className="admin-btn2" disabled={!canSave} onClick={() => save(false)}>
            Save as draft
          </button>
        </div>

        {!canPublish && canSave ? (
          <p className="admin-slugnote">Alt text is required before publishing.</p>
        ) : null}

        {steps ? <IngestProgress steps={steps} message={message} failed={failed} /> : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Write the page**

Create `app/admin/(protected)/photographs/new/page.tsx`:

```tsx
import Link from 'next/link'
import { listCollections } from '@/lib/data/photos-admin'
import { IngestForm } from '@/components/admin/IngestForm'

export const dynamic = 'force-dynamic'

export default async function NewPhotographPage() {
  // listCollections calls requireAdmin() first — the boundary is the data
  // access layer, never the layout (slice 4a §3.1).
  const collections = await listCollections()

  return (
    <>
      <nav className="admin-crumb" aria-label="Breadcrumb">
        <Link href="/admin/photographs">← Photographs</Link>
        <span className="admin-crumb-sep" aria-hidden="true">/</span>
        <span className="admin-crumb-here">New photograph</span>
      </nav>
      <IngestForm collections={collections ?? []} />
    </>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/ingest-surface.test.tsx`
Expected: PASS, 9 tests.

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add components/admin/IngestProgress.tsx components/admin/IngestForm.tsx "app/admin/(protected)/photographs/new/page.tsx" test/ingest-surface.test.tsx
git commit -m "feat(ingest): Surface C — the ingest form

Uploads via uploadToSignedUrl rather than a hand-rolled fetch: the library
wraps a Blob body in FormData with cacheControl and PUTs to
/object/upload/sign/<path>?token=, which a plain fetch does not match. This is
lib/supabase/client.ts's first consumer since slice 1 -- and it is not what
slice 4a avoided, which was @supabase/ssr's cookie-bound auth client.

The prototype's Base price select and its four size chips are gone: two of the
four sizes it offered (24×30, 32×40) are not sizes that exist, and no price on
that row was real. A read-only line states the real ladder instead.

Progress names the step actually running. A premature success claim is the
Order.tsx setTimeout defect (product.md §1), so a failure says which step
failed and leaves a retryable draft.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: The Photographs landing, and the nav goes live

**Files:**
- Create: `components/admin/PhotoList.tsx`
- Create: `app/admin/(protected)/photographs/page.tsx`
- Modify: `components/admin/AdminNav.tsx`
- Test: `test/photographs-landing.test.tsx` (create), `test/admin-nav.test.tsx` (modify)

**Interfaces:**
- Consumes: `listPhotos` (Task 7); `generateRegister`, `finishIngest`, `deletePhoto` (Task 6).
- Produces: `/admin/photographs`, and `Photographs` as the second live nav item.

**This landing is deliberately plain and explicitly NOT `design.md §11.4-B`** — exactly as slice 4a's placeholder was not `§11.4-A`. Slice 5b replaces it wholesale with the 4-col work-card grid, filter chips, counts and search. Do not build those here.

- [ ] **Step 1: Write the failing tests**

Create `test/photographs-landing.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { PhotoList } from '@/components/admin/PhotoList'
import type { AdminPhoto } from '@/lib/data/photos-admin'

vi.mock('@/lib/ingest/actions', () => ({
  generateRegister: vi.fn(),
  finishIngest: vi.fn(),
  deletePhoto: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

beforeEach(cleanup)

const base: AdminPhoto = {
  id: 'p1', slug: 'evil-lies', title: 'Evil Lies',
  published: true, derivatives_ready: true, has_bw_variant: false,
  created_at: '2026-07-19T12:00:00Z',
}

describe('PhotoList', () => {
  it('distinguishes an empty library from an unreadable one', () => {
    const empty = render(<PhotoList photos={[]} />)
    expect(empty.container.textContent).toMatch(/No photographs yet/i)
    cleanup()
    const broken = render(<PhotoList photos={null} />)
    expect(broken.container.textContent).toMatch(/couldn’t read/i)
    expect(broken.container.textContent).not.toMatch(/No photographs yet/i)
  })

  it('labels status as text, never colour alone', () => {
    const { container } = render(<PhotoList photos={[base, { ...base, id: 'p2', slug: 'draft-one', published: false }]} />)
    expect(container.textContent).toMatch(/Published/)
    expect(container.textContent).toMatch(/Draft/)
  })

  it('never says Unlisted (product.md §8 q4)', () => {
    const { container } = render(<PhotoList photos={[{ ...base, published: false }]} />)
    expect(container.textContent).not.toMatch(/unlisted/i)
  })

  it('flags an incomplete ladder and offers a retry', () => {
    const { container } = render(<PhotoList photos={[{ ...base, published: false, derivatives_ready: false }]} />)
    expect(container.textContent).toMatch(/Derivatives incomplete/i)
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.match(/Retry/i))).toBe(true)
  })

  it('shows no retry when the ladder is complete', () => {
    const { container } = render(<PhotoList photos={[base]} />)
    expect(container.textContent).not.toMatch(/Derivatives incomplete/i)
  })

  it('offers Delete on a draft but not on a published photograph', () => {
    // The server refuses independently; the control simply does not appear
    // rather than appearing and then refusing (product.md §1).
    const draft = render(<PhotoList photos={[{ ...base, published: false }]} />)
    expect([...draft.container.querySelectorAll('button')].some((b) => b.textContent === 'Delete')).toBe(true)
    cleanup()
    const live = render(<PhotoList photos={[base]} />)
    expect([...live.container.querySelectorAll('button')].some((b) => b.textContent === 'Delete')).toBe(false)
  })
})
```

Modify `test/admin-nav.test.tsx`. Find the assertion that exactly one item is a link and update it — Dashboard and Photographs are now both live, three items remain marked:

```tsx
  it('has two live links now: Dashboard and Photographs', () => {
    const { container } = render(<AdminNav />)
    const links = [...container.querySelectorAll('a')]
    expect(links.map((a) => a.textContent?.trim())).toEqual(['Dashboard', 'Photographs'])
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/admin', '/admin/photographs'])
  })

  it('still marks the three unbuilt items', () => {
    const { container } = render(<AdminNav />)
    const marks = [...container.querySelectorAll('.admin-mark')]
    expect(marks).toHaveLength(3)
    expect(marks.every((m) => m.textContent === 'NOT BUILT')).toBe(true)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/photographs-landing.test.tsx test/admin-nav.test.tsx`
Expected: FAIL — `PhotoList` unresolved; nav still has one link.

- [ ] **Step 3: Write `components/admin/PhotoList.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generateRegister, finishIngest, deletePhoto } from '@/lib/ingest/actions'
import type { AdminPhoto } from '@/lib/data/photos-admin'

/**
 * Slice 5a's landing. Deliberately plain and explicitly NOT design.md §11.4-B
 * -- slice 5b replaces it wholesale with the work-card grid, filter chips and
 * counts, exactly as 4b replaced 4a's placeholder.
 *
 * `photos === null` means the READ FAILED. Rendering "No photographs yet" then
 * would be a confident lie about an empty library (slice 4b D7).
 */
export function PhotoList({ photos }: { photos: AdminPhoto[] | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<string | null>(null)

  if (photos === null) {
    return (
      <p className="admin-empty">
        Couldn’t read the photographs. Nothing is shown rather than guessed.
      </p>
    )
  }

  if (photos.length === 0) {
    return <p className="admin-empty">No photographs yet.</p>
  }

  function remove(photo: AdminPhoto) {
    // Deleting destroys the original the lab export pulls (product.md §6.2), so
    // it is confirmed, and the server refuses independently of this dialog.
    if (!window.confirm(`Delete “${photo.title}” and its stored files? This can’t be undone.`)) return
    startTransition(async () => {
      setNotice(null)
      const result = await deletePhoto({ photoId: photo.id })
      if (!result.ok) setNotice(result.message)
      else router.refresh()
    })
  }

  function retry(photo: AdminPhoto) {
    startTransition(async () => {
      setNotice(null)
      const colour = await generateRegister({ photoId: photo.id, register: 'colour' })
      if (!colour.ok) return setNotice(colour.message)
      if (photo.has_bw_variant) {
        const silver = await generateRegister({ photoId: photo.id, register: 'silver' })
        if (!silver.ok) return setNotice(silver.message)
      }
      const done = await finishIngest({ photoId: photo.id, publish: false })
      setNotice(done.ok ? 'Every size is present now. It’s still a draft.' : done.message)
    })
  }

  return (
    <>
      {notice ? <p className="admin-empty" role="status">{notice}</p> : null}
      <ul className="admin-photolist">
        {photos.map((photo) => (
          <li key={photo.id} className="admin-photorow">
            <div>
              <div className="admin-photorow-title">{photo.title}</div>
              <div className="admin-photorow-sub">
                /prints/{photo.slug}
                {photo.has_bw_variant ? ' · colour + silver' : ' · colour'}
              </div>
            </div>
            {photo.derivatives_ready ? (
              <span className={`admin-status ${photo.published ? 'is-live' : 'is-draft'}`}>
                {photo.published ? 'Published' : 'Draft'}
              </span>
            ) : (
              <span className="admin-status is-incomplete">Derivatives incomplete</span>
            )}
            {photo.derivatives_ready ? (
              <span />
            ) : (
              <button type="button" className="admin-btn2" disabled={pending} onClick={() => retry(photo)}>
                Retry
              </button>
            )}
            {photo.published ? (
              // A published photograph is not deletable here, and the control
              // says so rather than appearing and then refusing.
              <span />
            ) : (
              <button type="button" className="admin-btn2" disabled={pending} onClick={() => remove(photo)}>
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
```

- [ ] **Step 4: Write the landing page**

Create `app/admin/(protected)/photographs/page.tsx`:

```tsx
import Link from 'next/link'
import { listPhotos } from '@/lib/data/photos-admin'
import { PhotoList } from '@/components/admin/PhotoList'

export const dynamic = 'force-dynamic'

export default async function PhotographsPage() {
  const photos = await listPhotos()
  const count = photos?.length ?? 0

  return (
    <>
      <div className="admin-band">
        <p className="admin-band-kicker">The library</p>
        <h1 className="admin-band-h1">Photographs</h1>
        <p className="admin-meta">
          {photos === null ? 'Count unavailable' : `${count} ${count === 1 ? 'work' : 'works'}`}
        </p>
        <Link className="admin-btn" href="/admin/photographs/new">＋ Post a photo</Link>
      </div>
      <PhotoList photos={photos} />
    </>
  )
}
```

- [ ] **Step 5: Make the nav item live**

In `components/admin/AdminNav.tsx`, change the `Photographs` entry only:

```ts
  { label: 'Photographs', href: '/admin/photographs' },
```

and delete its trailing `// slice 5` comment. Leave the other four entries untouched.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/photographs-landing.test.tsx test/admin-nav.test.tsx`
Expected: both PASS.

Run: `npm run typecheck && npm run lint && npm run build && npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add components/admin/PhotoList.tsx "app/admin/(protected)/photographs/page.tsx" components/admin/AdminNav.tsx test/photographs-landing.test.tsx test/admin-nav.test.tsx
git commit -m "feat(admin): the Photographs landing, and the nav item goes live

Deliberately plain and explicitly NOT design.md §11.4-B -- slice 5b replaces
it wholesale, as 4b replaced 4a's placeholder.

photos === null means the read FAILED; rendering 'No photographs yet' then
would be a confident lie about an empty library (4b D7). The two states read
differently on purpose.

Retry is manifest-driven so a browser closed mid-ingest is recoverable, and
'＋ Post a photo' becomes the admin's first live primary action -- 4b rendered
it marked NOT BUILT.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Documentation writeback

**Files:**
- Modify: `CLAUDE.md`
- Modify: `design.md`
- Modify: `product.md`

**Interfaces:** none. This task ships no code.

Following the `docs/design-md-admin-writeback` precedent (PR #4). Left undone, the next slice's agent reads `§11.4-C` as authoritative and rebuilds the surface this slice deliberately did not build.

- [ ] **Step 1: Update `CLAUDE.md`**

- In the verification table, replace the stale test count with the real final number from `npm test`.
- In the Architecture tree, add under `lib/`:
  ```
  ingest/{slug,keys,plan,validate,process,actions}.ts  # the ingest pipeline (slice 5a)
  ```
  and under `app/admin/(protected)/`:
  ```
  photographs/{page,new/page}.tsx    # library landing + Surface C ingest
  ```
- In the Roadmap, mark **Slice 5a — Admin ingest: DONE** and note 5b (`§11.4-B`) as next.
- Add to the Data model section: `photos.derivatives_ready` and the `derivatives_required_when_published` constraint, alongside the existing note about the two honest-function invariants — there are now **three**.

- [ ] **Step 2: Update `design.md`**

- **`§11.4-C`**: append a blockquote recording deviations **D16–D24** (list them from spec §11), stating that six are handoff defects (D16, D18, D19, D20, D23, D24), D17 applies a defect `§11.7` already documented, and D21/D22 fill gaps.
- **`§11.7`**: mark resolved, in place, never renumbering:
  - Per-photo pricing (`q3`) — **deferred, not declined**; its own slice after 5b. Record the three findings from spec §13 (the equivalence lock survives; seven call sites; `prints/page.tsx:24`'s module-scope `FROM_PRICE`).
  - `unlisted` (`q4`) — **resolved: a leftover.** The state is Draft.
  - Storefront freshness (`q5`) — **resolved: on-demand revalidation**, asserted in `test/ingest-actions.test.ts`.
  - How the ordered crop reaches the lab — **resolved: Nations' own site crops.** Record the centre-crop convention and the drift risk carried to slice 7.
- **`§10 q3`** (the aura) — **resolved:** computed and stored at ingest as a single `{r,g,b}`; no UI; the `§11.4-C` tile is not built.
- **`§11.4-E`**: delete the "How the ordered crop reaches Nations is genuinely open" blockquote and replace it with the answer.

- [ ] **Step 3: Update `product.md`**

- **`§8`**: mark **q3** (deferred with a pointer to its own slice), **q4**, **q5** and **q7** answered in place, dated 2026-07-19. Do not renumber — `design.md §11.7` cites them by number.
- **`§3`**: update the aura blockquote — the column is now written, and still read by nothing, deliberately.
- **`§3.2`**: note that the ladder is implemented in `lib/ingest/plan.ts` and locked to `lib/images/derivatives.ts` by `test/ingest-core.test.ts`.
- **`§5.2`**: change "published/unlisted" to "published/draft", and record that silver arrives as a **separately uploaded file**, never a server-side desaturation.
- **`§6.2`**: replace "Still open — how the ordered crop reaches Nations" with the answer.

- [ ] **Step 4: Verify the gate one final time**

Run: `npm run lint && npm run typecheck && npm run build && npm test`
Expected: all four green. Record the final test count.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md design.md product.md
git commit -m "docs(slice-5a): write slice 5's decisions back into the source-of-truth docs

Closes product.md §8 q4, q5 and q7 in place, and records q3 as deferred rather
than declined with the three findings its own slice inherits. Closes
design.md §10 q3. Records deviations D16-D24 against §11.4-C, six of which are
handoff defects rather than build-time disagreements.

Left undone, the next slice's agent reads §11.4-C as authoritative and rebuilds
the surface this slice deliberately did not build.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done

Slice 5a is complete when: `npm run lint`, `npm run typecheck`, `npm run build` and `npm test` are all green, and spec §12.2's ten manual checks pass — the load-bearing ones being that publishing updates the storefront in **seconds, not an hour**, that a killed network mid-generate leaves a retryable draft rather than a broken gallery, and that publishing with empty alt text or an incomplete ladder is refused **by Postgres**, not merely by the UI.
