# Slice 3 — Cart + Checkout final visual (design spec)

> **STATUS: Brainstormed 2026-07-19, ready for a plan.** Slice 3 is the "cart + checkout
> final visual": it dresses the money path in the storefront's voice across three surfaces —
> the **cart drawer** (`design.md §12.5-F`), **checkout** (`§12.5-G`), and **confirmation**
> (`§12.5-H`). It is the visual/UX half; **the money code is untouched**. `POST /api/checkout`,
> its request body, `lib/pricing.ts`, `lib/checkout/*`, the webhook, and `lib/orders/reconcile.ts`
> do not change. The server remains the sole price authority.
>
> Built on `develop` at slice 2 (`89032c1`). Branch: `slice-3`.

Companion: `design.md §12.5-F/G/H` (the mocks), `§1`/`§8` (honest function, cross-cutting),
`product.md §1` (the governing rule), `supabase/schema.sql` (`orders`, `order_items`).

---

## 0. Decisions locked in this brainstorm

| Decision | Value | Source |
|---|---|---|
| Scope | **All three surfaces** — drawer + checkout + confirmation | brainstorm |
| Drawer totals | **Subtotal only** + "Shipping & tax calculated at checkout." — deliberate §1 deviation from the mock (deviation **D1/D2**) | brainstorm / `§1` |
| Checkout totals | **Live quote** via a new pure `previewQuote`: quote-complete → the exact subtotal/shipping/tax/total the server will charge; quote-incomplete → subtotal only | brainstorm |
| Price authority | **Server stays sole authority.** `previewQuote` is a display mirror of `computeOrderAmounts`, not a second authority. The `/api/checkout` POST body is **unchanged** | `CLAUDE.md` §Money path |
| Cart identity | Merge identical `(photoId, size, register)` lines and bump qty | brainstorm |
| Add-to-cart | Does **not** auto-open the drawer — bumps the header count (Σ qty) + a brief inline "Added" confirmation | brainstorm |
| Stepper clamp | Quantity clamps to **`1…100`** (`100` = `MAX_QTY` in `lib/pricing.ts`) so the UI cannot compose a server-rejected order | brainstorm (sub-decision 1) |
| Cart persistence | Keep the `cart:v1` localStorage key; **parse tolerantly**, defaulting a legacy line's missing `slug`/`altText` to `''`. No key bump | brainstorm (sub-decision 2) |
| Confirmation copy | The Newsreader note is **expectation-framed**, never a completed action; **no tracking** on this page | brainstorm (sub-decision 3) / `§1` |
| Confirmation works | **Text rows, no thumbnail** — `order_items` is a frozen snapshot with a soft `photo_id` and no slug (deviation **D4**) | `schema.sql` / `§1` |

---

## 1. What this slice does NOT do (deferred, not dropped)

- **The money code** — `POST /api/checkout` + its request body, `lib/pricing.ts`, `lib/checkout/{build,schema}.ts`, `app/api/stripe-webhook/route.ts`, `lib/orders/reconcile.ts` — **is not touched.** A change here is out of scope and, for pricing, would mean consciously retiring the golden equivalence lock (`CLAUDE.md`).
- **End-to-end money verification against real (test-mode) Stripe** — still the manual gate on `develop → main` (`CLAUDE.md` §Money path). This slice does not perform it; it must not regress the POST contract that it exercises.
- **About / legal / footer** → slice 9 (blocked on design, `product.md §4`).
- **Real `revalidateTag` invalidation** → slice 8. Mostly N/A to these surfaces (drawer/checkout are client; confirmation is a per-order service-key read), but kept on the carried list.
- **The real derivative pipeline** → slice 5. Drawer thumbs use the same seeded fixtures slice 2 introduced.
- **Slice-3-local non-goals:** discount codes, gift notes, saved addresses, shipping-method choice (single flat rate; `estimateShipping` ignores method), multi-currency (USD only). "Save to collection" stays deleted (slice-2 C3).

---

## 2. File changes

