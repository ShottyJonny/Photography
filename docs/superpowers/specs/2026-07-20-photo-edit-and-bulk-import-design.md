# Photo edit surface + bulk import (design spec)

> **STATUS: Brainstormed 2026-07-20, ready for a plan.** Two coupled pieces behind one goal —
> **get the legacy catalogue in, and make every photo's words editable after ingest.**
>
> **Phase A — the edit surface** (shippable app code): a `updatePhoto` action and an edit page so a
> photo's text fields can change after it is created. Today nothing can — slice 5a shipped
> `beginIngest / createPhotoDraft / generateRegister / finishIngest / setPublished / deletePhoto`
> and **no edit action**, so a typo or a missing caption means delete-and-re-ingest.
>
> **Phase B — the bulk import** (run-once local script): loops slice 5a's ingest core over the
> ~23 legacy colour+silver pairs, producing drafts with real derivatives. Useless without Phase A,
> because the legacy data has **no alt text** and Postgres refuses to publish without it — so the
> imports arrive as drafts that only the edit surface can finish.
>
> **The money code is untouched.** No `lib/pricing.ts`, `lib/checkout/*`, `lib/orders/*`,
> `/api/checkout`, `/api/stripe-webhook`.
>
> Branch: Phase A off `develop`. Phase B is a local script, not part of the app build.

Companion: `design.md §11.4-C` (the ingest form this reuses styling from), `§11.1`/`§11.2`;
`product.md §1` (honest function), `§5.2` (the four fields); `supabase/schema.sql`;
slice 5a: `docs/superpowers/specs/2026-07-19-admin-ingest-design.md`, `lib/ingest/*`.

---

## 0. Decisions locked

| Decision | Value | Source |
|---|---|---|
| Edit scope | **Text fields only** — title, caption, description, alt. **Not** collection, **not** silver | **Jon** |
| Why not collection | It is a `collection_photos` join rewrite, not a field. Reassigning waits for the collections work | Jon |
| Why not silver | Toggling it is a file op (upload+generate, or storage delete), not a field edit. Its own later piece | Jon |
| Edit form | **New lightweight form**, not the `IngestForm` component (80% upload machinery). Reuses the `admin-*` field CSS | brainstorm |
| Slug | **Frozen** — storage is keyed to it, exactly as in ingest | slice 5a |
| Bulk import location | **Local one-time script**, Node 22, service key. Reuses 5a's core, not the Server Actions | **Jon** |
| Import state | **Drafts** — legacy data has no alt, and `alt_text_required_when_published` forbids publishing | forced |
| Existing slugs | **Skipped** — `among-giants`, `deterioration` are already live; re-running is safe | forced |
| `test` row | **Deleted** as part of this work — junk placeholder copy | Jon |

---

## 1. What this does NOT do

- **No collection reassignment** and **no silver add/remove** in the edit surface (§0).
- **No slug editing** — frozen after creation.
- **No new UI for the bulk import** — it is a script, run once, never shipped to Vercel.
- **No money-path change.**
- **No re-ingest of the 2 already-live photos.**

---

## Phase A — the edit surface

### A.1 File changes

```
lib/admin/photo-actions.ts          # NEW  'use server'  updatePhoto (requireAdmin first)
lib/data/photos-admin.ts            # MODIFY  add getPhotoForEdit(id)
components/admin/EditForm.tsx        # NEW  'use client'  prefilled text-field form
components/admin/PhotoList.tsx       # MODIFY  add an Edit link per row
app/admin/(protected)/photographs/[id]/edit/page.tsx   # NEW  the edit page
test/
  photo-edit-actions.test.ts        # NEW
  edit-form.test.tsx                # NEW
  admin-routes.test.ts              # (unchanged — lib/admin is already walked)
```

**`updatePhoto` lands in `lib/admin/`, which `admin-routes.test.ts` already walks** — so it is
caught by the `requireAdmin`-guard structural test with **no walker change** (5a had to extend it;
this does not).

### A.2 The action

```ts
// lib/admin/photo-actions.ts
'use server'

export interface UpdatePhotoInput {
  photoId: string
  title: string
  caption: string | null
  description: string | null
  altText: string | null
}
export type UpdateResult = { ok: true } | { ok: false; message: string }

export async function updatePhoto(input: UpdatePhotoInput): Promise<UpdateResult>
```

