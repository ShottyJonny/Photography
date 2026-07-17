# Rebuild — Architecture & Money Path (design spec)

> **Status: proposed, awaiting review.** Written 2026-07-17 from the source-of-truth
> docs (`CLAUDE.md`, `product.md`, `design.md`, `supabase/schema.sql`) and the legacy
> money path (`netlify/functions/`). This is the structural spec for the Next.js
> rebuild plus the first buildable slice.
>
> **What this spec IS:** the App Router skeleton, the cross-cutting decisions, and the
> **Foundation + Money-path** slice in build detail. **What it is NOT:** the pixel-level
> design of any storefront or admin surface — those are already specified in
> `design.md §11–§12` and each gets its own spec→plan cycle (see §7). This spec builds
> the frame those surfaces hang on, and the money code they all depend on.

---

## 0. Decisions locked in this brainstorm

Recorded so nothing gets silently re-litigated. Each is either a prior doc decision or
was decided in the 2026-07-17 brainstorm.

| Decision | Value | Source |
|---|---|---|
| Framework / host | Next.js App Router on Vercel + Supabase | `product.md §1.5` |
| Storefront rendering | **Static + on-demand revalidation** (ISR; admin writes call `revalidateTag`) | brainstorm (`product.md §8 q5`) |
| Derivatives | **Pre-generate at ingest with `sharp`** (6 widths × AVIF+WebP) | brainstorm (`product.md §3.2`) |
| Shipping address | **Collected on our checkout form** — the fulfillment + tax basis, written to `orders.shipping_address` | brainstorm |
| Billing address | **Stripe** — `billing_address_collection: 'required'`; we never store it | brainstorm |
| Country input | ISO-2 `<select>` (feeds tax and Stripe `allowed_countries` alike) | `product.md §1.5`, `CLAUDE.md` |
| Money logic | **Verbatim port** of the 4 pure functions; handlers rebuilt around them | `product.md §1.5` |
| Nav | wordmark → `/`, cloud mark → theme toggle | `design.md §12.2` |
| v1 pricing | **size-only** (no price column; `§8 q3` stays open) | `supabase/schema.sql`, `product.md §8 q3` |
| `unlisted` | kept, as `photos.published = false` | `product.md §8 q4` |
| Repo strategy | Next at root; legacy Vite tree removed in an early commit | brainstorm |
| First slice | **Foundation + Money path** (this spec) | brainstorm |

**The shipping-vs-billing split is the important correction from the brainstorm.**
Stripe mails nothing, so the *shipping* address belongs on our site (it drives the
Nations lab export, `design.md §11.4-E`, and it is what tax is computed against).
Stripe collects only the *billing* address, for the card/AVS check. Because tax and
shipping now read the **same** form object, the `§1.5` "tax computed against one
address, ship to another" divergence hazard does not exist in this design — we
deliberately do **not** also enable `shipping_address_collection`.

---

## 1. Stack & repo

- **Next.js (App Router), TypeScript, React 18+**, deployed on **Vercel**.
- **Supabase** for Postgres + Auth + Storage. Schema is **already applied and live**
  on the new project (`supabase/schema.sql`) — this spec consumes it, it does not
  redefine it.
