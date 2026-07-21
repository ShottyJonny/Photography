# Photo Edit Surface + Bulk Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a photo's text fields editable after ingest (Phase A), then bulk-import the ~23 legacy photographs as drafts with real derivatives (Phase B).

**Architecture:** Phase A adds one Server Action (`updatePhoto`), one read (`getPhotoForEdit`), an edit page, and a lightweight edit form reusing slice 5a's `admin-*` field CSS — a single-table update on four columns, no file handling. Phase B is a run-once local Node script that loops slice 5a's ingest **core** (`slug`/`keys`/`plan`/`validate`/`process`) over the legacy files against a direct service-key client.

**Tech Stack:** Next.js 16.2 (App Router), React 19, TypeScript strict, `@supabase/supabase-js`, `sharp` 0.35, Vitest 2.1, Node 22.

**Spec:** `docs/superpowers/specs/2026-07-20-photo-edit-and-bulk-import-design.md`. Read it before starting.

## Global Constraints

Every task's requirements implicitly include this section.

- **Phase A branch off `develop`.** Never commit to `develop` or `main`. Never `--no-verify`/`--force`.
- **Every commit message ends with:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Gate, all green:** `npm run lint` (0 errors AND 0 warnings), `npm run typecheck`, `npm run build`, `npm test`.
- **Baseline: 1771 tests passing.** Never let it drop.
- **`requireAdmin()` is the first statement of every Server Action and admin read.** Import from `@/lib/admin/require-admin`. `test/admin-routes.test.ts` walks `lib/admin/`, `lib/ingest/`, `app/admin/`, `components/admin/` for `'use server'` files and requires the literal `requireAdmin` in each `export async function`. **`updatePhoto` goes in `lib/admin/`, already walked — no walker change, no exemption.**
- **`import 'server-only'` at the top of every server-only module.** Vitest neutralizes it via `test/stubs/server-only.ts`.
- **DB is snake_case.** The `photos` columns edited are `title, caption, description, alt_text`.
- **Money code untouched:** `lib/pricing.ts`, `lib/checkout/*`, `lib/orders/*`, `/api/checkout`, `/api/stripe-webhook`.
- **Storefront read path untouched:** `lib/images/derivatives.ts`, `components/store/Plate.tsx`, `lib/data/photos.ts`.
- **Apostrophes in JSX are `’` (U+2019), never `'`** — `react/no-unescaped-entities` is a 0-warning gate.
- **No `@testing-library/jest-dom`** — assert on `document.querySelector`/`textContent`/attributes.
- **Never construct a real Supabase client in a test** — mock the module. **Mock `redirect()`/`notFound()` to throw.**
- **Admin copy is terse** (`Edit`, `Save`, not explanatory sentences). Form-control borders use `--hairform`; `min-height:44px` on controls; no `outline:none`.
- **`revalidateTag` takes TWO args in Next 16.2:** `revalidateTag('photos', 'max')`. One arg is a typecheck error.
- **Next 16 route params are a Promise:** `params: Promise<{ id: string }>`, `const { id } = await params`.

---

## File Structure

```
Phase A — app code (branch off develop)
  lib/data/photos-admin.ts            MODIFY  + getPhotoForEdit(id)
  lib/admin/photo-actions.ts          NEW  'use server'  updatePhoto
  components/admin/EditForm.tsx        NEW  'use client'
  components/admin/PhotoList.tsx       MODIFY  + Edit link column
  app/admin/(protected)/photographs/[id]/edit/page.tsx   NEW
  app/globals.css                      MODIFY  photorow grid 4→5 cols
  test/photo-edit-actions.test.ts      NEW
  test/edit-form.test.tsx              NEW
  test/photographs-landing.test.tsx    MODIFY  assert the Edit link

Phase B — run-once script (NOT part of the app build)
  package.json                          MODIFY  + tsx devDependency
  lib/import/plan.ts                    NEW  pure planImports() (testable)
  scripts/neutralize-server-only.mjs   NEW  loader registering the resolver
  scripts/server-only-resolver.mjs     NEW  resolver: server-only -> empty stub
  scripts/server-only-stub.mjs          NEW  the empty stub (plain JS, no transpile)
  scripts/bulk-import.mts               NEW  the runner
  test/import-plan.test.ts              NEW  covers planImports
```

---

## Task 1: `getPhotoForEdit` read

**Files:**
- Modify: `lib/data/photos-admin.ts`
- Test: `test/photo-edit-actions.test.ts` (create — shared with Task 2)

**Interfaces:**
- Consumes: `requireAdmin`, `createAuthServerClient` (existing).
- Produces: `EditablePhoto` type and `getPhotoForEdit(id: string): Promise<EditablePhoto | null>` — used by Task 4's page.

- [ ] **Step 1: Write the failing test**

