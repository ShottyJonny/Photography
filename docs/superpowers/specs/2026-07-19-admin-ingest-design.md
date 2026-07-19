# Slice 5a — Admin ingest pipeline + Surface C (design spec)

> **STATUS: Brainstormed 2026-07-19, ready for adversarial review then a plan.** Slice 5a is the
> **ingest pipeline**: a photograph goes in through the browser, its original lands privately, its
> derivative ladder is generated, its row is written, and it appears on the live storefront. It
> ships `design.md §11.4-C` (Post a photo) and a deliberately minimal Photographs landing.
>
> **Slice 5b** builds `§11.4-B` proper — the 4-col work-card grid, filter chips, counts,
> search/sort — replacing 5a's plain list wholesale, exactly as 4b replaced 4a's placeholder.
>
> **Depends on slice 4** (merged to `develop` as PR #5, `6b1d563`): `requireAdmin()`, the
> `[data-admin]` token scope, `proxy.ts`, the marked-control convention, and the route structure
> all exist before this starts.
>
> **The money code is untouched.** `lib/pricing.ts`, `lib/checkout/*`, `app/api/checkout`,
> `app/api/stripe-webhook`, `lib/orders/reconcile.ts`. 5a resolves `product.md §8 q3` in the
> direction that requires no money-path change at all (§0, D17/D18).
>
> Branch: `slice-5`, off `develop` at `6b1d563`.

Companion: `design.md §11.1` (tokens), `§11.2` (type roles), `§11.3` (shell), `§11.4-C` (this
surface), `§11.5`, `§11.6`, `§8`; `product.md §1` (honest function), `§3` (storage tiers), `§3.2`
(the derivative ladder), `§5.2` (photo library), `§8 q3/q4/q5/q7`; `supabase/schema.sql`;
`design/Jon Hoffman Admin.dc.html` (pixel source — `§11` wins where they disagree, the prototype
wins where `§11` is silent).

> **Measurements come from the prototype's inline styles, extracted 2026-07-19.** `§11.4-C`'s
> prose carries almost no numbers. Where this spec states a measurement it came from the
> prototype; where it deviates it is recorded in §11.

---

## 0. Decisions locked

| Decision | Value | Source |
|---|---|---|
| Upload path | **Browser → signed upload URL → Supabase Storage direct.** The original never transits Vercel | brainstorm |
| Derivative generation | **Staged, one call per register**, not one call for all 24 encodes | brainstorm |
| Publish gate | **`derivatives_ready` column + a Postgres `check`**, sibling of `alt_text_required_when_published` | brainstorm |
| Silver (B&W) | **A second uploaded file**, revealed by the toggle. Never a server-side desaturation | Jon |
| **`product.md §8 q3`** | **CLOSED — pricing stays size-only.** Base price select deleted; size chips become a read-only ladder | **Jon** |
| **`product.md §8 q4`** | **CLOSED — `unlisted` was a leftover.** The state is **Draft**: `published=false` means invisible to everyone, which is what RLS already enforces | **Jon** |
| **`product.md §8 q5`** | **CLOSED — on-demand revalidation, confirmed.** `revalidateTag` on every write; the 3600s TTL stays as a self-healing backstop | **Jon** |
| **`product.md §8 q7`** | **CLOSED — Nations' own site does the crop.** Nothing here produces a print-ready file | **Jon** |
| **`design.md §10 q3`** | **CLOSED — aura computed and stored at ingest, single `{r,g,b}`, no UI.** The `§11.4-C` tile is not built | **Jon** |
| Crop preview | **Surface C imports the storefront's `cropGuide()`.** No new geometry | Jon |
| Crop convention | **Centre crop**, recorded. A per-size offset feature belongs to slice 7 if ever | Jon |
| Collection assignment | **Included**, appending at `max(position)+1` | Jon |
| Slug | **Derived at ingest, editable before save, immutable after** | brainstorm |
| Scope | **5a = pipeline + Surface C + minimal landing. 5b = `§11.4-B`** | Jon |

### 0.1 Pre-verified facts

Measured on this machine 2026-07-19, so the plan does not have to guess.

**sharp, on a 38.2 MB / 6048×7560 source through the real ladder:**

```
one register, 6 widths x 2 formats: avif 5507 ms + webp 2386 ms = 7893 ms
total derivative bytes for the register: 2.88 MB
```

Random-noise source, i.e. the worst case for compression — real photographs will beat both
numbers. **Encoding is not the duration risk.** The risk is the I/O around it: pulling a 38 MB
colour original *and* a 32 MB silver one into the function plus 24 uploads out lands a
single-call design at ~30–40 s against a 60 s ceiling, degrading exactly on the largest files.
Staged-per-register is for I/O headroom and resumability, **not** because encoding is slow. This
correction is recorded because the first draft of the argument was wrong.

**sharp drops the ICC colour profile by default:**

```
SOURCE  icc profile present: true
NAIVE   .resize().webp()      -> icc present: false
KEEP    .withMetadata()       -> icc present: true
CONVERT .toColorspace(srgb)   -> icc present: true
```

See §6. `sharp.stats().dominant` returns `{r,g,b}` — the exact shape legacy `averageColor()`
returned, and the shape the `aura` column takes.

**Storage API confirmed** in `@supabase/storage-js` 2.110.7:
`createSignedUploadUrl(path, options?)` and `uploadToSignedUrl(path, token, fileBody, opts?)`.

**Test baseline to beat: 1687 tests, 37 files, all green** on `develop` at `6b1d563` (run
2026-07-19). `CLAUDE.md`'s "1498" and slice 4a's "1563" are both stale.

**`sharp` is currently in `devDependencies` with zero importers** — dead weight until this slice.

---

## 1. What slice 5a does NOT do

- **No `§11.4-B` work-card grid**, filter chips, counts, search or sort → 5b. 5a's landing is a
  plain list (§8).
- **No edit-after-ingest surface.** A photo's fields are set at ingest. Editing → 5b.
- **No collections editor, no reordering, no literature, no cover selection** → slice 6. 5a only
  *appends* a photo to an existing collection.
- **No home-feature picker** → slice 6.
- **No `§11.4-H` mobile ingest.** Desktop only, inheriting 4b's `<900px` stacking fallback.
- **No money-path change.** q3 is closed in the direction that requires none.
- **No print-ready crop generation.** q7 is closed: Nations crops.
- **No aura UI.** The column is written; nothing renders it.
- **No `next/image`.** `Plate.tsx` uses a raw `<picture>`; `remotePatterns` stays empty.

---

## 2. File changes

```
supabase/schema.sql                         # MODIFY  — derivatives_ready + constraint + 3 comment fixes
package.json                                # MODIFY  — sharp devDependencies → dependencies
next.config.ts                              # MODIFY  — serverExternalPackages: ['sharp']; delete the stale comment
lib/ingest/
  slug.ts                                   # NEW     — pure: deriveSlug()
  keys.ts                                   # NEW     — pure: originalKey() / derivativeKey()
  plan.ts                                   # NEW     — pure: derivativePlan() + expectedObjects()
  validate.ts                               # NEW     — pure: mime allowlist, size cap, MIN_WIDTH
  process.ts                                # NEW     — server-only; sharp: measure() + encodeLadder()
  actions.ts                                # NEW     — 'use server'; the four actions (§3)
lib/data/photos-admin.ts                    # NEW     — admin reads; requireAdmin() first
components/admin/
  Dropzone.tsx                              # NEW     — 'use client'; file select + drag, client measure
  CropPreview.tsx                           # NEW     — 'use client'; plate + cropGuide() overlay + size chips
  IngestForm.tsx                            # NEW     — 'use client'; orchestrates the four actions
  IngestProgress.tsx                        # NEW     — 'use client'; named steps, honest failure
  PhotoList.tsx                             # NEW     — 5a's plain landing list
  AdminNav.tsx                              # MODIFY  — Photographs becomes live; NOT BUILT marker removed
app/admin/(protected)/photographs/
  page.tsx                                  # NEW     — the landing
  new/page.tsx                              # NEW     — Surface C
app/globals.css                             # MODIFY  — append .admin-ingest-* classes
CLAUDE.md                                   # MODIFY  — test baseline, the new lib/ingest layer
test/
  ingest-slug.test.ts                       # NEW
  ingest-core.test.ts                       # NEW     — keys, plan, validate
  ingest-pipeline.test.ts                   # NEW     — REAL sharp
  ingest-actions.test.ts                    # NEW
  ingest-surface.test.tsx                   # NEW
  photographs-landing.test.tsx              # NEW
  admin-nav.test.tsx                        # MODIFY  — two live items now, three marked
  admin-routes.test.ts                      # MODIFY  — the four new actions pass the walker, no new exemption
```

Nothing under `app/(store)/`, `components/{store,cart,product}/`, `lib/pricing.ts`,
`lib/checkout/`, `lib/orders/`, `lib/product/crop.ts` or `lib/images/derivatives.ts` is modified.
**`test/crop.test.ts` is untouched** — Surface C reuses the function under its existing coverage,
which is the whole point of sharing it.

---

## 3. The pipeline

Four Server Actions. **`await requireAdmin()` is the first statement in every one** — slice 4a
§3.2's normative rule, because a `'use server'` export is a reachable public POST endpoint
whether or not the UI calls it. `admin-routes.test.ts` enforces this structurally.

| # | Action | Does | Weight |
|---|---|---|---|
| 1 | `beginIngest` | Validates slug format + uniqueness, mime, declared size. Returns signed upload URLs for the colour original and, if declared, the silver one | trivial |
| 2 | `createPhotoDraft` | Verifies the objects landed. Downloads the **colour** original once → `sharp.metadata()` + `stats()`. **Enforces `MIN_WIDTH`.** Inserts the `photos` row: `published:false`, `derivatives_ready:false`, with `aspect_ratio`, `width_px`, `height_px`, `aura`, `original_key`, `original_bw_key`, `has_bw_variant`. Appends to a collection if one was chosen | one download |
| 3 | `generateRegister` | Downloads one original, encodes 6 widths × 2 formats, uploads to `derivatives/<slug>/<register>/`. Called once per register | ~15 s |
| 4 | `finishIngest` | Lists the derivatives prefix and verifies **every** expected object exists. Sets `derivatives_ready:true`. Publishes if asked. Calls `revalidateTag` | trivial |

**`finishIngest` never partially succeeds.** If the manifest check fails, it sets nothing,
publishes nothing, and returns which objects are missing. If the manifest passes but the publish
is then rejected — empty alt text being the realistic case — `derivatives_ready` is still set
(it is true) and the photo remains a draft, with the reason returned. A draft that is fully
generated is a legitimate end state; a published photo that is not is not.

### 3.1 Why this shape

**The 4.5 MB wall.** Vercel caps serverless request bodies at 4.5 MB. A 38 MB original cannot
travel through a Server Action at all. The signed-upload-URL path means the browser PUTs straight
to Supabase and Vercel never sees the bytes on the way in.

**Failure leaves a draft, never a broken gallery.** If step 3 fails, the row exists, unpublished,
`derivatives_ready:false`, and `generateRegister` is re-runnable from the landing (§8). The
storefront is never shown a photograph whose ladder is half-built.

**`MIN_WIDTH` is enforced server-side in step 2, and only advisory client-side.** The floor exists
because `Plate.tsx` emits all six widths unconditionally: an original narrower than 1800 px would
make the top of the ladder an upscale, and the `srcset` `w` descriptor would then lie about what
it is serving. The client checks at file-select **for browser-decodable formats only** (JPEG,
PNG, WebP) as a courtesy so a doomed 38 MB upload is avoided; TIFF cannot be decoded in a browser,
so those are caught server-side after upload. Step 2 is authoritative in both cases, and on
rejection it deletes the uploaded originals and creates no row.

**Step 2 downloads the colour original a second time** (step 3 downloads it again). Accepted: it
keeps each action's job crisp, an invalid file never becomes a row, and the "Detected" tile gets
real server-measured values before generation begins. Recorded as a follow-up in §13 — a
range-request header read would remove it.

### 3.2 Storage keys — `product.md §3.2`, unchanged

```
originals/<slug>/<register>.<ext>              register ∈ {colour, silver}
derivatives/<slug>/<register>/<width>.<fmt>    width ∈ {160,400,600,960,1200,1800}, fmt ∈ {avif,webp}
```

These are exactly the keys `lib/images/derivatives.ts` already builds and `Plate.tsx` already
requests. **The storefront read path is not modified; 5a makes its existing assumptions true.**

**Slug immutability follows from this.** Storage is slug-keyed, so renaming a photo later would
orphan every derivative silently. The slug is derived from the title at ingest, shown in its own
field, editable up to the moment of save, and frozen afterwards. The alternative — re-keying
storage by `id` — means editing slice 2's `derivatives.ts` and `Plate.tsx`, and is rejected on
that basis.

---

## 4. Schema migration

In `supabase/schema.sql`, in the file's existing idempotent idiom:

```sql
alter table photos add column if not exists derivatives_ready boolean not null default false;

alter table photos drop constraint if exists derivatives_required_when_published;
alter table photos add constraint derivatives_required_when_published
  check (not published or derivatives_ready);
```

The sibling of `alt_text_required_when_published`, for the same reason: Postgres refusing the bad
state beats trusting the UI to prevent it.

**Three comment corrections, because they are now wrong:**

- `published boolean not null default false, -- false = unlisted (§8 q4)` → `-- false = draft`,
  with a note that q4 is closed and `unlisted` was a leftover.
- The `aura` block records §10 q3's resolution: computed at ingest, single `{r,g,b}` from
  `sharp.stats().dominant`, **nothing reads it**, deliberately, and no UI implies otherwise.
- `aspect_ratio numeric(6,4), -- measured once, at ingest` stops being aspirational — this slice
  is what writes it.

### 4.1 Blocking pre-build query

Adding a `check` constraint validates existing rows. If any photo is already `published`, the
migration fails.

```sql
select count(*) as total, count(*) filter (where published) as published from photos;
```

**Jon runs this and the result is recorded here before the plan is written.** If `published > 0`
we decide together: test data to delete, or real rows needing a backfill. This spec deliberately
does **not** ship a migration that flips `derivatives_ready` to `true` on existing published rows
— that would defeat the constraint on its first day, on exactly the rows whose derivatives are
least likely to exist.

---

## 5. The derivative plan

Six widths (`product.md §3.2`, already in `DERIVATIVE_WIDTHS`), two formats, one or two registers.

| Registers | Objects | Encode (worst case) |
|---|---|---|
| colour only | 12 | ~8 s |
| colour + silver | 24 | ~16 s, split across two calls |

`expectedObjects(slug, hasBw)` is a **pure function** returning the full key list. `finishIngest`
lists the prefix and compares against it. This is what makes "every derivative exists" a
verifiable claim rather than an assumption, and it is what `derivatives_ready` actually means.

**Encode quality — proposed, confirm at §12.**

| Widths | AVIF | WebP | Rationale |
|---|---|---|---|
| 160, 400 | q45 | q72 | The 160 is the home bleed, blurred 90 px and scaled 1.12 (`product.md §3.2`); quality is invisible there |
| 600, 960, 1200, 1800 | q62 | q82 | sharp's AVIF default of q50 is visibly soft on a 1800 px plate for a print portfolio |

**No upscaling, ever.** `MIN_WIDTH = 1800` guarantees every rung is a genuine downscale, and
`ingest-pipeline.test.ts` asserts each emitted file's **actual decoded width matches its
filename** — not merely that six files were written.

---

## 6. Colour management

**This is the finding most likely to be skipped and most likely to be blamed on AVIF.**

sharp discards the embedded ICC profile by default (§0.1). A Lightroom export in Adobe RGB or
Display P3 therefore reaches the browser as wide-gamut pixel values with no profile attached;
every browser assumes sRGB and renders them as-is. The result is visibly flat and desaturated,
worst in reds and deep blues, and nothing about it looks like a bug — the photographs just lose
their punch.

**Every derivative is produced with an explicit transform to sRGB**, using the source's embedded
profile rather than discarding it.

> **The plan pins the exact sharp call; this spec does not.** I verified that the default drops
> the profile. I did **not** verify a specific incantation end-to-end, and asserting one here as
> settled fact would be the kind of plausible-sounding reasoning this project removes rather than
> leaves lying around. `ingest-pipeline.test.ts` proves correctness **on pixel values**, because
> the obvious assertion — that an ICC profile is present on the output — passes while the image
> is still wrong.

The **original is never colour-managed, resized, re-encoded or touched.** It goes to the private
bucket byte-for-byte as uploaded, and that is what Nations pulls.

---

## 7. Surface C — `/admin/photographs/new`

Prototype geometry kept: breadcrumb bar `28px 40px 22px` with a `--hair` bottom border; body
`padding:34px 40px 40px`, `grid-template-columns:480px 1fr`, `gap:44px`, `align-items:start`.

Inherited from slice 4: all form-control borders are **`--hairform`** (D11), never `--hair`;
`min-height:44px` on every interactive control; labels written sentence case in JSX and uppercased
by CSS `text-transform`, so tests query sentence case; focus is the global `:focus-visible` ring
(`§11.5`) and **no rule here may set `outline:none`**.

### 7.1 Left column

- **Colour dropzone** — `1.5px dashed --hairform`, hover `border-color:var(--dim)` +
  `background:rgba(239,234,224,.03)`. Holds the plate at its **native aspect ratio**, not the
  prototype's hardcoded `aspect-ratio:4/5` + `object-fit:cover`, which silently misrepresents any
  photograph that is not 4:5 (D20). Empty state and a real `<input type="file">` — the prototype
  has neither, and no `<input>`, `<textarea>`, `<select>` or `<form>` element anywhere in its 729
  lines.
- **Crop preview** — the plate carries `CropGuide`'s overlay driven by `cropGuide(aspect, size)`,
  the storefront's own function. Size chips beneath select which size's crop is shown. **This
  takes the grid cell the "Aura — computed" tile occupied**: the rejected feature's slot goes to a
  real one.
- **Silver dropzone + its toggle**, here, directly beneath the colour dropzone (D19). The
  prototype puts that toggle in the right column, three feet from the thing it reveals.
- **"Detected" tile** — filename and MB immediately (both knowable client-side), aspect and pixel
  dimensions once measured. It renders what is known when it is known, rather than the
  prototype's hardcoded `4:5 · portrait` / `6048 × 7560 · 41 MB` (D24).
- **The mono note**, rewritten to describe what actually happens: originals stored privately, six
  widths in AVIF and WebP per register, nothing published until every derivative exists.

### 7.2 Right column — `gap:26px`

Type specs verbatim from the prototype:

| Field | Treatment |
|---|---|
| **Title** | Playfair 22px, `padding:15px 16px` |
| **Slug** *(new, D21)* | Mono 13px. Derived from Title, editable, with the note that it is permanent after save |
| **Caption** | Newsreader 16px; hint `short line on the card` |
| **Description** | Newsreader 16px, `line-height:1.6`, `min-height:74px`; hint `the print's page` |
| **Alt text** | Hanken 14px, `line-height:1.55`; hint `describes the image — accessibility` in `--ok` |
| **Collection** | Real select over existing collections, **optional** — `None` is a valid choice and the default. `No collections yet` when the table is empty |
| ~~Base price~~ | **Deleted** (D17) |
| **Sizes offered** | Non-interactive line stating the real ladder (D18) |
| **Publish now** | Toggle. Sub-copy `Off saves it as a draft — not visible to anyone` (D23) |

**Why Base price and the size chips go.** The prototype offers `8×10 · $150`, `16×20 · $260`,
`24×30 · $360`, `32×40 · $480`. Real `ALL_SIZES` is `4x6, 5x7, 8x10, 11x14, 12x16, 16x20, 20x30`
at `$5.00–$65.00`. **`24×30` and `32×40` are not sizes that exist**, and no price on that row is
real. `design.md §11.7` caught the "$150 base" above it and did not catch the row itself.
`schema.sql` has no price column, deliberately, with a fourteen-line comment explaining why, and
`lib/pricing.ts` is locked to the legacy original by a 1471-case golden equivalence test. Per-photo
pricing would also require changing `ProductInteractive.tsx:59`, which renders `ALL_SIZES`
unconditionally, and the checkout's size validation — a money-path change riding inside an ingest
slice.

**Collection assignment** writes `collection_photos` at `coalesce(max(position),0)+1` for that
collection. `collection_photos_position` is a unique index on `(collection_id, position)`; with a
single admin a collision is near-impossible, and on conflict the insert retries once. Editorial
reordering — `product.md §5.3`'s actual point — remains slice 6's.

### 7.3 Progress and failure — D22

The prototype has no concept of either. Both are honest-function requirements, not polish.

**Progress.** The pipeline is four steps and roughly thirty seconds. `IngestProgress` names the
step actually running — uploading the original, generating colour derivatives, generating silver
derivatives, publishing. A bare spinner claims nothing while the interesting part happens; a
premature "Saved" is the `Order.tsx` 900 ms-`setTimeout` defect (`product.md §1`) wearing new
clothes.

**Failure.** Each step can fail independently. On failure the surface names **which** step failed,
the draft row survives, `derivatives_ready` stays false, publishing remains impossible, and a
retry is offered. It never reports success for a photograph that is not fully there.

**Publish is refused, in three places, for the same reason.** Empty alt text → the client blocks
it, and `alt_text_required_when_published` would reject it anyway. Incomplete derivatives → the
client blocks it, `finishIngest` verifies the manifest, and `derivatives_required_when_published`
would reject it anyway. The UI check is a courtesy; **the database is the guarantee.**

---

## 8. The Photographs landing — `/admin/photographs`

5a's landing is deliberately plain and **explicitly not `§11.4-B`**, exactly as 4a's placeholder
was not `§11.4-A`. 5b replaces it wholesale.

- Header band: Playfair `Photographs`, real count, primary `＋ Post a photo` → `/photographs/new`.
  This is the **first live primary action in the admin** — 4b rendered it marked.
- A plain list per photo: title, `Published` / `Draft` status with its text label (`§11.1`:
  status is never carried by colour alone), and — where relevant — `Derivatives incomplete` with a
  **Retry** action.
- **Retry is manifest-driven, not blind.** It diffs `expectedObjects()` against what is actually
  in the bucket, re-runs `generateRegister` only for registers with anything missing, then
  re-runs `finishIngest`. A silver upload that failed while colour succeeded therefore costs one
  register's work, not two. It is also the recovery path for a browser closed mid-ingest.
- No plates. No filter chips, no counts by status, no search, no sort — all 5b.
- **Delete**, restricted: a photo is deletable only when it is unpublished **and no `order_items`
  row references it.** `order_items.photo_id` is `on delete set null`, so the row would survive —
  but the **storage object would not**, and `product.md §6.2` requires the lab export to pull the
  original. Deleting a purchased photograph would destroy the file fulfillment needs, silently,
  months later. Delete removes the row, its originals and its derivatives together.

**`AdminNav` — Photographs becomes live**, the second `next/link` item, its `NOT BUILT` marker
removed. Three marked items remain (Collections, Orders, Home feature).

---

## 9. Revalidation — `product.md §8 q5`, closed

`§11.4-G` prints "publishing needs no redeploy" as UI copy. `design.md §11.7` flags it as a
promise the system may not keep. This slice makes it true.

The caches already carry tags — no change to `lib/data/*` is needed:

| Module | Tags | TTL |
|---|---|---|
| `lib/data/photos.ts` `getPublishedPhotos` | `photos` | 3600 |
| `lib/data/photos.ts` `getPhotoBySlug` | `photos`, `photo:<slug>` | 3600 |
| `lib/data/collections.ts` | `collections` | 3600 |

**Every write path calls `revalidateTag`** for `photos`, `photo:<slug>`, and — when a collection
was assigned — `collections`. Publishing, unpublishing and deleting all revalidate.

**The 3600s TTL stays** as a self-healing backstop: a write path that ever forgets to revalidate
degrades to at most an hour of staleness instead of permanent staleness on a live storefront.

`ingest-actions.test.ts` asserts the calls, so the UI copy cannot quietly become a lie again.

---

## 10. Testing

Vitest. **Slice 4a §8.1's constraints apply unchanged:** there is no `@testing-library/jest-dom`,
so assert on `document.querySelector` / `textContent` / attributes; never construct a real
Supabase client (Node 20 has no global `WebSocket` — it passes on a Node 22 dev machine and fails
on CI); mock `cookies()`; mock `redirect()` to **throw**; `render(await Page())` for async server
components.

| File | Covers |
|---|---|
| `ingest-slug.test.ts` | Diacritics, punctuation, collapsing, casing, leading/trailing separators, the empty result, and a title that slugifies to nothing |
| `ingest-core.test.ts` | Key builders against `product.md §3.2` **and against `lib/images/derivatives.ts`'s existing output**, so the two cannot drift; `expectedObjects()` for both register counts; mime allowlist; size cap; `MIN_WIDTH` |
| `ingest-pipeline.test.ts` | **Real sharp**, tiny synthetic sources. Six widths per register in both formats; **each output's decoded width equals its filename** (the upscale trap); a wide-gamut source lands in sRGB, asserted on **pixel values, not profile presence**; `stats().dominant` is `{r,g,b}` |
| `ingest-actions.test.ts` | `requireAdmin()` first in all four; duplicate slug, bad mime and under-width rejected; under-width deletes the uploaded originals and creates no row; the draft inserts `published:false` + `derivatives_ready:false`; **`finishIngest` refuses to publish when one expected object is missing**; `revalidateTag` called with each tag |
| `ingest-surface.test.tsx` | Labels bound to inputs; publish blocked with empty alt; the crop preview drives off `cropGuide()`; progress names the real step; the failure state claims no success; the slug field warns it is permanent |
| `photographs-landing.test.tsx` | Status text labels present; `Derivatives incomplete` + Retry only on incomplete rows; **delete is refused for a photo with `order_items`**; the empty state |
| `admin-nav.test.tsx` | MODIFY — **two** live links now; three marked items still carry `NOT BUILT` |
| `admin-routes.test.ts` | MODIFY — the four new actions pass 4a's structural walker **with no new exemption added** |

---

## 11. Deviations from `design.md §11.4-C`

Slice 4a owns D1, D6, D10, D11; slice 4b owns D2–D5, D7–D9, D12–D15. Slice 5a continues at D16.

| # | Deviation | Why |
|---|---|---|
| **D16** | The "Aura — computed" tile is **not built** | `§11.4-C`'s own correction: "Do not build a surface that implies otherwise." The column is still written (§0) |
| **D17** | Base price select **deleted** | `§11.7`'s dead field. `schema.sql` has no price column, deliberately |
| **D18** | Size chips → a read-only ladder line | Two of the prototype's four sizes do not exist; no price on the row is real. `§11.7` caught the "$150 base" and missed the row beneath it |
| **D19** | A **second dropzone** for silver; its toggle moves to the left column | `original_bw_key` is a distinct column because silver is a distinct hand-converted file — the legacy archive has 23 of them against 25 colour, `Omniprominence` being 32 MB silver against 3.7 MB colour. A control must sit beside what it reveals |
| **D20** | Native-aspect plate + crop overlay, replacing the hardcoded `4/5` + `object-fit:cover` | The same defect slice 2's adversarial review caught on the storefront |
| **D21** | A **Slug** field is added | Storage is slug-keyed (`§3.2`), so the slug must be visible before it is frozen. `§11.4-C` has no such field |
| **D22** | Progress and failure states added | The prototype has neither. A thirty-second pipeline that claims nothing, or claims success early, is `product.md §1`'s founding defect |
| **D23** | **"Draft"** replaces "Unlisted" throughout | `§8 q4`. The prototype's own toggle promises "reachable only by direct link", which `photos_public_read ... using (published)` forbids — and its work card labels the same state "Draft · not visible" three lines later |
| **D24** | The Detected tile renders only what has been measured | The prototype hardcodes `6048 × 7560 · 41 MB` |

**All nine get written back into `§11.4-C` on merge**, following the `docs/design-md-admin-writeback`
precedent (PR #4) — because `§11.4-C`'s prose describes the surface as originally handed off, and
after this slice it describes something that was not built. Six of them (D16, D18, D19, D20, D23,
D24) are outright **defects** in the handoff rather than build-time disagreements: the tile whose
justification died, the sizes that do not exist, the missing second file, the plate that
misrepresents its own aspect, the status that promises what RLS forbids, and the hardcoded
measurements. D17 applies a defect `§11.7` had already documented. D21 and D22 fill **gaps** —
`§11.4-C` has no slug field and no concept of progress or failure.

The four `§11.7` items this slice closes (q3, q4, q5, crop) are marked resolved in the same pass.

---

## 12. Verification

### 12.1 Before build — Jon

1. **Blocking: the `photos` count query** (§4.1). Determines whether the constraint can be added.
2. **Blocking: the `originals` bucket file-size limit.** Supabase's default is 50 MB. The legacy
   silver `Omniprominence` is already 32 MB and print TIFFs pass 50 MB routinely. Set too low, the
   upload dies at the very end with an opaque error — **after** the whole transfer has been waited
   through, which is the worst possible place for it. Record the configured limit here; it becomes
   `validate.ts`'s size cap so the rejection happens **before** the upload instead of after.
3. **Non-blocking: Lightroom's export colour space.** sRGB makes §6's conversion free insurance;
   Adobe RGB or P3 makes it load-bearing.
4. **Non-blocking: confirm the §5 quality ladder** (AVIF q45/q62, WebP q72/q82).

### 12.2 After build — manual

1. Upload a real colour photograph → it appears on `/prints` and its product page at the **correct
   native aspect**, and the crop guides are right at every one of the seven sizes.
2. Upload one with a silver variant → the product page's register toggle serves the real B&W file,
   not a desaturation.
3. **Publish, and watch the storefront update in seconds, not an hour.** This is `§8 q5`'s answer
   and `§11.4-G`'s promise made true.
4. Kill the network mid-`generateRegister` → a retryable draft, publishing still impossible, no
   broken images anywhere on the storefront.
5. Try to publish with empty alt text → refused. Then try it with the constraint's own error by
   attempting the update directly → **refused by Postgres**, not merely by the UI.
6. Try to publish before derivatives complete → refused, same two layers.
7. Upload a file narrower than 1800 px → rejected with copy that says why, and **no row and no
   orphaned original are left behind**.
8. Inspect the derivatives bucket: 12 or 24 objects, each file's **actual width matching its
   filename**.
9. **Colour check:** open the 1800 px AVIF beside the original in a colour-managed viewer. This is
   the check that catches §6 being wrong, and nothing else will.
10. Delete a draft → row, originals and derivatives all gone. Attempt to delete a purchased photo
    → refused.

---

## 13. Carried forward

- **`design.md §11.4-C`** needs D16–D24 written back in, and `§11.7` needs q3, q4, q5 and the crop
  item marked resolved — following the `docs/design-md-admin-writeback` precedent (PR #4).
- **`product.md §8`** needs q3, q4, q5 and q7 marked answered in place, and `§3`'s aura paragraph
  updated to record that the column is now written and still read by nothing.
- **`schema.sql`'s `unlisted` framing** is corrected in this slice; `product.md §5.2`'s
  "published/unlisted" line should follow.
- **The crop promise and the lab sheet (slice 7).** `cropGuide()` computes a **centre** crop and
  that is what the customer is shown. Nations permits any crop. Centre-cropping there keeps the
  promise; deviating breaks it silently. Either the lab export eventually states the crop, or a
  per-size crop offset becomes a real feature. Recorded now so slice 7 inherits the constraint
  rather than rediscovering it.
- **Step 2's duplicate download** (§3.1) — removable with a range-request header read.
- **`§11.4-B`** (5b), **`§11.4-H` mobile ingest**, and an **edit-after-ingest** surface.
- **Typed Supabase `Database` generics** — still carried from slice 1, now also for `lib/ingest`.
- **Supabase FREE tier** (`product.md §1.5`) — still the documented way the last database died,
  and this slice is the one that starts putting real files in the buckets.