- **Node 20+** (`.nvmrc` to match; Vercel's default is fine). Package manager: npm
  (keep continuity with the existing lockfile discipline).
- **Repo strategy:** scaffold Next.js at the repo root. In a **dedicated early commit**,
  remove the legacy Vite app from the working tree — `src/`, `netlify/`, `index.html`,
  `vite.config.ts`, the Vite/ESLint config, and the Vite/React-Router/EmailJS
  dependencies. Preserved by the `Photography-main` quarry, the `Photography-legacy`
  archive, and git history. Rationale: stop the repo carrying two apps and **two copies
  of the money code** — the exact divergence the `CLAUDE.md` pricing-mirror problem warns
  about. `supabase/schema.sql`, `design/*.dc.html`, and the three markdown docs stay.

---

## 2. App Router structure

```
app/
  (store)/                       # public storefront · light+dark · STATIC + ISR
    layout.tsx                   # store shell: header lockup, ThemeProvider, CartProvider
    page.tsx                     # Home §12.5-A
    prints/page.tsx              # Prints grid §12.5-B
    prints/[slug]/page.tsx       # Product §12.5-D
    collections/page.tsx
    collections/[slug]/page.tsx  # §12.5-C
    checkout/page.tsx            # §12.5-G — ISO-2 <select>, full ship-to form, summary
    order/[id]/page.tsx          # Confirmation §12.5-H — reads order via server (service key)
    about/page.tsx               # ▢ UNDESIGNED — blocked on design (product.md §4)
    contact/page.tsx             # ▢ UNDESIGNED
    (legal)/…                    # ▢ UNDESIGNED — privacy/terms/refund/shipping (Stripe needs refund)
  (admin)/
    login/page.tsx               # Supabase Auth · single admin (§5.1)
    admin/layout.tsx             # dark-only 242px sidebar shell §11.3 · auth-gated · DYNAMIC
    admin/page.tsx               # Dashboard §11.4-A
    admin/photographs/page.tsx           # library §11.4-B
    admin/photographs/new/page.tsx       # ingest §11.4-C
    admin/collections/page.tsx           # §11.4-F
    admin/orders/page.tsx                # queue §11.4-D
    admin/orders/[id]/page.tsx           # detail + Nations export §11.4-E
    admin/home-feature/page.tsx          # §11.4-G
  api/
    checkout/route.ts            # POST · compute → insert order+items (service key) → Stripe session
    stripe-webhook/route.ts      # POST · verify sig → reconcile amount → paid | amount_mismatch
lib/
  pricing.ts                     # ← VERBATIM port of the 4 pure functions (§4.1)
  supabase/
    admin.ts                     # service-key client — server-only, bypasses RLS
    server.ts                    # anon server client (RLS-respecting reads in server components)
    client.ts                    # browser anon client
  stripe.ts                      # server-only Stripe client
  env.ts                         # typed, validated env access (fails loudly if missing)
  images/derivatives.ts          # sharp ladder (built in the ingest slice, §7)
middleware.ts                    # gate the (admin) group on a Supabase session
```

**Rendering per group:**
- **`(store)` is static + ISR.** Pages are statically generated and served from cache.
  Data reads are tagged (`{ next: { tags: [...] } }` on the Supabase-fetch layer, or
  `unstable_cache` with tags). Admin publish/edit paths call `revalidateTag(...)` so new
  or edited work appears **with no redeploy** — which is what makes `design.md §11.4-G`'s
  on-screen promise honest.
- **`(admin)` is dynamic and auth-gated.** Never cached; every load reflects live state.
  `middleware.ts` redirects unauthenticated requests under `(admin)` to `/login`.

**Where money lives:** `lib/pricing.ts`, imported **only** by `app/api/checkout/route.ts`
and `app/api/stripe-webhook/route.ts`. Nothing client-side ever prices. The cart and
checkout UI show numbers for display; `/api/checkout` recomputes from scratch and is the
sole authority — unchanged from the legacy intent, just relocated.

---

## 3. Environment & clients

### 3.1 Env var mapping (the traps live here)

| Purpose | Legacy | New | Note |
|---|---|---|---|
| Supabase URL (server) | `VITE_SUPABASE_URL` | `SUPABASE_URL` | **Rename.** The `VITE_` prefix meant nothing server-side; it was read server-side anyway (`stripe-webhook.js:5`). `product.md §1.5`. |
| Supabase anon key | `VITE_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public by design; `NEXT_PUBLIC_` is Next's browser-exposure prefix. |
| Supabase service key | `SUPABASE_SERVICE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` | Server-only. **Never** `NEXT_PUBLIC_`. Bypasses RLS. |
| Stripe secret | `STRIPE_SECRET_KEY` | `STRIPE_SECRET_KEY` | Server-only. **Test mode** for the rebuild. |
| Stripe publishable | `VITE_STRIPE_PUBLISHABLE_KEY` | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Only needed if we use Stripe.js client-side; the hosted-Checkout redirect flow may not need it. |
| Stripe webhook secret | `STRIPE_WEBHOOK_SECRET` | `STRIPE_WEBHOOK_SECRET` | Re-register the endpoint at the new URL (`§8`). |
| Deploy URL | `process.env.URL` | `SITE_URL` (explicit, set per Vercel env) → `VERCEL_URL` fallback | **The silent trap.** `process.env.URL` is Netlify-only; on Vercel it's undefined and the localhost fallback charges the card then redirects the customer to localhost. See §4.2. |

`lib/env.ts` reads and validates these once at module load and throws a clear error if a
required one is missing — so a misconfigured deploy fails **loudly** at boot instead of
silently redirecting customers to localhost.

### 3.2 Clients

- **`lib/supabase/client.ts`** — browser anon client. Used by client components. Sees
  only what RLS allows anon (published photos/collections; **no** orders).
- **`lib/supabase/server.ts`** — anon server client for RLS-respecting reads in server
  components (published catalog).
- **`lib/supabase/admin.ts`** — **service-key** client. `import 'server-only'` at the top
  so a stray client import is a build error. Used by `/api/checkout`, the webhook, the
  order-confirmation read, and all admin writes. Bypasses RLS — this is the only way
  `orders` is ever touched (`schema.sql` RLS posture).
- **`lib/stripe.ts`** — server-only Stripe client.

---

## 4. The money path — first slice, in build detail

This is the most dangerous code in the project (`CLAUDE.md`), and the legacy gate never
covered it. Treat every line here as needing an adversarial read, not a green check.

### 4.1 Verbatim pricing port — `lib/pricing.ts`

The four things ported **byte-for-byte in logic**: `computeOrderAmounts`, `PRICE_BY_SIZE`,
`estimateTaxRate`, `estimateShipping` (plus their private helpers `ALL_SIZES`,
`US_STATE_RATES`, `isUnitedStates`, `MAX_QTY`, `MAX_NAME_LEN`), from
`netlify/functions/lib/pricing.js`.

- **What changes:** only the module wrapper (`module.exports = {...}` → named `export`s)
  and the **minimum** TypeScript parameter annotations at the exported boundary needed to
  satisfy `strict`. **No logic, no value, no branch changes.** The 12% international flat
  rate, the 6% US fallback, the flat `$9.95` shipping, the "throw on invalid size" — all
  reproduced exactly, warts documented in `CLAUDE.md`/`taxShipping.ts` and all.
- **How we prove it (this is the real gate, not tsc):** a **golden equivalence test** that
  imports both the archived original (`Photography-legacy`/quarry `pricing.js`) and the
  new `lib/pricing.ts`, runs both over a grid — every size in `ALL_SIZES`, US states in
  `US_STATE_RATES` plus an unlisted state, `us`/`usa`/`united states` spellings, a
  non-US country, several quantities including boundary `MAX_QTY` — and asserts
  **identical** `computeOrderAmounts` output. Behavioral equivalence proves no drift
  regardless of syntactic changes; a text diff would not.
- **Alternative considered:** keep it as `lib/pricing.js` (`.js`, `allowJs`) for maximal
  verbatim, imported into TS. Rejected as the default because it loses call-site type
  safety, but flagged for spec review if you'd rather not touch the file at all.

### 4.2 Checkout route — `app/api/checkout/route.ts` (POST)

Flow, server-only, service key:

1. **Parse & validate** the request: `items[]` (each `{ photoId | slug, size, register, qty }`),
   `customer` (`{ email, name }`), `shippingAddress` (`{ name, street, city, region,
   postalCode, country }` with `country` an ISO-2 code).
2. **Resolve each item against `photos`** (service key): confirm the photo exists and is
   `published`; **snapshot** `title` and `original_key`; validate `register` against the
   `print_register` enum and `has_bw_variant` when `silver`. Reject unknown/unpublished
   photos. (The client is trusted for *which* photo/size/register/qty, never for price or
   title.)
3. **`computeOrderAmounts(items, shippingAddress)`** — server authority on every cent.
   Tax from `country`+`region`; throws on a missing destination (its existing contract).
4. **Insert the order** (`status: 'pending'`) with the **complete** `shipping_address`
   jsonb + server-derived `subtotal_cents/shipping_cents/tax_cents/total_cents`, then
   insert `order_items` (snapshotted `title`, `size`, `register`, `qty`, `unit_cents`,
   `original_key`). The DB returns the order `id` (`gen_random_uuid()`).
5. **Create the Stripe Checkout session:**
   - `line_items` from `amounts.lineItems` + shipping + tax lines (as the legacy handler
     did), all server-computed.
   - `mode: 'payment'`, `customer_email`, `metadata.orderId = <id>`,
     `payment_intent_data.metadata.orderId = <id>`, `payment_intent_data.receipt_email`
     (Stripe's receipt is the customer's only receipt — `CLAUDE.md`).
   - **`billing_address_collection: 'required'`.** **No `shipping_address_collection`** —
     we own shipping (§0).
   - **`success_url` / `cancel_url` from an explicit `SITE_URL`, never `process.env.URL`:**
     ```
     // SITE_URL is set per Vercel environment to the canonical origin
     // (production custom domain in prod; the preview origin in preview).
     // VERCEL_URL is the fallback for ad-hoc previews; localhost for dev.
     const base =
       process.env.SITE_URL ??
       (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
     success_url: `${base}/order/${id}?session_id={CHECKOUT_SESSION_ID}`
     cancel_url:  `${base}/checkout?canceled=1`
     ```
     `lib/env.ts` validates `base` resolves to a real origin, so a misconfigured deploy
     fails at boot rather than silently sending customers to localhost after charging them.
     No hash-router `#` gymnastics — App Router uses real paths, so the legacy
     "query must precede the `#`" hazard is gone.
6. **Return** `{ url: session.url }`. The client redirects to Stripe.

If step 5 throws after step 4, the order sits `pending` and is harmless (never paid);
expired sessions are reconciled by the webhook (§4.3). No `localStorage` anywhere, ever.

### 4.3 Webhook — `app/api/stripe-webhook/route.ts` (POST)

- **Raw body for signature verification:** App Router route handlers expose the raw body
  via `await req.text()`; pass that string + the `stripe-signature` header to
  `stripe.webhooks.constructEvent`. (No Pages-API `bodyParser` config needed.)
- **`checkout.session.completed`:**
  - Read `session.metadata.orderId`, `session.payment_intent`, and **`session.amount_total`**.
  - Load the order (service key). **Reconcile** (`product.md §6.3`): if
    `amount_total === total_cents` → set `status: 'paid'`; else → set
    `status: 'amount_mismatch'` and record `amount_paid_cents = amount_total` (the schema
    constraint `mismatch_records_amount_paid` requires it). Store `stripe_session_id` and
    `stripe_payment_intent_id`.
  - **Idempotent:** only transition from `pending` (guard on current status), since Stripe
    may deliver the event more than once.
  - After a successful `paid`/`amount_mismatch` write, **`revalidateTag`** for anything
    order-derived if applicable (admin is dynamic, so likely a no-op here — noted for
    completeness).
- **`checkout.session.expired`:** set `status: 'cancelled'` (the new enum has no
  `'expired'`; an unpaid, expired session is a cancellation). Idempotent.
- **`payment_intent.payment_failed`:** **leave the order `pending`** (the session is
  retryable) and log. Do **not** invent a `'failed'` status — it is not in the enum, and
  a failed attempt is not a terminal order state. *(Open detail — confirm in build: is
  silent-pending the desired behavior, or should a repeatedly-failed order surface
  somewhere? Deferred, not blocking.)*
- Any unrecognized event: log and 200.

The status values the **legacy** webhook wrote — `completed`, `expired`, `failed` — do
**not** exist in `order_status` and are all replaced above. This is why the handler is
rebuilt, not ported.

### 4.4 Order-confirmation read — `app/(store)/order/[id]/page.tsx`

Reads the order + items through a **server-side service-key** path (anon has no access to
`orders` by design). Renders **only true states** (`product.md §1`, `design.md §12.5-H`):
the Stripe receipt is the only receipt; no fake tracking; no "email sent" claim. If the
order is `amount_mismatch`, the customer still sees a valid "thank you / we're reviewing
your order" state — never a bare success claim that isn't true.

---

## 5. What "Foundation" covers in this slice (the boundary)

Slice 1 is **Foundation + Money path**, not the pixel-faithful surfaces. Concretely:

**In:**
- Next scaffold; TypeScript strict; ESLint/Prettier; the legacy-removal commit.
- `lib/env.ts`, the three Supabase clients, `lib/stripe.ts`.
- **Type + token infrastructure**: load the four faces (Playfair Display, Newsreader,
  IBM Plex Mono, Hanken Grotesk) via `next/font`; define the `design.md §12.2`/`§11.1`
  color + type tokens as CSS custom properties for both store themes and the admin dark
  theme; a `ThemeProvider` (mark-as-toggle wiring lands with the store header later).
  This is the *substrate* every later surface consumes — not the surfaces themselves.
- `lib/pricing.ts` + the golden equivalence test.
- `/api/checkout`, `/api/stripe-webhook`, order persistence, the confirmation read.
- A **functional (not final-pixel) checkout form + confirmation page** — enough to drive
  the money path end-to-end against Stripe **test mode** and observe a real `paid` and a
  deliberately-forced `amount_mismatch`.

**Out (later slices):**
- The visual build of Home / Prints / Collection / Product (`§12.5-A–D`).
- The final cart drawer + checkout + confirmation polish (`§12.5-F/G/H`).
- All of admin, auth, ingest, the derivative pipeline.

Rationale: the money path has to be *exercisable* to be trusted, which needs a real form
and a real confirmation read — but not the final typography and layout. Those fold into
the storefront slices without rework because they consume the same tokens and the same
`/api/checkout`.

---

## 6. Verification

The legacy gate had a hole exactly where the money is, and green never caught the two P0s
(`CLAUDE.md §Verification`). The rebuild closes that hole:

- **Static gate:** `tsc --noEmit` at 0, ESLint at 0, `next build` passes. Necessary,
  not sufficient.
- **Pure-function tests:** the golden equivalence test (§4.1) **plus** direct assertions
  on `computeOrderAmounts` — the international-flat-12% path, the US-state fallback-6%,
  the throw-on-bad-size, the `MAX_QTY` boundary. These are pure functions; there is no
  excuse for them to be untested this time.
- **Money-path integration check (Stripe test mode):** drive `/api/checkout` → Stripe
  test Checkout → webhook, and **observe**: a matching-amount order lands `paid`; a
  tampered/forced-mismatch order lands `amount_mismatch` with `amount_paid_cents`
  recorded and is quarantined; `shipping_address` is written **complete** at insert;
  `success_url` resolves to the real deploy origin, **not** localhost (the §4.2 trap,
  verified by observation, not assumption). Use the `verify` skill's drive-the-flow
  discipline — evidence, not "the build passed."
- **No live money on this repo** — nothing is deployed and Stripe is test mode. The live
  constraint was the legacy site, now down.

---

## 7. Decomposition & build order

Each slice after this one gets its **own** spec→plan→implementation cycle.

1. **Foundation + Money path** — *this spec.*
2. **Storefront read-path** — Home / Prints / Collection / Product (`§12.5-A–D`), reading
   published photos via ISR + tagged fetches. First consumer of the tokens.
3. **Cart + checkout + confirmation (final)** — `§12.5-F/G/H` visual build on top of the
   slice-1 money path.
4. **Admin foundation** — Supabase Auth, `login`, middleware gate, the §11.3 shell,
   Dashboard (`§11.4-A`).
5. **Ingest + derivatives + photo library** — `sharp` ladder (`lib/images/derivatives.ts`),
   private-original storage, aspect + aura at ingest, `§11.4-B/C`. Confirm `sharp` runs in
   Vercel's serverless runtime (or move ingest to a route with the right runtime / a
   Supabase Edge Function) — a build-time decision for this slice.
6. **Collections + literature** — `§11.4-F`.
7. **Orders queue + Nations lab export** — `§11.4-D/E`.
8. **Home feature** — `§11.4-G` + the `revalidateTag` wiring proving the "no redeploy"
   promise end-to-end.
9. **Undesigned surfaces** — About / Contact / legal / footer. **Blocked on design**
   (`product.md §4`, `design.md §10`): the nav links to About and Contact and Stripe
   expects a refund policy, but none are designed. Do not ship nav links that go nowhere
   (`product.md §1`).

---

## 8. Open items carried (not resolved by this spec)

- **`§8 q3` per-photo pricing** — deferred; v1 is size-only, `lib/pricing.ts` untouched,
  no price column. If it lands later, `pricing.ts` and the schema move in the same commit.
- **`§8 q7` ordered-crop → Nations** — how a non-4:5 size reaches the lab print-ready. The
  export "says nothing about crop rather than guessing" until decided. Belongs to slice 7.
- **`design.md §10 q2` focus states** — §8's visible-focus rule applies to every keyboard-
  reachable surface; the ink-on-paper treatment (hairline ink ring candidate) needs
  specifying before slices 2–8 build interactive chrome.
- **`design.md §10 q3` aura fate** — stored speculatively at ingest; nothing reads it.
  Decide before it becomes permanent dead weight. Belongs to slice 5.
- **Webhook `payment_intent.payment_failed` handling** — silent-pending vs surfacing;
  confirm in slice-1 build (§4.3).
- **`sharp` on Vercel** — confirm runtime at slice 5.
- **Cutover checklist** (`product.md §1.5`, do **before** the store can take money):
  re-register the Stripe webhook at the new URL; **upgrade Supabase off the free tier**
  (the free-tier pause is exactly how the last DB died); point env at the new project;
  swap Stripe to live mode as the final step.

---

## 9. Source docs

- `CLAUDE.md` — working norms, the money-path constraints, the verification hole.
- `product.md` — IA, honest-function, `§1.5` migration hazards, `§6` fulfillment, `§8` open Qs.
- `design.md` — `§11` admin / `§12` storefront targets, `§8` cross-cutting rules.
- `supabase/schema.sql` — the applied, live data model (authoritative over `product.md §3`).
- `netlify/functions/lib/pricing.js` — the verbatim-port source (also in the quarry/archive).
