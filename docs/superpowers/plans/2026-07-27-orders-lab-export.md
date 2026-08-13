# Slice 7 — Orders queue + Nations lab export (implementation plan)

**Spec:** `docs/superpowers/specs/2026-07-27-orders-lab-export-design.md`
**Branch:** `claude/photography-site-code-7semsh` (off `develop`)
**Gate:** `npm run lint && npm run typecheck && npm test && npm run build` — all four, every task.

Ten tasks, pure code first. Each task is one commit. Tests are written before the implementation
in the task, and the task is not done until the gate is green.

---

## Task 1 — `lib/orders/address.ts` (pure)

The stored address is `jsonb` written by `toStoredShippingAddress` (`/api/checkout`), so its
shape is known but its completeness is not guaranteed for older or hand-made rows.

```ts
export interface StoredAddress {
  name?: string | null; street?: string | null; city?: string | null
  region?: string | null; postal_code?: string | null; country?: string | null
}
export function addressLines(a: StoredAddress | null | undefined): string[]
export function copyableAddress(a: StoredAddress | null | undefined): string
```

- `addressLines` returns only non-blank lines, in order: name, street, `city, REGION POSTAL`,
  country. The third line is assembled from whichever of the three exist: `Cincinnati, OH 45202`,
  `Cincinnati, OH`, `45202`, or omitted entirely.
- `copyableAddress` = `addressLines().join('\n')`.
- Never emits `undefined`, `null`, `', '`, or a blank line.

**Tests — `test/orders-address.test.ts`**
full address · missing region · missing postal · missing street · name only · empty object → `[]` ·
null/undefined input → `[]` · whitespace-only fields are treated as absent · `copyableAddress`
joins with `\n` and equals the rendered lines.

---

## Task 2 — `lib/orders/lab-export.ts` (pure)

```ts
export interface ExportItem {
  title: string; size: string; register: 'colour' | 'silver'
  qty: number; original_key: string | null
}
export interface ExportOrder {
  id: string; created_at: string; email: string
  address: StoredAddress; items: ExportItem[]; finish: string | null
}
export function buildLabExport(order: ExportOrder): string
```

Emits the block locked in the spec. Implementation notes:

- Date: `Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })` → `YYYY-MM-DD`. Mirror
  `lib/admin/dates.ts`'s zone-explicit approach; do not use the machine's local zone.
- `PRINTS` header: `PRINTS  (finish: ${finish?.trim() || 'Lustre'} · paper: ${PAPER})` where
  `PAPER = 'Fuji Crystal Archive'` is an exported constant (one place for Jon to correct).
- Item line: `  ${qty}x  ${title}  ${size}  ${registerLabel}   file: ${key ?? '(not recorded)'}`
  with title/size/register right-padded to the widest value **in this order**.
- `registerLabel`: `colour → 'Colour'`, `silver → 'Silver B&W'`.
- `SHIP TO` = two-space-indented `addressLines()`, then the email as its own line.
- No trailing whitespace on any line; block ends without a trailing newline.
- Zero items: the `PRINTS` header still prints, with no lines under it. (A zero-item order is a
  data fault, not a crash — the block shows it plainly.)

**Tests — `test/lab-export.test.ts`**
full block snapshot-by-assertion (header, SHIP TO, PRINTS, NOTES) · date is New York, not local
(assert a `2026-07-16T03:00:00Z` order still reads `2026-07-15`) · `2x` qty rendering · both
register labels · padding aligns columns · finish substituted · blank/null finish → `Lustre` ·
`original_key` verbatim · null key → `file: (not recorded)` · partial address never prints
`undefined` or a blank line · NOTES is exactly the two lines · the deleted 4:5 crop line is absent ·
no line has trailing whitespace · zero items.

---

## Task 3 — `lib/orders/query.ts` (pure)

```ts
export type OrderTab = 'queue' | 'lab' | 'attention' | 'shipped' | 'all'
export const TABS: { key: OrderTab; label: string; statuses: OrderStatus[] | null; oldestFirst: boolean }[]
export function statusesForTab(tab: OrderTab): OrderStatus[] | null   // null = all
export function isOrderTab(v: string | undefined): v is OrderTab
export function countsByTab(statuses: OrderStatus[]): Record<OrderTab, number>
export function filterOrders<T extends { id: string; customer_email: string; customer_name: string | null }>(
  rows: T[], query: string,
): T[]
```

- Tabs exactly as the spec's table: `queue = ['paid']`, `lab = ['submitted_to_lab']`,
  `attention = ['amount_mismatch']`, `shipped = ['shipped']`, `all = null`.
- `filterOrders`: trim + lowercase the query; a row matches if
  `id.replace(/-/g,'').startsWith(q.replace(/-/g,''))` **or** email includes q **or** name includes q.
  Empty query → all rows unchanged (same array order).
