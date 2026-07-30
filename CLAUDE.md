# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Jon Hoffman Photography — a **Next.js + TypeScript** print portfolio and storefront. It sells physical prints to the public with real money, and (later slices) has an admin for getting photos in and orders out.

## READ FIRST — status

**This is the Next.js rebuild.** The repo was previously a Vite + React SPA on Netlify; that app was **deleted** in slice 1 (2026-07-18). Any reference you find to Vite, Netlify functions, a hash router, `src/`, `styles.css`, `products.ts`, or "pushing to main deploys to LIVE Stripe" is **stale** — it survives only in the archived legacy repo (see [The legacy quarry](#the-legacy-quarry)). The current stack:

| | Stack |
|---|---|
| Framework | **Next.js 16 (App Router, Turbopack), TypeScript strict, React 19** |
| Hosting | **Vercel** — live at `www.jonhoffmanphotography.com` (apex 308s to `www`) |
| Data | **Supabase** (Postgres + Auth + Storage; `supabase/schema.sql` is applied and live) |
| Payments | **Stripe Checkout** (**test mode** — not live) |
| Tests | **Vitest** |

**The site is deployed, but takes no money yet.** `main` ships to production on push; the storefront is
`noindex` and Stripe is still in **test mode**, so no card can be charged. Build and push freely on
feature branches — but from the Stripe live cutover onward, `main` is real money and this paragraph
is the thing to change first.

**The rebuild is happening in slices.** Slice 1 (Foundation + Money path) is built and on `develop`. Later slices are specced/planned under `docs/superpowers/`. See [Roadmap](#roadmap).

## Working norms

Be direct. If you see a flaw in the reasoning — a wrong framing, a contradiction with a prior decision, an under-considered tradeoff — name it plainly, and lead with the part that's wrong. No softening preambles, no agreement-shaped responses. Pushback is the value.

Surface forks; don't pick silently. When two or more defensible approaches exist, present them with a recommendation and tradeoffs before drafting. A finished draft of an undecided question is the wrong artifact.

Evidence before assertions. Paste real command output. If you could not verify something, say so rather than claiming it works. The money path especially deserves an adversarial read regardless of a green gate (see [Money path](#money-path)).

## Commands

```bash
npm run dev        # next dev (http://localhost:3000)
npm run build      # next build
npm run start      # next start (serve the production build)
npm run lint       # eslint . (ESLint 9 flat config; Next 16 removed the `next lint` command)
npm run typecheck  # tsc --noEmit
npm test           # vitest run
```

Node **22** (`.nvmrc` is `22`; Active LTS). Local, CI (`node-version-file: .nvmrc`), and Vercel (Node.js Version) are all pinned to 22, so the runtime that's tested is the runtime that ships. `next dev` / `next build` use **Turbopack** by default (Next 16).

## Verification — the gate

Four checks, each its own CI job (`.github/workflows/ci.yml`), on every push/PR to `main` and `develop`, on Node 20:

| Check | Command | Baseline |
|---|---|---|
| lint | `npm run lint` | 0 errors/warnings |
| typecheck | `npm run typecheck` | 0 errors |
| build | `npm run build` | passes (needs no secrets — clients are lazy, `/prints` is `force-dynamic`) |
| test | `npm test` | all green (**2006** tests as of slice 7) |

Split jobs are deliberate: a failure names itself (lint vs typecheck vs build vs test) instead of collapsing into one red dot. **The job ids are the required-status-check contract** for branch protection — renaming one re-pins that rule.

**Unlike the legacy app, the money code is now under test.** `lib/pricing.ts` is proven byte-identical in logic to the frozen legacy original by a 1471-case golden equivalence test (`test/pricing.equivalence.test.ts` vs `test/fixtures/legacy-pricing.cjs`); the checkout route, webhook, and reconciliation are all tested. Still: green is necessary, not sufficient — the end-to-end verification against real Stripe is a **manual** step, and it has only been run in **test mode** (see [Money path](#money-path)).

Lint runs via the ESLint CLI (`eslint .` — Next 16 removed `next lint`), so it covers **all** of `app/`/`components/`/`lib/`/`test/`; the legacy "test files aren't linted" gap is closed.

## Architecture

Next.js App Router. Route groups separate the two halves.

```
app/
  layout.tsx                   # root: next/font faces + globals.css
  page.tsx                     # placeholder home (slice 2 rebuilds home under (store))
  globals.css                  # design tokens (DESIGN.md §12.2), both themes
  (store)/                     # public storefront — light/dark
    layout.tsx                 # ThemeProvider + CartProvider
    prints/page.tsx            # minimal shop (slice 1) → §12.5-B (slice 2)
    checkout/page.tsx          # checkout form → POST /api/checkout
    order/[id]/page.tsx        # confirmation (service-key read, honest states)
  api/
    checkout/route.ts          # POST — the money endpoint
    stripe-webhook/route.ts    # POST — payment confirmation
  admin/                       # ADMIN — dark only, auth-gated (slice 4a)
    layout.tsx                 # [data-admin] token scope; noindex
    sign-in/page.tsx           # public sign-in
    (protected)/               # everything here is guarded
      layout.tsx               # force-dynamic; requireAdmin()
      page.tsx                 # /admin — §11.4-A dashboard on live counts
      photographs/{page,new/page}.tsx    # library landing + Surface C ingest
      collections/{page,new/page,[id]/page}.tsx  # collections admin (slice 6a)
      home-feature/page.tsx        # home focal point picker (slice 6b)
      orders/{page,[id]/page}.tsx  # §11.4-D queue + §11.4-E detail/export (slice 7)
lib/
  pricing.ts                   # VERBATIM port of the 4 pricing functions (money authority)
  checkout/{build,schema}.ts   # pure checkout core + zod request contract
  orders/reconcile.ts          # pure amount reconciliation
  reorder.ts                   # pure applyReorder for @dnd-kit drop (slice 6a)
  orders/{lab-export,address,query}.ts  # pure: the Nations block, address lines, tabs+search (slice 7)
  data/orders-admin.ts         # admin order reads + signed originals (slice 7)
  admin/order-actions.ts       # the six fulfillment transitions (slice 7)
  collections/pull-quote.ts    # shared pullQuote for home hero + admin preview (slice 6b)
  ingest/{slug,keys,plan,validate,process,actions}.ts  # the ingest pipeline (slice 5a)
  data/collections-admin.ts    # admin collection reads + listCollectionsForFeature (slice 6a/6b)
  env.ts                       # typed, validated env (throws loud on missing)
  supabase/{admin,server,client}.ts  # service-key / anon-server / browser clients
  supabase/{auth-server,auth-proxy}.ts # cookie-bound authenticated clients (slice 4a)
  admin/{require-admin,auth-actions,auth-state}.ts  # requireAdmin() boundary + sign-in/out
  admin/{dashboard,dates,collection-actions,home-feature-actions}.ts  # dashboard + collection + home feature actions
  format/price.ts              # priceForSize / priceRangeLabel / formatPrice (shared)
  stripe.ts                    # lazy, server-only Stripe client
components/{cart,theme}/        # CartContext/AddToCart, ThemeProvider
components/admin/               # CollectionList, CollectionEditor, WorksList, LiteratureEditor, PhotoPicker (slice 6a); HomeFeaturePicker, HomeHeroPreview (slice 6b); OrderTabs, OrderRows, LabExport, FulfillmentRail, CopyButton (slice 7)
test/                          # Vitest; test/fixtures/legacy-pricing.cjs is the pricing reference
supabase/schema.sql            # the applied data model (5 tables, RLS)
docs/superpowers/{specs,plans}/  # the rebuild's design + implementation docs, one per slice
design/*.dc.html               # design prototypes (reference, not production code)
```

proxy.ts                       # session refresh + redirect for /admin/:path*

The **admin half** is built. Slice 4a shipped auth; slice 4b shipped the dashboard shell; slice 5a shipped ingest (Surface C + a plain Photographs landing); slice 6a shipped collections admin (create/edit, add photos, drag-reorder, cover, literature); slice 6b shipped the home-feature picker (`/admin/home-feature`); slice 7 shipped the orders queue and the Nations lab export (`/admin/orders`). **All five nav items are live and no `NOT BUILT` marker remains.** What is left in the admin is `§11.4-B`'s work-card grid (slice 5b), not a missing capability.

**Admin surfaces read as the logged-in user** through `lib/supabase/auth-server.ts` under RLS, so `schema.sql`'s `authenticated` policies are exercised rather than decorative. The service key stays confined to the three sessionless paths (`/api/checkout`, `/api/stripe-webhook`, `/order/[id]`). **Authorization is `requireAdmin()` in the data-access layer, never a layout** — Next layouts do not re-render on client-side navigation, so a layout check stops running on route changes. Every admin read, write, and Server Action calls it first.

State is React Context (`ThemeProvider`, `CartProvider`). No store or server-state library yet.

## Money path

The most dangerous code in the project.

- **`POST /api/checkout`** (server, service key): zod-validates the request → resolves each cart item against the `photos` table (a **silver** register snapshots `original_bw_key`, not the colour `original_key`) → `computeOrderAmounts()` (`lib/pricing.ts`) derives every cent server-side → inserts `orders` (pending) + `order_items` (snake_case `shipping_address` via `toStoredShippingAddress`) → creates a Stripe Checkout session (`payment_method_types: ['card']`, `billing_address_collection: 'required'`, **no** `shipping_address_collection` — we collect + own the shipping address ourselves; `success_url` from `SITE_URL`) → returns the URL. On an `order_items` insert failure it deletes the just-created order (no orphan).
- **`POST /api/stripe-webhook`** (server, service key): verifies the signature against the **raw** body → gates on `session.payment_status === 'paid'` → `reconcile()` compares `amount_total` to the stored `total_cents` → sets `paid`, or **`amount_mismatch`** (quarantine, records the amount actually paid) → **idempotent** (only advances a `pending` order). `checkout.session.expired` → `cancelled`; `payment_intent.payment_failed` → stays `pending`.
- **`/order/[id]`** confirmation reads the order via the service key (anon has no orders access) and shows only true states.

**Invariants — do not break:**

- **The server is the sole price authority.** `computeOrderAmounts` derives cents from `item.size` + the address; any client `price`/`unit`/`totals` are ignored.
- **`lib/pricing.ts` is a verbatim port**, logic byte-identical to the legacy original and locked to it by the golden equivalence test. There is no longer a client/server mirror to keep in sync (the legacy `netlify/functions/lib/pricing.js` duplication is gone) — it's one module the routes import. Pricing is **size-keyed** today (per-photo pricing is `product.md §8 q3`, open). A *deliberate* pricing change means updating the unit tests and consciously retiring/adjusting the equivalence lock — not a casual edit.
- **Orders are service-key only.** `orders`/`order_items` are touched only via `lib/supabase/admin.ts`; RLS gives anon no access. **No order data in `localStorage`, ever** (that was the legacy bug).
- **DB is snake_case**, no exceptions.
- **Order status enum:** `pending | paid | amount_mismatch | submitted_to_lab | shipped | cancelled | refunded`. The legacy `completed`/`expired`/`failed` do not exist. Since slice 7 every value except `pending` is reachable from `/admin/orders/[id]`, and **every transition is a human pressing a button** — `lib/admin/order-actions.ts` is the only writer, it re-reads and gates on the current status server-side, and nothing in the codebase advances a state on a timer.

**Two traps the rebuild handles — know why the code is shaped this way:**

- **Never `process.env.URL`.** It is Netlify-only; on Vercel it is undefined, and the old localhost fallback would redirect a paying customer to localhost *after* charging the card. Redirect URLs come from `SITE_URL` (→ `VERCEL_URL` fallback; `lib/env.ts` **throws in production** if neither is set). **Set `SITE_URL` in the Vercel production env** to the canonical domain — `VERCEL_URL` is the per-deploy `*.vercel.app` host, not your domain.
- **`SUPABASE_SERVICE_ROLE_KEY` is server-only.** `lib/supabase/admin.ts` and `lib/stripe.ts` begin with `import 'server-only'` (a stray client import is a build error); Vitest neutralizes it via `test/stubs/server-only.ts`. Never `NEXT_PUBLIC_` it.

**End-to-end money verification, test mode: PASSED 2026-07-19.** Driven against real test-mode Stripe +
the live Supabase project. Observed: order `pending → paid` via a real Checkout and a real webhook; a
forced `amount_mismatch` quarantined with `amount_paid_cents` recorded; `shipping_address` stored
complete and snake_case; `success_url` resolving from `SITE_URL` — the `process.env.URL` trap proven
fixed. The mismatch branch was forced with a correctly-signed synthetic `checkout.session.completed`,
since real Stripe never produces a mismatch naturally (the server computes both amounts).

**The remaining gate is live mode, and it has NOT run.** Live is a different secret key, a different
webhook signing secret, and a different endpoint URL — the test-mode pass proves none of it. After the
live cutover, place one real low-value order and refund it, and observe the same four things. Until
that has happened, treat the live money path as unverified no matter how green CI is.

## Environment

`.env.local` is not committed; `.env.example` lists the names. In deploy, set these in Vercel per environment.

| Var | Purpose |
|---|---|
| `SUPABASE_URL` | server |
| `NEXT_PUBLIC_SUPABASE_URL` | browser client (same value as `SUPABASE_URL`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon — published-catalog reads only |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only**, bypasses RLS |
| `STRIPE_SECRET_KEY` | **test mode** for now |
| `STRIPE_WEBHOOK_SECRET` | webhook signature (re-register the endpoint at the deploy URL) |
| `SITE_URL` | canonical origin for Stripe redirect URLs |

`lib/env.ts` validates the required vars at first read and throws loudly if any is missing — a misconfigured deploy dies before it can charge a card.

## Data model

`supabase/schema.sql` is applied and live on a new Supabase project: five tables (`photos`, `collections`, `collection_photos`, `orders`, `order_items`), RLS on all five, `orders`/`order_items` closed to anon (reads go through the service key). Buckets: `originals` private, `derivatives` public. Public signups disabled. Three honest-function invariants are enforced by Postgres: can't publish a photo without alt text; can't publish without `derivatives_ready`; can't store a tracking number without a shipment. The SQL is authoritative over prose in `product.md`.

**Cutover checklist (`product.md §1.5`) — state as of 2026-07-29:**

| Step | Status |
|---|---|
| Upgrade Supabase off the free tier (the free-tier pause is how the last database died) | **DONE** — org on Pro, 2026-07-29 |
| Point env at the right project | **DONE** — `vfjixurevanpzmbiywxm`, verified live |
| `SITE_URL` set to the canonical origin | **DONE** — `https://www.jonhoffmanphotography.com` (Production) |
| Re-register the Stripe webhook at the deploy URL | **TODO** — live endpoint does not exist yet |
| Swap Stripe to live mode | **TODO — do this last** |
| Verify the live money path with one real order + refund | **TODO** |
| Lift `noindex` (delete `app/robots.ts` + the `robots` key in `app/layout.tsx`) and add a sitemap | **TODO — after the above** |

## Git workflow

- **`develop` is the integration branch.** Branch feature/slice work off `develop`; merge back into `develop`.
- **`develop → main` is gated by the manual money-path verification** (above). `main` is the release branch.
- **Never commit directly to `main` or `develop`**; never `--no-verify`, `--force`, or bypass hooks.
- Every commit message ends with a `Co-Authored-By:` trailer naming **the model that actually wrote it**:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  History through 2026-07-27 says `Claude Opus 4.8`, which was accurate then. Do not copy the older
  string forward onto work a newer model did — a trailer is a claim about authorship, and §1's
  honest-function rule does not stop at the storefront.
- Nothing deploys on push yet (Vercel isn't wired). When it is, `main` → production.

## Roadmap

The rebuild is sliced; each slice is a spec → plan → subagent-driven build under `docs/superpowers/`.

- **Slice 1 — Foundation + Money path: DONE** (on `develop`). Scaffold, tokens/type, clients/env, `lib/pricing.ts`, `/api/checkout`, webhook, order persistence.
- **Slice 2 — Storefront read-path: DONE.** Home / Prints / Collection / Product / Contact + the shared header/shell, on the visibility-gated data layer; the CropGuide on a native-aspect plate.
- **Slice 3 — Cart + checkout final visual: DONE.** Identity-merged cart, slide-in drawer with a focus trap, the two-column checkout on `previewQuote` (a pure display mirror of `computeOrderAmounts`).
- **Slice 4 — Admin foundation: DONE.** 4a shipped auth (`proxy.ts`, `requireAdmin()` in the DAL, sign-in, the `[data-admin]` token scope); 4b shipped the `§11.3` shell and the `§11.4-A` dashboard on live counts.
- **Slice 5a — Admin ingest: DONE.** Browser → signed upload URL → Supabase Storage; staged derivative generation; Surface C (`/admin/photographs/new`); plain Photographs landing (`/admin/photographs`). **Slice 5b** (`§11.4-B` work-card grid) is next.
- **Slice 6a — Collections + literature: DONE.** Admin write surface for collections — create/edit, add photos, drag-reorder, set cover, write literature. Storefront literature renders as semantic `<p>` paragraphs.
- **Slice 6b — Home feature: DONE.** Admin write surface for the home focal point — picker with live preview, clear-then-set of `featured_on_home`, shared `pullQuote` with the storefront home.
- **About + legal surfaces: DONE.** Shared `Prose` layout, About / Shipping / Refunds / Privacy / Terms, the footer, and US-only checkout so the shipping policy is honest.
- **Slice 7 — Orders + lab export: DONE.** `/admin/orders` (five tabs, search, expandable rows, mismatch quarantine) and `/admin/orders/[id]` (detail, signed originals, the Nations export block, the forward-only fulfillment rail). The storefront confirmation shows a real tracking number once an order is genuinely shipped.
- **Slice 5b** (`§11.4-B` work-card grid for `/admin/photographs`) and **per-photo pricing** (`product.md §8 q3`) are the remaining feature slices. Neither blocks taking money.

**Carried forward:** typed Supabase `Database` clients (codegen once a live project is at hand) — the admin reads still carry a local `no-explicit-any` disable because of it. The slice-1 theme-flash is **closed**: the pre-hydration script is in `app/layout.tsx`. Full list of follow-ups: `.superpowers/sdd/progress.md`.

**Still unconfirmed, and it reaches a real order form:** Nations' exact surface/paper vocabulary (`product.md §6.2`). `lab_finish` is free text defaulting to `Lustre`, and the export header's paper string is a constant in `lib/orders/lab-export.ts` — one edit each once Jon confirms.

## Source-of-truth docs

- **`product.md`** — information architecture, per-surface behaviour, the honest-function rules, open questions, and the migration hazards (§1.5).
- **`DESIGN.md`** — how it looks and moves. `§11` (admin) and `§12` (storefront) are the design target; `§8` cross-cutting rules are live. `§2–§7` are a legacy inventory of the deleted stylesheet and expire at cutover — do not read them as targets.
- **`supabase/schema.sql`** — the applied data model (authoritative over prose).
- **`docs/superpowers/specs/` + `plans/`** — the rebuild's design and TDD implementation docs, one per slice.
- **`.superpowers/sdd/progress.md`** — the slice-1 execution ledger and follow-up findings (git-ignored scratch).

## Honest function — the governing rule

From `product.md §1`: **a control's label must match what it does; a status must reflect reality; copy must not claim an action the system never performed.** No fake tracking, no "we emailed you" the system didn't send — the customer's only receipt is Stripe's. If a surface can't tell the truth about a state, it says less instead of guessing. This is enforced in code (the confirmation page renders only true states) and in the schema (Postgres rejects a tracking number without a shipment).

## The legacy quarry

The deleted Vite app lives in the sibling folder `C:\Users\Shott\Photography-main` and the private archived repo `ShottyJonny/Photography-legacy` (which also holds the ~369MB of images stripped from this repo). It is the **quarry** — copy reference logic out of it (e.g. the CropGuide math for slice 2), never work in it.

## Design system

`DESIGN.md` is the source of truth for how the site looks and moves. `§11` (admin) and `§12` (storefront) are the settled target; `§8` cross-cutting rules — visible focus, `prefers-reduced-motion`, pinch-zoom on the photograph, give the photograph the dominant share, `alt` text that describes the image — apply to every slice. Every price comes from `lib/pricing.ts`, never from the design mocks' hardcoded numbers.
