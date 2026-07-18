# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Jon Hoffman Photography — a **Next.js + TypeScript** print portfolio and storefront. It sells physical prints to the public with real money, and (later slices) has an admin for getting photos in and orders out.

## READ FIRST — status

**This is the Next.js rebuild.** The repo was previously a Vite + React SPA on Netlify; that app was **deleted** in slice 1 (2026-07-18). Any reference you find to Vite, Netlify functions, a hash router, `src/`, `styles.css`, `products.ts`, or "pushing to main deploys to LIVE Stripe" is **stale** — it survives only in the archived legacy repo (see [The legacy quarry](#the-legacy-quarry)). The current stack:

| | Stack |
|---|---|
| Framework | **Next.js 16 (App Router, Turbopack), TypeScript strict, React 19** |
| Hosting | **Vercel** (target — not wired/deployed yet) |
| Data | **Supabase** (Postgres + Auth + Storage; `supabase/schema.sql` is applied and live) |
| Payments | **Stripe Checkout** (**test mode** — not live) |
| Tests | **Vitest** |

**Nothing is deployed. There is no live-money constraint on this repo** — that was the legacy site, now taken down. Build and push freely on feature branches.

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

Node **20.9+** (`.nvmrc` is `20`). `next dev` / `next build` use **Turbopack** by default (Next 16).

## Verification — the gate

Four checks, each its own CI job (`.github/workflows/ci.yml`), on every push/PR to `main` and `develop`, on Node 20:

| Check | Command | Baseline |
|---|---|---|
| lint | `npm run lint` | 0 errors/warnings |
| typecheck | `npm run typecheck` | 0 errors |
| build | `npm run build` | passes (needs no secrets — clients are lazy, `/prints` is `force-dynamic`) |
| test | `npm test` | all green (**1498** tests as of slice 1) |

Split jobs are deliberate: a failure names itself (lint vs typecheck vs build vs test) instead of collapsing into one red dot. **The job ids are the required-status-check contract** for branch protection — renaming one re-pins that rule.

**Unlike the legacy app, the money code is now under test.** `lib/pricing.ts` is proven byte-identical in logic to the frozen legacy original by a 1471-case golden equivalence test (`test/pricing.equivalence.test.ts` vs `test/fixtures/legacy-pricing.cjs`); the checkout route, webhook, and reconciliation are all tested. Still: green is necessary, not sufficient — **end-to-end verification against real Stripe (test mode) is a manual step and hasn't run yet** (see [Money path](#money-path)).

Lint runs via the ESLint CLI (`eslint .` — Next 16 removed `next lint`), so it covers **all** of `app/`/`components/`/`lib/`/`test/`; the legacy "test files aren't linted" gap is closed.

## Architecture

Next.js App Router. Route groups separate the two halves.

```
app/
  layout.tsx                   # root: next/font faces + globals.css
  page.tsx                     # placeholder home (slice 2 rebuilds home under (store))
  globals.css                  # design tokens (design.md §12.2), both themes
  (store)/                     # public storefront — light/dark
    layout.tsx                 # ThemeProvider + CartProvider
    prints/page.tsx            # minimal shop (slice 1) → §12.5-B (slice 2)
    checkout/page.tsx          # checkout form → POST /api/checkout
    order/[id]/page.tsx        # confirmation (service-key read, honest states)
  api/
    checkout/route.ts          # POST — the money endpoint
    stripe-webhook/route.ts    # POST — payment confirmation
lib/
  pricing.ts                   # VERBATIM port of the 4 pricing functions (money authority)
  checkout/{build,schema}.ts   # pure checkout core + zod request contract
  orders/reconcile.ts          # pure amount reconciliation
  env.ts                       # typed, validated env (throws loud on missing)
  supabase/{admin,server,client}.ts  # service-key / anon-server / browser clients
  stripe.ts                    # lazy, server-only Stripe client
components/{cart,theme}/        # CartContext/AddToCart, ThemeProvider
test/                          # Vitest; test/fixtures/legacy-pricing.cjs is the pricing reference
supabase/schema.sql            # the applied data model (5 tables, RLS)
docs/superpowers/{specs,plans}/  # the rebuild's design + implementation docs, one per slice
design/*.dc.html               # design prototypes (reference, not production code)
```

The **admin half** (`(admin)` route group, Supabase Auth, ingest, orders queue, lab export) is **not built yet** — slices 4+.

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
- **Order status enum:** `pending | paid | amount_mismatch | submitted_to_lab | shipped | cancelled | refunded`. The legacy `completed`/`expired`/`failed` do not exist.

**Two traps the rebuild handles — know why the code is shaped this way:**

- **Never `process.env.URL`.** It is Netlify-only; on Vercel it is undefined, and the old localhost fallback would redirect a paying customer to localhost *after* charging the card. Redirect URLs come from `SITE_URL` (→ `VERCEL_URL` fallback; `lib/env.ts` **throws in production** if neither is set). **Set `SITE_URL` in the Vercel production env** to the canonical domain — `VERCEL_URL` is the per-deploy `*.vercel.app` host, not your domain.
- **`SUPABASE_SERVICE_ROLE_KEY` is server-only.** `lib/supabase/admin.ts` and `lib/stripe.ts` begin with `import 'server-only'` (a stray client import is a build error); Vitest neutralizes it via `test/stubs/server-only.ts`. Never `NEXT_PUBLIC_` it.

**End-to-end money verification is manual and has not run.** Drive `/api/checkout` → Stripe test Checkout → webhook against real (test-mode) Stripe + a live Supabase project, and observe: order `pending → paid`; a forced `amount_mismatch` quarantined with the amount recorded; the shipping address stored complete + snake_case; and `success_url` resolving to a real origin (not localhost). **This gates `develop → main`.**

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

`supabase/schema.sql` is applied and live on a new Supabase project: five tables (`photos`, `collections`, `collection_photos`, `orders`, `order_items`), RLS on all five, `orders`/`order_items` closed to anon (reads go through the service key). Buckets: `originals` private, `derivatives` public. Public signups disabled. Two honest-function invariants are enforced by Postgres: can't publish a photo without alt text; can't store a tracking number without a shipment. The SQL is authoritative over prose in `product.md`.

**Before the store can take money (cutover checklist, `product.md §1.5`):** upgrade Supabase off the free tier (the free-tier pause is how the last database died); re-register the Stripe webhook at the deploy URL; point env at the right project; swap Stripe to live mode **last**.

## Git workflow

- **`develop` is the integration branch.** Branch feature/slice work off `develop`; merge back into `develop`.
- **`develop → main` is gated by the manual money-path verification** (above). `main` is the release branch.
- **Never commit directly to `main` or `develop`**; never `--no-verify`, `--force`, or bypass hooks.
- Every commit message ends with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Nothing deploys on push yet (Vercel isn't wired). When it is, `main` → production.

## Roadmap

The rebuild is sliced; each slice is a spec → plan → subagent-driven build under `docs/superpowers/`.

- **Slice 1 — Foundation + Money path: DONE** (on `develop`). Scaffold, tokens/type, clients/env, `lib/pricing.ts`, `/api/checkout`, webhook, order persistence.
- **Slice 2 — Storefront read-path:** specced (`docs/superpowers/specs/2026-07-17-storefront-read-path-design.md`) and adversarially reviewed (21 findings to apply first — chiefly the CropGuide: native-aspect plate, landscape via `aspect_ratio`). Home / Prints / Collection / Product / Contact + the shared header/shell.
- Slices 3–9 (planned in the specs / `product.md`): cart+checkout final visual, admin foundation (auth), ingest + derivatives, collections + literature, orders queue + Nations lab export, home feature, and the undesigned surfaces (About / Contact / legal / footer — blocked on design, `product.md §4`).

**Carried forward from slice 1** (do before they bite): the `ThemeProvider` theme-flash (fix with a pre-hydration inline script when the theme toggle ships in slice 2); typed Supabase `Database` clients (codegen once a live project is at hand). Full list of follow-ups: `.superpowers/sdd/progress.md`.

## Source-of-truth docs

- **`product.md`** — information architecture, per-surface behaviour, the honest-function rules, open questions, and the migration hazards (§1.5).
- **`design.md`** — how it looks and moves. `§11` (admin) and `§12` (storefront) are the design target; `§8` cross-cutting rules are live. `§2–§7` are a legacy inventory of the deleted stylesheet and expire at cutover — do not read them as targets.
- **`supabase/schema.sql`** — the applied data model (authoritative over prose).
- **`docs/superpowers/specs/` + `plans/`** — the rebuild's design and TDD implementation docs, one per slice.
- **`.superpowers/sdd/progress.md`** — the slice-1 execution ledger and follow-up findings (git-ignored scratch).

## Honest function — the governing rule

From `product.md §1`: **a control's label must match what it does; a status must reflect reality; copy must not claim an action the system never performed.** No fake tracking, no "we emailed you" the system didn't send — the customer's only receipt is Stripe's. If a surface can't tell the truth about a state, it says less instead of guessing. This is enforced in code (the confirmation page renders only true states) and in the schema (Postgres rejects a tracking number without a shipment).

## The legacy quarry

The deleted Vite app lives in the sibling folder `C:\Users\Shott\Photography-main` and the private archived repo `ShottyJonny/Photography-legacy` (which also holds the ~369MB of images stripped from this repo). It is the **quarry** — copy reference logic out of it (e.g. the CropGuide math for slice 2), never work in it.

## Design system

`design.md` is the source of truth for how the site looks and moves. `§11` (admin) and `§12` (storefront) are the settled target; `§8` cross-cutting rules — visible focus, `prefers-reduced-motion`, pinch-zoom on the photograph, give the photograph the dominant share, `alt` text that describes the image — apply to every slice. Every price comes from `lib/pricing.ts`, never from the design mocks' hardcoded numbers.