- `countsByTab` tallies one pass over a status list — the surface's numbers and its rows come
  from the same predicates.

**Tests — `test/orders-query.test.ts`**
queue is `paid` only · `submitted_to_lab` is not in queue · mismatch in neither queue nor shipped ·
`all` includes `pending`/`cancelled`/`refunded` · id prefix match · hyphen-insensitive prefix ·
case-insensitive · email substring · name substring · null name doesn't throw · empty query is
identity · `isOrderTab` rejects junk · counts match the predicates.

---

## Task 4 — `lib/data/orders-admin.ts` (read)

`import 'server-only'`; `await requireAdmin()` first in every export; `createAuthServerClient()`.

```ts
export const LIST_CAP = 200
export async function listOrders(input: { tab: OrderTab; query: string }): Promise<OrderListResult | null>
export async function getOrderForFulfillment(id: string): Promise<AdminOrderDetail | null>
```

`listOrders`:
1. `select('status')` over all orders → `countsByTab` (this is the counts read; it is cheap and it
   guarantees the tab numbers can't drift from the rows).
2. Tab read: `orders` with the row columns, `.in('status', statusesForTab(tab))` when not null,
   ordered `created_at` per the tab's direction, `.limit(LIST_CAP + 1)`.
   `truncated = rows.length > LIST_CAP`; slice back to `LIST_CAP`.
3. One `order_items` read `.in('order_id', ids)` selecting
   `id, order_id, title, size, register, qty, unit_cents, original_key, photos(slug)`, grouped in
   JS onto the rows. The `photos(slug)` join is a left join — `photo_id` is `on delete set null`,
   so `photoSlug` is `null` for a deleted photo and the surface renders a plate-less row.
4. `filterOrders(rows, query)` last, in memory.
5. Any error from step 1–3 → `console.error` + `return null`.

`getOrderForFulfillment` reads the single order + its items, then mints signed URLs:
`db.storage.from('originals').createSignedUrl(key, 3600)` per item with a non-null `original_key`,
collected into `signedOriginals: Record<itemId, string | null>`. A signing failure yields `null`
for that item, never a thrown page.

**Tests — `test/orders-admin-read.test.ts`** (mock `@/lib/admin/require-admin` and
`@/lib/supabase/auth-server`, following `test/collections-admin-read.test.ts`)
`requireAdmin` called first · items grouped onto their orders · a deleted photo yields
`photoSlug: null` · `truncated` true at cap+1 and false below · counts come from the status read ·
tab filter passes the right statuses · query filtering applied · read error → null ·
`getOrderForFulfillment` returns null for an unknown id · signed URLs mapped per item ·
a signing error yields null for that item and the rest still resolve.

---

## Task 5 — `lib/admin/order-actions.ts` (writes)

`'use server'`; every export starts `await requireAdmin()`; house `Result` type.
Each action re-reads `status` and gates on it **server-side** before writing.

```ts
markSubmittedToLab({ id })         // paid → submitted_to_lab, stamps submitted_to_lab_at
markShipped({ id, trackingNumber })// submitted_to_lab → shipped, stamps shipped_at + tracking
acceptMismatch({ id })             // amount_mismatch → paid
markRefunded({ id })               // any but pending → refunded
markCancelled({ id })              // any but pending/shipped → cancelled
setLabFinish({ id, finish })       // any → lab_finish (trim; blank → 'Lustre')
```

Illegal transitions return `{ ok: false, message }` and write nothing. `markShipped` rejects a
blank tracking number *before* touching the row (`tracking_requires_shipment` would let a blank
string through — the constraint only forbids tracking without a shipment, not the reverse).

**Tests — `test/order-actions.test.ts`**
each legal transition writes the right columns · `paid → shipped` refused · `markShipped` blank/
whitespace tracking refused with no write · `acceptMismatch` on a `paid` order refused ·
`markCancelled` on a `shipped` order refused · `markRefunded` on `pending` refused ·
`setLabFinish` trims, and blank falls back to `Lustre` · a DB error surfaces as `{ ok: false }` ·
`requireAdmin` called first in all six.

---

## Task 6 — `components/admin/CopyButton.tsx` + `LabExport.tsx`

`CopyButton` (client): props `{ text, label, className? }`. `navigator.clipboard.writeText` in a
try/catch; on success shows `Copied` for ~2s; **on failure shows `Copy failed`** and does not
claim success. `aria-live="polite"` on the status span.

`LabExport` (client): the `<pre>` block, a `CopyButton` for the whole block, and the finish field
(input + Save via `setLabFinish`, `useTransition`, `router.refresh()`).

**Tests — `test/copy-button.test.tsx`, `test/lab-export-component.test.tsx`**
copies the exact text · shows Copied on success · shows Copy failed when `writeText` rejects (and
never Copied) · the block renders inside `<pre>` · finish save calls the action and refreshes ·
an action failure renders the message.

---

## Task 7 — `components/admin/OrderTabs.tsx` + `OrderRows.tsx`

`OrderTabs` (client-free where possible — plain links + a GET form so it works without JS):
tab links `?tab=…` preserving `q`, each with its count; search input named `q`.

`OrderRows` (client): the row grid, the caret expansion (`aria-expanded`, `aria-controls`), the
per-row `⧉ Name + address` `CopyButton`, the mismatch quarantine styling, and `Open →`.

**Tests — `test/order-rows.test.tsx`**
renders one row per order · expansion reveals every work with size/register/qty · caret
`aria-expanded` toggles · mismatch row carries the alert class, both amounts, and the MISMATCH
chip · a photo-less item renders the title without an `<img>` · copy button carries the multi-line
address · status chips carry text.

---

## Task 8 — `app/admin/(protected)/orders/page.tsx` (Surface D)

`export const dynamic = 'force-dynamic'`. Reads `searchParams` (`tab`, `q`), validates the tab with
`isOrderTab` (junk → `queue`), calls `listOrders`, renders band + tabs + banner + rows.

- `null` result → the D7 line: *"Couldn't read the orders. Nothing is shown rather than guessed."*
- Empty tab → an honest per-tab empty line ("Nothing awaiting the lab." etc.).
- `truncated` → *"Showing the first 200 orders."*
- Mismatch banner above the table whenever `counts.attention > 0`, on any tab.

**Tests — `test/orders-page.test.tsx`**
tabs render with counts · a failed read says so and shows no rows · empty state · truncation
notice · the banner appears when mismatches exist · an unknown `?tab=` falls back to queue.

---

## Task 9 — `app/admin/(protected)/orders/[id]/page.tsx` + `FulfillmentRail.tsx` (Surface E)

Server page: `force-dynamic`, `getOrderForFulfillment`, `notFound()` on null id, renders header,
ship-to/contact, line items with signed `↓ original` links, `LabExport`, and `FulfillmentRail`.

`FulfillmentRail` (client): three steps with their real timestamps; the legal next action as a
button; the tracking input revealed by "Mark shipped + tracking" and required; the resolution row
with the spec's copy. `useTransition` + `router.refresh()`; failures render next to the control.

**Tests — `test/order-detail.test.tsx`, `test/fulfillment-rail.test.tsx`**
full uuid shown · payment-intent shown when present, absent when null · copy address/name text ·
signed link rendered · "original not available" when the key or URL is null · export block present ·
rail shows only the legal next step per status · tracking input is required (empty submit does not
call the action) · timestamps render when set · Accept as paid appears only for `amount_mismatch` ·
the refund/cancel helper copy states it does not move money.

---

## Task 10 — Nav, dashboard, confirmation, CSS

- `AdminNav`: `Orders` → `/admin/orders`. Update `test/admin-nav.test.tsx` (it is no longer
  `NOT BUILT` — that assertion flips).
- `QueueRow`: `MarkedButton` → `<Link href={/admin/orders/${id}}>` labelled `Open →` / `Review →`.
- Dashboard: `MarkedLink label="All orders →"` → real `<Link>`. Update
  `test/admin-dashboard.test.tsx`.
- `/order/[id]`: select `tracking_number`, and when `status === 'shipped'` and it is non-null,
  render one line — `Tracking: <number>` — with no carrier claim and no link.
- `app/globals.css`: `.admin-ord-*` under `[data-admin]`, following the `.admin-col-*` convention;
  `.confirm-tracking` in the storefront scope. Extend `test/admin-css.test.ts` with the new
  classes (and keep the D11/D12 rules: `--hairform` on control boundaries, ground-pulse only).

**Tests** — the three updated suites above, plus `test/order-confirmation.test.tsx`:
tracking shows for `shipped` + number · hidden for `paid`/`submitted_to_lab` · hidden when null ·
no carrier or tracking-link text.

---

## Docs (final commit)

- `CLAUDE.md`: roadmap — slice 3 and about/legal recorded as done, slice 7 as DONE, the admin nav's
  five live items, the test count refreshed. Architecture tree gains `orders/`.
- `DESIGN.md §11.4-D/E`: a deviations table (the fifth tab, the real ids, the real `original_key`,
  signed links out of the block, the resolution controls, free-text finish, dashboard links).
- `product.md §6`: mark `§6.4` built; leave the Nations-vocabulary confirm-before-relying item open
  and point it at `lab_finish`.

---

## Definition of done

1. All four gate checks green, with the test count stated in the final commit message.
2. No `NOT BUILT` marker remains in the admin nav.
3. Every `order_status` value except `pending` is reachable from the UI, and every transition is
   pressed by a human.
4. Nothing in the money path changed: `git diff develop -- lib/pricing.ts app/api` is empty.
