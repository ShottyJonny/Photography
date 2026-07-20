# Slice 5a-ii — Surface C and the Photographs Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A photograph goes in through the browser and appears on the live storefront — the surfaces over slice 5a-i's pipeline.

**Scope:** Tasks 7–11, continuing 5a-i's numbering. **Depends on `2026-07-19-admin-ingest-pipeline.md` being merged first** — every action, key builder and type it consumes is defined there. Task numbers are not renumbered so cross-references stay valid.

**Architecture:** The browser uploads originals **directly to Supabase Storage** via a server-issued signed upload URL, because Vercel caps serverless request bodies at 4.5 MB and originals are 30–40 MB. Four Server Actions then do the rest, each calling `requireAdmin()` as its first statement. Derivative generation is **staged one call per register** for I/O headroom and resumability. A `derivatives_ready` column plus a Postgres `check` constraint make publishing an incomplete ladder impossible.

**Tech Stack:** Next.js 16.2 (App Router, Turbopack), React 19, TypeScript strict, `@supabase/supabase-js` 2.76, `@supabase/ssr`, `@supabase/storage-js` 2.110.7, `sharp` 0.35.3, Vitest 2.1, zod 3.24.

**Spec:** `docs/superpowers/specs/2026-07-19-admin-ingest-design.md`. Read it before starting.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Branch `slice-5`**, off `develop` at `6b1d563`. Never commit to `develop` or `main`. Never `--no-verify`, `--force`, or bypass hooks.
- **Every commit message ends with:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **The gate is four checks, all must stay green:** `npm run lint` (0 errors AND 0 warnings — the repo's real current output is empty; the only permitted suppressions are the two `@next/next/no-img-element` disables the plan spells out in Task 8), `npm run typecheck` (0 errors), `npm run build`, `npm test`.
- **Test baseline: 1687 passing in 37 files.** Never let this number go down. (`CLAUDE.md` says 1498 — stale. Ignore it.)
- **`requireAdmin()` is the first statement of every Server Action and every admin data read.** Import from `@/lib/admin/require-admin`. `test/admin-routes.test.ts` enforces this by walking for files containing `'use server'` and requiring the literal string `requireAdmin` inside each `export async function` body. **Do not add an exemption to that test.**
  > **The walker currently scans only `lib/admin/`, `app/admin/` and `components/admin/`.** This slice's actions live in **`lib/ingest/`**, which is none of them — so without Task 6 Step 5's fix the guarantee is *vacuous*: the test goes green having examined nothing. Task 6 extends the walker. Verify the fix by deleting a `requireAdmin()` call and confirming the test **fails**.
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
lib/ingest/actions.ts                            NEW  'use server'  the six actions
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
.admin-switch { flex: none; width: 40px; height: 44px; min-height: 44px; background-clip: content-box; padding: 11px 0; border-radius: 999px; border: none; background: rgba(239, 234, 224, 0.16); position: relative; cursor: pointer; transition: background 0.2s; border-radius: 999px; }
.admin-switch::after { content: ''; position: absolute; top: 13px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #efeae0; transition: transform 0.2s; }
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
  - `Dropzone({ label, hint, file, hasPreview, onFile, disabled, children })`
  - `CropPreview({ src, aspectRatio })`

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
        {/* eslint-disable-next-line @next/next/no-img-element -- see below */}
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
        {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL from a
            local File. next/image cannot optimise it, and spec §1 keeps
            remotePatterns empty; components/store/Plate.tsx sets the raw-<img>
            precedent for this repo. */}
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
import { render, cleanup, fireEvent } from '@testing-library/react'
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
    // fireEvent.change, NOT `el.value = x` + dispatchEvent: React 19's value
    // tracker sees currentValue === node.value and discards the event, so
    // onChange never fires and the assertion reads ''.
    const { container } = renderForm()
    const title = container.querySelector<HTMLInputElement>('#ingest-title')!
    fireEvent.change(title, { target: { value: 'If Gold Could Rust' } })
    expect(container.querySelector<HTMLInputElement>('#ingest-slug')!.value).toBe('if-gold-could-rust')
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

  const [measured, setMeasured] = useState<Measured | null>(null)
  const [busy, setBusy] = useState(false)
  const [steps, setSteps] = useState<{ key: StepKey; state: StepState }[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const ladder = useMemo(() => priceRangeLabel(), [])

  function chooseColour(file: File | null) {
    setColourFile(file)
    setMeasured(null)
    // Release the previous blob: URL -- replacing a 40MB file repeatedly
    // otherwise pins each one in memory for the life of the document.
    if (colourUrl) URL.revokeObjectURL(colourUrl)
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
      // Verbatim from beginIngest. Deriving these from the filename would sign
      // `colour.jpg` (from the MIME) and then read back `colour.jpeg`.
      colourPath: begun.targets.find((t) => t.register === 'colour')!.bucketPath,
      silverPath: begun.targets.find((t) => t.register === 'silver')?.bucketPath ?? null,
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
          {/*
            A LENIENT transform while typing, the full deriveSlug on blur.
            Running deriveSlug on every keystroke trims trailing separators, so
            typing "evil" then "-" yields "evil" again and a multi-word slug can
            never be typed by hand.
          */}
          <input
            id="ingest-slug" className="admin-input is-slug" value={slug} disabled={busy}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-'))
            }}
            onBlur={(e) => setSlug(deriveSlug(e.target.value))}
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

        {/*
          NO "Publish now" toggle (D25). The prototype carries both the toggle
          AND the two buttons, which is a redundancy it never resolved. The two
          buttons already express the choice; a toggle beside them either does
          nothing (a dead control -- product.md §1) or silently contradicts
          whichever button is pressed.
        */}
        <p className="admin-slugnote">
          Saving as a draft keeps it hidden from everyone. You can publish it later from Photographs.
        </p>

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
  setPublished: vi.fn(),
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

Modify `test/admin-nav.test.tsx`. **Read the existing file first** — it has no module-scope `AdminNav` import; it uses an `async function renderNav()` with a dynamic `await import(...)`. Every replacement below must be `async` and call `await renderNav()`, or it will not compile.

**Three** existing tests change, not one. The plan's earlier draft named only the first, and the third would have failed silently outside these instructions:

```tsx
  it('has two live links now: Dashboard and Photographs', async () => {
    const { container } = await renderNav()
    const links = [...container.querySelectorAll('a')]
    expect(links.map((a) => a.textContent?.trim())).toEqual(['Dashboard', 'Photographs'])
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/admin', '/admin/photographs'])
  })

  it('marks the three remaining unbuilt items', async () => {
    const { container } = await renderNav()
    const marks = [...container.querySelectorAll('.admin-mark')]
    expect(marks).toHaveLength(3)
    expect(marks.every((m) => m.textContent === 'NOT BUILT')).toBe(true)
  })
```

And the existing test asserting **four** non-interactive `span.admin-navitem` items must become **three**. Find the assertion reading `expect(marked.length).toBe(4)` (or equivalent) and change it to `3`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/photographs-landing.test.tsx test/admin-nav.test.tsx`
Expected: FAIL — `PhotoList` unresolved; nav still has one link.

- [ ] **Step 3: Write `components/admin/PhotoList.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generateRegister, finishIngest, setPublished, deletePhoto } from '@/lib/ingest/actions'
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

  function publish(photo: AdminPhoto, next: boolean) {
    startTransition(async () => {
      setNotice(null)
      const result = await setPublished({ photoId: photo.id, published: next })
      if (!result.ok) setNotice(result.message)
      else router.refresh()
    })
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

  /**
   * MANIFEST-DRIVEN, not blind (spec §8). finishIngest already returns the
   * `missing` key list, so ask it first and regenerate only the registers that
   * actually have gaps. Re-running both unconditionally costs a needless ~15s
   * colour re-encode when only silver failed.
   */
  function retry(photo: AdminPhoto) {
    startTransition(async () => {
      setNotice(null)

      const probe = await finishIngest({ photoId: photo.id, publish: false })
      if (probe.ok) {
        setNotice('Every size was already present. It’s still a draft.')
        return router.refresh()
      }

      const missing = probe.missing ?? []
      if (missing.length === 0) return setNotice(probe.message)

      const registers = (['colour', 'silver'] as const).filter((r) =>
        missing.some((key) => key.includes(`/${r}/`)),
      )
      for (const register of registers) {
        const step = await generateRegister({ photoId: photo.id, register })
        if (!step.ok) return setNotice(step.message)
      }

      const done = await finishIngest({ photoId: photo.id, publish: false })
      if (!done.ok) return setNotice(done.message)
      setNotice('Every size is present now. It’s still a draft.')
      router.refresh()
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
              // Unpublish exists BECAUSE deletePhoto's refusal says "Unpublish
              // it first" -- error copy may not name an action the system does
              // not offer (product.md §1).
              <button type="button" className="admin-btn2" disabled={pending} onClick={() => publish(photo, false)}>
                Unpublish
              </button>
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
      {/*
        .admin-band is `display:flex; justify-content:space-between` (globals.css).
        It needs exactly TWO children or everything lays out in a row -- match
        app/admin/(protected)/page.tsx, which wraps its kicker and h1 in a div.
      */}
      <div className="admin-band">
        <div>
          <p className="admin-band-kicker">The library</p>
          <h1 className="admin-band-h1">Photographs</h1>
          <p className="admin-meta">
            {photos === null ? 'Count unavailable' : `${count} ${count === 1 ? 'work' : 'works'}`}
          </p>
        </div>
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
