# Slice 7 — Orders queue + Nations lab export (design spec)

**Date:** 2026-07-27
**Surfaces:** `design.md §11.4-D` (the work queue) and `§11.4-E` (order detail + export)
**Product:** `product.md §6.1` (state machine), `§6.2` (the export), `§6.3` (reconciliation), `§6.4` (the list)
**Status:** draft for build

## Goal

Close the fulfillment loop. Today money can come in and nothing can get it out: `/api/checkout`
and the webhook are built and tested, but the admin has no orders surface at all. Four of the
seven `order_status` values — `submitted_to_lab`, `shipped`, `cancelled`, `refunded` — are
unreachable from the application, so a paid order sits at `paid` forever and the
`submitted_to_lab_at` / `shipped_at` / `tracking_number` / `lab_finish` columns are dead.

Slice 7 builds the two surfaces that make the schema true:

- **`/admin/orders`** — the work queue (tabs, search, expandable rows, mismatch quarantine).
- **`/admin/orders/[id]`** — order detail, the Nations Photo Lab export block, and the
  forward-only fulfillment rail.

**No schema change.** Every column this slice writes is already applied and live
(`supabase/schema.sql` lines 231–248), including the `tracking_requires_shipment` and
`mismatch_records_amount_paid` constraints. **No money-path change.** `lib/pricing.ts`,
`/api/checkout`, and the webhook are untouched — this slice only reads what they wrote.

## Decisions

### 1. Five tabs, not four — `submitted_to_lab` needs a home

`design.md §11.4-D` specifies *Queue · Needs attention · Shipped · All*. That set strands a
state: an order Jon has placed at the lab is no longer `paid` and not yet `shipped`, so under the
handoff's four tabs it disappears from every view except All — the exact moment in fulfillment
when he most needs to see it. The tabs become:

| Tab | Status filter | Order |
|---|---|---|
| **Queue** | `paid` | oldest first (`product.md §6.4`) |
| **At the lab** | `submitted_to_lab` | oldest first |
| **Needs attention** | `amount_mismatch` | oldest first |
| **Shipped** | `shipped` | newest first |
| **All** | everything, incl. `pending` / `cancelled` / `refunded` | newest first |

**Queue stays exactly `paid`.** `product.md §6.4` defines the work queue as "`paid`, oldest
first" and the dashboard's *In the queue* tile counts `paid` only (`lib/admin/dashboard.ts`).
Widening Queue to include `submitted_to_lab` would silently contradict the tile a click away.
A fifth tab costs nothing and keeps the two counts honest.

`pending` orders (checkout started, never paid) appear only under All. They are not work, and
`§6.1` forbids a timer ever advancing or expiring them.

### 2. Real ids. The design's order number does not exist

`§11.4-E` heads the export `ORDER JH-20260716-0042`. There is no order-number column, and slice
4b already refused to invent one (D14, `components/admin/QueueRow.tsx`): "deriving one from
`created_at` plus an invented counter would fabricate the field Jon uses to reconcile a row
against Stripe."

- The queue row shows the **first 8 characters** of the uuid, as `QueueRow` already does.
- The detail header and the export block print the **full uuid** — that is the id the customer
  quotes and the id that reconciles against Stripe.
- The detail header also shows `stripe_payment_intent_id` when present, because that is what
  reconciles in the Stripe dashboard. It is *not* in the export block; the lab has no use for it.

### 3. The export prints the real `original_key`, never `<slug>_orig.tif`

`§11.4-E`'s line format ends `file: <slug>_orig.tif`. No such object exists. Originals are stored
at `<slug>/<register>.<ext>` (`lib/ingest/keys.ts`), and `/api/checkout` **snapshots the resolved
key per line** into `order_items.original_key` — `original_bw_key` for a silver register,
`original_key` for colour. That snapshot is the whole point of the column
(`schema.sql`: "snapshot: what fulfillment actually pulls").

The export prints `file: <order_items.original_key>` verbatim. When the column is null — an order
placed before ingest existed, or a photo whose file was never attached — it prints
`file: (not recorded)`. It never reconstructs a filename from the slug, because a filename that
looks right and is wrong costs a reprint on Jon.

### 4. Download links are signed, server-side, and never inside the copy block

`originals` is a private bucket. The `↓ original` link per line item is a Supabase signed URL
minted on the server at render time (`createSignedUrl(key, 3600)`) through the **authenticated**
client, so RLS's `originals_admin_all` policy is what authorizes it — not the service key.

