# Slice 4b — Admin shell + dashboard (design spec)

> **STATUS: Brainstormed + adversarially reviewed 2026-07-19, ready for a plan.** Slice 4b builds
> the `design.md §11.3` dark shell (242px sidebar + fluid main) and the `§11.4-A` dashboard,
> wired to live counts, on top of slice 4a's auth spine.
>
> **Depends on 4a** (`2026-07-19-admin-auth-spine-design.md`): `requireAdmin()`, the
> `[data-admin]` token scope, `proxy.ts`, and the route structure all exist before this starts.
> 4a's §9.3 test-order cleanup is a **prerequisite** — see §9.1.
>
> **The money code is untouched.** 4b **reads** `orders`/`order_items` and writes nothing. It
> advances no fulfillment state; `product.md §6.1`'s "no state is ever set by anything but an
> explicit human action" is satisfied trivially, because 4b offers no such action.
>
> Branch: `slice-4` (continues from 4a).

Companion: `design.md §11.1` (tokens), `§11.2` (type roles), `§11.3` (shell), `§11.4-A`
(dashboard), `§11.5` (shape/elevation/motion), `§11.6` (do/don't), `§8`;
`product.md §1`, `§6.1`, `§6.3`, `§6.4`; `supabase/schema.sql`;
`design/Jon Hoffman Admin.dc.html` (pixel source — `§11` wins where they disagree, the prototype
wins where `§11` is silent).

> **Measurements come from the prototype, extracted 2026-07-19.** Most of the admin's layout is
> inline-styled there rather than in its `<style>` block, so the numbers are not in `§11`'s prose
> at all. The implementation plan carries the full extracted table; four items in this spec were
> **corrected against it** after the fact — the signed-in chip (§5), the queue-row grid (§6.2),
> the `PAID` chip (§6.2), and the ghost-button border (§5). Where this spec's first draft
> inferred a measurement from `§11`'s prose and the prototype disagrees, the prototype won.

---

## 0. Decisions locked

| Decision | Value | Source |
|---|---|---|
| Nav | **All five `§11.3` items render; four disabled + marked** `NOT BUILT` | Jon |
| Dashboard scope | **`§11.4-A` complete** — header band, four live tiles, queue, right rail. Not-yet-wired controls disabled + marked | Jon |
| Sign-out control | **Mono link beside "View live site ↗"**, a POST form button | Jon |
| Data client | 4a's cookie-bound `authenticated` client, **`requireAdmin()` first** | 4a §3.1 |
| Caching | **No `unstable_cache` on any admin read** | brainstorm |
| Partial failure | **Any query error collapses the whole result to `ok: false`** | review |
| Order id display | **uuid prefix.** `JH-YYYYMMDD-NNNN` is a design fiction with no schema backing | review |
| Money formatting | **Extract `formatPrice` into `lib/format/price.ts`** and refactor the four existing copies | review |
| Locale / zone | **`en-GB` + `America/New_York`**, both explicit | review (zone observed in 4a §0.1) |

---

## 1. What slice 4b does NOT do

- **No fulfillment state transitions.** `submitted_to_lab`, `shipped`, tracking → slice 7.
- **No lab export.** `Copy for lab` / `Review` render disabled → slice 7 (`§11.4-E`).
- **No ingest.** `＋ Post a photo` renders disabled → slice 5 (`§11.4-C`).
- **No collections editor / home-feature picker.** `Change what leads home →` disabled → slice 6.
- **No `§11.4-H` mobile admin.** Desktop `§11.3` shell + a minimal stacking fallback (§6.3).
- **No Orders count pill** (`§11.3`) → slice 7 (D8).
- **No derivative images.** No photo or collection cover renders a plate in 4b (§6.2).

---

## 2. File changes

```
lib/format/price.ts                 # MODIFY  — add formatPrice(cents); refactor the 4 duplicates
lib/admin/
  dashboard.ts                      # NEW     — pure summarize() + getDashboard() (requireAdmin first)
  dates.ts                          # NEW     — the two Intl formatters (§6.2)
components/admin/
  AdminShell.tsx                    # NEW     — 242px sidebar + fluid main, inside the card
  AdminNav.tsx                      # NEW     — 'use client'; usePathname; 1 live + 4 marked
  StatTile.tsx                      # NEW     — label / Playfair number / faint sub; alert variant
  QueueRow.tsx                      # NEW     — compact order row; mismatch quarantine treatment
  MarkedControl.tsx                 # NEW     — the disabled+marked button/link primitives (§6.1.1)
app/admin/(protected)/
  layout.tsx                        # MODIFY  — render AdminShell around children (4a rendered bare)
  page.tsx                          # REWRITE — §11.4-A dashboard (4a's placeholder is replaced)
app/globals.css                     # MODIFY  — append admin component classes + @keyframes softpulse
app/(store)/checkout/page.tsx       # MODIFY  — import formatPrice (delete local copy)
app/(store)/order/[id]/page.tsx     # MODIFY  — import formatPrice (delete local copy)
components/cart/CartDrawer.tsx      # MODIFY  — import formatPrice (delete local copy)
components/product/ProductInteractive.tsx # MODIFY — import formatPrice (delete local copy)
test/
  admin-summarize.test.ts           # NEW     — the pure core (named to not collide with the .tsx)
  admin-dates.test.ts               # NEW
  admin-nav.test.tsx                # NEW
  admin-shell.test.tsx              # NEW
  admin-dashboard.test.tsx          # NEW
  price.test.ts                     # MODIFY  — formatPrice cases
```

`components/admin/SignOutButton.tsx` exists from 4a and **moves into the shell footer** — the
component is unchanged, only its mount point.

> **The four storefront edits are deliberate and in scope.** `formatPrice` does not exist:
> `lib/format/price.ts` exports only `priceForSize`/`priceRangeLabel`, and
> `` `$${(cents/100).toFixed(cents % 100 ? 2 : 0)}` `` is copy-pasted verbatim in four files.
> Adding a fifth definition for the admin, or adding a shared one and leaving four copies, both
> preserve exactly the decay pattern `design.md §11.7` warns about. The refactor is four one-line
> changes under 1563 existing tests.

---

## 3. Styling convention

The repo has three live precedents — inline `style` objects (`components/store/Header.tsx`),
styled-jsx (`components/product/ProductInteractive.tsx`), and global classes in `globals.css`
(slice 3). **4b uses global classes in `app/globals.css`**, appended after 4a's `[data-admin]`
token block, matching the slice-3 precedent and the file `admin-tokens.test.ts` already parses.

`@keyframes softpulse` **exists nowhere in the repo** — it lives only in
`design/Jon Hoffman Admin.dc.html`:

```css
@keyframes softpulse { 0%, 100% { opacity: .5 } 50% { opacity: 1 } }
```

It must be added here, in modified form — see D12.

All admin class names are prefixed `admin-`.

---

## 4. Data layer

### 4.1 Types — defined, because the builder cannot infer them

```ts
// lib/admin/dashboard.ts
export type QueueOrder = {
  id: string
  status: 'paid' | 'amount_mismatch'
  created_at: string
  customer_name: string | null          // schema.sql: nullable
  customer_email: string
  total_cents: number
  amount_paid_cents: number | null      // schema.sql: nullable; non-null iff amount_mismatch
  workCount: number
}

export type DashboardData = {
  orders: {
    id: string
    status: 'paid' | 'amount_mismatch'
    created_at: string
    customer_name: string | null
    customer_email: string
    total_cents: number
    amount_paid_cents: number | null
    order_items: { count: number }[]    // PostgREST returns an ARRAY, not a scalar
  }[]
  publishedCount: number
  unlistedCount: number
  collections: { name: string; featured_on_home: boolean }[]
}

export type Summary = {
  queueCount: number                    // paid ONLY
  attentionCount: number                // amount_mismatch ONLY
  publishedCount: number
  unlistedCount: number
  collectionCount: number
  featuredCollectionName: string | null
}

export type DashboardResult =
  | { ok: true; summary: Summary; queue: QueueOrder[]; held: QueueOrder[] }
  | { ok: false }

export function summarize(data: DashboardData): { summary: Summary; queue: QueueOrder[]; held: QueueOrder[] }
export function getDashboard(): Promise<DashboardResult>
```

- **`order_items` deserializes to `{ count: number }[]`.** `row.order_items.count` is `undefined`
  and would render a blank works count. `workCount = row.order_items[0]?.count ?? 0`.
- **`queue` is `paid` only; `held` is `amount_mismatch` only.** They are separate arrays so the
  rendered heading and the tile count cannot disagree (§6.2).
- **`{ ok: false }` carries no `reason`.** The underlying error is `console.error`'d server-side
  and never returned — a PostgREST error carries `message`/`details`/`hint` that can include
  column names and SQL fragments, and Server Component return values are serialized to the client.

### 4.2 Queries

All through 4a's `createAuthServerClient()`, under RLS, with **`await requireAdmin()` as
`getDashboard()`'s first statement** (4a §3.1).

```ts
db.from('orders')
  .select('id, status, created_at, customer_name, customer_email, total_cents, amount_paid_cents, order_items(count)')
  .in('status', ['paid', 'amount_mismatch'])
  .order('created_at', { ascending: true })          // §6.4: oldest first

db.from('photos').select('id', { count: 'exact', head: true }).eq('published', true)
db.from('photos').select('id', { count: 'exact', head: true }).eq('published', false)
db.from('collections').select('name, featured_on_home')
```

Every column verified against `supabase/schema.sql`.

**`ok: false` is keyed on the PostgREST `error` object — never on `data`.** `head: true` returns
`data: null` *by design*, with the number on `count`. A failure check written as "falsy data"
would render the unreadable state on every healthy request, inverting D7 into its own §1
violation.

**Partial failure collapses to `ok: false`.** If orders read and collections failed, three
truthful tiles beside one unreadable one is harder to reason about than an honestly unreadable
dashboard — and D7's whole claim is that a tile never shows a number it did not receive.

**No `unstable_cache`.** `lib/data/photos.ts` caches because those reads are shared, anonymous
and public. These are neither shared nor anonymous, and a cross-request cache over a per-session
read is a leak seam. 4a's `force-dynamic` on the protected layout already applies.

### 4.3 Formatting

```ts
// lib/admin/dates.ts — both formatters carry an explicit locale AND timeZone
const ZONE = 'America/New_York'
formatKicker(d: Date): string   // "Thursday · 16 July 2026"
formatRowDate(d: Date): string  // "11 Jul"
```

`en-GB` gives day-before-month, matching the prototype. The `·` separator is composed from
`formatToParts`, not baked into a locale pattern. **Both must be server-computed:** a client
`new Date()` hydrate-mismatches, and an implicit zone makes the rendered string depend on the
machine that happened to render it — a UTC default renders tomorrow's date to an Eastern reader
every evening after 8pm. This is the "Invalid Date" defect class (`schema.sql`, `orders.created_at`)
in a form that is harder to notice, because it looks fine.

`grep -rn "toLocale\|Intl\.DateTimeFormat"` across `app/ lib/ components/` returns **zero** — there
is no precedent to copy, which is why both formats are pinned here.

```ts
// lib/format/price.ts — extracted, not reinvented
export function formatPrice(cents: number): string   // "$65", "$5.50"
```

The existing convention drops cents when they are zero, and the mismatch line's whole point is
that two numbers read differently at a glance — `$5.50` beside `$65`, not `$5.50` beside `$65.00`.

---

## 5. The shell — `§11.3`

`AdminShell.tsx`: 242px fixed sidebar + fluid main, inside a card (`border-radius:6px`, one soft
drop shadow; interior elements square, `§11.5`).

**Sidebar** (`--panel`, right `--hair` border, `padding:26px 18px 24px`):

1. Cloud mark + "Jon Hoffman / Studio Admin" lockup
2. Hairline
3. Nav (§6.1)
4. Footer pinned bottom (`margin-top:auto`): **"View live site ↗"** (`href="/"`,
   `target="_blank"`, `rel="noopener noreferrer"`), **"Sign out"** (D2), and the chip.

**The signed-in chip** — taken from the prototype, which is more specific than `§11.3`'s prose
and settles this better than the spec's first draft did. It is **not** an avatar carrying a
hidden label; it is an avatar *beside a visible two-line lockup*:

```
[JH]  Jon Hoffman
      jonhoffmanbusiness@gmail.com
```

- avatar: `32px`, `border-radius:50%`, `background:#2a2a28`, `display:grid; place-items:center`,
  `font:600 12px mono`, `color:var(--ink)`
- lockup: `font-size:11px; line-height:1.4`; name `--ink`, email `--faint` at `10px`
- row: `display:flex; align-items:center; gap:10px; padding-top:12px;
  border-top:1px solid var(--hairsoft)`

The email is real, visible text — no `aria-label`, no visually-hidden span. **It will overflow**:
`jonhoffmanbusiness@gmail.com` at 10px mono is ~162px against ~148px of available width, so the
email cell takes `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` **plus a `title`
carrying the full address**. An ellipsised email that cannot be read in full is a small `§1`
problem of its own.

**Main header band:** mono kicker over a Playfair `44px` H1, primary action top-right.

**Button vocabulary** (`§11.3`) — the secondary is specified here because `§11.4-A`'s "ghost
button" is otherwise unstated and three of the dashboard's controls use it:

| | Treatment |
|---|---|
| Primary | `--btnbg` ground, `--btnink` text, mono `11px` `.14em` uppercase, `14px 22px`, square. Hover `opacity:.88`; active `translateY(1px)` |
| Secondary / ghost | `font:500 10px mono; letter-spacing:.1em; uppercase; color:var(--ink); padding:7px 12px`, transparent ground, `1px --hairform` border. The prototype specifies `--hair` here; **that is 1.42:1 and fails SC 1.4.11**, so it inherits 4a's `--hairform` (3.02:1) like every other control boundary (**D11**) |

`min-height:44px` on every interactive control (`§8`, `§11.4-H`).

---

## 6. Surfaces

### 6.1 Nav — five items, one live (**D5**)

Order **from the prototype's sidebar**, which `§11.3` does not enumerate (it specifies item
*styling* only, and `§11` says the prototype wins where the section is silent):

