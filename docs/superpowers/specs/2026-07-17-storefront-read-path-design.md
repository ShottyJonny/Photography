# Slice 2 — Storefront Read-Path (design spec)

> **Status: proposed, awaiting review.** Written 2026-07-17. The public storefront's
> read surfaces — Home, Prints, Collections (index + detail), Product, Contact — plus the
> shared store shell/header. Reads *published* rows via ISR + tagged fetches. Consumes
> slice 1's scaffold, tokens, clients, `ThemeProvider`, and `lib/pricing.ts`.
>
> **Depends on slice 1 being built first.** This spec assumes the Foundation + Money-path
> slice (`docs/superpowers/plans/2026-07-17-foundation-money-path.md`) exists: the Next
> scaffold, `app/globals.css` tokens, the four fonts, `supabaseServer()`, the
> `ThemeProvider`, and `lib/pricing.ts`. It also **replaces** slice 1's temporary
> `force-dynamic` `/prints` stub with the real thing.
>
> Companion design source: `design.md §12.5-A–D` (Home / Prints / Collection / Product),
> `§12.2` (theme + nav), `§12.3` (type), `§12.4` (layout), `§12.6` (motion), `§8` (cross-cutting).

---

## 0. Decisions locked in this brainstorm

| Decision | Value | Source |
|---|---|---|
| Nav | **Prints · Collections · Contact · Cart** (drop Work and About) | brainstorm (`design.md §12.2` open) |
| Home / theme controls | wordmark → `/`; cloud mark → theme toggle | `design.md §12.2` |
| Home index rail | **the featured collection's works** (editorial order), not the whole portfolio | brainstorm |
| Images | **hand-seed a few real derivatives + lock the key convention**; render with `<picture>` (AVIF+WebP), **not `next/image`** | brainstorm (`product.md §3.2`) |
| Collections index | **derived** simple design (grid of collection cards → detail); not blocked like About | brainstorm |
| Contact | **minimal + honest** — a real email in the site's voice, no form, no dead social links | brainstorm (`product.md §4`, §1) |
| Price display | import `PRICE_BY_SIZE` from `lib/pricing.ts` — **single source of truth**; server stays the authority | brainstorm |
| Rendering | **real ISR + tagged fetches** (replaces slice 1's `force-dynamic /prints`) | `product.md §8 q5` |
| Focus states | **hairline ink ring on `:focus-visible`**, applied globally to every interactive element | `design.md §10 q2` / §8 |
| Alt text | images use `photos.alt_text` (never the title) | `product.md §5.2`, a11y audit |
| Add-to-cart | **stub → slice 3**; the button renders but cart wiring is deferred | slice plan §7 |

---

## 1. What this slice does NOT do (deferred, not dropped)

- **Cart / add-to-cart wiring** → slice 3 (the button is present but inert here).
- **The real derivative pipeline** → slice 5. This slice hand-seeds a *fixture* set and
  locks the key convention slice 5 must honor. The seed script is a throwaway dev fixture,
  **not** pipeline code.
- **`revalidateTag` triggers** → slice 8 (admin publish). This slice *defines* the tags;
  nothing invalidates them yet, so pages also carry a time-based `revalidate` fallback.
- **About + legal/footer** → slice 9 (blocked on design, `product.md §4`). About is **not**
  in the nav (§0).

---

## 2. App Router additions

```
app/(store)/
  layout.tsx                     # MODIFIED: add <Header/> above {children} (Theme+Cart providers already here from slice 1)
  page.tsx                       # Home §12.5-A
  prints/page.tsx                # Prints §12.5-B  (REPLACES slice 1's force-dynamic stub)
  prints/[slug]/page.tsx         # Product §12.5-D
  collections/page.tsx           # Collections index (derived)
  collections/[slug]/page.tsx    # Collection detail §12.5-C
  contact/page.tsx               # minimal honest Contact
components/
  store/Header.tsx               # lockup: cloud mark (theme), wordmark (home), nav — client (uses useTheme)
  store/Plate.tsx                # <picture> AVIF+WebP renderer over the derivative ladder
  product/SizePicker.tsx         # size chips — client
  product/RegisterToggle.tsx     # Colour / Silver — client
  product/CropGuide.tsx          # crop overlay — client
lib/
  data/photos.ts                 # getPublishedPhotos(), getPhotoBySlug() — cached + tagged
  data/collections.ts            # getCollections(), getCollectionBySlug(), getFeaturedCollection()
  images/derivatives.ts          # derivativeSrcSet(slug, register), key convention (shared with slice 5)
  format/price.ts                # priceRangeLabel() / priceForSize() display helpers over PRICE_BY_SIZE
scripts/seed-derivatives.mjs     # THROWAWAY dev fixture: sharp ladder for ~3 photos → public bucket
test/                            # data-layer tags, crop math, derivative-URL helper
```

---

## 3. Data layer — `lib/data/` (RSC-only, cached + tagged)

All reads go through `supabaseServer()` (anon key, RLS restricts to `published`). Each is
wrapped in `unstable_cache` (or `fetch`-tag equivalent) with **stable tag names** — this is
the contract slice 8's admin publish will call `revalidateTag()` against.

- `getPublishedPhotos()` → tag `photos`
- `getPhotoBySlug(slug)` → tags `photos`, `photo:<slug>`
- `getCollections()` → tag `collections`
- `getCollectionBySlug(slug)` (photos joined via `collection_photos`, ordered by `position`) → tags `collections`, `collection:<slug>`
- `getFeaturedCollection()` (where `featured_on_home`, + ordered photos) → tags `collections`, `home`

**No featured collection?** (fresh DB) — `getFeaturedCollection()` returns null; Home renders
a quiet empty state ("Coming soon.") rather than crashing. Honest, not fake.

Every page sets a time-based `revalidate` fallback (e.g. 3600s) *in addition to* tags, so
staleness is bounded before slice 8 wires real invalidation.

---

## 4. Images — `lib/images/derivatives.ts` + `Plate`

- **Key convention (locked):** `derivatives/<photo-slug>/<register>/<width>.avif` and `.webp`,
  `register ∈ {colour, silver}`, `width ∈ {160, 400, 600, 960, 1200, 1800}` (`product.md §3.2`).
  Public bucket base URL from `NEXT_PUBLIC_SUPABASE_URL` (public reads).
- `derivativeSrcSet(slug, register)` builds the `srcSet` string; `derivativeSrc(slug, register, width)` a single URL.
- **`Plate`** renders `<picture>` with an AVIF `<source>` + WebP `<source>` + `<img>` fallback,
  a `sizes` attr per surface, `alt={photo.alt_text}` (**never** the title — the a11y fix),
  and `width`/`height` from `photo.width_px/height_px` to reserve layout. **Not `next/image`**
  — we own the exact ladder and must not double-optimize through Vercel (`product.md §3.2`).
- The **home bleed** uses the `160` width, `blur(90px) scale(1.12)`, `aria-hidden` (§12.5-A / §3.2:
  "serve the bleed the 160" — the cheapest win on the site).
- **Seed fixture:** `scripts/seed-derivatives.mjs` takes ~3 sample images, generates the ladder
  with `sharp`, and uploads to the public bucket; plus SQL seeding ~3 `photos` + 1 featured
  `collection` + `collection_photos`. Lets the surfaces render for build/visual verification.

---

## 5. Surfaces

Per-surface behaviour; appearance is `design.md §12.5`. All server components except the noted client islands.

- **Home** (`page.tsx`, §12.5-A): `getFeaturedCollection()`. 820×900 plate right-aligned,
  `object-position:center 40%`, 150px gradient mask; blurred 160 bleed behind; left rail =
  the featured collection's works (Playfair, active=ink/rest=dim, hover nudges right — CSS only,
  **no auto-advance carousel**, §9); mono collection kicker → Newsreader pull-quote → primary
  "View this print →" (→ first/active work's product page) + ghost "Enter the collection" (→ detail).
- **Prints** (`prints/page.tsx`, §12.5-B): `getPublishedPhotos()`. 3-col 4:5 grid; each card
  = `Plate` (hover brightens) + Playfair title + **quiet** price + mono index + size-range meta.
  Title leads, price recedes. Filter by collection via `searchParams` (server-filtered, no JS,
  shareable URLs). Pagination is out of scope (noted; low volume).
- **Product** (`prints/[slug]/page.tsx`, §12.5-D): `getPhotoBySlug()`. 600×750 plate with
  **CropGuide** overlay; mono "No. NN · Collection" → Playfair title → Newsreader line →
  **SizePicker** chips → **RegisterToggle** (Colour / Silver, disabled when `!has_bw_variant`) →
  price (Playfair, from `priceForSize`) → "Add to cart" (**stub**) + "Save to collection" (stub).
  - **CropGuide math** (the tricky piece): port/adapt the legacy crop logic from the **quarry**
    (`Photography-main/src/pages/Product.tsx` + `utils/aspect.ts`, `utils/sizeDisplay.ts`) — slice 1
    removed `src/` from this repo, so it comes from the archive like the pricing port did. Given the
    plate's `aspect_ratio` and the selected size's aspect, draw the centered inscribed crop rectangle
    and shade the excluded margins, captioned "Guides show the N×M crop." Five of seven sizes crop, so
    the guide is meaningful (`design.md §12.5-D`). It is UI logic, not money — adapt, don't treat as verbatim.
- **Collections index** (`collections/page.tsx`, derived): `getCollections()`. Grid of collection
  cards: cover `Plate` + Playfair name + mono count ("Six photographs") + Newsreader dek → detail.
- **Collection detail** (`collections/[slug]/page.tsx`, §12.5-C): `getCollectionBySlug()`. Centered
  masthead (mono "Collection No. NN · N photographs", Playfair name, Newsreader italic dek) →
  the **literature** at ~640px reading measure with Playfair drop-cap + signature → "The works"
  as a horizontal film-strip of 300px plates → product pages.
- **Contact** (`contact/page.tsx`, minimal + honest): Newsreader copy in the Relics-essay voice
  (not emoji-corporate) + a real `mailto:` (`jonhoffmanbusiness@gmail.com` unless changed). No
  form, no social links that don't resolve (§1). One screen.

---

## 6. Shared chrome, motion, a11y

- **Header** (`components/store/Header.tsx`, client): the lockup — cloud mark (calls
  `useTheme().toggle`, swaps asset + `data-theme`), Playfair "Jon Hoffman" wordmark linking `/`
  over a mono "PHOTOGRAPHS & PRINTS" kicker, then nav (Prints · Collections · Contact · Cart-stub
  with a count of 0 for now). Same lockup shape the admin reuses later (§11.3).
- **Focus states** (`design.md §10 q2`, §8): a **hairline ink ring** on `:focus-visible` for
  every interactive element — `outline: 1px solid var(--ink); outline-offset: 2px` (or a `--hair`
  variant). Defined once globally. §8's one rule the handoff dropped; it does not get dropped again.
- **Motion** (§12.6): hovers `.18–.2s`; theme flip instant. **Every** animation gated behind
  `prefers-reduced-motion`. No auto-advancing carousel anywhere (§9).
- **Mobile** (§12.5-E/I, §8): plates pinch-zoomable (no `user-scalable=no`); hit targets ≥44px.
- **Alt text**: `photos.alt_text`, always. Decorative bleed is `aria-hidden`.

---

## 7. Verification

- **Seed → build → see it.** Run `scripts/seed-derivatives.mjs`, then `npm run build`, then load
  Home / Prints / Product / Collection and confirm real plates render (the point of the slice).
- **Unit tests:** the data-layer tag wiring (each fetch carries the right tags), the
  `derivativeSrcSet` URL builder (exact keys + both formats), and the CropGuide math (each of the
  seven sizes yields the expected crop rectangle against a known plate aspect — including the two
  4:5 sizes that crop nothing and the five that do).
- **Static gate:** `tsc`, `next lint`, `next build`, all `vitest` green.
- Necessary but not sufficient — the visual check of Home and the Product crop guide is the real
  proof, per the repo's evidence-before-assertions rule.

---

## 8. Build order within the slice (for the plan)

This is a **big slice**. Suggested split into independently-reviewable chunks at plan time:
1. Data layer + `derivatives.ts` helper + seed fixture + `Plate` (the substrate).
2. Header + shell + focus/motion globals + Contact (the frame).
3. Home (§12.5-A) — the headline surface.
4. Prints + Product (incl. CropGuide) — the shop path.
5. Collections index + detail (incl. literature reading column).

Each chunk ends testable. If you'd rather ship smaller PRs, chunks 1–2, 3, 4, 5 are natural PR
boundaries.

---

## 9. Open / carried

- **Pagination on Prints** — deferred (low volume; noted so it isn't a silent cap).
- **About + legal/footer** — slice 9, blocked on design (`product.md §4`).
- **Real ISR invalidation** — slice 8 defines the trigger; this slice defines the tags.
- **The seed fixture is throwaway** — slice 5 replaces it with the real ingest pipeline against
  the same locked key convention.

---

## 10. Source docs

- `design.md §12.2–§12.7` (storefront target), `§8` (cross-cutting), `§10 q2` (focus).
- `product.md §3.2` (derivative ladder), `§4` (surfaces), `§5.2` (alt text), `§8 q5` (freshness).
- `supabase/schema.sql` — `photos`, `collections`, `collection_photos`, RLS published-read.
- `docs/superpowers/specs/2026-07-17-rebuild-architecture-money-path-design.md` — slice 1 (dependency).
