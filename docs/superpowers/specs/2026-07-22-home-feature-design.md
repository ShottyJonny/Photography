# Slice 6b — Home feature (design spec)

> **STATUS: Brainstormed 2026-07-22, ready for a plan.** Slice 6b is the **admin write surface for
> the home focal point** (`design.md §11.4-G`): a picker that chooses which collection the storefront
> home opens on, with a live preview, and the "Set as home focal point" action that writes
> `collections.featured_on_home`.
>
> **The storefront read side already exists.** Slice 2 built the home hero (`app/(store)/page.tsx`),
> which already reads `getFeaturedCollection()` (`featured_on_home = true`) and renders the plate,
> collection kicker, quote and CTAs — or an empty "Coming soon." when nothing is featured. The schema
> already carries `featured_on_home` and the `collections_one_featured` unique partial index. What is
> missing is the **only way for Jon to set it**: today `featured_on_home` can be changed by nothing but
> raw SQL. Slice 6b is that control, and nothing else.
>
> **Depends on slice 6a** (merged to `develop`, PR #26): the collections admin, `lib/admin/collection-actions.ts`,
> `lib/data/collections-admin.ts`, and the `[data-admin]` shell. 6b reuses that layer's patterns
> (`requireAdmin()` first, `null`-on-error reads, `AdminCollectionRow`-style shapes).
>
> **The money code is untouched.** No `lib/pricing.ts`, `lib/checkout/*`, `lib/orders/*`,
> `/api/checkout`, `/api/stripe-webhook`.
>
> Branch: `slice-6b` off `develop`.

Companion: `design.md §11.4-G`, `§11.1`/`§11.2`/`§11.3`, `§11.5`; `design.md §12.5-A` (the built home hero
this surface previews); `product.md §1`, `§4` ("grander home"), `§8 q5` (publish-without-redeploy);
`supabase/schema.sql` (`collections.featured_on_home`, `collections_one_featured`); slice 6a
(`docs/superpowers/specs/2026-07-20-collections-literature-design.md`) for the admin patterns;
`design/Jon Hoffman Admin.dc.html` Surface G (pixel source, lines 521–570).

---

## 0. Decisions locked

| Decision | Value | Source |
|---|---|---|
| Split | **6b is the home feature alone** (6a shipped collections+literature) | slice 6a §0 |
| Set mechanism | **Two sequential updates in the Server Action** — clear the old feature, then set the new one. **No schema change, no migration** | Jon |
| Why not a Postgres function | The `collections_one_featured` unique index only collides if two rows are `true` at once; **clear-then-set never produces that state**, so 6a's function pattern buys only atomicity — and the sole failure mode (a crash between the two writes) is a benign, self-healing empty home. Not worth a blocking migration | brainstorm |
| Preview fidelity | The live preview **mirrors the built `§12.5-A` home**, not the prototype's Surface-G preview pane (D30). It shares the home's `pullQuote` helper so the previewed text is byte-identical to what will ship | honest function (§1) |
| No-feature state | A **"No feature"** option clears `featured_on_home` entirely → home renders "Coming soon." This is the current, legitimate state and must be reachable (D32) | §1 |
| Empty-collection guard | A collection with **0 published works** is listed but **not selectable** — featuring it would make home read "Coming soon." while the admin claims it leads (D31) | §1 |
| Count shown | The **published** count, not total members incl. drafts (D33) — it is what home will actually show | forced by the above |
| Route | **`/admin/home-feature`** (nav label "Home feature"; dashboard link "Change what leads home →") | nav + dashboard |
| Revalidation | Action revalidates `collections`. Home and dashboard are already `force-dynamic`, so both reflect the change on the next request with no redeploy (`§8 q5`) | house style |

---

## 1. What slice 6b does NOT do

- **No schema change.** `featured_on_home` and `collections_one_featured` already exist; the write is
  two `UPDATE`s in the action.
- **No storefront home rebuild.** The home hero is slice 2's and stays as-is. 6b's *only* storefront-side
  edit is extracting the existing `pullQuote` into a shared module so the preview and the home tell the
  same truth — behaviour-preserving.
- **No `§11.4-H` mobile.** Desktop shell + the `<900px` stacking fallback 4b/6a established.
- **No home *link* in the storefront nav.** That gap is `design.md §10 q1` / `product.md §4`, unrelated.
- **No money-path or checkout change.**

---

## 2. File changes

```
lib/collections/pull-quote.ts                 NEW  pure  pullQuote(dek, literature) — shared with the home
app/(store)/page.tsx                          MODIFY  import pullQuote from the shared module (no behaviour change)
lib/data/collections-admin.ts                 MODIFY  + listCollectionsForFeature()
lib/admin/home-feature-actions.ts             NEW  'use server'  setFeaturedCollection (clear-then-set)
components/admin/
  HomeHeroPreview.tsx                          NEW  the faithful home-hero approximation (shared pullQuote text)
  HomeFeaturePicker.tsx                        NEW  'use client'  radio list + Set + live preview
  AdminNav.tsx                                 MODIFY  Home feature goes live (Orders is the last marked item)
app/admin/(protected)/home-feature/page.tsx   NEW  the surface (force-dynamic; read + picker; unreadable state)
app/admin/(protected)/page.tsx                MODIFY  "Change what leads home →" becomes a real link
app/globals.css                               MODIFY  append .admin-hf-*
test/
  pull-quote.test.ts                           NEW
  collections-feature-read.test.ts             NEW
  home-feature-actions.test.ts                 NEW
  home-feature-picker.test.tsx                 NEW
  admin-nav.test.tsx                            MODIFY  four live links, one mark
  admin-dashboard.test.tsx                      MODIFY  the focal link is now live
CLAUDE.md                                       MODIFY  roadmap + tree + test count
```

Nothing under `lib/pricing.ts`, `lib/checkout/`, `lib/orders/`, `app/api/*`, or `supabase/schema.sql`
is modified.

---

## 3. Data layer

### 3.1 The write — `lib/admin/home-feature-actions.ts` (`'use server'`)

One action. `requireAdmin()` first (slice 4a §3.2; `admin-routes.test.ts` walks `lib/admin/`, so the file
needs no exemption). `collectionId: null` clears the feature.

```ts
setFeaturedCollection(input: { collectionId: string | null }): Promise<{ ok: true } | { ok: false; message: string }>
```

The body is **clear-then-set**, in that order, so the `collections_one_featured` unique partial index
(`on collections (featured_on_home) where featured_on_home`) never sees two `true` rows:

```ts
// 1. Clear whatever leads home now. After this, zero rows are featured.
await db.from('collections').update({ featured_on_home: false }).eq('featured_on_home', true)
// 2. Set the new one (skipped when clearing to "No feature").
if (input.collectionId) {
  await db.from('collections').update({ featured_on_home: true }).eq('id', input.collectionId)
}
```

Then `revalidateTag('collections', 'max')`.

**Why not a Postgres function** (6a used one for `reorder_collection_photos`): 6a's per-row position
rewrite collides *unavoidably*, even single-user, because an intermediate state duplicates a `position`
value. Here the clear happens before the set, so at no instant are two rows `true` — there is no collision
to design around. A function would only add atomicity, and the non-atomic failure (process dies between
the two writes) leaves **zero** collections featured, which the home already renders honestly as "Coming
soon." and Jon fixes by clicking Set again. A blocking migration to guard a self-healing, single-admin
edge is not worth it.

**No server-side empty-collection guard.** Featuring a 0-published collection is prevented in the UI
(§4). A crafted POST that bypasses the UI produces only a "Coming soon." home — a valid, reversible state
the home already handles — not a broken invariant, so unlike 6a's `reorderPhotos` membership check this
does not warrant a server guard. This is a deliberate right-sizing, recorded so it reads as considered,
not missed.

### 3.2 The read — `lib/data/collections-admin.ts` (append; server, `requireAdmin()` first)

```ts
export interface FeatureCandidate {
  id: string
  slug: string
  name: string
  previewQuote: string      // pullQuote(dek, literature) — identical to what the home will show
  heroSlug: string | null   // cover if it's published, else the first published photo; null if none
  publishedCount: number    // published members only — what the home will actually render
  featured_on_home: boolean
}

listCollectionsForFeature(): Promise<FeatureCandidate[] | null>   // position-ordered; null on a PostgREST error
```

- Reads `collections (id, slug, name, dek, literature, cover_photo_id, featured_on_home, position)`
  ordered by `position`, and the `collection_photos` joined to `photos (id, slug, published)`.
- **`heroSlug`** is computed exactly as the home computes its hero (`app/(store)/page.tsx:47`): the cover
  photo *if it is among the published members*, else the first published member by position, else `null`.
  This guarantees the preview's image is the image home will lead with.
- **`publishedCount`** counts only published members — the honest count (D33).
- **`previewQuote`** is `pullQuote(dek, literature)` from the shared helper (§3.3), so the preview line and
  the home line can never drift.
- Returns **every** collection, including those with `publishedCount === 0` (the UI lists them disabled),
  and including drafts-only collections. `null` on error (4b §4.2 / 6a §4.2).

The existing `listCollectionsAdmin()` is close but wrong for this surface: it counts *all* members and
carries no `previewQuote`/`heroSlug`/`literature`. A dedicated read is clearer than overloading it.

### 3.3 The shared quote — `lib/collections/pull-quote.ts` (pure)

`app/(store)/page.tsx` already has a local `pullQuote(dek, literature)`: dek wins; else the first sentence
of the literature (if ≤200 chars); else a 160-char truncation; else `''`. Extract it **verbatim** into a
pure module, export it, and import it in both the home page and the feature read. This is the one piece of
storefront-side change in 6b, and it is behaviour-preserving — the home renders identically. The point is
that the preview reuses the *same* function, so "what Jon previews" is provably "what ships." It also puts
`pullQuote` under test for the first time.

---

## 4. Surface — Surface G

`§11.3` shell, single `main`. Prototype geometry (`design/Jon Hoffman Admin.dc.html:521–570`):

- **Header**: Playfair `44px` "Home feature"; mono `11px .12em` subhead "What the home page opens on".
- **Body grid `360px 1fr`, `gap:44px`, `align-items:start`** — the picker (left), the live preview (right).

**Picker column** (`data-featgroup`):
- Mono `10px .18em` label "Choose a focal point".
- **A leading "No feature" option** (D32): same row shape, radio, copy "No feature — home shows
  *Coming soon.*" Selecting it and pressing Set clears `featured_on_home`.
- One `.admin-hf-opt` per collection: flex, `gap:14px`, `padding:14px`, `margin-bottom:12px`,
  `border:1px solid` (`--ink` when selected, `--hair` otherwise), `cursor:pointer`. A **52×66** cover
  thumb (via `derivativeSrc(heroSlug, 'colour', 160)`; a `--panel2` placeholder box when `heroSlug` is
  null), Playfair `20px` name (`--dim` when unselected), a mono `10px` meta line "**N works**"
  (published count, D33), and a `16px` radio dot (`.admin-hf-radio`, filled `--ink` when selected).
- **A 0-published collection renders disabled** (D31): `aria-disabled`, not selectable, `--faint` name,
  meta reads "No published works — can't lead home." It is shown (so Jon sees why it isn't eligible),
  never silently hidden.
- **Set button** (`.admin-hf-set`): block, centred, mono `11px .14em` uppercase, `--btnink` on `--btnbg`,
  `padding:14px`, "Set as home focal point". **Disabled** when the selection equals the current featured
  state (a no-op) or when the selected collection is 0-published.
- **The note**, verbatim from the mock: "Publishes on save — no redeploy. The change is live within a
  minute." (`§8 q5`.)

**Preview column** — "Live preview — home hero" (mono `10px .18em`), then `HomeHeroPreview`:
- A bordered box (`1px var(--hair)`, `height:520px`, `overflow:hidden`) that **mirrors the built home**
  (D30): the hero image (`object-position:center 40%`, the home's value), the home's characteristic
  left-to-right darkening so copy stays legible, the collection-name kicker, the `previewQuote` line
  (shared helper), and a static "Enter the collection →" affordance. It is a faithful *approximation*,
  not a pixel render of `page.tsx` — the four content elements (image, name, quote, CTA) are what must
  match, and they do.
- **When "No feature" or a 0-published collection is selected**, the preview shows the **empty state** —
  the same "Coming soon." the home actually renders — not a hero it cannot produce.

### 4.1 Deviation from the prototype's preview — the honesty point (D30)

The prototype's Surface-G preview (`:560–565`) shows a **52px photo-style title** repeating the collection
name, over a layout that predates the shipped home. The **built** home (`§12.5-A`, slice 2, adversarially
reviewed) has no such title: its copy block is a small collection-name kicker + the quote + the CTAs, with
the *image* as the dominant element. A preview that showed the prototype's bigger-title layout would be a
`§1` violation — "a status must reflect reality" — advertising a home that won't render. So the preview
follows the shipped home, and drops the mock's title. Recorded as D30; written back into `design.md
§11.4-G` on merge.

---

## 5. Nav and dashboard go live

- **`components/admin/AdminNav.tsx`**: `{ label: 'Home feature', href: '/admin/home-feature' }`. **Orders**
  becomes the *only* remaining marked item (it lands in slice 7).
- **`app/admin/(protected)/page.tsx`**: the "Home focal point" railcard's `MarkedLink "Change what leads
  home →"` becomes a real `<Link href="/admin/home-feature">`. The railcard's *name* display
  (`featuredCollectionName`, already wired via `getDashboard`) is unchanged.
- The dashboard's "Recent uploads" railcard **stays marked** (slice 5b), so the dashboard still carries
  exactly one marked control — the tests move the mark count, they don't zero it.

---

## 6. Testing

Slice 4a §8.1 constraints unchanged (no jest-dom; never a real Supabase client; mock `redirect()`/
`useRouter()`; `render(await Page())` for async server components; `revalidateTag` takes two args).

| File | Covers |
|---|---|
| `pull-quote.test.ts` | dek wins; first-sentence fallback; the ≤200 guard; the 160-char truncation; empty → `''` |
| `collections-feature-read.test.ts` | `requireAdmin` first; `heroSlug` = published cover else first published else null; `publishedCount` excludes drafts; `previewQuote` from the shared helper; a 0-published collection is still returned; `null` on error |
| `home-feature-actions.test.ts` | `requireAdmin` first; **clears the current feature before setting** (order asserted); `collectionId:null` clears only (no set); revalidates `collections` |
| `home-feature-picker.test.tsx` | preselects the current featured (or "No feature" when none); the preview swaps name/quote/image on selection; **Set disabled for a no-op and for a 0-published option**; a 0-published option is `aria-disabled`; the "No feature" option and 0-published option both preview the "Coming soon." state; the "no redeploy" note is present; the unreadable state |
| `admin-nav.test.tsx` | MODIFY — **four** live links (Dashboard, Photographs, Collections, Home feature); **one** mark (Orders); one `span.admin-navitem` |
| `admin-dashboard.test.tsx` | MODIFY — the focal link is a live `<a href="/admin/home-feature">`, no longer marked; "Recent uploads" stays marked |

---

## 7. Deviations from `design.md §11.4-G`

Continues 6a's D-numbering (6a owns D26–D29; 6b owns **D30–D33**).

| # | Deviation | Why |
|---|---|---|
| **D30** | Preview mirrors the **built** `§12.5-A` home (kicker + quote + image-dominant), not the prototype's Surface-G preview with its repeated 52px title | The shipped home is the reality; a preview of a superseded layout is a `§1` lie. Shares `pullQuote` so the text can't drift |
| **D31** | A 0-published collection is listed but **not selectable** | Featuring it makes home read "Coming soon." while the admin claims it leads — `§1`. Shown (not hidden) so the reason is legible |
| **D32** | A **"No feature"** option clears `featured_on_home` | None-featured is the current, legitimate state (empty home) and must be reachable; the mock's radio implies exactly-one and omits it |
| **D33** | The option meta shows the **published** count, not total members | It is what home will render; a total that counts drafts overstates the collection on the surface whose whole job is "what leads home" |

D30–D33 are `design.md` gaps/decisions, written back into `§11.4-G` on merge.

---

## 8. Verification

### 8.1 Before build

None. **No schema change and no live-project migration** — this is the payoff of the clear-then-set
decision (§3.1). The build runs entirely on the branch.

### 8.2 After build — manual (needs a live Supabase project with ≥2 collections, one with published works)

1. Open `/admin/home-feature` → the picker lists every collection in `position` order; the currently
   featured one (if any) is preselected, else "No feature" is.
2. Select another collection → the preview swaps its image, name, and quote **without a page load**; the
   Set button enables.
3. Press **Set as home focal point** → load the storefront home in another tab: it now opens on the chosen
   collection, its hero, kicker and quote — **no redeploy** (`§8 q5`). The dashboard "Home focal point"
   railcard names it.
4. Select a collection with **no published works** → it is disabled, the preview shows "Coming soon.", and
   Set stays disabled.
5. Select **"No feature"** → Set → the storefront home renders "Coming soon."; the dashboard reads "No
   collection leads home yet."
6. Confirm the **`collections_one_featured` index holds**: after several switches, `select count(*) from
   collections where featured_on_home` is ≤ 1 at all times.
7. The nav "Home feature" item is live and current; **Orders** is the only item still marked; the
   dashboard's focal link navigates here.

---

## 9. Carried forward

- `design.md §11.4-G` gets D30–D33 written back; the prototype's Surface-G preview markup is annotated as
  superseded by the built home.
- **Slice 7** (orders queue + lab export) makes the last marked nav item, Orders, live.
- If the home ever gains a second featured slot (e.g. a secondary feature), the clear-then-set action and
  the unique index both need revisiting — recorded, not built.
- The `<900px` mobile treatment of Surface G reuses the shell's stacking fallback; a dedicated `§11.4-H`
  mobile pass is still deferred.