| # | Item | 4b |
|---|---|---|
| 1 | Dashboard | **live** — `next/link` to `/admin`, active state |
| 2 | Photographs | marked → slice 5 |
| 3 | Collections | marked → slice 6 |
| 4 | Orders | marked → slice 7 |
| 5 | Home feature | marked → slice 6 |

Per `§11.3`: `10px 13px`, radius 7px (**D13**), mono 13px, 5px leading dot (`--nb`, opacity
`.35` → `1` when active). Active = `background rgba(239,234,224,.09)` + `--ink` text.
**Inactive text is `--dim`** — specified because the active state's other two signals are both
sub-threshold on their own (the wash is 1.21:1 against `--panel`, the inactive dot 2.82:1), so
the ink/dim text delta is what actually carries "which page am I on."

Dashboard uses `next/link`, not a raw `<a>`: an anchor forces a full document navigation, which
discards the client router and makes `AdminNav`'s `'use client'` + `usePathname` seam pointless —
and makes every section change in slices 5–7 a page reload.

### 6.1.1 The marked-control rule

Applies to every not-yet-wired control, nav and dashboard alike.

| Would have been | Renders as |
|---|---|
| `<a href>` (nav items, `All orders →`, `Change what leads home →`) | `<span>` — no `href`, no `role`, no `tabindex`. Not a control, and read as plain text |
| `<button>` (`＋ Post a photo`, `Copy for lab`, `Review`) | `<button aria-disabled="true" tabIndex={0}>` with a no-op handler |

