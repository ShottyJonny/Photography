# Slice 6a — Collections + literature (design spec)

> **STATUS: Brainstormed 2026-07-20, ready for a plan.** Slice 6a is the **admin write surface for
> collections** (`design.md §11.4-F`): create and edit collections, add photos, drag-reorder them,
> set a cover, and write the literature. The storefront read-path for collections is already built
> (slice 2 — `lib/data/collections.ts`, both `/collections` pages), so this is purely the admin
> half.
>
> **Slice 6b** builds `§11.4-G` — the home-feature picker + live preview — on top of this. Split
> from a combined slice 6 on the same reasoning as 4 and 5: two surfaces, and the tricky
> position-management and literature work belongs in a focused plan.
>
> **The money code is untouched.** No `lib/pricing.ts`, `lib/checkout/*`, `lib/orders/*`,
> `/api/checkout`, `/api/stripe-webhook`.
>
> Branch: `slice-6a` off `develop`.

Companion: `design.md §11.4-F`, `§11.1`/`§11.2`/`§11.3`; `product.md §1`, `§5.3`;
`supabase/schema.sql` (`collections`, `collection_photos`); slice 5a
(`docs/superpowers/specs/2026-07-19-admin-ingest-design.md`) for the admin patterns;
`design/Jon Hoffman Admin.dc.html` Surface F (pixel source, extracted 2026-07-20).

---

## 0. Decisions locked