- **`requireAdmin()` first** (slice 4a §3.2 — a `'use server'` export is a public POST endpoint).
- Reads the row's `slug` and `published` (needed for the alt guard and for revalidation).
- **Refuses clearing alt on a published photo:** if `published` and `altText` is null/blank, return
  a plain message — do not let `alt_text_required_when_published` throw a raw constraint error at
  the user. On an unpublished draft, a blank alt is allowed (it just stays unpublishable).
- Updates **exactly** `title, caption, description, alt_text` — a single-table update, no join.
- **Revalidates** `photos`, `photo:<slug>`, `collections` (a caption or title change is visible on
  `/prints`, the product page, and any collection strip). Same mechanism ingest uses, so editing a
  published photo updates the storefront in seconds — no redeploy.
- Title is required (non-blank); caption/description/alt may each be null.

### A.3 The read

```ts
// lib/data/photos-admin.ts
export interface EditablePhoto {
  id: string; slug: string; title: string
  caption: string | null; description: string | null; alt_text: string | null
  published: boolean
}
export async function getPhotoForEdit(id: string): Promise<EditablePhoto | null>
```

`requireAdmin()` first; `null` on a PostgREST error (4b §4.2's error-keyed pattern), so the page
distinguishes "no such photo" from "read failed".

### A.4 The page and form

- **`/admin/photographs/[id]/edit`** — `force-dynamic`, loads via `getPhotoForEdit`, 404s (via
  `notFound()`) when the id is unknown, renders `EditForm` prefilled.
- **`EditForm`** — a `'use client'` form over the four fields, reusing the `admin-*` field classes
  from slice 5a (Playfair title, Newsreader caption/description, Hanken alt with its `--ok` hint).
  **Not** the `IngestForm` component — that carries dropzones, blob URLs, sharp progress and the
  four-step pipeline, none of which edit needs. Save calls `updatePhoto`; on success,
  `router.push('/admin/photographs')` + `refresh()`.
- **The published-alt guard is surfaced in the UI too:** on a published photo, emptying alt
  disables Save with a one-line note. The action enforces it regardless (the UI is a courtesy; the
  action is the guarantee — same split as ingest's publish gate).
- **Slug shown, read-only**, with the note that it is permanent (consistency with Surface C).
- **PhotoList** gains an **Edit** link per row → the edit page. Copy is terse (`Edit`), per the
  admin copy register.

### A.5 Testing (Phase A)

| File | Covers |
|---|---|
| `photo-edit-actions.test.ts` | `requireAdmin` first; updates the four columns and no others; **refuses clearing alt on a published photo, allows it on a draft**; revalidates all three tags; rejects a blank title |
| `edit-form.test.tsx` | Prefills from a photo; labels bound to inputs; Save disabled when a published photo's alt is emptied; slug shown read-only |
| `admin-routes.test.ts` | Unchanged — `lib/admin/photo-actions.ts` is already inside the walked set, asserted to contain `requireAdmin` with no new exemption |

---

## Phase B — the bulk import

### B.1 Shape

A single local script — `scripts/bulk-import.mts` — run once from Jon's machine on Node 22 with
`--env-file=.env.local` for the service key. **Not part of the app build**; it lives in `scripts/`
as a record but nothing imports it.

It reuses slice 5a's **core** modules — `lib/ingest/{slug,keys,plan,validate,process}.ts` — the
same code the admin runs, so the derivatives it writes are byte-identical to the admin's. It does
**not** call the Server Actions (`beginIngest` etc.), which require a `requireAdmin()` +
request/cookie context a script has no way to supply. It replicates their orchestration over the
shared core, against a **direct service-key client** (`lib/supabase/admin.ts`).

Note `lib/supabase/admin.ts` **also** begins `import 'server-only'`, so the stub loader (§B.3)
must neutralize it for both the storage client and `process.ts`.

### B.2 Per file

Source: `C:/Users/Shott/Photography-main/public/images/prints/*.jpg` (colour) and `bw/*.jpg`
(silver, where present — 23 of 25).

1. **Slug** ← `deriveSlug(basename)` — the same function; `"Grand Ring.jpg"` → `grand-ring`.
2. **Skip if the slug already exists** in `photos` — `among-giants`, `deterioration` are live.
   Skipping makes the whole script safely re-runnable.
3. Read colour (+ silver if the `bw/` file exists).
4. **Validate** mime / size / `MIN_WIDTH_PX` (`validate.ts`). A legacy file that fails is reported
   and skipped, not fatal.
5. Upload originals privately to `originals/<slug>/{colour,silver}.<ext>` via the service key.
6. `measure(colourBuffer)` → aspect, dims, aura.
7. `encodeLadder(colour)` (+ `encodeLadder(silver)`) → upload every derivative to
   `derivatives/<slug>/<register>/`.
8. **Verify the manifest** (`expectedObjects`) before marking ready — the same check `finishIngest`
   does; a partial upload leaves `derivatives_ready:false`.
9. Insert the `photos` row: **`published:false`**, `derivatives_ready:true` (once the manifest
   passes), measured `aspect_ratio/width_px/height_px/aura`, `has_bw_variant`, `original_key`,
   `original_bw_key`. **Title** from the filename basename; **caption, description, and alt all
   null.**

**It imports nothing from the legacy `products.ts`.** Only the image files are read. The 10 legacy
descriptions read like captions (`§5.2`'s split would reassign them), and importing them would land
text in the wrong field and force a cross-repo TS import. The words are written in the edit surface
per-photo instead — the image processing is automated, all the copy is Jon's.

### B.3 The `server-only` wrinkle

`lib/ingest/process.ts` begins `import 'server-only'`, which throws when imported outside a Next
server bundle. The script neutralizes it with a stub loader — the exact mechanism Vitest already
uses (`test/stubs/server-only.ts`, aliased in `vitest.config.ts`). Concretely: run under
`node --import ./scripts/neutralize-server-only.mjs`, which registers a resolver mapping
`server-only` to the existing stub. This keeps the script importing the *real* `process.ts` rather
than a copy, preserving the byte-identical guarantee.

### B.4 Dry run — the verification

The script takes **`--dry-run`** (default when no `--write` flag). Dry run lists, per file, what it
*would* do — `create <slug>` or `skip <slug> (exists)` or `skip <slug> (too small)` — and writes
**nothing** to storage or the DB. It is the honest check that the plan is right before 46 files
move. `--write` performs it for real.

Expected dry run: **~23 create, 2 skip (exist)**, 0 too-small (all legacy files clear 1800px —
verified in the slice 5a brainstorm).

### B.5 The `test` row

Deleted as part of this work — junk placeholder copy sitting unpublished. Either a `--delete-test`
step in the script or a one-line manual `delete from photos where slug = 'test'`. It is unpublished
and unordered, so `deletePhoto`'s guards would allow it; the script may reuse that logic or issue
the delete directly since it holds the service key.

### B.6 Testing (Phase B)

No heavy unit tests — it is throwaway, and its core (`slug/keys/plan/validate/process`) is already
covered by slice 5a's suite (`ingest-slug`, `ingest-core`, `ingest-validate`, `ingest-pipeline`).
Its verification is **`--dry-run`** (§B.4) followed by the real run, confirmed by the drafts
appearing in `/admin/photographs` with complete ladders and by spot-checking one on `/prints`
after it is published through the edit surface.

---

## 2. Sequencing

**Phase A first.** It is what makes a bulk-imported draft finishable — without it, Phase B produces
23 photos that can never be published (no alt) and never edited. Phase A ships through `develop`
like every slice; Phase B runs once against the live project after A is merged and the writing
begins.

**The workflow the two enable together:** run the import → 23 drafts land with real derivatives →
open each in the edit surface, write its alt (and caption, and fix its title), publish. The images
are automated; the words stay Jon's.

---

## 3. Verification

### 3.1 Phase A — manual

1. Edit a **published** photo's caption → `/prints` and the product page show it within seconds
   (revalidation).
2. Empty a published photo's alt → Save is refused, with a plain message, and the row stays as it
   was.
3. Edit a **draft**'s alt from blank to real → it becomes publishable (Publish now succeeds).
4. Open the edit page for an unknown id → 404, not a crash.

### 3.2 Phase B — manual

1. `--dry-run` → ~23 create, 2 skip, nothing written. Confirm the count against the file list.
2. `--write` → the drafts appear in `/admin/photographs`, each `Draft`, each with 12 or 24
   derivatives in the bucket (spot-check `expectedObjects` for one).
3. Write alt on one imported draft via Phase A → publish → it renders on `/prints` at its true
   native aspect.
4. Re-run `--write` → every row skips (idempotent).
5. The `test` row is gone.

---

## 4. Carried forward

- **Collection reassignment** and **silver add/remove** in the edit surface — deferred by §0,
  their own later pieces.
- **Captions and alt for the imported 23** — the human half; the import leaves them null, the edit
  surface is where they get written.
- **All copy for the imported 23** — caption, description, alt — is written in the edit surface.
  The import pulls only images and a filename-derived title; nothing comes from the legacy
  `products.ts` (§B.2).