Signed URLs are **excluded from the export block**. The block is pasted into Nations' order form
and may sit in a tab for hours; an expired link inside a document Jon trusts is a worse failure
than no link. The block carries keys, the page carries links.

If signing fails, or `original_key` is null, the line renders a plain "original not available"
note in place of the link. No dead anchors.

### 5. Search is a pure filter over a bounded read, and admits when it truncated

`§6.4`: "Search by order id or email — the customer's only receipt is Stripe's, so the id is what
they will quote." Postgres cannot prefix-match a `uuid` column through PostgREST without a cast,
and the id Jon has in hand is usually the 8-character prefix the queue showed him. So:

- The read fetches the active tab ordered and **capped at 200 rows**.
- `filterOrders(rows, query)` — a pure, unit-tested function — keeps rows whose id *starts with*
  the query (case-insensitive, hyphens ignored) **or** whose email or customer name *contains* it.
- When the read hits the cap, the surface says so: *"Showing the first 200 orders."* A cap that
  silently truncates would let a real order be invisible while the page looks complete — and when
  a search comes back empty on a truncated page, the empty line is bounded to what was actually
  searched rather than claiming no order matches.
- **A full uuid is resolved by the query itself, across every tab.** That is the id §6.4 says the
  customer will quote, so it must never come back "no match" because the order had moved to a
  state you were not looking at, or sat past the cap.

At this volume the cap will not be reached for years. It is a stated bound, not a hidden one.

### 6. The rail is forward-only, human-pressed, and tracking is required to ship

`Paid → Submitted to lab → Shipped`. Each step is a distinct button that a human presses; nothing
is ever advanced by a timer (`§1`, `§6.1` — the legacy site set `shipped` on a 900ms `setTimeout`
and generated a fake UPS number, which is the failure this rail exists to make impossible).

- **Mark submitted to lab** — sets `status = 'submitted_to_lab'` and stamps `submitted_to_lab_at`.
  Enabled only from `paid`.
- **Mark shipped + tracking** — reveals a tracking input; **the tracking number is required**.
  `§6.1` defines `shipped` as "Jon, manually + tracking" and "the only state that may ever display
  a tracking number". A `shipped` row with no tracking is a state whose entire meaning is missing,
  so the action refuses it rather than writing a half-truth. Sets `status`, `shipped_at`, and
  `tracking_number` together, satisfying `tracking_requires_shipment`.
- Enabled only from `submitted_to_lab`. Skipping the lab step is not offered: the rail models the
  real sequence, and an order that never went to the lab has no prints to ship.

### 7. `amount_mismatch` is resolved by a human, and the buttons say what they actually do

`§6.3`: a quarantined order must be visibly held out of the queue "because the failure mode is
shipping $65 of prints for $5.50." Quarantine is the easy half; the missing half is a way out.
The detail page for a mismatched order shows `paid $X · expected $Y` and offers three resolutions:

- **Accept as paid** → `amount_mismatch → paid`. The one non-forward transition in the slice, and
  it is deliberate: a human compared the Stripe dashboard to the order and decided the money is
  right. The button's helper line says exactly that — *"Only after confirming in Stripe that the
  full amount was captured."*
- **Mark refunded** → `refunded`. **Helper: "Records that you refunded this in Stripe. It does not
  move money."**
- **Mark cancelled** → `cancelled`. Same shape.

`Mark refunded` / `Mark cancelled` are available on any non-`pending` order, not just mismatches —
otherwise a refunded order sits in the queue forever and the queue lies. They are record-keeping
controls, labelled as such. **This slice does not call Stripe's refund API.** Building a button
that moves real money is its own slice with its own adversarial review; a button that claims to
and doesn't is the `§1` violation this project exists to avoid, which is why the copy is explicit
rather than implied.

### 8. `lab_finish` stays free text with a default, until Nations' vocabulary is confirmed

`product.md §6.2` carries an open item: *"Confirm before building: Nations' exact surface/paper
vocabulary, so the `finish` enum and the NOTES block match their real order form."* It is not
confirmed. So `lab_finish` remains what the schema already made it — `text default 'Lustre'`,
editable on the detail page and substituted across the export header. **No enum, no dropdown of
invented options.** A select listing four finishes Nations may not offer would encode a guess into
the sheet a human pastes into a real order form. Free text with the known-good default is the
honest shape until Jon confirms the list; adding the enum later is a one-line change.

The same restraint applies to the paper line: the header prints
`(finish: <lab_finish> · paper: Fuji Crystal Archive)` exactly as `§11.4-E` specifies, and that
paper string is Jon's to correct once confirmed.