```
components/cart/
  CartContext.tsx      # MODIFY  — richer CartLine, identity merge, remove/setQty, drawer UI state
  CartDrawer.tsx       # NEW     — §12.5-F slide-in drawer (client)
  AddToCart.tsx        # DELETE  — orphaned slice-1 leftover; nothing imports it
components/store/
  Header.tsx           # MODIFY  — "Cart (N)" becomes a button → open(); N = Σ qty
components/product/
  ProductInteractive.tsx # MODIFY — pass slug + altText into add(); inline "Added" confirmation
app/(store)/
  layout.tsx           # MODIFY  — mount <CartDrawer/> inside CartProvider
  checkout/page.tsx    # REWRITE — §12.5-G two-column, labeled fields + inline validation + live quote
  order/[id]/page.tsx  # REWRITE — §12.5-H expanded read + order_items query + honest states
app/
  globals.css          # MODIFY  — drawer / checkout / confirmation classes + reduced-motion
lib/format/
  quote.ts             # NEW     — previewQuote(lines, {country, region}); pure, client-safe
test/
  cart-context.test.ts        # NEW
  quote.test.ts               # NEW
  cart-drawer.test.tsx        # NEW
  checkout.test.tsx           # NEW
  order-confirmation.test.tsx # NEW
```

`AddToCart.tsx` is dead (slice-2 `ProductInteractive` calls `add()` directly; nothing imports
`AddToCart`). Confirm with a repo-wide grep at build time before deleting.

---

## 3. CartContext — the identity model and drawer state

`components/cart/CartContext.tsx` (client). Today it is a slice-1 stub: `CartLine` is
`{ photoId, title, size, register, qty }`, `add` blindly appends, and the only other methods are
`clear`. This slice makes the cart real.

**`CartLine` gains two snapshot fields** the drawer thumb needs:

```ts
export type CartLine = {
  photoId: string
  slug: string          // NEW — for the drawer thumb's derivative URL (Plate)
  title: string
  altText: string       // NEW — the thumb's alt (a11y, §8)
  size: string
  register: 'colour' | 'silver'
  qty: number
}
```

**Identity + mutations** (all keyed by the composite identity):

- `lineKey(l)` = the composite `photoId` + `size` + `register` joined by `|` — the merge/identity key.
- `add(line)` — if a line with the same key exists, **bump its qty** (clamped to `100`); else append. Does **not** open the drawer.
- `remove(key)` — drop the line.
- `setQty(key, n)` — clamp `n` to `1…100`; `remove` is the only way to reach 0.
- `clear()` — unchanged (used post-checkout / tests).

**Derived:** `count = Σ qty` (the header and drawer "N works").

**Drawer UI state on the same context** (one provider, no second context): `isOpen`, `open()`,
`close()`. Keeping it here means `Header` (opens) and `CartDrawer` (renders/closes) share one
source of truth.

**Persistence — tolerant rehydrate (sub-decision 2).** Keep the `cart:v1` key. On mount:
**wrap `JSON.parse` in try/catch** (corrupt storage → empty cart, never a crash — today's code
does a bare `JSON.parse(s)`), then **assert the parsed value is an array** (anything else → empty),
then **coerce** each line: default a missing `slug`/`altText` to `''`, drop anything without a
`photoId`/`size`/`register`, clamp `qty` to `1…100` (drop non-integer/≤0). A stale slice-1 cart (no
`slug`/`altText`) degrades — the thumb falls back to no-image, the line stays usable — instead of
crashing. The first-render-matches-SSR-empty pattern (read localStorage in `useEffect` after mount)
is kept.

---

## 4. CartDrawer — `§12.5-F`

`components/cart/CartDrawer.tsx` (client). Mounted once in `app/(store)/layout.tsx` inside
`CartProvider`. Renders nothing until `isOpen`.

- **Shell:** 456px right panel (`--paper`, left `--hair` border, one soft shadow per §12.6) over
  a dimmed + blurred backdrop. Backdrop click and Esc both `close()`.
- **Header:** "Your selection · N works" (N = Σ qty) + a "✕" close button.
- **Empty state:** honest — "Your selection is empty." No recommended-products filler.
- **Rows:** a 76px register-aware `Plate` thumb (uses `slug` + `register`; alt = `altText`);
  Playfair title + `priceForSize(size) × qty`; mono `size · register`; a bordered −/qty/+
  stepper (`setQty`, clamped `1…100`); "Remove" (`remove`).
- **Footer (deviation D1/D2):** **subtotal only** (Σ `priceForSize × qty`) + the line
  "Shipping & tax calculated at checkout." → primary **"Review & checkout →"** which navigates to
  `/checkout` and calls `close()`. **No shipping line, no "total", no "tax" text** — the drawer has
  no address and cannot tell the truth about either.