Create `test/photo-edit-actions.test.ts` (Task 2 appends to it):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAdmin = vi.fn(async () => ({ id: 'admin', email: 'jon@example.com' }))
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin: () => requireAdmin() }))

const db = { photos: [] as Record<string, unknown>[] }
let failRead = false

function fakeClient() {
  return {
    from: () => ({
      select: () => ({
        eq: (_c: string, id: string) => ({
          maybeSingle: async () =>
            failRead
              ? { data: null, error: { message: 'read failed' } }
              : { data: db.photos.find((p) => p.id === id) ?? null, error: null },
        }),
      }),
    }),
  }
}
vi.mock('@/lib/supabase/auth-server', () => ({ createAuthServerClient: async () => fakeClient() }))

import { getPhotoForEdit } from '@/lib/data/photos-admin'

beforeEach(() => {
  db.photos = [{
    id: 'p1', slug: 'grand-ring', title: 'Grand Ring',
    caption: 'a line', description: 'a page', alt_text: 'alt here', published: true,
  }]
  failRead = false
  vi.clearAllMocks()
})

describe('getPhotoForEdit', () => {
  it('calls requireAdmin and returns the editable fields', async () => {
    const p = await getPhotoForEdit('p1')
    expect(requireAdmin).toHaveBeenCalledOnce()
    expect(p).toMatchObject({ slug: 'grand-ring', title: 'Grand Ring', alt_text: 'alt here', published: true })
  })

  it('returns null for an unknown id (no such photo)', async () => {
    expect(await getPhotoForEdit('nope')).toBeNull()
  })

  it('returns null when the read errors (distinct from not-found, but both null here)', async () => {
    failRead = true
    expect(await getPhotoForEdit('p1')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/photo-edit-actions.test.ts`
Expected: FAIL — `getPhotoForEdit` is not exported.

- [ ] **Step 3: Add the read to `lib/data/photos-admin.ts`**

Append:

```ts
export interface EditablePhoto {
  id: string
  slug: string
  title: string
  caption: string | null
  description: string | null
  alt_text: string | null
  published: boolean
}

const EDIT_COLS = 'id, slug, title, caption, description, alt_text, published'

/** null on a missing row OR a read error. The page treats both as not-editable. */
export async function getPhotoForEdit(id: string): Promise<EditablePhoto | null> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { data, error } = await db.from('photos').select(EDIT_COLS).eq('id', id).maybeSingle()
  if (error) {
    console.error('[admin] getPhotoForEdit failed', error)
    return null
  }
  return (data as EditablePhoto | null) ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/photo-edit-actions.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/data/photos-admin.ts test/photo-edit-actions.test.ts
git commit -m "feat(admin): getPhotoForEdit read for the edit surface

Returns the four editable text fields plus slug and published (needed for the
alt-clear guard and revalidation). null on a missing row or a read error, the
4b §4.2 error-keyed pattern.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `updatePhoto` action

**Files:**
- Create: `lib/admin/photo-actions.ts`
- Test: `test/photo-edit-actions.test.ts` (append)

**Interfaces:**
- Consumes: `requireAdmin`, `createAuthServerClient`, `revalidateTag`.
- Produces:
  - `interface UpdatePhotoInput { photoId: string; title: string; caption: string | null; description: string | null; altText: string | null }`
  - `type UpdateResult = { ok: true } | { ok: false; message: string }`
  - `updatePhoto(input: UpdatePhotoInput): Promise<UpdateResult>` — used by Task 3's form.

- [ ] **Step 1: Write the failing test**

Append to `test/photo-edit-actions.test.ts`. First extend the fake client with `update` and add `revalidateTag`; put these mock additions near the top mocks:

```ts
const revalidateTag = vi.fn()
vi.mock('next/cache', () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a) }))
```

Extend `fakeClient`'s `from()` to also return an `update` builder (replace the `from: () => ({ select... })` with this fuller version):

```ts
    from: () => ({
      select: () => ({
        eq: (_c: string, id: string) => ({
          maybeSingle: async () =>
            failRead
              ? { data: null, error: { message: 'read failed' } }
              : { data: db.photos.find((p) => p.id === id) ?? null, error: null },
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => {
          const row = db.photos.find((p) => p.id === id)
          if (row) Object.assign(row, patch)
          return { error: null }
        },
      }),
    }),
```

Then append the test block:

```ts
import { updatePhoto } from '@/lib/admin/photo-actions'

const GOOD = { photoId: 'p1', title: 'New Title', caption: 'c', description: 'd', altText: 'a' }

describe('updatePhoto', () => {
  it('calls requireAdmin and updates exactly the four text columns', async () => {
    const r = await updatePhoto(GOOD)
    expect(requireAdmin).toHaveBeenCalledOnce()
    expect(r.ok).toBe(true)
    const row = db.photos[0]
    expect(row.title).toBe('New Title')
    expect(row.caption).toBe('c')
    expect(row.description).toBe('d')
    expect(row.alt_text).toBe('a')
    // did NOT touch slug or published
    expect(row.slug).toBe('grand-ring')
    expect(row.published).toBe(true)
  })

  it('rejects a blank title', async () => {
    const r = await updatePhoto({ ...GOOD, title: '   ' })
    expect(r.ok).toBe(false)
    expect(db.photos[0].title).toBe('Grand Ring')
  })

  it('refuses clearing alt on a PUBLISHED photo, and changes nothing', async () => {
    const r = await updatePhoto({ ...GOOD, altText: '' })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.message).toMatch(/alt text/i)
    expect(db.photos[0].alt_text).toBe('alt here')
    expect(db.photos[0].title).toBe('Grand Ring') // no partial write
  })

  it('ALLOWS clearing alt on a draft', async () => {
    db.photos[0].published = false
    const r = await updatePhoto({ ...GOOD, altText: '' })
    expect(r.ok).toBe(true)
    expect(db.photos[0].alt_text).toBeNull()
  })

  it('revalidates all three storefront tags', async () => {
    await updatePhoto(GOOD)
    expect(revalidateTag).toHaveBeenCalledWith('photos', 'max')
    expect(revalidateTag).toHaveBeenCalledWith('photo:grand-ring', 'max')
    expect(revalidateTag).toHaveBeenCalledWith('collections', 'max')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/photo-edit-actions.test.ts`
Expected: FAIL — `@/lib/admin/photo-actions` unresolved.

- [ ] **Step 3: Write `lib/admin/photo-actions.ts`**

```ts
'use server'

import { revalidateTag } from 'next/cache'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

export interface UpdatePhotoInput {
  photoId: string
  title: string
  caption: string | null
  description: string | null
  altText: string | null
}
export type UpdateResult = { ok: true } | { ok: false; message: string }

function blank(v: string | null): boolean {
  return v === null || v.trim() === ''
}

export async function updatePhoto(input: UpdatePhotoInput): Promise<UpdateResult> {
  await requireAdmin()

  if (blank(input.title)) {
    return { ok: false, message: 'A title is required.' }
  }

  const db = await createAuthServerClient()

  const { data: current, error: readErr } = await db
    .from('photos')
    .select('slug, published')
    .eq('id', input.photoId)
    .maybeSingle()
  if (readErr || !current) {
    return { ok: false, message: 'That photograph no longer exists.' }
  }
  const row = current as { slug: string; published: boolean }

  // The DB enforces this too (alt_text_required_when_published). Checking here
  // gives a plain message instead of a raw constraint error.
  if (row.published && blank(input.altText)) {
    return { ok: false, message: 'A published photograph needs alt text. Unpublish it first to clear it.' }
  }

  // Trim every field, and normalise blank optionals to null. updatePhoto is a
  // public POST endpoint, so a raw caller can send untrimmed values the form
  // would have cleaned.
  const clean = (v: string | null): string | null => (blank(v) ? null : v!.trim())

  const { error } = await db
    .from('photos')
    .update({
      title: input.title.trim(),
      caption: clean(input.caption),
      description: clean(input.description),
      alt_text: clean(input.altText),
    })
    .eq('id', input.photoId)
  if (error) {
    return { ok: false, message: 'Couldn’t save the changes.' }
  }

  revalidateTag('photos', 'max')
  revalidateTag(`photo:${row.slug}`, 'max')
  revalidateTag('collections', 'max')
  return { ok: true }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/photo-edit-actions.test.ts test/admin-routes.test.ts`
Expected: both PASS. `admin-routes` still green — `lib/admin/photo-actions.ts` is inside the walked set and contains `requireAdmin`, **no exemption added**.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/photo-actions.ts test/photo-edit-actions.test.ts
git commit -m "feat(admin): updatePhoto — edit the four text fields

Single-table update on title, caption, description, alt_text. Never touches
slug or published. Refuses clearing alt on a published photo with a plain
message rather than letting alt_text_required_when_published throw. Revalidates
photos / photo:<slug> / collections so an edit to a published photo shows on
the storefront in seconds.

Lands in lib/admin, already covered by the requireAdmin structural walker — no
walker change and no exemption.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `EditForm` component

**Files:**
- Create: `components/admin/EditForm.tsx`
- Test: `test/edit-form.test.tsx`

**Interfaces:**
- Consumes: `updatePhoto` (Task 2), `EditablePhoto` (Task 1).
- Produces: `EditForm({ photo }: { photo: EditablePhoto })` — used by Task 4's page.

- [ ] **Step 1: Write the failing test**

Create `test/edit-form.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { EditForm } from '@/components/admin/EditForm'
import type { EditablePhoto } from '@/lib/data/photos-admin'

vi.mock('@/lib/admin/photo-actions', () => ({ updatePhoto: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const PUBLISHED: EditablePhoto = {
  id: 'p1', slug: 'grand-ring', title: 'Grand Ring',
  caption: 'a line', description: 'a page', alt_text: 'alt here', published: true,
}

beforeEach(cleanup)

describe('EditForm', () => {
  it('prefills every field from the photo', () => {
    const { container } = render(<EditForm photo={PUBLISHED} />)
    expect(container.querySelector<HTMLInputElement>('#edit-title')!.value).toBe('Grand Ring')
    expect(container.querySelector<HTMLInputElement>('#edit-caption')!.value).toBe('a line')
    expect(container.querySelector<HTMLTextAreaElement>('#edit-description')!.value).toBe('a page')
    expect(container.querySelector<HTMLTextAreaElement>('#edit-alt')!.value).toBe('alt here')
  })

  it('binds every label to its input', () => {
    render(<EditForm photo={PUBLISHED} />)
    for (const name of ['Title', 'Caption', 'Description', 'Alt text']) {
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.includes(name))
      expect(label, `no label for ${name}`).toBeTruthy()
      expect(document.getElementById(label!.getAttribute('for')!)).toBeTruthy()
    }
  })

  it('shows the slug read-only and permanent', () => {
    const { container } = render(<EditForm photo={PUBLISHED} />)
    expect(container.textContent).toMatch(/grand-ring/)
    expect(container.textContent).toMatch(/can’t be changed/i)
  })

  it('disables Save when a published photo’s alt is emptied', () => {
    const { container } = render(<EditForm photo={PUBLISHED} />)
    const save = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!
    expect(save.hasAttribute('disabled')).toBe(false)
    fireEvent.change(container.querySelector('#edit-alt')!, { target: { value: '' } })
    expect(save.hasAttribute('disabled')).toBe(true)
  })

  it('allows an empty alt on a draft', () => {
    const { container } = render(<EditForm photo={{ ...PUBLISHED, published: false, alt_text: '' }} />)
    const save = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!
    expect(save.hasAttribute('disabled')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/edit-form.test.tsx`
Expected: FAIL — `@/components/admin/EditForm` unresolved.

- [ ] **Step 3: Write `components/admin/EditForm.tsx`**

Reuses the exact `admin-*` field classes from `IngestForm`. No dropzone, no slug editing.

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePhoto } from '@/lib/admin/photo-actions'
import type { EditablePhoto } from '@/lib/data/photos-admin'

export function EditForm({ photo }: { photo: EditablePhoto }) {
  const router = useRouter()
  const [title, setTitle] = useState(photo.title)
  const [caption, setCaption] = useState(photo.caption ?? '')
  const [description, setDescription] = useState(photo.description ?? '')
  const [altText, setAltText] = useState(photo.alt_text ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Emptying alt on a published photo would violate the DB constraint; block Save.
  const altBlocksPublished = photo.published && altText.trim() === ''
  const canSave = title.trim() !== '' && !altBlocksPublished && !busy

  async function save() {
    setBusy(true)
    setMessage(null)
    const result = await updatePhoto({
      photoId: photo.id,
      title,
      caption: caption.trim() || null,
      description: description.trim() || null,
      altText: altText.trim() || null,
    })
    if (!result.ok) {
      setMessage(result.message)
      setBusy(false)
      return
    }
    router.push('/admin/photographs')
    router.refresh()
  }

  return (
    <div className="admin-form" style={{ maxWidth: 640, padding: '34px 40px 40px' }}>
      <div className="admin-formfield">
        <label htmlFor="edit-title">Title</label>
        <input id="edit-title" className="admin-input is-title" value={title} disabled={busy}
          onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="admin-formfield">
        <label htmlFor="edit-slug">Web address</label>
        <input id="edit-slug" className="admin-input is-slug" value={photo.slug} readOnly disabled />
        <p className="admin-slugnote">/prints/{photo.slug} — can’t be changed; the stored files are named after it.</p>
      </div>

      <div className="admin-formfield">
        <label htmlFor="edit-caption">
          Caption<span className="admin-formhint">short line on the card</span>
        </label>
        <input id="edit-caption" className="admin-input is-prose" value={caption} disabled={busy}
          onChange={(e) => setCaption(e.target.value)} />
      </div>

      <div className="admin-formfield">
        <label htmlFor="edit-description">
          Description<span className="admin-formhint">the print’s page</span>
        </label>
        <textarea id="edit-description" className="admin-input is-prose-long" value={description}
          disabled={busy} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="admin-formfield">
        <label htmlFor="edit-alt">
          Alt text<span className="admin-formhint is-a11y">describes the image — accessibility</span>
        </label>
        <textarea id="edit-alt" className="admin-input is-alt" value={altText} disabled={busy}
          onChange={(e) => setAltText(e.target.value)} />
      </div>

      {altBlocksPublished ? (
        <p className="admin-slugnote">Alt text is required while published. Unpublish to clear it.</p>
      ) : null}

      <div className="admin-actions">
        <button type="button" className="admin-btn is-wide" disabled={!canSave} onClick={save}>Save</button>
        <button type="button" className="admin-btn2" disabled={busy}
          onClick={() => router.push('/admin/photographs')}>Cancel</button>
      </div>

      {message ? <p className="admin-slugnote" role="alert">{message}</p> : null}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/edit-form.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add components/admin/EditForm.tsx test/edit-form.test.tsx
git commit -m "feat(admin): EditForm — the four text fields, prefilled

Reuses slice 5a's admin-* field classes; no dropzone, no slug editing (slug is
read-only). Emptying alt on a published photo disables Save with a one-line
note — the UI courtesy over updatePhoto's guarantee, same split as ingest's
publish gate.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: The edit page and the landing Edit link

**Files:**
- Create: `app/admin/(protected)/photographs/[id]/edit/page.tsx`
- Modify: `components/admin/PhotoList.tsx`
- Modify: `app/globals.css`
- Test: `test/photographs-landing.test.tsx` (append)

**Interfaces:**
- Consumes: `getPhotoForEdit` (Task 1), `EditForm` (Task 3).
- Produces: the `/admin/photographs/[id]/edit` route; an `Edit` link on each landing row.

- [ ] **Step 1: Write the failing test**

Append to `test/photographs-landing.test.tsx`:

```tsx
  it('offers an Edit link per row pointing at the edit page', () => {
    const { container } = render(<PhotoList photos={[base]} />)
    const edit = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Edit')
    expect(edit, 'no Edit link').toBeTruthy()
    expect(edit!.getAttribute('href')).toBe('/admin/photographs/p1/edit')
  })
```

(`base` in that file has `id: 'p1'`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/photographs-landing.test.tsx`
Expected: FAIL — no `Edit` link.

- [ ] **Step 3: Add the Edit link to `PhotoList.tsx`**

Add `import Link from 'next/link'` at the top. Then add an Edit link as the row's first action, immediately after the closing `</div>` of the title block (before the status `{photo.derivatives_ready ? ...}`):

```tsx
            <Link className="admin-btn2" href={`/admin/photographs/${photo.id}/edit`}>Edit</Link>
```

- [ ] **Step 4: Widen the row grid**

In `app/globals.css`, find `.admin-photorow` and change its columns from four to five:

```css
.admin-photorow { display: grid; grid-template-columns: 1fr auto auto auto auto; gap: 16px; align-items: center; padding: 14px 10px; border-bottom: 1px solid var(--hairsoft); }
```

Add, so the Edit anchor matches the ghost-button height:

```css
a.admin-btn2 { display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
```

- [ ] **Step 5: Write the edit page**

Create `app/admin/(protected)/photographs/[id]/edit/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPhotoForEdit } from '@/lib/data/photos-admin'
import { EditForm } from '@/components/admin/EditForm'

export const dynamic = 'force-dynamic'

export default async function EditPhotographPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // getPhotoForEdit calls requireAdmin() first — the boundary is the DAL (4a §3.1).
  const photo = await getPhotoForEdit(id)
  if (!photo) notFound()

  return (
    <>
      <nav className="admin-crumb" aria-label="Breadcrumb">
        <Link href="/admin/photographs">← Photographs</Link>
        <span className="admin-crumb-sep" aria-hidden="true">/</span>
        <span className="admin-crumb-here">Edit</span>
      </nav>
      <EditForm photo={photo} />
    </>
  )
}
```

- [ ] **Step 6: Run tests and the gate**

Run: `npx vitest run test/photographs-landing.test.tsx`
Expected: PASS.

Run: `npm run lint && npm run typecheck && npm run build && npm test`
Expected: all green; `/admin/photographs/[id]/edit` compiles as a route.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/(protected)/photographs/[id]/edit/page.tsx" components/admin/PhotoList.tsx app/globals.css test/photographs-landing.test.tsx
git commit -m "feat(admin): edit page and the landing Edit link

/admin/photographs/[id]/edit loads via getPhotoForEdit (requireAdmin first),
404s on an unknown id, renders EditForm. Each landing row gains an Edit link;
the row grid widens 4->5 columns.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Phase A ends here.** Open a PR into `develop`, get it green, merge. Phase B runs after A is merged.

---

## Task 5: The bulk import (Phase B — run-once script)

**Files:**
- Create: `lib/import/plan.ts` (pure, testable)
- Create: `scripts/neutralize-server-only.mjs`
- Create: `scripts/bulk-import.mts`
- Test: `test/import-plan.test.ts`

**Interfaces:**
- Consumes: `deriveSlug` (`@/lib/ingest/slug`), and — in the runner only — `measure`/`encodeLadder` (`@/lib/ingest/process`), `originalKey`/`ORIGINALS_BUCKET`/`DERIVATIVES_BUCKET` (`@/lib/ingest/keys`), `expectedObjects` (`@/lib/ingest/plan`), `validateUpload`/`validateDimensions`/`extensionFor` (`@/lib/ingest/validate`), `supabaseAdmin` (`@/lib/supabase/admin`). (`encodeLadder` already returns each object's `key`, so `derivativeKey` is not called directly.)
- Produces: `planImports()` (pure) and the runnable script.

> **This is a run-once migration script, not part of the app build.** Its IO is verified by `--dry-run` + the real run (spec §B.4), not unit tests. Only its pure decision logic (`planImports`) is unit-tested, because that is the part that decides create-vs-skip and is easy to get wrong.

- [ ] **Step 1: Write the failing test for the pure planner**

Create `test/import-plan.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { planImports } from '@/lib/import/plan'

describe('planImports', () => {
  const files = [
    { basename: 'Grand Ring', colourPath: '/x/Grand Ring.jpg', silverPath: '/x/bw/Grand Ring.jpg' },
    { basename: 'Among Giants', colourPath: '/x/Among Giants.jpg', silverPath: null },
    { basename: 'Never Sleeps', colourPath: '/x/Never Sleeps.jpg', silverPath: null },
  ]

  it('creates files whose slug is not already in the DB', () => {
    const plan = planImports(files, new Set(['among-giants', 'deterioration']))
    const grand = plan.find((p) => p.slug === 'grand-ring')!
    expect(grand.action).toBe('create')
    expect(grand.hasSilver).toBe(true)
  })

  it('skips a file whose slug already exists', () => {
    const plan = planImports(files, new Set(['among-giants']))
    expect(plan.find((p) => p.slug === 'among-giants')!.action).toBe('skip')
  })

  it('derives the slug with the same function ingest uses', () => {
    const plan = planImports(files, new Set())
    expect(plan.map((p) => p.slug)).toEqual(['grand-ring', 'among-giants', 'never-sleeps'])
  })

  it('marks hasSilver only when a silver path is present', () => {
    const plan = planImports(files, new Set())
    expect(plan.find((p) => p.slug === 'grand-ring')!.hasSilver).toBe(true)
    expect(plan.find((p) => p.slug === 'never-sleeps')!.hasSilver).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/import-plan.test.ts`
Expected: FAIL — `@/lib/import/plan` unresolved.

- [ ] **Step 3: Write `lib/import/plan.ts`**

```ts
import { deriveSlug } from '@/lib/ingest/slug'

export interface SourceFile {
  basename: string
  colourPath: string
  silverPath: string | null
}

export interface ImportDecision {
  slug: string
  title: string
  action: 'create' | 'skip'
  reason?: 'exists'
  hasSilver: boolean
  colourPath: string
  silverPath: string | null
}

/** Pure: decide create-vs-skip per file. The runner does the IO. */
export function planImports(files: SourceFile[], existingSlugs: Set<string>): ImportDecision[] {
  return files.map((f) => {
    const slug = deriveSlug(f.basename)
    const exists = existingSlugs.has(slug)
    return {
      slug,
      title: f.basename,
      action: exists ? 'skip' : 'create',
      ...(exists ? { reason: 'exists' as const } : {}),
      hasSilver: f.silverPath !== null,
      colourPath: f.colourPath,
      silverPath: f.silverPath,
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/import-plan.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Install `tsx` and write the server-only loader**

The runner is TypeScript using `@/…` path aliases. Native Node type-stripping strips types but does **not** resolve `@/` aliases, so `tsx` (which reads `tsconfig` `paths`) is load-bearing. Install it:

```bash
npm install --save-dev tsx
```

Create **three** small files. First, `scripts/server-only-stub.mjs` — a **plain-JS** empty module (not the `.ts` test stub, so the loader chain never has to transpile the stub itself):

```js
// Empty. lib/ingest/process.ts and lib/supabase/admin.ts `import 'server-only'`,
// which throws outside a Next server bundle. The resolver points that import here.
export {}
```

Then `scripts/server-only-resolver.mjs` — a resolve hook mapping the bare specifier to that stub:

```js
import { pathToFileURL } from 'node:url'
import { resolve as resolvePath } from 'node:path'

const STUB = pathToFileURL(resolvePath('scripts/server-only-stub.mjs')).href

export async function resolve(specifier, context, next) {
  // Delegate everything else (including tsx's own resolution) down the chain.
  if (specifier === 'server-only') return { url: STUB, shortCircuit: true }
  return next(specifier, context)
}
```

Then `scripts/neutralize-server-only.mjs` — registers the resolver:

```js
// Run the bulk import under: node --import ./scripts/neutralize-server-only.mjs --import tsx ...
// This --import comes BEFORE tsx so the server-only mapping is in the hook chain;
// tsx delegates the bare `server-only` specifier down to our resolver via next().
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./scripts/server-only-resolver.mjs', pathToFileURL('./').href)
```

- [ ] **Step 6: Write the runner**

Create `scripts/bulk-import.mts`. **This is not covered by unit tests — its verification is `--dry-run` then the real run.** Run it with `tsx` (or `node --import tsx`) plus the loader.

```ts
/**
 * ONE-TIME legacy catalogue import. Not part of the app build.
 *
 * Run (dry, default):
 *   node --import ./scripts/neutralize-server-only.mjs --import tsx \
 *     scripts/bulk-import.mts --source "C:/Users/Shott/Photography-main/public/images"
 * Run (for real): add --write
 *
 * Needs .env.local for the service key: prefix with `node --env-file=.env.local ...`
 * or export the vars first.
 *
 * Reuses lib/ingest/* — the same core the admin runs, so derivatives are
 * byte-identical. Imports as DRAFTS (legacy data has no alt; Postgres forbids
 * publishing without it). Skips slugs already in the DB. Idempotent.
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { planImports, type SourceFile, type ImportDecision } from '@/lib/import/plan'
import { measure, encodeLadder } from '@/lib/ingest/process'
import { originalKey, ORIGINALS_BUCKET, DERIVATIVES_BUCKET } from '@/lib/ingest/keys'
import { expectedObjects } from '@/lib/ingest/plan'
import { validateUpload, validateDimensions, extensionFor } from '@/lib/ingest/validate'
import { supabaseAdmin } from '@/lib/supabase/admin'

// The legacy catalogue is all JPG. If that ever changes, derive per file instead.
const JPEG = 'image/jpeg'

const args = process.argv.slice(2)
const write = args.includes('--write')
const sourceRoot = args[args.indexOf('--source') + 1]
if (!sourceRoot) throw new Error('--source <images dir> is required')

const printsDir = join(sourceRoot, 'prints')
const bwDir = join(printsDir, 'bw')

function collectFiles(): SourceFile[] {
  return readdirSync(printsDir)
    .filter((f) => extname(f).toLowerCase() === '.jpg')
    .map((f) => {
      const colourPath = join(printsDir, f)
      const silverPath = existsSync(join(bwDir, f)) ? join(bwDir, f) : null
      return { basename: basename(f, extname(f)), colourPath, silverPath }
    })
}

async function existingSlugs(): Promise<Set<string>> {
  const db = supabaseAdmin()
  const { data, error } = await db.from('photos').select('slug')
  if (error) throw new Error(`could not read photos: ${error.message}`)
  return new Set((data ?? []).map((r: { slug: string }) => r.slug))
}

async function importOne(d: ImportDecision): Promise<void> {
  const db = supabaseAdmin()
  const colour = readFileSync(d.colourPath)
  const upCheck = validateUpload({ mime: JPEG, bytes: colour.length })
  if (!upCheck.ok) throw new Error(`${d.slug}: ${upCheck.message}`)

  const measured = await measure(colour)
  const dimCheck = validateDimensions(measured.widthPx)
  if (!dimCheck.ok) throw new Error(`${d.slug}: ${dimCheck.message}`)

  // Supabase RETURNS errors, it does not throw them — main's try/catch would
  // miss them, printing "created" over a broken row. Check and throw on every one.
  async function put(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
    const { error } = await db.storage.from(bucket).upload(key, body, { contentType, upsert: true })
    if (error) throw new Error(`upload ${key}: ${error.message}`)
  }

  const colourKey = originalKey(d.slug, 'colour', extensionFor(JPEG))
  await put(ORIGINALS_BUCKET, colourKey, colour, JPEG)

  let silverKey: string | null = null
  if (d.hasSilver && d.silverPath) {
    const silver = readFileSync(d.silverPath)
    silverKey = originalKey(d.slug, 'silver', extensionFor(JPEG))
    await put(ORIGINALS_BUCKET, silverKey, silver, JPEG)
  }

  for (const register of d.hasSilver ? (['colour', 'silver'] as const) : (['colour'] as const)) {
    const src = register === 'colour' ? colour : readFileSync(d.silverPath!)
    const objects = await encodeLadder(src, d.slug, register)
    for (const o of objects) await put(DERIVATIVES_BUCKET, o.key, o.body, o.contentType)
  }

  // Verify the manifest before marking ready (what finishIngest does).
  const expected = expectedObjects(d.slug, d.hasSilver)
  const present = new Set<string>()
  for (const register of d.hasSilver ? (['colour', 'silver'] as const) : (['colour'] as const)) {
    const { data } = await db.storage.from(DERIVATIVES_BUCKET).list(`${d.slug}/${register}`)
    for (const e of data ?? []) present.add(`${d.slug}/${register}/${e.name}`)
  }
  const ready = expected.every((k) => present.has(k))

  const { error: insErr } = await db.from('photos').insert({
    slug: d.slug,
    title: d.title,
    caption: null,
    description: null,
    alt_text: null,
    aspect_ratio: measured.aspectRatio,
    width_px: measured.widthPx,
    height_px: measured.heightPx,
    aura: measured.aura,
    published: false,
    derivatives_ready: ready,
    has_bw_variant: d.hasSilver,
    original_key: colourKey,
    original_bw_key: silverKey,
  })
  if (insErr) throw new Error(`insert row: ${insErr.message}`)
}

async function main() {
  const files = collectFiles()
  const plan = planImports(files, await existingSlugs())
  const creates = plan.filter((p) => p.action === 'create')
  const skips = plan.filter((p) => p.action === 'skip')

  console.log(`${files.length} source files · ${creates.length} create · ${skips.length} skip`)
  for (const p of plan) console.log(`  ${p.action.padEnd(6)} ${p.slug}${p.reason ? ` (${p.reason})` : ''}${p.hasSilver ? ' [+silver]' : ''}`)

  if (!write) {
    console.log('\nDRY RUN — nothing written. Re-run with --write to perform the import.')
    return
  }

  for (const d of creates) {
    try {
      await importOne(d)
      console.log(`  created ${d.slug}`)
    } catch (err) {
      console.error(`  FAILED ${d.slug}: ${(err as Error).message}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 7: Exclude `scripts/` from the app typecheck, then verify the gate**

`lib/import/plan.ts` is real app code and stays typechecked. The runner in `scripts/` is run-once tooling that uses `@/` aliases resolved by `tsx` at runtime — it must **not** be part of the app's `tsc`. `tsconfig.json`'s `include` is `**/*.ts`/`**/*.tsx`, which does not match `.mts`, but exclude `scripts` explicitly so the intent is recorded and any future `scripts/*.ts` is covered. In `tsconfig.json`, change `exclude`:

```json
  "exclude": [
    "node_modules",
    "scripts"
  ]
```

Run: `npm run lint && npm run typecheck && npm test`
Expected: all green, `import-plan` tests included (4 new).

- [ ] **Step 8: DRY RUN — the real verification (Jon runs this)**

**Jon runs this against the live project**, not the agent — it holds the service key. From the repo root:

```bash
node --env-file=.env.local --import ./scripts/neutralize-server-only.mjs --import tsx \
  scripts/bulk-import.mts --source "C:/Users/Shott/Photography-main/public/images"
```

Expected: `25 source files · 23 create · 2 skip` (among-giants, deterioration skipped as `exists`), nothing written.

**This run is also the proof the server-only loader works** — the runner imports `lib/ingest/process.ts` and `lib/supabase/admin.ts`, both of which `import 'server-only'`. If the loader chain is wrong, this command throws `This module cannot be imported from a Client Component` (or similar) at import time, before any output. Clean output *is* the check.

**Note on `too-small`:** the dry run only decides create-vs-skip-exists; dimension validation runs under `--write` (a too-small file would surface there as `FAILED <slug>`). All 25 legacy files clear 1800px (verified in the spec brainstorm), so none is expected to fail — but the dry run does not pre-flight dimensions.

- [ ] **Step 9: Commit the script (dry-run verified)**

```bash
git add lib/import/plan.ts scripts/neutralize-server-only.mjs scripts/server-only-resolver.mjs scripts/server-only-stub.mjs scripts/bulk-import.mts test/import-plan.test.ts tsconfig.json package.json package-lock.json
git commit -m "feat: one-time legacy catalogue bulk import

Loops slice 5a's ingest core (slug/keys/plan/validate/process) over the legacy
colour+silver pairs against a direct service-key client — same code the admin
runs, byte-identical derivatives, not the Server Actions (which need an auth
context). Imports as DRAFTS (legacy data has no alt; Postgres forbids
publishing without it) and skips slugs already in the DB, so it is idempotent.

Pure planImports() decides create-vs-skip and is unit-tested; the IO is verified
by --dry-run then the real run. server-only is neutralized by a loader pointing
at the existing test stub. Not part of the app build.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 10: The real run and the `test` row (Jon)**

After the dry run looks right, add `--write`:

```bash
node --env-file=.env.local --import ./scripts/neutralize-server-only.mjs --import tsx \
  scripts/bulk-import.mts --source "C:/Users/Shott/Photography-main/public/images" --write
```

Then delete the junk `test` row (unpublished, unordered):

```sql
delete from photos where slug = 'test';
```

Verify: `/admin/photographs` shows ~23 new `Draft` rows; spot-check one has 12 or 24 derivatives; write its alt in the edit surface and publish; confirm it renders on `/prints`.

---

## Done

Phase A is complete when its four gate checks are green and the PR merges to `develop`. Phase B is complete when the dry run shows 23 create / 2 skip, the real run lands the drafts with complete ladders, the `test` row is gone, and one imported draft has been edited + published through the Phase A surface and renders on `/prints`.