### 9. The dashboard's two marked buttons become links, not copy buttons

`§11.4-A` puts a "Copy for lab" ghost button on every dashboard queue row. Rendering it honestly
would mean the dashboard read pulling every line item, every snapshot key, and the finish for
every queued order — and then copying a block the row does not show. A control whose output you
cannot see before you paste it into a real order form is the wrong affordance.

So both `MarkedButton`s on the dashboard resolve to links into the order:

- queue row → **"Open →"** to `/admin/orders/{id}`
- held (mismatch) row → **"Review →"** to `/admin/orders/{id}`

and `MarkedLink label="All orders →"` becomes a real link to `/admin/orders`. Copy-for-lab lives
on the detail page, directly under the block it copies. Two more `NOT BUILT` markers die.

### 10. The customer's confirmation page learns about tracking

`shipped` exists so that a tracking number can be true. The customer's only receipt is Stripe's
(`§1` — the system sends no email), so `/order/[id]` is the only place a tracking number can ever
reach them. When `status === 'shipped'` **and** `tracking_number` is present, the confirmation
page renders it as plain text alongside the shipped note. No carrier logo, no link, no "track your
package" claim — the schema does not record a carrier, and `§1` forbids inventing one.

This is the only storefront change in the slice.

## The export block (locked)

```
ORDER  8f14e45f-ceea-467a-9b3a-2c4f7a5d1e02
DATE   2026-07-16
LAB    Nations Photo Lab

SHIP TO
  Jane Marsh
  1200 Vine Street
  Cincinnati, OH 45202
  US
  jane@example.com

PRINTS  (finish: Lustre · paper: Fuji Crystal Archive)
  2x  Deterioration   8x10   Colour       file: deterioration/colour.jpg
  1x  Omniprominence  16x20  Silver B&W   file: omniprominence/silver.jpg

NOTES
  Borderless. No auto-correct — files are print-ready.
```

Rules, all of them tested:

- Plain text, `\n`-joined, no trailing whitespace on any line. It is pasted into a web form.
- `DATE` is the order's `created_at` in **America/New_York**, `YYYY-MM-DD` — the same zone-explicit
  treatment `lib/admin/dates.ts` already applies, so the date never shifts under the reader.