- **a11y / motion (§8, §12.6):** `role="dialog"`, `aria-modal="true"`, labelled by the header;
  on open, **focus moves into the dialog** (the ✕ or first focusable); focus is trapped while open
  and **returns to the opener on close**; body scroll-lock while open; the slide/fade is gated
  behind `prefers-reduced-motion` (reduced → appear/disappear, no transform).

Prices come from `lib/format/price.ts` (`priceForSize`), never from a stored/client price.

---

## 5. previewQuote — `lib/format/quote.ts` (pure, client-safe)

New pure module. No hardcoded rates — it **wraps the locked `computeOrderAmounts`** so the number
the customer sees is the number the server computes.

```ts
import { computeOrderAmounts, priceForSize } from '@/lib/pricing' // pricing has no `server-only` guard
// (lib/format/price.ts already imports from lib/pricing inside client components — client-safe.)

export type QuoteLine = { size: string; qty: number; title?: string }
export type QuoteDest = { country: string; region: string }

export type Quote =
  | { complete: true;  subtotal: number; shipping: number; tax: number; total: number }
  | { complete: false; subtotal: number }   // subtotal is always knowable; the rest needs the address

export function previewQuote(lines: QuoteLine[], dest: QuoteDest): Quote {
  const subtotal = lines.reduce((s, l) => s + priceForSize(l.size) * l.qty, 0)
  try {
    const a = computeOrderAmounts(
      lines.map((l) => ({ size: l.size, qty: l.qty, name: l.title })),
      { country: dest.country, region: dest.region },
    )
    return { complete: true, subtotal: a.subtotal, shipping: a.shipping, tax: a.tax, total: a.total }
  } catch {
    return { complete: false, subtotal }   // e.g. US with no region → computeOrderAmounts throws
  }
}
```

**"Quote-complete" is defined by the math, not the form:** it's exactly *"`computeOrderAmounts`
did not throw"* — valid item sizes + `country` present + `region` present **iff** US. Street/city/
postal are irrelevant to the math and are **not** part of this gate (see the two-gate note in §6).

**Faithful-mirror property (tested):** for the same inputs, `previewQuote` returns the same
subtotal/shipping/tax/total as `computeOrderAmounts`. It is a **display mirror only** — it does
not (and cannot, without a service key) validate that a photo is still published. If an item goes
stale between quote and POST, the **server rejects the whole order (400)** rather than charging the
quoted amount. The server stays the authority.

---

## 6. Checkout — `§12.5-G` (rewrite `app/(store)/checkout/page.tsx`, client)

Two columns. **The POST body and `/api/checkout` are unchanged** — same
`{ items:[{photoId,size,register,qty}], customer:{email,name}, shippingAddress:{name,street,city,region,postalCode,country} }`.
The new `CartLine.slug`/`altText` are **thumb-only display fields and must never enter the POST** —
the items mapping stays exactly `{photoId,size,register,qty}` (F5).