| Decision | Value | Source |
|---|---|---|
| Split | **6a collections+literature, 6b home feature** | Jon |
| Literature format | **Plain prose, paragraph breaks.** No formatting toolbar (the mock's B/i/quote is dropped) | Jon |
| Storefront literature render | **Split on blank lines into `<p>`** — a small change to the slice-2 collection page (currently one `<div>`) | forced by the above |
| Reorder | **Drag-and-drop via `@dnd-kit`** (keyboard sensor → accessible). Reorder *logic* unit-tested; drag *interaction* verified in the browser | **Jon** (overrode move-buttons) |
| Position rewrite | **A Postgres function** `reorder_collection_photos(collection, ordered[])`, two-phase offset, so the `unique(collection_id, position)` index never collides | brainstorm |
| Collection slug | **Derived from name, editable, warned** it changes the public `/collections/<slug>` URL. Not frozen (nothing is storage-keyed) | Jon |
| Membership | **Any photo, drafts included.** The storefront already filters collections to published photos | Jon |
| Cover | A **★ toggle** on one work sets `cover_photo_id` | mock |
| Featured-on-home | **Read-only display in 6a.** Setting it is 6b's home-feature picker | scope |

---

## 1. What slice 6a does NOT do

- **No home-feature picker** (`§11.4-G`) → 6b. The "Featured on home" tag renders when true but has no
  control here.
- **No formatting toolbar** in the literature editor — plain prose only.
- **No `§11.4-H` mobile** — desktop shell + the `<900px` stacking fallback 4b established.
- **No collection cover *image* on the storefront home** — that's the home feature (6b).
- **No money-path or checkout change.**

---

## 2. File changes

```
supabase/schema.sql                          MODIFY  + reorder_collection_photos() function + grant
lib/admin/collection-actions.ts               NEW  'use server'  the eight actions
lib/data/collections-admin.ts                 NEW  server  admin reads (list + edit + addable pool)
lib/collections/slug.ts                       NEW  pure  deriveCollectionSlug (reuse ingest deriveSlug)
components/admin/
  CollectionList.tsx                          NEW  the 250px master list ('use client' for active state)
  CollectionEditor.tsx                        NEW  'use client'  the detail editor (orchestrates actions)
  WorksList.tsx                               NEW  'use client'  the @dnd-kit sortable works list
  LiteratureEditor.tsx                        NEW  'use client'  name/slug/dek/literature + word count
  PhotoPicker.tsx                             NEW  'use client'  "＋ Add works" modal/panel
  AdminNav.tsx                                MODIFY  Collections becomes live
app/admin/(protected)/collections/
  page.tsx                                    NEW  list + empty state
  new/page.tsx                                NEW  create-collection form (name → slug)
  [id]/page.tsx                               NEW  the editor
app/(store)/collections/[slug]/page.tsx       MODIFY  split literature into <p> paragraphs
app/globals.css                               MODIFY  append .admin-col-* classes
package.json                                  MODIFY  + @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
lib/reorder.ts                                NEW  pure  applyReorder(ids, from, to) — the tested logic
test/
  reorder.test.ts                            NEW
  collection-slug.test.ts                    NEW
  collection-actions.test.ts                 NEW
  collection-editor.test.tsx                 NEW
  collections-landing.test.tsx               NEW
  collection-literature-render.test.tsx      NEW  the storefront <p> split
  admin-nav.test.tsx                          MODIFY  three live links now
```

Nothing under `lib/pricing.ts`, `lib/checkout/`, `lib/orders/`, `app/api/*` is modified.

---

## 3. Schema — the reorder function

`collection_photos` has `unique(collection_id, position)`, so rewriting positions one row at a
time collides. The robust fix is a Postgres function that rewrites all positions in one
transaction, using a **two-phase offset** so the source and target position ranges never overlap
(safe even against a non-deferrable unique index):

```sql
-- product.md §5.3: editorial order. Rewrites every position for a collection from an ordered
-- array of photo ids. Two-phase offset so unique(collection_id, position) never collides mid-update.
create or replace function reorder_collection_photos(p_collection uuid, p_ordered uuid[])
returns void language plpgsql security invoker as $$
begin
  -- Phase 1: lift every row far above the final range (n is always << 1000000).
  update collection_photos set position = position + 1000000 where collection_id = p_collection;
  -- Phase 2: set final positions from the array's order (0-based).
  update collection_photos cp
    set position = ord.i - 1
    from (select unnest(p_ordered) as pid, generate_subscripts(p_ordered, 1) as i) ord
    where cp.collection_id = p_collection and cp.photo_id = ord.pid;
end $$;

grant execute on function reorder_collection_photos(uuid, uuid[]) to authenticated;
```

`security invoker` so the caller's RLS applies — the admin's `collection_photos_admin_all` policy
is what permits the writes, exercised rather than bypassed. **Blocking pre-build:** Jon applies
this to the live project (like the `derivatives_ready` migration), and the plan verifies it exists
before the reorder action is wired.

No other schema change. `cover_photo_id`, `featured_on_home`, `dek`, `literature`, and the unique
featured index all already exist.

---

## 4. Data layer

### 4.1 Server Actions — `lib/admin/collection-actions.ts` (`'use server'`)

`requireAdmin()` first in every one (slice 4a §3.2; `admin-routes.test.ts` walks `lib/admin/`).
Each revalidates `collections`; those that change what a photo's own page shows also revalidate
`photos` / `photo:<slug>`.

```ts
createCollection(input: { name: string }): Promise<{ ok: true; id: string } | { ok: false; message: string }>
updateCollectionMeta(input: { id: string; name: string; slug: string; dek: string | null }): Promise<Result>
updateLiterature(input: { id: string; literature: string | null }): Promise<Result>
addPhotos(input: { collectionId: string; photoIds: string[] }): Promise<Result>   // append at max(position)+1
removePhoto(input: { collectionId: string; photoId: string }): Promise<Result>
reorderPhotos(input: { collectionId: string; orderedPhotoIds: string[] }): Promise<Result>  // -> the RPC
setCover(input: { collectionId: string; photoId: string | null }): Promise<Result>
deleteCollection(input: { id: string }): Promise<Result>
```

- **`createCollection`**: `deriveCollectionSlug(name)`; reject empty name and duplicate slug; insert
  with `position = max(position)+1` across collections; return the new id (the form redirects to
  the editor).
- **`updateCollectionMeta`**: slug must be the canonical derivation of *itself* (same guard as
  ingest — a `'use server'` export is a public POST). Reject duplicate slug against *other* rows.
- **`reorderPhotos`**: validates the id set matches the collection's current membership exactly
  (no adds/drops smuggled in), then calls `db.rpc('reorder_collection_photos', ...)`.
- **`setCover`**: sets `cover_photo_id`; `null` clears it. `on delete set null` already handles a
  deleted cover photo.
- **`removePhoto`**: if the removed photo was the cover, clears the cover too.
- **`deleteCollection`**: `collection_photos` cascade-deletes; the collection row goes. Photos are
  untouched (membership is a join, not ownership).

### 4.2 Reads — `lib/data/collections-admin.ts` (server, `requireAdmin()` first)

```ts
listCollectionsAdmin(): Promise<AdminCollectionRow[] | null>   // cover slug, name, count, featured, position-ordered
getCollectionForEdit(id: string): Promise<AdminCollectionDetail | null>  // meta + ordered members (all, incl drafts) + cover id
listAddablePhotos(collectionId: string): Promise<AddablePhoto[] | null>  // photos NOT already in this collection
```

`null` on a PostgREST error (4b §4.2). Members include drafts (a badge distinguishes them);
`listAddablePhotos` excludes current members so the picker can't double-add.

The existing `listCollections()` in `lib/data/photos-admin.ts` (used by the ingest form's select)
is left as-is — it returns only `id, name` and is a different shape.

---

## 5. Surfaces — Surface F

Master-detail inside the `§11.3` shell. Prototype geometry (extracted 2026-07-20):

- **`main` grid `250px 1fr`** — the 250px collection list (left, `--hair` right border,
  `padding:28px 20px`, `gap:6px`) and the editor (right, `padding:30px 36px 40px`).
- **Editor header**: Playfair `38px` name, the `--ok` "Featured on home" tag when featured, a mono
  subhead (`Collection No. NN · N photographs`), and the primary **Save collection** button.
- **Body grid `1fr 1fr`, `gap:34px`** — Works (left), Literature (right).

**Works column:**
- Header row: `Works — drag to order` · right-aligned `cover ★`, mono `10px .18em`, `--hair`
  bottom border.
- Each row (`@dnd-kit` sortable): grid `20px 46px 1fr auto`, `gap:12px`, `padding:9px 6px`,
  `cursor:grab`. Drag handle `⠿` (`--faint` mono), 46×58 thumb, Playfair `16px` name, a cover
  toggle (`★` `--warn` when cover / `☆` `--faint` otherwise). **A draft member shows a small mono
  `DRAFT` marker** so it's clear why it isn't on the storefront yet.
- `＋ Add works` — dashed `--hair` button opening `PhotoPicker`.
- **Thumbnails render via the existing derivative path** (`derivativeSrc(slug, 'colour', 160)`),
  the 160 rung — reusing `lib/images/derivatives.ts`, no new image code.

**Where each field is edited (no field edited twice):**
- **Name** and **slug** are edited in the **header/meta area** (name inline in the Playfair title;
  slug in a mono field beneath the subhead, with the link-breaking warning).
- **Dek** and **literature** are edited in the **literature card**.

**Literature column** (plain prose — no toolbar, D-drop from mock):
- Header `The literature`.
- A `--panel2` bordered card. The collection **name** shows at its top as a read-only Playfair-20
  heading (context — you see it as the reader does), then the two editable prose fields in
  Newsreader: **dek** (italic 15, the one-line definition) and **literature** (15/1.7 textarea,
  autogrowing). A live **word count** (`Newsreader · N words`) on the literature body.
- The mono note beneath: *"This is where the site's voice lives. If it stops sounding like this
  essay, the site is wrong."* — verbatim from the mock (`product.md §1`).

**List column** — a `＋` create button (→ `/admin/collections/new`), then a row per collection
(38×48 thumb, Playfair 17 name, mono meta `Featured · N works` / `N works`), active row washed
`rgba(239,234,224,.07)`.

All controls: `--hairform` borders, `min-height:44px`, focus ring inherited, terse copy.

### 5.1 The photo picker

`＋ Add works` opens a picker listing `listAddablePhotos` (thumb + title + published/draft badge),
multi-select, `Add`. On add → `addPhotos` appends them at the end; the editor refreshes.

---

## 6. Literature rendering on the storefront (the slice-2 change)

`app/(store)/collections/[slug]/page.tsx:52` currently renders `{detail.literature}` in one
`<div>`, collapsing paragraphs. Change it to split on blank lines and render a `<p>` per
paragraph, keeping the `::first-letter` drop-cap on the **first** paragraph only:

```tsx
{detail.literature
  ? detail.literature.split(/\n\s*\n/).map((para, i) => (
      <p key={i} className={i === 0 ? 'collection-literature-body is-first' : 'collection-literature-body'}>
        {para.trim()}
      </p>
    ))
  : null}
```

The `::first-letter` selector moves from `.collection-literature-body` to
`.collection-literature-body.is-first`. This is the only storefront-read change, and it's covered
by `collection-literature-render.test.tsx` (a two-paragraph literature renders two `<p>`s; the
drop-cap class lands on the first). Nothing else in the collections read path moves.

---

## 7. The tested pure core

`@dnd-kit`'s drag can't be exercised in jsdom, so the *reorder logic* is extracted and tested; the
*drag UI* is manual (§9).

```ts
// lib/reorder.ts
export function applyReorder<T>(items: T[], from: number, to: number): T[]
```

`WorksList` calls `applyReorder(memberIds, from, to)` on drop to get the new order, renders it
optimistically, and persists via `reorderPhotos`. `reorder.test.ts` covers move-down, move-up,
no-op (from===to), and boundary indices.

---

## 8. Testing

Slice 4a §8.1 constraints unchanged (no jest-dom; never a real Supabase client; mock `redirect()`
to throw; `render(await Page())` for async server components).

| File | Covers |
|---|---|
| `reorder.test.ts` | `applyReorder` up/down/no-op/bounds |
| `collection-slug.test.ts` | derivation, duplicate-safe casing (reuses `deriveSlug`) |
| `collection-actions.test.ts` | `requireAdmin` first in all eight; create rejects empty/duplicate; `updateCollectionMeta` slug canonical-self + duplicate-vs-others; **`reorderPhotos` rejects an id set that adds or drops a member**; `removePhoto` clears cover when it removed the cover; `setCover(null)` clears; each revalidates `collections`; `reorderPhotos` calls the `reorder_collection_photos` RPC |
| `collection-editor.test.tsx` | fields bound + prefilled; word count updates; the "voice lives" note present; slug-permanence warning; draft members badged |
| `collections-landing.test.tsx` | list vs empty vs unreadable (4b D7); `＋` links to `/new`; featured row tagged |
| `collection-literature-render.test.tsx` | storefront: two paragraphs → two `<p>`; drop-cap class on the first only |
| `admin-nav.test.tsx` | MODIFY — **three** live links (Dashboard, Photographs, Collections); two marked |

---

## 9. Deviations from `design.md §11.4-F`

Continues 5a's D-numbering (5a owns D16–D25).

| # | Deviation | Why |
|---|---|---|
| **D26** | No formatting toolbar (B/i/quote/¶) in the literature editor | Plain prose (§0). The storefront renders no formatting; a toolbar producing unshown formatting is a `§1` lie |
| **D27** | Reorder via `@dnd-kit`, with a Postgres function behind it | The mock implies drag; the schema's unique index makes naïve position rewrites collide |
| **D28** | Draft members carry a `DRAFT` marker | Membership allows drafts (§0); the mock assumes all-published, which would hide *why* a work isn't live |
| **D29** | Collection slug editable + warned | The mock has no slug field; collections aren't storage-keyed, so editable is safe but link-breaking |

D26–D29 are `design.md` gaps/decisions, written back into `§11.4-F` on merge.

---

## 10. Verification

### 10.1 Before build — Jon

1. **Blocking:** apply `reorder_collection_photos` + the grant to the live project; the plan checks
   it exists before wiring `reorderPhotos`.

### 10.2 After build — manual

1. Create a collection → it appears in the list and at `/collections` (empty until photos added).
2. Add several photos (incl. a draft) → they list; the draft is badged and does **not** appear on
   the storefront collection page until published.
3. **Drag to reorder** → the order persists and matches on the live `/collections/<slug>`
   film-strip. Reorder by keyboard too (`@dnd-kit` sensor) — §8's rule.
4. Set a cover ★ → `cover_photo_id` updates; the storefront masthead uses it.
5. Write literature with two paragraphs → the storefront renders **two paragraphs** with a drop-cap
   on the first (the §6 change).
6. Edit the slug → the collection moves to the new `/collections/<slug>`; the warning showed.
7. Delete a collection → gone from list and storefront; its photos still exist in Photographs.

---

## 11. Carried forward

- **6b home feature** (`§11.4-G`) — the picker + live preview, setting `featured_on_home`.
- `design.md §11.4-F` gets D26–D29 written back.
- **Collection cover on the storefront home** — depends on 6b.
- The literature editor stays plain prose; if inline emphasis is ever wanted, markdown is the
  lightweight upgrade (recorded, not built).