- One line per `order_items` row, in insert order (the order the customer built the cart).
- `qty` renders as `2x`, register as `Colour` / `Silver B&W` (`§11.4-D`'s vocabulary).
- Columns are space-padded to the widest value in *this* order, so the block stays readable
  without a monospace guarantee at the far end.
- `SHIP TO` omits any line the stored address does not carry — it never prints an empty line or
  the string `undefined`. `shipping_address` is `jsonb` written by `toStoredShippingAddress`, and
  a legacy or partial row must degrade, not crash.
- The NOTES block is the two lines above. The handoff's third line (`Match crop to 4:5 as
  delivered.`) stays deleted — `§11.4-E`'s own correction, because five of the seven sizes are not
  4:5 and the instruction would mis-print them.

## Route & files

| File | Change |
|---|---|
| `app/admin/(protected)/orders/page.tsx` | **new** — Surface D; tabs + search + rows (server) |
| `app/admin/(protected)/orders/[id]/page.tsx` | **new** — Surface E; detail + export + rail (server) |
| `lib/data/orders-admin.ts` | **new** — `listOrders()`, `getOrderForFulfillment()`, signed-URL minting |
| `lib/orders/lab-export.ts` | **new** — pure `buildLabExport()` |
| `lib/orders/address.ts` | **new** — pure `addressLines()` / `copyableAddress()` |
| `lib/orders/query.ts` | **new** — pure `filterOrders()`, tab predicates, `TABS` |
| `lib/admin/order-actions.ts` | **new** — the six Server Actions |
| `components/admin/OrderRows.tsx` | **new** — client; expandable rows, copy-address button |
| `components/admin/OrderTabs.tsx` | **new** — client; tab links + search box (URL-driven) |
| `components/admin/LabExport.tsx` | **new** — client; `<pre>` block + "Copy block" |
| `components/admin/FulfillmentRail.tsx` | **new** — client; the three steps + tracking + resolutions |
| `components/admin/CopyButton.tsx` | **new** — shared clipboard control with a real result state |
| `components/admin/AdminNav.tsx` | `Orders` → `href: '/admin/orders'` |
| `app/admin/(protected)/page.tsx` | dashboard rows link out; `All orders →` goes live |
| `components/admin/QueueRow.tsx` | `MarkedButton` → `<Link>` |
| `app/(store)/order/[id]/page.tsx` | tracking line when `shipped` + `tracking_number` |
| `app/globals.css` | `.admin-ord-*` classes under `[data-admin]`; one `.confirm-tracking` |

## Reads — `lib/data/orders-admin.ts`

Same shape as every other admin read: `import 'server-only'`, `await requireAdmin()` as the first
statement, `createAuthServerClient()` so the query runs as the logged-in user under RLS
(`orders_admin_all` / `order_items_admin_all`). The service key stays out of the admin half.

```ts
export type OrderTab = 'queue' | 'lab' | 'attention' | 'shipped' | 'all'

export interface AdminOrderItem {
  id: string; title: string; size: string; register: 'colour' | 'silver'
  qty: number; unit_cents: number; original_key: string | null
  photoSlug: string | null          // soft join for the thumbnail; null if the photo is gone
}
export interface AdminOrderRow {
  id: string; status: OrderStatus; created_at: string
  customer_name: string | null; customer_email: string
  shipping_address: StoredAddress
  total_cents: number; amount_paid_cents: number | null
  tracking_number: string | null
  items: AdminOrderItem[]
}
export interface OrderListResult {
  rows: AdminOrderRow[]
  counts: Record<OrderTab, number>   // tab counts, from one grouped read
  truncated: boolean
}
```

- `listOrders({ tab, query })` → `OrderListResult | null` (null = the read failed; the surface says
  so rather than rendering "no orders", the D7 rule).
- Rows carry their items because `§11.4-D`'s expansion lists every work inline and the thumbnail group
  needs the slugs. One `order_items` read for the page's ids, grouped in JS — not N+1.
- `counts` are **exact head counts, one per tab** (`count: 'exact', head: true` + the shared
  `statusesForTab` predicate). Not a `select('status')` tallied in JS: Supabase caps a response at
  the project's "Max rows" setting (1000 by default), so that read would quietly stop counting and
  every tab number would be wrong with no signal. Head requests transfer no rows and have no
  ceiling.
- `getOrderForFulfillment(id)` → the row above plus `subtotal_cents`, `shipping_cents`, `tax_cents`,
  `stripe_payment_intent_id`, `submitted_to_lab_at`, `shipped_at`, `lab_finish`, `notes`, and a
  `signedOriginals: Record<itemId, string | null>` map minted at render.

## Writes — `lib/admin/order-actions.ts`

`'use server'`, every export opening with `await requireAdmin()` (enforced by
`test/admin-routes.test.ts`), returning the house `Result` type. All six re-read the row and
**gate on the current status server-side** — a stale page must not be able to POST a transition
that is no longer legal.

| Action | From | Writes |
|---|---|---|
| `markSubmittedToLab({ id })` | `paid` | `status`, `submitted_to_lab_at = now()` |
| `markShipped({ id, trackingNumber })` | `submitted_to_lab` | `status`, `shipped_at = now()`, `tracking_number` (rejects blank) |
| `acceptMismatch({ id })` | `amount_mismatch` | `status = 'paid'` |
| `markRefunded({ id })` | any but `pending` | `status = 'refunded'` |
| `markCancelled({ id })` | any but `pending`/`shipped` | `status = 'cancelled'` |
| `setLabFinish({ id, finish })` | any | `lab_finish` (trimmed; blank → `'Lustre'`) |

No `revalidateTag` — both order surfaces are `force-dynamic`; the storefront caches nothing about
orders. `router.refresh()` on the client after a successful write.

## Surface D — the queue (`/admin/orders`)

Band: Playfair "Orders" + the total count. Tabs as links (`?tab=`), active tab underlined ink,
each with its count. Search box posts `?q=` (a form, so it works without JS).

Column header row in mono, then rows on `120px 1.4fr 130px 90px auto auto`:
short id + date · customer (name, email, **⧉ Name + address** copy) · thumbnail group + `⌄` caret ·
Playfair total · status chip · **Open →**.

- **Expansion** (caret rotates 180°, `aria-expanded` on the control): a sub-grid per work —
  thumb · Playfair title · size · `Colour` / `Silver B&W` · `qty × unit` · line total.
- **Mismatch rows** are quarantined per `§11.4-D`: alert wash, 2px left `--alert` rule,
  `paid $X · expected $Y`, a pulsing MISMATCH chip (ground pulses, never text opacity — D12), and a
  standalone alert banner above the table. They are excluded from the Queue tab and its count.
- Thumbnails: `derivativeSrc(photoSlug, register, 160, 'webp')`. When `photoSlug` is null (photo
  deleted — `photo_id` is `on delete set null`) the cell renders an empty plate with the title as
  text. The snapshot still describes what was bought; only the picture is gone.
- Status chips carry text, never colour alone (`§11.1`): PAID · AT LAB · MISMATCH · SHIPPED ·
  CANCELLED · REFUNDED · PENDING.

## Surface E — order detail (`/admin/orders/[id]`)

Breadcrumb `Orders / <short id>` → header: full uuid + date in mono, customer name in Playfair
with **⧉ Copy name**, status chip, total.

- **Ship-to / Contact** two-cell panel, with **Copy address** and **Copy name** emitting real
  multi-line clipboard text from `copyableAddress()`.
- **Line items**: thumb · Playfair title · mono `size · register · finish · qty` · `↓ original`
  (signed) or the honest "original not available".
- **Right column — the export**: `<pre>` on `--panel2`, mono, headed by a **Copy block** primary
  button, with the finish field above it (text input, default `Lustre`, "Save" persists and the
  block re-renders substituted).
- **Under it — the rail**: Paid ✓ → Submitted to lab → Shipped, each step showing its real
  timestamp when set, each advance an explicit button. Shipped reveals the required tracking
  input. Below, the resolution row (Accept as paid, when mismatched · Mark refunded · Mark
  cancelled) with the copy from Decision 7.
- Errors from any action render as a terse line next to the control that failed. No optimism: the
  rail only moves after the server says it moved.

`CopyButton` reports what actually happened — "Copied" on success, and on failure (no clipboard
permission, insecure context) it says copying failed and leaves the text selectable. A button that
says "Copied" when nothing reached the clipboard is `§1`'s founding defect in miniature.

## Tests (TDD)

Pure first, then reads, then actions, then surfaces.

- **`lab-export`**: header/date zone; one line per item; qty and register vocabulary; column
  padding; finish substitution across the header; `original_key` printed verbatim;
  `(not recorded)` when null; partial address degrades (no `undefined`, no blank lines); the
  deleted crop line is absent; no trailing whitespace; empty item list still produces a valid block.
- **`address`**: full address; missing region/postal; missing street; name-only; the copy string is
  `\n`-joined and matches the rendered lines.
- **`query`**: tab predicates (Queue is `paid` only; `submitted_to_lab` is not in Queue; mismatch
  is in neither Queue nor Shipped); id-prefix match, case- and hyphen-insensitive; email substring;
  name substring; empty query returns everything; counts derived from the same predicates.
- **`orders-admin` read**: `requireAdmin` called first; items grouped onto rows, not N+1; null on
  read error; `truncated` set at the cap; slug soft-join yields null for a deleted photo.
- **`order-actions`**: each transition from its legal state; each **rejected** from an illegal one
  (`paid → shipped` refused; `markShipped` with blank tracking refused, nothing written;
  `acceptMismatch` on a `paid` order refused); `requireAdmin` on all six; `setLabFinish` trims and
  falls back to `Lustre`.
- **Surfaces**: tab rendering + counts; the mismatch row is quarantined and excluded from the queue
  count; expansion lists every work; a failed read says so instead of showing "no orders";
  the truncation notice; detail renders the export block and the rail's real timestamps; the
  tracking input is required.
- **Nav/dashboard**: `Orders` is live and no longer `NOT BUILT`; the dashboard's queue and held
  rows link into the order; `All orders →` is a real link.
- **Confirmation**: tracking shows when `shipped` + `tracking_number`; hidden for every other
  status and when tracking is null.

## Out of scope

- **No Stripe refund call.** `Mark refunded` records; it does not move money, and it says so.
- **No emails.** The system has never sent one; `§1` forbids claiming otherwise.
- **No schema change**, no migration, no new index.
- **No money-path edit.** `lib/pricing.ts`, `/api/checkout`, `/api/stripe-webhook` untouched.
- **No `pending` clean-up job.** No state is ever set by a timer.
- Bulk actions, CSV export, per-order notes editing — nothing has asked for them yet.

## Carried forward

- **Nations' finish/paper vocabulary is still unconfirmed** (`product.md §6.2`). `lab_finish` is
  free text until it is; the paper string in the export header is a constant Jon can correct in one
  place.
- **Centre-crop drift** (`§6.2`, resolved 2026-07-19): Nations' own site does the crop, and the
  storefront's `cropGuide()` shows a centre crop. Nothing in this slice can enforce that Jon
  centre-crops there. The export deliberately says nothing about cropping rather than instructing
  the lab wrongly.