- **Left — the form:** Contact (email) + Ship-to, rendered as **real labeled `<input>`s** (not the
  mock's "filled cells"), each with a visible `<label>`, inline validation surfaced via
  `role="alert"`, and the §8 hairline focus ring. Country is the existing ISO-2 select
  (`US/CA/GB/DE`); region is a labeled field ("State / Region").
- **Right — the live summary:** driven by `previewQuote(cartLines, {country, region})`. Re-quotes
  on every country/region change. Quote-complete → subtotal / shipping / tax / **Playfair total**.
  Quote-incomplete → subtotal + "Shipping & tax calculated once your address is complete." → primary
  **"Pay with Stripe →"** + the line "Secure payment on Stripe's page · card never touches this site."
- **Two gates, deliberately different (honest):**
  - the **quote** updates as soon as the math has what it needs (country + region-if-US);
  - the **Pay button** is enabled only when the **full** form is valid (email + all address fields)
    **and** the cart is non-empty — because the POST requires them (`checkout/schema.ts`).
  Requiring street/city before *quoting* would be a fake gate; letting *Pay* fire without them would
  fail at the server.
- On submit: existing behavior — POST, on `!ok` show `json.error` via `role="alert"`, else
  `window.location.href = json.url`. **No "we'll email you" copy** — the only receipt is Stripe's.

---

## 7. Confirmation — `§12.5-H` (rewrite `app/(store)/order/[id]/page.tsx`, server / service key)

Service-key read (anon has no `orders` access). **Expand** the current
`select('id, status, total_cents, customer_name')` to add
`created_at, customer_email, shipping_address, subtotal_cents, shipping_cents, tax_cents`, and add a
**second query** for `order_items` (`title, size, register, qty, unit_cents`) by `order_id`.

- **Header block (centered):** mono order id → Playfair 76px **"Thank you."** (active) /
  **"Order update"** (cancelled/refunded) → Newsreader note → "— Jon". Keep the existing **honest
  status map** verbatim (active = not cancelled/refunded; each real `order_status` gets a true
  message; `pending` says "received … reviewing"; nothing invents a state).
- **`amount_mismatch` is named, not left to fall through (F2).** It is one of the seven
  `order_status` values and is *not* cancelled/refunded, so it renders **active → "Thank you."** with
  the generic **"we've received your order and are reviewing it. Your receipt comes from Stripe."**
  This is the honest read of a quarantine (§6.3): the order genuinely *is* received and under manual
  review. It must **not** claim `paid`, show a total-as-charged, or render any shipping/tracking
  state. This is a conscious decision recorded here — not an accident of the default branch.
- **Note copy (sub-decision 3):** expectation-framed, never a completed action. The **ship-window
  line is gated to payment-confirmed states** (`paid` / `submitted_to_lab` / `shipped`) —
  *"Every print is made to order and typically ships within 5–7 days. Your receipt comes from
  Stripe. — Jon."* For `pending` / `amount_mismatch` (payment not confirmed) the note drops the
  5–7-day promise and says only *"We've received your order and are reviewing it. Your receipt comes
  from Stripe. — Jon."* (F3). **No tracking** rendered here in any state; tracking lives in the admin
  slice, gated on a real `shipped_at` (schema constraint).
- **Two cells:**
  - **Shipping to** — the stored snake_case `shipping_address` fields (`name`, `street`, `city`,
    `region`, `postal_code`, `country`) rendered verbatim.
  - **Works** — **TEXT rows, no thumbnail** (deviation D4): `title · size · register · qty ·`
    line price. Line price = **`unit_cents × qty` from the snapshot**, not recomputed from
    `PRICE_BY_SIZE`. Then subtotal / shipping / tax / total from the order row.
- **Why no thumbnail:** `order_items` is a frozen receipt with a *soft* `photo_id` (may be null) and
  no slug (`schema.sql` "an order is a receipt"). A live derivative could depict a since-renamed,
  re-cropped, or deleted photo. The receipt shows what was bought.
- **Not found:** the existing "We couldn't find that order." path is kept.

---

## 8. Honest-function contract (§1) — the governing read

The organizing principle: **three surfaces, two pricing regimes.** Drawer + checkout show **live**
pricing off `lib/pricing.ts` (a working selection, still changeable). Confirmation shows the
**frozen snapshot** off `order_items` (a receipt of what was actually charged). Getting that split
right is the whole honesty story.

### 8.1 Deliberate deviations from the mocks

| # | Mock (`design.md §12.5`) | This slice | Why (§1) |
|---|---|---|---|
| **D1** | Drawer footer: subtotal / shipping / total | **Subtotal only** + "Shipping & tax calculated at checkout." | No address in the drawer ⇒ tax is unknowable (US-state / 12% intl / 0). A "total" without tax is a mislabeled total. Subtotal is the one number exactly true with no address. Shipping is *currently* flat $9.95, but hardcoding it would couple the drawer to a pricing internal and lie the day shipping becomes address-dependent. |
| **D2** | Drawer hint "Tax calculated at payment." | "Shipping & tax calculated at **checkout**." | *Our server* computes shipping + tax; Stripe only collects the total we hand it. "at payment" wrongly implies Stripe computes it, and it omits shipping. |
| **D3** | Checkout summary shows totals (implied always present) | Summary is a **live quote**: subtotal-only until quote-complete, then exact | Don't display tax/total before the address that determines them exists. |
| **D4** | §12.5-H "works summary" (ambiguous re: thumbnail; §12.5-G uses thumbs) | Confirmation works have **no thumbnail** | `order_items` snapshot has no slug and is frozen; a live derivative could depict a since-changed photo. Resolves the ambiguity toward §1. |

*Fidelity note (not a §1 deviation):* the checkout mock's "filled cells" become real **labeled**
inputs with validation + focus ring — the cells were a visual placeholder; a real form needs labels.

### 8.2 Invariants this slice must not break

- **The server is the sole price authority.** `previewQuote` mirrors `computeOrderAmounts` for
  display; it is never trusted for the charge. The POST body and `/api/checkout` are unchanged.
- **Drawer/checkout = live pricing; confirmation = snapshot.** The confirmation's line prices come
  from `order_items.unit_cents`, never re-derived, so a later price change never rewrites a receipt.
- **Orders stay service-key only** (`schema.sql` RLS). No order data in `localStorage`, ever — the
  cart persists only the selection (`photoId/slug/title/altText/size/register/qty`), never order rows.
  `slug`/`altText` are thumb-only and **never enter the checkout POST** (F5).
- **Only true states render** on confirmation. No fake tracking, no unsent-email claim.

---

## 9. Shared chrome, motion, a11y (`globals.css`)

- New classes for the drawer (panel, backdrop, row, stepper), checkout (two-column grid, field,
  summary), and confirmation (centered header, two-cell grid, text rows).
- **Focus (§8, the load-bearing row):** every new interactive element — close button, stepper
  buttons, Remove, checkout inputs, Pay — carries the hairline ink `:focus-visible` ring established
  in slice 2.
- **Motion (§12.6):** drawer slide + backdrop fade at `.18–.2s`; **all** of it behind
  `@media (prefers-reduced-motion: reduce)` (reduced → no transform, no fade).
- **Radius (§12.6):** cards 5px; the thumb and stepper are square.
- **"Added" confirmation is announced (F6):** the inline post-add confirmation on the product page
  is an `aria-live="polite"` region so screen-reader users hear it, not only sighted ones.

### 9.1 Mobile (`§12.5-I`) — F1

The three surfaces must hold at 375px, not just desktop; §12.5-I is explicit about cart/checkout/
confirmation on mobile.

- **Drawer width:** `min(456px, 100vw)` — effectively full-width below ~480px. A fixed 456px panel
  overflows a 375px viewport; this must not ship.
- **Checkout:** the two columns **stack** to one below the breakpoint (form, then summary); the
  summary stays reachable without scrolling past a long form (or is sticky). Confirmation's two cells
  stack likewise.
- **Hit targets ≥ 44px (§12.5-I):** the stepper −/+, the ✕ close, Remove, and Pay meet the minimum on
  touch. The stepper's 44px targets can exceed the visual control via padding.
- **Pinch-zoom (§8):** nothing in these surfaces reintroduces `user-scalable=no`.

---

## 10. Verification

**Unit / component (Vitest + jsdom, configured in slice 2):**

- **CartContext** (`cart-context.test.ts`): merge by `(photoId,size,register)` bumps qty;
  `remove`; `setQty` clamps `1…100`; `add` clamps merged qty to `100`; `clear`; persist → rehydrate
  `cart:v1`; **tolerant rehydrate** of a legacy line missing `slug`/`altText`; `count = Σ qty`;
  `isOpen/open/close`.
- **previewQuote** (`quote.test.ts`): complete-US (exact per-state tax), complete-non-US (12% flat),
  incomplete-US (no region → `complete:false`, subtotal only), empty cart, unknown-state-code (6%
  fallback); **faithful-mirror** — equals `computeOrderAmounts` for the same inputs.
- **CartDrawer** (`cart-drawer.test.tsx`): renders lines; stepper ± and Remove mutate the cart;
  empty state; footer shows subtotal and **no** "total"/"tax"/"shipping" number (guards D1/D2);
  `role="dialog"` + `aria-modal`; focus moves into the dialog on open; Esc and backdrop click close;
  reduced-motion path.
- **Header**: `count = Σ qty`; click opens the drawer.
- **Checkout** (`checkout.test.tsx`): summary re-quotes on country/region change; Pay disabled until
  full form valid + cart non-empty; **the POST JSON shape is unchanged, carrying only
  `{photoId,size,register,qty}`** — no `slug`/`altText` leak (regression lock on the money contract, F5).
- **Confirmation** (`order-confirmation.test.tsx`): each of the seven statuses → correct
  heading/message — including **`amount_mismatch` → active "Thank you." + reviewing message, no
  ship-window, no "paid" claim** (F2), and the **ship-window line only on `paid`/`submitted_to_lab`/
  `shipped`** (F3); works render from the `order_items` snapshot (`unit_cents × qty`); **no `<img>` in
  the works list** (guards D4); `shipping_address` rendered; not-found path.

**Static gate:** `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` all green.

**Manual (the real proof, per evidence-before-assertions):** `npm run dev`, add prints, open the
drawer (merge, stepper, remove, subtotal-only footer), go to checkout (watch the quote flip from
subtotal-only to exact as the address completes; confirm Pay gating), and load a confirmation page
in each status. This slice does **not** run the end-to-end Stripe money verification (still the
`develop → main` gate) but must not regress the POST contract it depends on.

---

## 11. Build order within the slice (for the plan)

Natural, independently-reviewable chunks:

1. **CartContext** — richer `CartLine`, identity merge, `remove`/`setQty`, drawer state, tolerant
   rehydrate + tests. Delete `AddToCart.tsx`. (The substrate — everything else depends on it.)
2. **previewQuote** (`lib/format/quote.ts`) + tests. (Pure, isolatable.)
3. **CartDrawer** + `Header` button + `ProductInteractive` (`slug`/`altText` + "Added") + mount in
   layout + `globals.css` drawer classes + tests.
4. **Checkout** rewrite (§12.5-G) + `globals.css` checkout classes + tests.
5. **Confirmation** rewrite (§12.5-H) + `globals.css` confirmation classes + tests.

Chunks 1–2 are the money-adjacent core and should land first. 3/4/5 are natural PR boundaries.

---

## 12. Open / carried

- **Confirmation note wording** — resolved to expectation-framed copy (sub-decision 3); the exact
  sentence is in §7 and can be tuned in review without touching logic.
- **About / legal / footer** → slice 9 (blocked on design, `product.md §4`).
- **Real ISR invalidation** → slice 8 (mostly N/A to these surfaces).
- **Derivative pipeline** → slice 5 (drawer thumbs use slice-2 seeded fixtures).
- **End-to-end Stripe money verification** → still the manual `develop → main` gate (`CLAUDE.md`).

---

## 13. Source docs

- `design.md §12.5-F/G/H` (the mocks), `§8` (cross-cutting: focus, motion, pinch-zoom, the
  photograph's dominant share), `§12.6` (shape/elevation/motion), `§12.7` (storefront do/don't).
- `product.md §1` (honest function — the governing rule), `§4` (undesigned surfaces → slice 9).
- `supabase/schema.sql` — `orders`, `order_items` (the snapshot/receipt invariant), RLS
  (orders service-key only).
- `lib/pricing.ts`, `lib/checkout/{build,schema}.ts`, `lib/format/price.ts`, `app/api/checkout/route.ts`,
  `app/api/stripe-webhook/route.ts` — the money path this slice dresses but does not change.
- `docs/superpowers/specs/2026-07-17-storefront-read-path-design.md` — slice 2 (dependency:
  `CartContext`, `Header`, `Plate`, `ProductInteractive`, `lib/format/price.ts`).

---

## 14. Post-review corrections (applied 2026-07-19)

An adversarial review of this spec (six lenses, grounded against the repo) surfaced six findings.
Everything else probed — `previewQuote` faithfulness/rounding/ISO-2 matching, `lib/pricing.ts`
client-safety, `Plate`/`derivatives.ts` in a client tree, the `AddToCart` deletion, the flat-$9.95
shipping — was verified correct in code and needs no change.

| # | Sev | Correction | Landed in |
|---|---|---|---|
| F1 | major | Mobile under-specified: 456px drawer overflows 375px; checkout/confirmation must stack; ≥44px targets; pinch-zoom | §9.1 |
| F2 | major | `amount_mismatch` confirmation state named explicitly (active, reviewing, no `paid`/tracking claim) — not a fall-through | §7 |
| F3 | minor | Ship-window copy gated to payment-confirmed states; `pending`/`amount_mismatch` drop the 5–7-day promise | §7, §10 |
| F4 | minor | Tolerant rehydrate spelled out: `try/catch` around `JSON.parse`, array guard, per-line coercion | §3 |
| F5 | minor | `slug`/`altText` are thumb-only and never enter the POST; regression-locked in the checkout test | §6, §8.2, §10 |
| F6 | nit | Drawer focus moves *into* the dialog on open; the "Added" confirmation is an `aria-live` region | §4, §9 |

**Grounding evidence:** `AddToCart` has no importers (`grep`); `lib/images/derivatives.ts` uses only
`NEXT_PUBLIC_SUPABASE_URL` (no `server-only`) and `Plate` already renders inside the client
`ProductInteractive`, so the drawer thumb is client-safe; `lines.length` as a count exists only in
`components/store/Header.tsx:28` (→ Σ qty).