**Why `aria-disabled` rather than `disabled` on the buttons:** the native attribute removes the
element from the tab order, so a keyboard or screen-reader user never reaches it and never hears
`NOT BUILT` — and browsers grey disabled text on top of an already-marginal token. Since the
marker *is* the honest-function payload, it has to be discoverable. WCAG 1.4.3 also exempts
inactive controls from contrast, which is precisely the exemption you do not want applying here.

The marker is the literal string `NOT BUILT` in mono `--faint` (`.50` after 4a's D10 — at
`§11.1`'s `.42` it is **3.58:1**, failing 4.5:1), carried in the element's **text content**, never
a `title`, tooltip, or colour. Font-size `10px` matches the label register; `§11.2`'s "never set
body copy below 12px" governs body copy, and this is a label.

Accessible names are expected to read `＋ Post a photo NOT BUILT` and `Photographs NOT BUILT`.

`NOT BUILT` over `SOON` deliberately: "soon" claims a timeline nothing guarantees.

### 6.2 Dashboard — `/admin`, `§11.4-A`

**Header band.** Mono kicker (`formatKicker`) over Playfair `44px`, primary `＋ Post a photo`
(marked, slice 5).

**The greeting is computed, not hardcoded.** `§11.4-A`'s literal is "Good evening, Jon." The
first draft shipped it fixed while calling it "a small §1 lie" — but `product.md §1` has no size
qualifier, and the same server timestamp the kicker already needs is right there. Derived from
`formatKicker`'s zone: `< 12:00` morning, `< 17:00` afternoon, else evening.

**Four stat tiles** (`1px --hair`, `22px 20px`: mono uppercase label, Playfair 42px number,
`--faint` sub). Labels are written **sentence case in JSX and uppercased by CSS `text-transform`**,
so tests query sentence case.

| Tile | Number | Sub |
|---|---|---|
| In the queue | `summary.queueCount` | `paid · awaiting the lab` |
| Needs attention | `summary.attentionCount` | `amount mismatch — quarantined` |
| Published works | `publishedCount` | `N unlisted` / `1 unlisted` / `none unlisted` |
| Collections | `collectionCount` | `{name} is featured` / `no collection is featured` |

**The invariant (`product.md §6.3`): `queueCount` excludes `amount_mismatch`.** The failure mode
it prevents is shipping $65 of prints for $5.50. Dedicated test.

**D3 — the Needs-attention tile's `--alert` border and wash apply only when `attentionCount > 0`.**
`§11.4-A` states it flatly; applied literally, a healthy console shows a permanently alarmed tile
reading `0`, which is a status not reflecting reality.

**Two-column split below.**

*Left — `Fulfillment queue · oldest first`, with `All orders →` marked (slice 7).*

Row composition **from the prototype**, which `§11.4-A` describes only as "compact rows each with
a 'Copy for lab' ghost button":

```
grid-template-columns: 118px 1fr auto auto;  gap:16px; align-items:center;
padding:14px 10px; border-bottom:1px solid var(--hairsoft)

  JH…0039   Maya Lindqvist          [PAID]   [Copy for lab]
            2 works · 11 Jul
```

Four columns, not five — the works count and the date are **one fused sub-line** under the
customer name, per the prototype. Cell specifics: id `font:500 12px mono; color:var(--ink)`;
name `font-size:13px; color:var(--ink)`; sub-line `font-size:11px; color:var(--faint)`.

- **Order id:** `id.slice(0, 8)` in mono. `§11.4-E`'s `JH-20260716-0042` has **no backing column**
  in `schema.sql`; deriving one from `created_at` plus an invented counter would fabricate an
  order number in the one place Jon has to reconcile a row against Stripe. Recorded as D14 and
  carried to slice 7.
- **No Playfair total.** The total belongs to `§11.4-D` (the Orders surface), not the dashboard.
- **`PAID` chip:** **outlined, not filled** — `font:500 11px mono; color:var(--ok);
  border:1px solid var(--ok); padding:4px 9px`, with the literal text `PAID`. `§11.1` requires
  every status to carry a text label, never colour alone. The first draft named `MISMATCH` and
  left this one unspecified.
- **`Copy for lab`:** ghost button, marked (slice 7).
- Rows separated by `--hairsoft` (`§11.1`: "soft divider between list rows").
- Works count pluralizes: `1 work` / `2 works`.
- Empty: `Nothing awaiting the lab.`

*Below it — `Held out of the queue`, rendering `held[]`.*

`product.md §6.4` requires mismatches "surfaced, never silently queued," and `§11.4-A` puts the
row inline. But `§11.4-D` achieves the separation with **tabs**, which `§11.4-A` has none of — so
transplanting the row without the separation yields "In the queue: 0" directly above a visibly
non-empty queue. A separate labelled group keeps the count and its list in agreement while still
surfacing the order. Recorded as **D15**.

Each held row: alert wash, 2px left `--alert` rule, and
`paid {formatPrice(amount_paid_cents)} · expected {formatPrice(total_cents)}` — bindings written
out because inverting them turns the quarantine line into a lie about which number is real.
(The prototype says "order total"; `§11.4-D` and `schema.sql`'s `mismatch_records_amount_paid`
comment both say "expected", and `§11` outranks the prototype.)

**D12 — the MISMATCH chip.** `§11.5` specifies `softpulse` on opacity `.5↔1`. At the trough,
`--alert` text on the alert wash computes to **1.99:1**; even at full opacity it is 4.51:1 on the
wash and **4.44:1 on `--panel2`** — already failing. The most safety-critical status in the
system would spend half of every 2.2s cycle illegible. So: **the chip's text is `--ink` on an
`--alert`-tinted ground, and the pulse animates the ground, not the text.** Text contrast is then
constant and comfortable, the alert colour still carries the signal, and it is paired with the
literal word `MISMATCH` per `§11.1`.

> SC 2.2.2 (Pause, Stop, Hide) technically wants a *mechanism* to pause, and
> `prefers-reduced-motion` is a user preference rather than a mechanism. Accepted for a
> single-user private console where the animation is a slow ground tint on one row, with the
> reduced-motion gate in place. Recorded rather than glossed.

*Right rail — data-driven, not hardcoded.*

The first draft justified both empty states with "there are no photos or collections **yet**,"
which makes them true only until slice 5 inserts a row — and would put "Relics is featured" in
the Collections tile six inches from "No collection leads home yet." in the rail.

| Region | No data | Data, no image (4b's actual state) |
|---|---|---|
| Home focal point | `No collection leads home yet.` | The featured collection's Playfair name, **no plate** — `cover_photo_id` is nullable by design (`on delete set null`), and no derivative pipeline exists until slice 5 |
| Recent uploads | `No photographs yet.` | Titles only, no plates, same reason |

`Change what leads home →` is marked (slice 6).

### 6.3 Responsive fallback (**D9**)

`§11.4-H` is out of scope, but a fixed 242px sidebar on a phone is broken, so something must
happen. Minimal rule: below `900px` the sidebar stops being fixed and stacks above main,
full-width; nav becomes a horizontal row. No drawer, no hamburger, no new components. Hit targets
≥44px. `§11.4-H` supersedes this later.

### 6.4 Zero is not the same as unreadable (**D7**)

Four tiles reading `0` when the read failed is a confident lie about an empty business — the §1
violation easiest to commit by accident. On `{ ok: false }` the surface renders, verbatim:

> **Couldn't read the studio data.** The numbers aren't shown rather than guessed.

No tiles, no queue, no empty-state copy (which would itself be a claim). Tiles never render a
number they did not receive.

---

## 7. Deviations from `design.md §11`

4a owns D1, D6, D10, D11. 4b owns:

| # | Deviation | Why |
|---|---|---|
| **D2** | Sign-out added to the `§11.3` sidebar footer | `§11.3` specifies the chip and "View live site ↗" but no sign-out. A console you cannot leave is a defect |
| **D3** | Needs-attention `--alert` treatment conditional on `count > 0` | Literal application shows a permanently alarmed tile reading `0` — status not reflecting reality (`§1`) |
| **D4** | Slice 5–7 controls render marked, not omitted and not wired | Jon's decision, applied consistently with D5 |
| **D5** | All five nav items render; four marked | Jon's decision |
| **D7** | Tiles distinguish zero from unreadable | `§11.4-A` assumes data is always available |
| **D8** | Orders' amber count pill deferred to slice 7 | A count pill on a marked item advertises a queue that cannot be opened |
| **D9** | `< 900px` stacking fallback | `§11.4-H` out of scope; a fixed 242px sidebar on a phone is broken |
| **D12** | MISMATCH chip: `--ink` text on a pulsing `--alert` ground, instead of `softpulse` on `--alert` text at `.5↔1` | The specified form computes to **1.99:1** at the trough and 4.44:1 on `--panel2` at full. The system's most safety-critical status cannot be its least legible |
| **D13** | Nav item radius stays `7px` | `§11.3` says `radius 7px`; `§11.5` says "radius 0 everywhere except the outer card (6px), pills, and the avatar." **An internal `design.md` contradiction**, resolved toward the explicit measurement and flagged for reconciliation |
| **D14** | Order id renders as a uuid prefix | `JH-YYYYMMDD-NNNN` (`§11.4-E`, prototype) has no backing column. Fabricating one in the field Jon reconciles against Stripe is a §1 problem. Slice 7 needs a real decision |
| **D15** | Mismatches render in a separate `Held out of the queue` group rather than inline | `§11.4-A` has no tabs, so an inline row contradicts the tile count directly above it. `§11.4-D` achieves the same separation with tabs |

D2 and D13 are `design.md` **gaps/defects** and get written back into `§11` on merge, with 4a's
D1/D6/D10/D11 and its focus treatment.

---

## 8. Testing

Vitest. **4a's §8.1 constraints apply unchanged** — no `jest-dom`, never construct a real
Supabase client, mock `redirect()` to *throw*, `render(await Page())` for async server components.

| File | Covers |
|---|---|
| `admin-summarize.test.ts` | Pure `summarize()`: **`queueCount` excludes `amount_mismatch`**; `held` contains exactly the mismatches; `workCount` reads `order_items[0].count` and survives an empty array; nullable `customer_name`/`amount_paid_cents`; pluralization; featured-collection name and the none case |
| `admin-dates.test.ts` | `formatKicker`/`formatRowDate` against a **fixed instant**, asserting exact output; the greeting's three branches at boundary hours; an instant that is "tomorrow" in UTC but not in `America/New_York` — the defect the explicit zone exists to prevent |
| `admin-nav.test.tsx` | Exactly one item is a link, and it is `Dashboard`; the other four are non-interactive (no `href`, not focusable) with `NOT BUILT` in their text content; item order matches §6.4; inactive items are `--dim` |
| `admin-shell.test.tsx` | Lockup; `View live site ↗` is `href="/"` with `rel="noopener noreferrer"`; **sign-out is a `<button>` inside a `<form>`, not an anchor**; the chip's **visible text is `JH`** and its **hidden text contains the email**, asserted separately |
| `admin-dashboard.test.tsx` | Four tiles with live numbers; **D3** (alert treatment only when `> 0`); marked controls are focusable and carry the marker; `PAID` chip renders the literal word; `Held out of the queue` group appears only when `held` is non-empty; both right-rail regions in both data states; **`{ ok: false }` renders the §6.4 copy and no numbers**; the zero-paid-plus-one-mismatch state (the exact state a stale test row would produce) |
| `price.test.ts` | `formatPrice`: `6500 → "$65"`, `550 → "$5.50"`, `0 → "$0"`; the four refactored call sites still pass their existing assertions |

---

## 9. Verification

### 9.1 Prerequisite — before the dashboard is trusted

**4a §9.3's test-order cleanup must be done.** The money gate forced an `amount_mismatch` to
prove quarantine works; that row is still in `orders`. Left in place it ships the Needs-attention
tile permanently alarmed on fake data — precisely the state D3 exists to prevent — and makes
§9.2's count check self-fulfilling.

### 9.2 Manual

1. Tile counts match a `select status, count(*) from orders group by status` — run against a
   cleaned table, so the check can actually fail.
2. `In the queue` excludes any `amount_mismatch`; a mismatch appears under `Held out of the
   queue` with `paid $X · expected $Y` reading the right way round.
3. Every marked control is reachable by keyboard and announces `NOT BUILT`; no marked link
   navigates.
4. Kicker date and greeting are correct at 9pm Eastern — the case a UTC default gets wrong.
5. Storefront in light mode, then `/admin` → still dark (4a §5).
6. At `<900px` the sidebar stacks and nothing overflows horizontally.
7. `prefers-reduced-motion: reduce` → the MISMATCH ground stops pulsing.

---

## 10. Carried forward

- `design.md §11` needs D2 and D13 written back in (with 4a's D1/D6/D10/D11 + focus).
- **`JH-…` order ids** (D14) — slice 7's lab export needs a real decision, and `§11.4-E` prints
  one on a sheet a human pastes into Nations' order form.
- `§11.4-H` mobile admin supersedes §6.3.
- Orders count pill (D8) → slice 7.
- Derivative plates in the right rail → slice 5.
- SC 2.2.2 pause mechanism for `softpulse` (D12's accepted risk) — revisit if the admin ever
  gains a second user.
