# Slice 4b — Admin Shell + Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `design.md §11.3` dark shell (242px sidebar + fluid main, inside a card) and the `§11.4-A` dashboard, wired to live counts from `orders`, `photos`, and `collections`, on top of slice 4a's auth spine.

**Architecture:** The dashboard is a server component that calls one data function, `getDashboard()`, whose **first statement is `requireAdmin()`** — the authorization boundary established in 4a, because Next layouts do not re-render on client-side navigation. `getDashboard()` splits impure fetching from a pure `summarize()` that is unit-tested exhaustively. Every control belonging to slices 5–7 renders present-but-marked rather than omitted or wired.

**Tech Stack:** Next.js 16.2.10 (App Router, Turbopack), React 19, TypeScript strict, `@supabase/ssr` 0.12.3, Vitest 2.

**Spec:** `docs/superpowers/specs/2026-07-19-admin-shell-dashboard-design.md` — read it before starting. `D2`, `D3`, `D12`… refer to its §7 deviation table.

**Prior slice:** `docs/superpowers/plans/2026-07-19-admin-auth-spine.md` (4a) must be merged and green before this starts. This plan consumes its exports by exact name.

---

## Global Constraints

4a's Global Constraints **all still apply**. Read that section. The ones that bite hardest here:

- **No `@testing-library/jest-dom`.** Assert with `container.textContent`, `container.querySelector(...)`, `el.getAttribute(...)`, `el.hasAttribute(...)`.
- **Never construct a real Supabase client in a test.** Mock `@/lib/supabase/auth-server` and `@/lib/admin/require-admin`.
- **`redirect()` must be mocked to throw**, never as a no-op.
- **Apostrophes in user-visible strings use `’`** (`design.md §11.2`).
- **Do not modify `vitest.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `next.config.ts`, or the CI workflow.** Add no dependencies at all — 4b needs none.
- **Never run SQL against Supabase and never open the dashboard.** The manual verification in the spec's §9.2 is Jon's.
- **Branch:** `slice-4`. Never commit to `main`/`develop`; never `--no-verify`.
- **Gate:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

**New for 4b:**

- **Do not restore `--faint` to `.42` or swap `--hairform` back to `--hair`.** 4a's `test/admin-tokens.test.ts` locks them; a contrast assertion failing means you reverted a deliberate deviation (D10/D11), not that the test is wrong.
- **`summarize()` must stay pure** — no client, no `Date.now()`, no I/O. It is the only exhaustively-tested piece of dashboard logic.
- **`queueCount` excludes `amount_mismatch`.** This is `product.md §6.3`'s whole point; the failure mode is shipping $65 of prints for $5.50.
- **No `unstable_cache`, no `revalidate`, no `fetch` caching on any admin read.** `lib/data/photos.ts` caches because those reads are shared, anonymous and public. These are neither.

---

## Prerequisites — confirm before Task 1

- [ ] **Slice 4a is merged and green.** `git log --oneline` shows the 4a commits; `npm test` passes.
- [ ] These exports exist and are imported by name:
  - `requireAdmin` from `@/lib/admin/require-admin`
  - `createAuthServerClient` from `@/lib/supabase/auth-server`
  - `SignOutButton` from `@/components/admin/SignOutButton`
  - the `[data-admin]`, `--hairform`, `--hairsoft`, `--ok`, `--alert`, `.admin-sr-only`, `.admin-btn` rules in `app/globals.css`
- [ ] **Jon has cleared the money-gate test orders** (4a spec §9.3). Not your job and not verifiable from here — if the Needs-attention tile renders a non-zero count during manual checks, that is why. Do not delete rows.

---

## Extracted measurements — the source of truth for this slice

Taken from `design/Jon Hoffman Admin.dc.html` on 2026-07-19. **Most of the admin's layout is inline-styled in that file, not in its `<style>` block, so these numbers appear nowhere in `design.md §11`'s prose.** Where §11's prose and this table disagree, §11 wins; where §11 is silent — which is most of it — this table is authoritative.

| Element | Values |
|---|---|
| Card | `border-radius:6px; box-shadow:0 30px 70px -34px rgba(0,0,0,.6); overflow:hidden; display:flex; background:var(--paper)` |
| Sidebar | `width:242px; flex:none; background:var(--panel); border-right:1px solid var(--hair); display:flex; flex-direction:column; padding:26px 18px 24px` |
| Lockup row | `display:flex; align-items:center; gap:11px; padding:0 8px` |
| Lockup name | Playfair `18px`, `line-height:1` |
| Lockup kicker | `font-size:9px; letter-spacing:.28em; uppercase; color:var(--faint); margin-top:4px` |
| Sidebar hairline | `height:1px; background:var(--hair); margin:22px 8px 18px` |
| Nav | `display:flex; flex-direction:column; gap:3px` |
| Nav item | `display:flex; align-items:center; gap:11px; padding:10px 13px; border-radius:7px; color:var(--dim); font:500 13px/1 mono; letter-spacing:.01em; transition:background .16s, color .16s` |
| Nav hover / active | `background:rgba(239,234,224,.05)` / `background:rgba(239,234,224,.09); color:var(--ink)` |
| Nav dot `.nb` | 5px, `background:var(--nb)`, `opacity:.35` → `1` when active |
| Sidebar footer | `margin-top:auto; padding:0 8px` |
| "View live site ↗" | `display:flex; align-items:center; justify-content:space-between; font:500 11px mono; letter-spacing:.06em; color:var(--dim); padding:11px 0; border-top:1px solid var(--hairsoft)` |
| Chip row | `display:flex; align-items:center; gap:10px; padding-top:12px; border-top:1px solid var(--hairsoft)` |
| Avatar | `32px; border-radius:50%; background:#2a2a28; display:grid; place-items:center; font:600 12px mono; color:var(--ink)` |
| Chip lockup | `font-size:11px; line-height:1.4`; name `--ink`, email `--faint` at `10px` |
| Main | `flex:1; min-width:0; display:flex; flex-direction:column` |
| Header band | `display:flex; align-items:flex-end; justify-content:space-between; padding:34px 40px 26px; border-bottom:1px solid var(--hair)` |
| Header kicker | `font-size:10px; letter-spacing:.3em; uppercase; color:var(--dim); margin-bottom:12px; mono` |
| Header H1 | Playfair `44px`, `line-height:1` |
| Primary button | `font:500 11px mono; letter-spacing:.14em; uppercase; color:var(--btnink); background:var(--btnbg); padding:14px 22px` |
| Tile grid | `padding:30px 40px; display:grid; grid-template-columns:repeat(4,1fr); gap:20px` |
| Tile | `border:1px solid var(--hair); padding:22px 20px` |
| Tile label | `font:500 10px mono; letter-spacing:.16em; uppercase; color:var(--dim); margin-bottom:16px` |
| Tile number | Playfair `42px`, `line-height:1` |
| Tile sub | `font-size:11px; color:var(--faint); margin-top:8px` |
| **Tile, alert variant** | `border:1px solid var(--alert); background:rgba(200,91,61,.06)`; label `color:var(--alert)`; sub `color:var(--alert)` |
| Section header | `font:500 10px mono; letter-spacing:.1em; uppercase; color:var(--dim)` |
| Queue row | `display:grid; grid-template-columns:118px 1fr auto auto; gap:16px; align-items:center; padding:14px 10px; border-bottom:1px solid var(--hairsoft)` |
| Row id | `font:500 12px mono; color:var(--ink)` |
| Row name | `font-size:13px; color:var(--ink)` |
| Row sub-line | `font-size:11px; color:var(--faint)` |
| `PAID` chip | `font:500 11px mono; color:var(--ok); border:1px solid var(--ok); padding:4px 9px` |
| Ghost button | `font:500 10px mono; letter-spacing:.1em; uppercase; color:var(--ink); border:1px solid var(--hairform); padding:7px 12px` — the prototype says `--hair`; that is 1.42:1 and fails SC 1.4.11, so it takes 4a's `--hairform` (D11) |

**One judgement call (D16), because the prototype cannot answer it.** Its card is `width:1440px; min-height:900px` inside a `padding:54px 56px 90px` wrap — those are design-canvas presentation values, not production layout. The production shell uses `padding:24px` around a card with `min-height:calc(100dvh - 48px)`, so the card and its single shadow stay visible without the canvas's enormous gutter. Recorded here rather than invented silently.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/format/price.ts` (modify) | Add `formatPrice(cents)`; the four existing copies import it |
| `lib/admin/dates.ts` (new) | The two `Intl` formatters + the greeting, all zone-explicit |
| `lib/admin/dashboard.ts` (new) | Types, pure `summarize()`, and `getDashboard()` |
| `components/admin/MarkedControl.tsx` (new) | The two marked-control primitives |
| `components/admin/AdminNav.tsx` (new) | `'use client'`; `usePathname`; 1 live + 4 marked |
| `components/admin/AdminShell.tsx` (new) | Sidebar + main frame, inside the card |
| `components/admin/StatTile.tsx` (new) | Label / number / sub, with the alert variant |
| `components/admin/QueueRow.tsx` (new) | One order row; the held variant carries the quarantine treatment |
| `app/admin/(protected)/layout.tsx` (modify) | Wrap children in `AdminShell` |
| `app/admin/(protected)/page.tsx` (rewrite) | The `§11.4-A` dashboard |
| `app/globals.css` (modify) | Append the admin component classes + `@keyframes softpulse` |
| 4 storefront files (modify) | Import `formatPrice` instead of redeclaring it |

---

## Task 1: Extract `formatPrice`

**Files:**
- Modify: `lib/format/price.ts`, `test/price.test.ts`
- Modify: `app/(store)/checkout/page.tsx`, `app/(store)/order/[id]/page.tsx`, `components/cart/CartDrawer.tsx`, `components/product/ProductInteractive.tsx`

**Interfaces:**
- Produces: `formatPrice(cents: number): string`

**Why this is in scope despite touching storefront files:** `formatPrice` does not exist. `lib/format/price.ts` exports only `priceForSize`/`priceRangeLabel`, and `` `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}` `` is copy-pasted **verbatim in four files**. Adding a fifth copy for the admin, or adding a shared one and leaving four copies, both preserve exactly the decay pattern `design.md §11.7` warns about. Four one-line changes, under 1563 existing tests.

- [ ] **Step 1: Write the failing test**

Append to `test/price.test.ts`:

```ts
import { formatPrice } from '@/lib/format/price'

describe('formatPrice', () => {
  it('drops the cents when they are zero', () => {
    expect(formatPrice(6500)).toBe('$65')
    expect(formatPrice(0)).toBe('$0')
  })

  it('keeps two decimals when there are cents', () => {
    expect(formatPrice(550)).toBe('$5.50')
    expect(formatPrice(4243)).toBe('$42.43')
  })

  // The mismatch line's whole point is that two numbers read differently at a
  // glance: "paid $5.50 · expected $65", not "$5.50 · $65.00".
  it('renders a mismatch pair distinguishably', () => {
    expect(`${formatPrice(550)} · ${formatPrice(6500)}`).toBe('$5.50 · $65')
  })
})
```

> If `test/price.test.ts` does not already import `describe`/`it`/`expect` from `vitest`, add them to its existing import rather than duplicating the line.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/price.test.ts`
Expected: FAIL — `formatPrice` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/format/price.ts`:

```ts
/**
 * The storefront's money format, extracted. Was copy-pasted verbatim in four
 * files; the admin needed a fifth, which is where a duplicated helper stops
 * being harmless (design.md §11.7).
 *
 * Cents are dropped when zero so "$5.50 · $65" reads as two different numbers
 * at a glance — which is the entire point of the quarantine line.
 */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`
}
```

- [ ] **Step 4: Replace the four copies**

In each of these files, delete the local `formatPrice` function declaration and import the shared one instead. Do not change any call site — the name and behaviour are identical.

| File | Local declaration to delete |
|---|---|
| `app/(store)/checkout/page.tsx` | around line 11 |
| `app/(store)/order/[id]/page.tsx` | around line 19 |
| `components/cart/CartDrawer.tsx` | around line 8 |
| `components/product/ProductInteractive.tsx` | around line 24 |

Add to each: `import { formatPrice } from '@/lib/format/price'` (merge into an existing `@/lib/format/price` import if one is already there).

- [ ] **Step 5: Run the full suite and the static gate**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: **1563 + 3 = 1566** passing. The existing storefront tests are the proof the refactor is behaviour-preserving — if any of them fail, you changed behaviour, not just location.

- [ ] **Step 6: Commit**

```bash
git add lib/format/price.ts test/price.test.ts "app/(store)/checkout/page.tsx" "app/(store)/order/[id]/page.tsx" components/cart/CartDrawer.tsx components/product/ProductInteractive.tsx
git commit -m "refactor(format): extract formatPrice from its four copies" -m "The helper was copy-pasted verbatim in four files and the admin needed a fifth, which is where a duplicated helper stops being harmless. Behaviour is unchanged; the existing storefront tests are the proof." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Dates and the greeting

**Files:**
- Create: `lib/admin/dates.ts`
- Test: `test/admin-dates.test.ts`

**Interfaces:**
- Produces: `formatKicker(d: Date): string`, `formatRowDate(d: Date): string`, `greetingFor(d: Date): string`

**Why the zone is explicit and non-negotiable:** a UTC default renders **tomorrow's date** to an Eastern reader every evening after 8pm. This is the "Invalid Date" defect class (`schema.sql`, `orders.created_at`) in a form that is harder to notice, because it looks fine. There is no precedent to copy — `grep -rn "toLocale\|Intl\.DateTimeFormat"` across `app/ lib/ components/` returns **zero**.

**The greeting is computed, not hardcoded.** `§11.4-A`'s literal is "Good evening, Jon." The spec's first draft shipped it fixed while calling it "a small §1 lie" — but `product.md §1` has no size qualifier, and the same server timestamp the kicker needs is already in hand.

- [ ] **Step 1: Write the failing test**

Create `test/admin-dates.test.ts`. Every expected string below was produced by running the real `Intl` implementation — do not adjust them to match an implementation that disagrees.

```ts
import { describe, it, expect } from 'vitest'
import { formatKicker, formatRowDate, greetingFor } from '@/lib/admin/dates'

// 2026-07-16T20:00:00Z === 16 Jul 2026, 4:00pm America/New_York (EDT)
const AFTERNOON = new Date('2026-07-16T20:00:00Z')
// 2026-07-17T01:30:00Z === 16 Jul 2026, 9:30pm America/New_York — but 17 Jul in UTC
const LATE_EVENING = new Date('2026-07-17T01:30:00Z')

describe('formatKicker', () => {
  it('renders the prototype format exactly', () => {
    expect(formatKicker(AFTERNOON)).toBe('Thursday · 16 July 2026')
  })

  // THE ONE THAT MATTERS. With a UTC default this renders "Friday · 17 July
  // 2026" — tomorrow's date, every evening after 8pm, and it looks fine.
  it('uses the project zone, not UTC, across the day boundary', () => {
    expect(formatKicker(LATE_EVENING)).toBe('Thursday · 16 July 2026')
  })
})

describe('formatRowDate', () => {
  it('renders the compact row format', () => {
    expect(formatRowDate(AFTERNOON)).toBe('16 Jul')
  })

  it('uses the project zone across the day boundary', () => {
    expect(formatRowDate(LATE_EVENING)).toBe('16 Jul')
  })
})

describe('greetingFor', () => {
  it('is computed, and covers all three branches at their boundaries', () => {
    // 11:59am, 12:00pm, 4:59pm, 5:00pm EDT
    expect(greetingFor(new Date('2026-07-16T15:59:00Z'))).toBe('Good morning, Jon.')
    expect(greetingFor(new Date('2026-07-16T16:00:00Z'))).toBe('Good afternoon, Jon.')
    expect(greetingFor(new Date('2026-07-16T20:59:00Z'))).toBe('Good afternoon, Jon.')
    expect(greetingFor(new Date('2026-07-16T21:00:00Z'))).toBe('Good evening, Jon.')
  })

  it('handles midnight, where hour12:false can report 24', () => {
    // 2026-07-16T04:30:00Z === 12:30am EDT
    expect(greetingFor(new Date('2026-07-16T04:30:00Z'))).toBe('Good morning, Jon.')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/admin-dates.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin/dates`.

- [ ] **Step 3: Implement**

Create `lib/admin/dates.ts`:

```ts
/**
 * Every formatter here carries an EXPLICIT locale and timeZone.
 *
 * An implicit zone makes the rendered string depend on whichever machine
 * happened to render it, and a UTC default shows tomorrow's date to an Eastern
 * reader every evening after 8pm. That is the "Invalid Date" defect class in a
 * form that is harder to notice, because it looks correct.
 *
 * These must only ever be called server-side: a client `new Date()` would
 * hydrate-mismatch against the server's render.
 */
const ZONE = 'America/New_York'
const LOCALE = 'en-GB' // day-before-month, matching the prototype

const kickerParts = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONE,
})

/** "Thursday · 16 July 2026" — the separator is composed, not a locale pattern. */
export function formatKicker(date: Date): string {
  const part: Record<string, string> = {}
  for (const p of kickerParts.formatToParts(date)) {
    if (p.type !== 'literal') part[p.type] = p.value
  }
  return `${part.weekday} · ${part.day} ${part.month} ${part.year}`
}

const rowDate = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric', month: 'short', timeZone: ZONE,
})

/** "16 Jul" — the compact form used in a queue row. */
export function formatRowDate(date: Date): string {
  return rowDate.format(date)
}

const zonedHour = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric', hour12: false, timeZone: ZONE,
})

/**
 * §11.4-A's copy is "Good evening, Jon." — rendered as a fact about the time
 * rather than a fixed string, because product.md §1 has no size qualifier for
 * a status that does not reflect reality.
 */
export function greetingFor(date: Date): string {
  // hour12:false reports midnight as 24 in some implementations.
  const hour = Number(zonedHour.format(date)) % 24
  if (hour < 12) return 'Good morning, Jon.'
  if (hour < 17) return 'Good afternoon, Jon.'
  return 'Good evening, Jon.'
}
```

- [ ] **Step 4: Run the test and the static gate**

```bash
npx vitest run test/admin-dates.test.ts
npm run typecheck
npm run lint
```

Expected: 6 tests PASS; 0 errors; 0 problems.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/dates.ts test/admin-dates.test.ts
git commit -m "feat(admin): zone-explicit date formatters and a computed greeting" -m "A UTC default renders tomorrow's date to an Eastern reader every evening after 8pm — the 'Invalid Date' defect class in a form that looks correct. Both formatters pin locale and timeZone, and a test asserts the day-boundary case directly. The greeting is derived from the same timestamp rather than hardcoded." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: The dashboard data layer

**Files:**
- Create: `lib/admin/dashboard.ts`
- Test: `test/admin-summarize.test.ts`, `test/admin-dashboard-data.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (4a), `createAuthServerClient` (4a).
- Produces: `QueueOrder`, `DashboardData`, `Summary`, `DashboardResult`, `summarize()`, `getDashboard()`.

**Three traps in this task, all of which pass a naive test:**

1. **`order_items(count)` deserializes to an array**, `{ count: number }[]` — not a scalar. `row.order_items.count` is `undefined` and renders a blank works count.
2. **`.select('id', { count: 'exact', head: true })` returns `data: null` by design**, with the number on `count`. A failure check written as "falsy data" renders the unreadable state on **every healthy request**, inverting D7 into its own §1 violation. Key `ok:false` on the `error` object, never on `data`.
3. **RLS denial returns zero rows with no error.** That is why `requireAdmin()` is the first statement — the error channel cannot detect it, so the caller's identity assertion has to.

- [ ] **Step 1: Write the failing tests**

Create `test/admin-summarize.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { summarize, type DashboardData } from '@/lib/admin/dashboard'

function order(over: Partial<DashboardData['orders'][number]> = {}) {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    status: 'paid' as const,
    created_at: '2026-07-16T20:00:00Z',
    customer_name: 'Maya Lindqvist',
    customer_email: 'maya@example.com',
    total_cents: 6500,
    amount_paid_cents: null,
    order_items: [{ count: 2 }],
    ...over,
  }
}
const EMPTY: DashboardData = { orders: [], publishedCount: 0, unlistedCount: 0, collections: [] }

describe('summarize', () => {
  // product.md §6.3 — the failure mode is shipping $65 of prints for $5.50.
  it('excludes amount_mismatch from the queue count', () => {
    const { summary } = summarize({
      ...EMPTY,
      orders: [
        order(),
        order({ id: 'b', status: 'amount_mismatch', amount_paid_cents: 550 }),
        order({ id: 'c' }),
      ],
    })
    expect(summary.queueCount).toBe(2)
    expect(summary.attentionCount).toBe(1)
  })

  it('splits the rows into queue and held, keeping both', () => {
    const { queue, held } = summarize({
      ...EMPTY,
      orders: [order({ id: 'a' }), order({ id: 'b', status: 'amount_mismatch', amount_paid_cents: 550 })],
    })
    expect(queue.map((o) => o.id)).toEqual(['a'])
    expect(held.map((o) => o.id)).toEqual(['b'])
  })

  it('reads workCount out of the embedded array, not a scalar', () => {
    const { queue } = summarize({ ...EMPTY, orders: [order({ order_items: [{ count: 3 }] })] })
    expect(queue[0].workCount).toBe(3)
  })

  it('survives an empty or missing order_items embed', () => {
    const { queue } = summarize({ ...EMPTY, orders: [order({ order_items: [] })] })
    expect(queue[0].workCount).toBe(0)
  })

  it('carries nullable customer_name and amount_paid_cents through untouched', () => {
    const { queue } = summarize({ ...EMPTY, orders: [order({ customer_name: null })] })
    expect(queue[0].customer_name).toBeNull()
    expect(queue[0].amount_paid_cents).toBeNull()
  })

  it('names the featured collection, or reports none', () => {
    const none = summarize({ ...EMPTY, collections: [{ name: 'Relics', featured_on_home: false }] })
    expect(none.summary.featuredCollectionName).toBeNull()
    expect(none.summary.collectionCount).toBe(1)

    const one = summarize({
      ...EMPTY,
      collections: [{ name: 'Relics', featured_on_home: true }, { name: 'Tide', featured_on_home: false }],
    })
    expect(one.summary.featuredCollectionName).toBe('Relics')
    expect(one.summary.collectionCount).toBe(2)
  })

  it('passes the photo counts straight through', () => {
    const { summary } = summarize({ ...EMPTY, publishedCount: 16, unlistedCount: 2 })
    expect(summary.publishedCount).toBe(16)
    expect(summary.unlistedCount).toBe(2)
  })

  it('produces an all-zero summary for an empty database without erroring', () => {
    const { summary, queue, held } = summarize(EMPTY)
    expect(summary.queueCount).toBe(0)
    expect(queue).toEqual([])
    expect(held).toEqual([])
  })
})
```

Create `test/admin-dashboard-data.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const guard = { throws: false }
const requireAdmin = vi.fn(async () => {
  if (guard.throws) throw new Error('NEXT_REDIRECT;/admin/sign-in')
  return { id: 'u1', email: 'jon@example.com' }
})
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin: () => requireAdmin() }))

type Result = { data: unknown; count: number | null; error: unknown }
const results: Record<string, Result> = {}
const calls: string[] = []

vi.mock('@/lib/supabase/auth-server', () => ({
  createAuthServerClient: async () => ({
    from: (table: string) => {
      const chain = {
        select: (_cols: string, opts?: { head?: boolean }) => {
          const key = opts?.head ? `${table}:count` : table
          const settle = () => {
            calls.push(key)
            // A head:true response carries data:null BY DESIGN.
            const r = results[key] ?? { data: null, count: 0, error: null }
            return Promise.resolve(r)
          }
          const q = {
            eq: (_c: string, v: unknown) => {
              const k = `photos:${v ? 'published' : 'unlisted'}`
              calls.push(k)
              return Promise.resolve(results[k] ?? { data: null, count: 0, error: null })
            },
            in: () => q,
            order: () => settle(),
            then: (res: (v: Result) => unknown) => settle().then(res),
          }
          return q
        },
      }
      return chain
    },
  }),
}))

beforeEach(() => {
  guard.throws = false
  for (const k of Object.keys(results)) delete results[k]
  calls.length = 0
  requireAdmin.mockClear()
})

describe('getDashboard', () => {
  it('calls requireAdmin before touching the database', async () => {
    guard.throws = true
    const { getDashboard } = await import('@/lib/admin/dashboard')
    await expect(getDashboard()).rejects.toThrow(/NEXT_REDIRECT/)
    expect(calls).toEqual([])
  })

  // head:true returns data:null on SUCCESS. Keying failure on falsy data would
  // render the unreadable state on every healthy request.
  it('returns ok:true with zeroes for an empty but healthy database', async () => {
    results['orders'] = { data: [], count: null, error: null }
    results['photos:published'] = { data: null, count: 0, error: null }
    results['photos:unlisted'] = { data: null, count: 0, error: null }
    results['collections'] = { data: [], count: null, error: null }
    const { getDashboard } = await import('@/lib/admin/dashboard')
    const result = await getDashboard()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.summary.queueCount).toBe(0)
  })

  it('collapses to ok:false when any single query errors', async () => {
    results['orders'] = { data: [], count: null, error: null }
    results['photos:published'] = { data: null, count: 0, error: null }
    results['photos:unlisted'] = { data: null, count: 0, error: null }
    results['collections'] = { data: null, count: null, error: { message: 'permission denied for table collections' } }
    const { getDashboard } = await import('@/lib/admin/dashboard')
    expect(await getDashboard()).toEqual({ ok: false })
  })

  it('never returns the underlying error text', async () => {
    results['orders'] = { data: null, count: null, error: { message: 'column orders.secret does not exist', hint: 'perhaps you meant' } }
    const { getDashboard } = await import('@/lib/admin/dashboard')
    const result = await getDashboard()
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(JSON.stringify(result)).not.toContain('hint')
  })
})
```

> The chain mock above is deliberately shaped to match the exact call sequence in Step 3. If you change the query shape, change the mock with it — do not loosen the mock to accept anything.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run test/admin-summarize.test.ts test/admin-dashboard-data.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin/dashboard`.

- [ ] **Step 3: Implement**

Create `lib/admin/dashboard.ts`:

```ts
import 'server-only'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

export type OrderRow = {
  id: string
  status: 'paid' | 'amount_mismatch'
  created_at: string
  customer_name: string | null      // schema.sql: nullable
  customer_email: string
  total_cents: number
  amount_paid_cents: number | null  // non-null iff amount_mismatch (schema constraint)
  order_items: { count: number }[]  // PostgREST returns an ARRAY, not a scalar
}

export type QueueOrder = Omit<OrderRow, 'order_items'> & { workCount: number }

export type DashboardData = {
  orders: OrderRow[]
  publishedCount: number
  unlistedCount: number
  collections: { name: string; featured_on_home: boolean }[]
}

export type Summary = {
  queueCount: number       // paid ONLY
  attentionCount: number   // amount_mismatch ONLY
  publishedCount: number
  unlistedCount: number
  collectionCount: number
  featuredCollectionName: string | null
}

export type DashboardResult =
  | { ok: true; summary: Summary; queue: QueueOrder[]; held: QueueOrder[] }
  | { ok: false }

const ORDER_COLUMNS =
  'id, status, created_at, customer_name, customer_email, total_cents, amount_paid_cents, order_items(count)'

function toQueueOrder({ order_items, ...rest }: OrderRow): QueueOrder {
  // order_items is [{ count: n }] — reading .count off the array yields undefined
  // and renders a blank works count.
  return { ...rest, workCount: order_items?.[0]?.count ?? 0 }
}

/** Pure. No client, no clock, no I/O. */
export function summarize(data: DashboardData): {
  summary: Summary
  queue: QueueOrder[]
  held: QueueOrder[]
} {
  const all = data.orders.map(toQueueOrder)
  const queue = all.filter((o) => o.status === 'paid')
  const held = all.filter((o) => o.status === 'amount_mismatch')
  const featured = data.collections.find((c) => c.featured_on_home)

  return {
    summary: {
      // product.md §6.3: mismatches are EXCLUDED from the queue count. The
      // failure mode is shipping $65 of prints for $5.50.
      queueCount: queue.length,
      attentionCount: held.length,
      publishedCount: data.publishedCount,
      unlistedCount: data.unlistedCount,
      collectionCount: data.collections.length,
      featuredCollectionName: featured?.name ?? null,
    },
    queue,
    held,
  }
}

/**
 * requireAdmin() is the FIRST statement, not decoration: an RLS denial returns
 * zero rows with NO error, so the error channel cannot detect a wrong-identity
 * read. Only the caller's identity assertion can.
 */
export async function getDashboard(): Promise<DashboardResult> {
  await requireAdmin()

  const db = await createAuthServerClient()
  const [orders, published, unlisted, collections] = await Promise.all([
    db.from('orders').select(ORDER_COLUMNS)
      .in('status', ['paid', 'amount_mismatch'])
      .order('created_at', { ascending: true }),          // §6.4: oldest first
    db.from('photos').select('id', { count: 'exact', head: true }).eq('published', true),
    db.from('photos').select('id', { count: 'exact', head: true }).eq('published', false),
    db.from('collections').select('name, featured_on_home'),
  ])

  // Keyed on `error`, NEVER on `data`: head:true returns data:null on SUCCESS,
  // so a falsy-data check would report "unreadable" on every healthy request.
  const failure =
    orders.error ?? published.error ?? unlisted.error ?? collections.error ??
    (published.count === null || unlisted.count === null ? { message: 'count unavailable' } : null)

  if (failure) {
    // Logged server-side only. A PostgREST error carries message/details/hint
    // that can include column names and SQL fragments, and a Server Component's
    // return value is serialized to the client.
    console.error('[admin-dashboard] read failed', failure)
    return { ok: false }
  }

  // Any single failure collapses the whole result: a partially-readable
  // dashboard is harder to reason about than an honestly unreadable one, and
  // D7's claim is that a tile never shows a number it did not receive.
  const { summary, queue, held } = summarize({
    orders: (orders.data ?? []) as OrderRow[],
    publishedCount: published.count ?? 0,
    unlistedCount: unlisted.count ?? 0,
    collections: (collections.data ?? []) as DashboardData['collections'],
  })

  return { ok: true, summary, queue, held }
}
```

- [ ] **Step 4: Run the tests and the static gate**

```bash
npx vitest run test/admin-summarize.test.ts test/admin-dashboard-data.test.ts
npm run typecheck
npm run lint
```

Expected: 8 + 4 = 12 tests PASS; 0 errors; 0 problems.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/dashboard.ts test/admin-summarize.test.ts test/admin-dashboard-data.test.ts
git commit -m "feat(admin): dashboard data layer, pure summarize plus a guarded read" -m "queueCount excludes amount_mismatch (product.md §6.3). requireAdmin() is the first statement because an RLS denial returns zero rows with no error, so the error channel cannot detect a wrong-identity read. ok:false is keyed on the error object and never on data — head:true returns data:null on success, so a falsy-data check would render the unreadable state on every healthy request. The underlying error is logged, never returned." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: The admin component CSS

**Files:**
- Modify: `app/globals.css` (append only)
- Test: `test/admin-css.test.ts`

**Convention:** global classes in `app/globals.css`, appended after 4a's `[data-admin]` token block, matching the slice-3 precedent. All admin class names are prefixed `admin-`.

**`@keyframes softpulse` exists nowhere in the repo** — only in the prototype, as `0%,100%{opacity:.5} 50%{opacity:1}`. It is added here **in modified form**, per D12.

**D12, stated plainly:** the prototype pulses the chip's opacity between `.5` and `1`. At the trough, `--alert` text on the alert wash computes to **1.99:1**; even at full opacity it is 4.44:1 on `--panel2`. The system's most safety-critical status would spend half of every 2.2s cycle illegible. So the chip's **text is `--ink` on an `--alert`-tinted ground, and the pulse animates the ground, not the text.**

- [ ] **Step 1: Write the failing test**

Create `test/admin-css.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
const flat = css.replace(/\s+/g, ' ')

function rule(selector: string): string {
  const i = css.indexOf(selector + ' {')
  if (i === -1) throw new Error(`missing rule: ${selector}`)
  return css.slice(i, css.indexOf('}', i))
}

describe('the admin component classes', () => {
  it('defines every class the shell and dashboard render', () => {
    for (const cls of [
      '.admin-card', '.admin-sidebar', '.admin-main', '.admin-navitem', '.admin-nb',
      '.admin-marked', '.admin-mark', '.admin-tile', '.admin-tile-label',
      '.admin-tile-number', '.admin-tile-sub', '.admin-queue-row', '.admin-paid',
      '.admin-mismatch', '.admin-ghost', '.admin-chip-avatar',
    ]) {
      expect(css, `${cls} missing`).toContain(cls)
    }
  })

  it('pins the sidebar to 242px (design.md §11.3)', () => {
    expect(rule('.admin-sidebar')).toMatch(/width:\s*242px/)
  })

  it('gives the card exactly one shadow and a 6px radius (§11.5)', () => {
    const card = rule('.admin-card')
    expect(card).toMatch(/border-radius:\s*6px/)
    expect(card.match(/box-shadow/g)?.length).toBe(1)
  })

  it('uses --hairform for control boundaries, not --hair (D11, SC 1.4.11)', () => {
    expect(rule('.admin-ghost')).toContain('--hairform')
  })

  // D12 — the prototype animates opacity .5<->1, which puts --alert text at
  // 1.99:1 at the trough. The pulse must move the GROUND, not the text.
  it('defines softpulse without animating text opacity', () => {
    const start = css.indexOf('@keyframes softpulse')
    expect(start, '@keyframes softpulse missing').toBeGreaterThan(-1)
    // The block's closing brace is the first one at column 0 after the start.
    const frames = css.slice(start, css.indexOf('
}', start) + 2)
    expect(frames, 'softpulse must not animate opacity').not.toMatch(/opacity\s*:/)
    expect(frames).toMatch(/background/)
  })

  it('renders mismatch chip text in --ink, never in --alert (D12)', () => {
    expect(rule('.admin-mismatch')).toMatch(/color:\s*var\(--ink\)/)
  })

  it('keeps the marked-control marker in the text flow, not a tooltip', () => {
    expect(rule('.admin-mark')).not.toMatch(/content:/)
  })

  it('stacks the shell below 900px (D9)', () => {
    expect(flat).toMatch(/@media \(max-width: 900px\)/)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/admin-css.test.ts`
Expected: FAIL — `missing rule: .admin-card`.

- [ ] **Step 3: Implement**

Append to the **end** of `app/globals.css`, after 4a's block. Change nothing above it.

```css
/* ===================================================================
   Admin shell + dashboard (design.md §11.3, §11.4-A).
   Measurements extracted from design/Jon Hoffman Admin.dc.html, where
   most of the admin is inline-styled rather than in its <style> block.
   =================================================================== */

.admin-wrap { padding: 24px; }
.admin-card {
  display: flex;
  min-height: calc(100dvh - 48px);
  background: var(--paper); color: var(--ink);
  border-radius: 6px; overflow: hidden;
  box-shadow: 0 30px 70px -34px rgba(0, 0, 0, 0.6);
}

/* --- Sidebar --- */
.admin-sidebar {
  width: 242px; flex: none;
  background: var(--panel);
  border-right: 1px solid var(--hair);
  display: flex; flex-direction: column;
  padding: 26px 18px 24px;
}
.admin-lockup { display: flex; align-items: center; gap: 11px; padding: 0 8px; }
.admin-lockup-name { margin: 0; font-family: var(--font-playfair); font-size: 18px; line-height: 1; }
.admin-lockup-kicker { margin: 4px 0 0; font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.28em; text-transform: uppercase; color: var(--faint); }
.admin-rule { height: 1px; background: var(--hair); margin: 22px 8px 18px; }
.admin-nav { display: flex; flex-direction: column; gap: 3px; list-style: none; margin: 0; padding: 0; }
.admin-navitem {
  display: flex; align-items: center; gap: 11px;
  padding: 10px 13px; border-radius: 7px;
  color: var(--dim); text-decoration: none;
  font-family: var(--font-mono); font-weight: 500; font-size: 13px; line-height: 1;
  letter-spacing: 0.01em;
  transition: background 0.16s, color 0.16s;
}
a.admin-navitem:hover { background: rgba(239, 234, 224, 0.05); color: var(--ink); }
.admin-navitem.is-active { background: rgba(239, 234, 224, 0.09); color: var(--ink); }
.admin-nb { width: 5px; height: 5px; border-radius: 50%; background: var(--nb); opacity: 0.35; flex: none; }
.admin-navitem.is-active .admin-nb { opacity: 1; }

.admin-sidefoot { margin-top: auto; padding: 0 8px; }
.admin-livesite {
  display: flex; align-items: center; justify-content: space-between;
  font-family: var(--font-mono); font-weight: 500; font-size: 11px; letter-spacing: 0.06em;
  color: var(--dim); text-decoration: none;
  padding: 11px 0; border-top: 1px solid var(--hairsoft);
}
.admin-livesite:hover { color: var(--ink); }
.admin-chip { display: flex; align-items: center; gap: 10px; padding-top: 12px; border-top: 1px solid var(--hairsoft); }
.admin-chip-avatar {
  width: 32px; height: 32px; flex: none; border-radius: 50%;
  background: #2a2a28; display: grid; place-items: center;
  font-family: var(--font-mono); font-weight: 600; font-size: 12px; color: var(--ink);
}
.admin-chip-text { font-size: 11px; line-height: 1.4; min-width: 0; }
.admin-chip-name { color: var(--ink); }
.admin-chip-email { color: var(--faint); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* --- Main --- */
.admin-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.admin-band {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 24px;
  padding: 34px 40px 26px; border-bottom: 1px solid var(--hair);
}
.admin-band-kicker { margin: 0 0 12px; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: var(--dim); }
.admin-band-h1 { margin: 0; font-family: var(--font-playfair); font-weight: 400; font-size: 44px; line-height: 1; }

/* --- Marked controls (spec §6.1.1) --- */
.admin-marked { display: inline-flex; align-items: center; gap: 8px; }
.admin-mark { font-family: var(--font-mono); font-weight: 500; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--faint); }
button.admin-marked, .admin-btn[aria-disabled='true'], .admin-ghost[aria-disabled='true'] { cursor: not-allowed; opacity: 0.72; }

/* --- Buttons --- */
.admin-ghost {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 7px 12px;
  background: transparent; color: var(--ink);
  /* Prototype says --hair; that is 1.42:1 and fails SC 1.4.11 (D11). */
  border: 1px solid var(--hairform); border-radius: 0;
  font-family: var(--font-mono); font-weight: 500; font-size: 10px;
  letter-spacing: 0.1em; text-transform: uppercase;
}

/* --- Stat tiles --- */
.admin-tiles { padding: 30px 40px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.admin-tile { border: 1px solid var(--hair); padding: 22px 20px; }
.admin-tile.is-alert { border-color: var(--alert); background: rgba(200, 91, 61, 0.06); }
.admin-tile-label { margin: 0 0 16px; font-family: var(--font-mono); font-weight: 500; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--dim); }
.admin-tile.is-alert .admin-tile-label { color: var(--alert); }
.admin-tile-number { margin: 0; font-family: var(--font-playfair); font-weight: 400; font-size: 42px; line-height: 1; color: var(--ink); }
.admin-tile-sub { margin: 8px 0 0; font-size: 11px; color: var(--faint); }
.admin-tile.is-alert .admin-tile-sub { color: var(--alert); }

/* --- Columns, queue, rail --- */
.admin-cols { padding: 0 40px 40px; display: grid; grid-template-columns: 1.55fr 1fr; gap: 32px; align-items: start; }
.admin-sectionhead { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0 0 6px; font-family: var(--font-mono); font-weight: 500; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); }
.admin-queue { list-style: none; margin: 0 0 28px; padding: 0; }
.admin-queue-row { display: grid; grid-template-columns: 118px 1fr auto auto; gap: 16px; align-items: center; padding: 14px 10px; border-bottom: 1px solid var(--hairsoft); }
.admin-row-id { font-family: var(--font-mono); font-weight: 500; font-size: 12px; color: var(--ink); }
.admin-row-name { font-size: 13px; color: var(--ink); }
.admin-row-sub { font-size: 11px; color: var(--faint); }
.admin-paid { font-family: var(--font-mono); font-weight: 500; font-size: 11px; color: var(--ok); border: 1px solid var(--ok); padding: 4px 9px; white-space: nowrap; }
.admin-empty { margin: 0; padding: 14px 10px; font-size: 12px; color: var(--faint); }

/* --- Quarantine (D12/D15) --- */
.admin-held { background: rgba(200, 91, 61, 0.06); border-left: 2px solid var(--alert); }
.admin-held-line { font-family: var(--font-mono); font-size: 11px; color: var(--ink); }
.admin-mismatch {
  font-family: var(--font-mono); font-weight: 500; font-size: 11px;
  /* D12: text is --ink on a tinted ground. The prototype's opacity pulse puts
     --alert text at 1.99:1 at the trough — illegible for half of every cycle,
     on the one status that must never be missed. */
  color: var(--ink);
  background: rgba(200, 91, 61, 0.28);
  border: 1px solid var(--alert);
  padding: 4px 9px; white-space: nowrap;
  animation: softpulse 2.2s ease-in-out infinite;
}
/* The ONLY looping animation in the system (§11.5), and it moves the ground. */
@keyframes softpulse {
  0%, 100% { background: rgba(200, 91, 61, 0.16); }
  50%      { background: rgba(200, 91, 61, 0.40); }
}

/* --- Right rail --- */
.admin-rail { display: flex; flex-direction: column; gap: 24px; }
.admin-railcard { border: 1px solid var(--hair); padding: 18px; }
.admin-railcard-name { margin: 0; font-family: var(--font-playfair); font-size: 20px; line-height: 1.2; }
.admin-uploads { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 0; padding: 0; list-style: none; }
.admin-upload { border: 1px solid var(--hairsoft); aspect-ratio: 4 / 5; display: grid; place-items: center; padding: 8px; font-size: 10px; color: var(--faint); text-align: center; }

/* --- Responsive fallback (D9) — §11.4-H supersedes this later --- */
@media (max-width: 900px) {
  .admin-wrap { padding: 0; }
  .admin-card { flex-direction: column; min-height: 100dvh; border-radius: 0; box-shadow: none; }
  .admin-sidebar { width: 100%; border-right: none; border-bottom: 1px solid var(--hair); }
  .admin-nav { flex-direction: row; flex-wrap: wrap; }
  .admin-sidefoot { margin-top: 16px; }
  .admin-tiles { grid-template-columns: repeat(2, 1fr); padding: 20px; }
  .admin-cols { grid-template-columns: 1fr; padding: 0 20px 20px; }
  .admin-band { padding: 20px; }
  .admin-queue-row { grid-template-columns: 1fr auto; row-gap: 6px; }
}
```

- [ ] **Step 4: Run the tests and the static gate**

```bash
npx vitest run test/admin-css.test.ts test/admin-tokens.test.ts
npm run typecheck
npm run lint
```

Expected: 8 + 9 tests PASS. 4a's `admin-tokens` must still pass — if a contrast assertion fails, you changed a locked token.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css test/admin-css.test.ts
git commit -m "feat(admin): shell and dashboard classes, with softpulse reworked" -m "Measurements extracted from the prototype, where most of the admin is inline-styled rather than in its <style> block. softpulse animates the chip's GROUND, not its text opacity: the prototype's .5<->1 opacity pulse puts --alert text at 1.99:1 at the trough, so the system's most safety-critical status would be illegible for half of every cycle (D12). Control boundaries use --hairform, not --hair (D11)." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Marked controls and the nav

**Files:**
- Create: `components/admin/MarkedControl.tsx`, `components/admin/AdminNav.tsx`
- Test: `test/admin-nav.test.tsx`

**Interfaces:**
- Produces: `MarkedLink({ label })`, `MarkedButton({ label, className? })`, `AdminNav()`

**The marked-control rule (spec §6.1.1):**

| Would have been | Renders as |
|---|---|
| `<a href>` | `<span>` — no `href`, no `role`, no `tabindex`. Not a control, read as plain text |
| `<button>` | `<button type="button" aria-disabled="true">` — still focusable, still announced |

**Why `aria-disabled` rather than the native `disabled`:** the native attribute removes the element from the tab order, so a keyboard or screen-reader user never reaches it and never hears `NOT BUILT` — and browsers grey disabled text on top of an already-marginal token. Since the marker *is* the honest-function payload, it has to be discoverable. A `<button type="button">` with no handler is inert regardless.

**Nav order comes from the prototype's sidebar**, which `§11.3` does not enumerate (it specifies item *styling* only): **Dashboard, Photographs, Collections, Orders, Home feature.**

- [ ] **Step 1: Write the failing test**

Create `test/admin-nav.test.tsx`:

```tsx
import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const pathname = { value: '/admin' }
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }))

afterEach(() => { cleanup(); pathname.value = '/admin' })

async function renderNav() {
  const { AdminNav } = await import('@/components/admin/AdminNav')
  return render(<AdminNav />)
}

describe('AdminNav', () => {
  it('lists the five items in the prototype order', async () => {
    const { container } = await renderNav()
    const labels = [...container.querySelectorAll('.admin-navitem')].map(
      (el) => (el.textContent ?? '').replace('NOT BUILT', '').trim(),
    )
    expect(labels).toEqual(['Dashboard', 'Photographs', 'Collections', 'Orders', 'Home feature'])
  })

  it('makes exactly one item a link, and it is Dashboard', async () => {
    const { container } = await renderNav()
    const links = container.querySelectorAll('a.admin-navitem')
    expect(links.length).toBe(1)
    expect(links[0].getAttribute('href')).toBe('/admin')
    expect(links[0].textContent).toContain('Dashboard')
  })

  it('renders the four unbuilt items as non-interactive text carrying the marker', async () => {
    const { container } = await renderNav()
    const marked = [...container.querySelectorAll('span.admin-navitem')]
    expect(marked.length).toBe(4)
    for (const el of marked) {
      expect(el.textContent).toContain('NOT BUILT')
      expect(el.hasAttribute('href')).toBe(false)
      expect(el.hasAttribute('tabindex')).toBe(false)
      expect(el.getAttribute('role')).toBeNull()
    }
  })

  it('marks the active item and only the active item', async () => {
    const { container } = await renderNav()
    const active = container.querySelectorAll('.admin-navitem.is-active')
    expect(active.length).toBe(1)
    expect(active[0].textContent).toContain('Dashboard')
  })

  it('does not mark Dashboard active on another admin path', async () => {
    pathname.value = '/admin/orders'
    const { container } = await renderNav()
    expect(container.querySelectorAll('.admin-navitem.is-active').length).toBe(0)
  })

  // §11.3's Orders count pill is deferred (D8): a pill on a dead item
  // advertises a queue that cannot be opened.
  it('renders no count pill on the marked Orders item', async () => {
    const { container } = await renderNav()
    expect(container.textContent).not.toMatch(/Orders\s*\d/)
  })
})

describe('MarkedControl', () => {
  it('renders a marked button that is focusable and announced as disabled', async () => {
    const { MarkedButton } = await import('@/components/admin/MarkedControl')
    const { container } = render(<MarkedButton label="＋ Post a photo" />)
    const button = container.querySelector('button')
    expect(button?.getAttribute('aria-disabled')).toBe('true')
    // NOT the native attribute — that would remove it from the tab order, so
    // nobody navigating by keyboard would ever hear the marker.
    expect(button?.hasAttribute('disabled')).toBe(false)
    expect(button?.getAttribute('type')).toBe('button')
    expect(button?.textContent).toContain('＋ Post a photo')
    expect(button?.textContent).toContain('NOT BUILT')
  })

  it('renders a marked link as inert text, never as an anchor', async () => {
    const { MarkedLink } = await import('@/components/admin/MarkedControl')
    const { container } = render(<MarkedLink label="All orders →" />)
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).toContain('All orders →')
    expect(container.textContent).toContain('NOT BUILT')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/admin-nav.test.tsx`
Expected: FAIL — cannot resolve `@/components/admin/AdminNav`.

- [ ] **Step 3: Create `components/admin/MarkedControl.tsx`**

```tsx
/**
 * Controls whose action lands in a later slice.
 *
 * product.md §1: "a control's label must match what it does." These say they
 * do nothing, and they do nothing — the marker is real text content, never a
 * title, tooltip, or colour (design.md §11.1: status is never carried by
 * colour alone).
 *
 * NOT BUILT rather than SOON: "soon" claims a timeline nothing guarantees.
 */
const MARK = 'NOT BUILT'

/** For anything that would have been an <a>. Not a control at all. */
export function MarkedLink({ label, className }: { label: string; className?: string }) {
  return (
    <span className={className ? `admin-marked ${className}` : 'admin-marked'}>
      <span>{label}</span>
      <span className="admin-mark">{MARK}</span>
    </span>
  )
}

/**
 * For anything that would have been a <button>. aria-disabled rather than the
 * native attribute: `disabled` removes it from the tab order, so a keyboard
 * user never reaches it and never hears the marker — and the marker is the
 * whole point. A type="button" with no handler is inert regardless.
 */
export function MarkedButton({ label, className }: { label: string; className?: string }) {
  return (
    <button type="button" aria-disabled="true" className={className ?? 'admin-ghost'}>
      <span>{label}</span>
      <span className="admin-mark">{MARK}</span>
    </button>
  )
}
```

- [ ] **Step 4: Create `components/admin/AdminNav.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MarkedLink } from '@/components/admin/MarkedControl'

/**
 * Order is the PROTOTYPE's sidebar order — design.md §11.3 specifies item
 * styling but does not enumerate the items, and §11 says the prototype wins
 * where the section is silent.
 *
 * next/link, not a raw <a>: an anchor forces a full document navigation, which
 * discards the client router and makes every section change in slices 5-7 a
 * page reload.
 */
const ITEMS: { label: string; href: string | null }[] = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Photographs', href: null },   // slice 5
  { label: 'Collections', href: null },   // slice 6
  { label: 'Orders', href: null },        // slice 7
  { label: 'Home feature', href: null },  // slice 6
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Studio Admin">
      <ul className="admin-nav">
        {ITEMS.map(({ label, href }) => (
          <li key={label}>
            {href ? (
              <Link
                href={href}
                className={`admin-navitem${pathname === href ? ' is-active' : ''}`}
                aria-current={pathname === href ? 'page' : undefined}
              >
                <span className="admin-nb" aria-hidden="true" />
                {label}
              </Link>
            ) : (
              <span className="admin-navitem">
                <span className="admin-nb" aria-hidden="true" />
                <MarkedLink label={label} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
```

- [ ] **Step 5: Run the test and the static gate**

```bash
npx vitest run test/admin-nav.test.tsx
npm run typecheck
npm run lint
```

Expected: 8 tests PASS; 0 errors; 0 problems.

- [ ] **Step 6: Commit**

```bash
git add components/admin/MarkedControl.tsx components/admin/AdminNav.tsx test/admin-nav.test.tsx
git commit -m "feat(admin): nav with four marked items and the marked-control primitives" -m "A marked link is not a control at all — a span with no href, role or tabindex. A marked button keeps aria-disabled rather than the native attribute, because `disabled` removes it from the tab order and nobody navigating by keyboard would ever hear NOT BUILT, which is the honest-function payload. Item order comes from the prototype; §11.3 styles the items but does not enumerate them." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: The shell

**Files:**
- Create: `components/admin/AdminShell.tsx`
- Modify: `app/admin/(protected)/layout.tsx`
- Test: `test/admin-shell.test.tsx`

**Interfaces:**
- Consumes: `AdminNav` (Task 5), `SignOutButton` (4a), `requireAdmin` (4a).
- Produces: `AdminShell({ email, children })`

**The chip is an avatar beside a visible two-line lockup** — the prototype is more specific than §11.3's prose. The email is real visible text, not an `aria-label` (inconsistently exposed, and where it is exposed it *replaces* the visible text). It **will overflow** 242px, so it takes ellipsis plus a `title` carrying the full address.

- [ ] **Step 1: Write the failing test**

Create `test/admin-shell.test.tsx`:

```tsx
import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }))
vi.mock('@/lib/admin/auth-actions', () => ({ signOut: async () => {} }))

afterEach(cleanup)

async function renderShell(email = 'jonhoffmanbusiness@gmail.com') {
  const { AdminShell } = await import('@/components/admin/AdminShell')
  return render(<AdminShell email={email}><p>page body</p></AdminShell>)
}

describe('AdminShell', () => {
  it('renders the lockup and the nav', async () => {
    const { container } = await renderShell()
    expect(container.textContent).toContain('Jon Hoffman')
    expect(container.textContent).toContain('Studio Admin')
    expect(container.querySelector('.admin-nav')).not.toBeNull()
  })

  it('renders its children in main', async () => {
    const { container } = await renderShell()
    expect(container.querySelector('.admin-main')?.textContent).toContain('page body')
  })

  it('links to the live site safely, in a new tab', async () => {
    const { container } = await renderShell()
    const link = container.querySelector('.admin-livesite')
    expect(link?.getAttribute('href')).toBe('/')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toContain('noopener')
    expect(link?.getAttribute('rel')).toContain('noreferrer')
  })

  // D2 — §11.3 specifies the chip and "View live site" but no sign-out.
  // A GET sign-out is CSRF-able and gets fired by link prefetching.
  it('renders sign-out as a form button, never an anchor', async () => {
    const { container } = await renderShell()
    const button = container.querySelector('form button[type="submit"]')
    expect(button?.textContent).toContain('Sign out')
    expect(container.querySelector('a[href*="sign-out"]')).toBeNull()
  })

  it('shows the avatar initials and the real email as visible text', async () => {
    const { container } = await renderShell('jon@example.com')
    expect(container.querySelector('.admin-chip-avatar')?.textContent).toBe('JH')
    expect(container.querySelector('.admin-chip-email')?.textContent).toBe('jon@example.com')
  })

  // The email overflows 242px at 10px mono, so the truncated text must not be
  // the only copy of it.
  it('carries the full email in a title, since the visible one is ellipsised', async () => {
    const { container } = await renderShell('jonhoffmanbusiness@gmail.com')
    expect(container.querySelector('.admin-chip-email')?.getAttribute('title'))
      .toBe('jonhoffmanbusiness@gmail.com')
  })

  it('puts the sidebar and main inside a single card', async () => {
    const { container } = await renderShell()
    const card = container.querySelector('.admin-card')
    expect(card?.querySelector('.admin-sidebar')).not.toBeNull()
    expect(card?.querySelector('.admin-main')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/admin-shell.test.tsx`
Expected: FAIL — cannot resolve `@/components/admin/AdminShell`.

- [ ] **Step 3: Create `components/admin/AdminShell.tsx`**

```tsx
import Link from 'next/link'
import { AdminNav } from '@/components/admin/AdminNav'
import { SignOutButton } from '@/components/admin/SignOutButton'

function CloudMark() {
  return (
    <svg
      width="26" height="26" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M7 18h10a4 4 0 0 0 .5-7.98A5 5 0 0 0 7.5 8.5 4 4 0 0 0 7 18z" />
    </svg>
  )
}

/**
 * design.md §11.3 — 242px fixed sidebar + fluid main, inside one card.
 * Does no fetching: `email` is supplied by the caller, which has already
 * called requireAdmin().
 */
export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="admin-wrap">
      <div className="admin-card">
        <aside className="admin-sidebar">
          <div className="admin-lockup">
            <CloudMark />
            <div>
              <p className="admin-lockup-name">Jon Hoffman</p>
              <p className="admin-lockup-kicker">Studio Admin</p>
            </div>
          </div>

          <div className="admin-rule" />
          <AdminNav />

          <div className="admin-sidefoot">
            <Link
              href="/"
              className="admin-livesite"
              target="_blank"
              rel="noopener noreferrer"
            >
              View live site <span aria-hidden="true">↗</span>
            </Link>

            {/* D2 — §11.3 gives the chip and the live-site link but no way out. */}
            <SignOutButton />

            <div className="admin-chip">
              <div className="admin-chip-avatar" aria-hidden="true">JH</div>
              <div className="admin-chip-text">
                <div className="admin-chip-name">Jon Hoffman</div>
                {/* Visible, not an aria-label: aria-label is inconsistently
                    exposed and REPLACES the visible text where it is. */}
                <div className="admin-chip-email" title={email}>{email}</div>
              </div>
            </div>
          </div>
        </aside>

        <main className="admin-main">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Modify `app/admin/(protected)/layout.tsx`**

Replace the whole file. `requireAdmin()` is still called here — and still is not the boundary; it supplies the email and covers a direct page load. React `cache()` dedupes it with the page's own call.

```tsx
import { requireAdmin } from '@/lib/admin/require-admin'
import { AdminShell } from '@/components/admin/AdminShell'

// cookies() forces these routes dynamic anyway, but the CI build job runs with
// NO secrets — without this, whether `next build` survives would depend on
// statement ordering inside the client factory.
export const dynamic = 'force-dynamic'

/**
 * Calls requireAdmin() so a direct page load is guarded, but it is NOT the
 * boundary — layouts do not re-render on client-side navigation. The boundary
 * is requireAdmin() in the data-access layer (getDashboard calls it first).
 */
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin()
  return <AdminShell email={user.email ?? ''}>{children}</AdminShell>
}
```

- [ ] **Step 5: Run the tests and the static gate**

```bash
npx vitest run test/admin-shell.test.tsx test/admin-landing.test.tsx
npm run typecheck
npm run lint
```

Expected: 7 shell tests PASS. **4a's `admin-landing.test.tsx` must still pass** — it renders the page, not the layout, so wrapping the layout should not disturb it. If it fails, you changed the page rather than the layout.

- [ ] **Step 6: Commit**

```bash
git add components/admin/AdminShell.tsx "app/admin/(protected)/layout.tsx" test/admin-shell.test.tsx
git commit -m "feat(admin): the §11.3 shell — 242px sidebar, fluid main, one card" -m "The signed-in chip is an avatar beside a visible two-line lockup, per the prototype — not an avatar carrying a hidden label. The email is real text with a title, because it ellipsises at 242px and the truncated copy must not be the only one. Sign-out lands in the sidebar footer (D2): §11.3 gives the chip and the live-site link but no way out." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Stat tiles and queue rows

**Files:**
- Create: `components/admin/StatTile.tsx`, `components/admin/QueueRow.tsx`
- Test: `test/admin-tile-row.test.tsx`

**Interfaces:**
- Consumes: `formatPrice` (Task 1), `formatRowDate` (Task 2), `QueueOrder` (Task 3), `MarkedButton` (Task 5).
- Produces: `StatTile({ label, value, sub, alert? })`, `QueueRow({ order, held? })`

**D3 — the alert treatment is conditional.** The prototype's alert tile carries an alert border, a wash, an alert label **and** an alert sub: four alarm signals. Around a `0`, that is a status that does not reflect reality. `alert` is passed only when the count is greater than zero.

**D14 — the order id renders as a uuid prefix.** `§11.4-E`'s `JH-20260716-0042` has **no backing column** in `schema.sql`; deriving one from `created_at` plus an invented counter would fabricate an order number in the one field Jon uses to reconcile a row against Stripe.

- [ ] **Step 1: Write the failing test**

Create `test/admin-tile-row.test.tsx`:

```tsx
import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatTile } from '@/components/admin/StatTile'
import { QueueRow } from '@/components/admin/QueueRow'
import type { QueueOrder } from '@/lib/admin/dashboard'

afterEach(cleanup)

const ORDER: QueueOrder = {
  id: 'ab12cd34-5678-90ef-1234-567890abcdef',
  status: 'paid',
  created_at: '2026-07-16T20:00:00Z',
  customer_name: 'Maya Lindqvist',
  customer_email: 'maya@example.com',
  total_cents: 6500,
  amount_paid_cents: null,
  workCount: 2,
}

describe('StatTile', () => {
  it('renders the label, number and sub', () => {
    const { container } = render(<StatTile label="In the queue" value={3} sub="paid · awaiting the lab" />)
    expect(container.textContent).toContain('In the queue')
    expect(container.querySelector('.admin-tile-number')?.textContent).toBe('3')
    expect(container.textContent).toContain('paid · awaiting the lab')
  })

  // D3 — the prototype's alert tile has four alarm signals. Around a 0 that is
  // a status that does not reflect reality.
  it('applies the alert treatment only when asked', () => {
    const quiet = render(<StatTile label="Needs attention" value={0} sub="amount mismatch — quarantined" />)
    expect(quiet.container.querySelector('.admin-tile')?.className).not.toContain('is-alert')
    cleanup()
    const loud = render(<StatTile label="Needs attention" value={1} sub="amount mismatch — quarantined" alert />)
    expect(loud.container.querySelector('.admin-tile')?.className).toContain('is-alert')
  })

  it('writes its label in sentence case, leaving uppercasing to CSS', () => {
    const { container } = render(<StatTile label="In the queue" value={0} sub="x" />)
    expect(container.querySelector('.admin-tile-label')?.textContent).toBe('In the queue')
  })
})

describe('QueueRow', () => {
  it('renders id, customer, fused works-and-date sub-line, and the PAID chip', () => {
    const { container } = render(<QueueRow order={ORDER} />)
    expect(container.querySelector('.admin-row-id')?.textContent).toBe('ab12cd34')
    expect(container.textContent).toContain('Maya Lindqvist')
    expect(container.querySelector('.admin-row-sub')?.textContent).toBe('2 works · 16 Jul')
    expect(container.querySelector('.admin-paid')?.textContent).toBe('PAID')
  })

  // D14 — JH-20260716-0042 has no backing column; inventing one would
  // fabricate the number Jon reconciles against Stripe.
  it('renders a uuid prefix, never a fabricated JH- order number', () => {
    const { container } = render(<QueueRow order={ORDER} />)
    expect(container.textContent).not.toContain('JH-')
  })

  it('pluralises the works count', () => {
    const one = render(<QueueRow order={{ ...ORDER, workCount: 1 }} />)
    expect(one.container.querySelector('.admin-row-sub')?.textContent).toContain('1 work ')
    cleanup()
    const none = render(<QueueRow order={{ ...ORDER, workCount: 0 }} />)
    expect(none.container.querySelector('.admin-row-sub')?.textContent).toContain('0 works')
  })

  it('falls back to the email when customer_name is null', () => {
    const { container } = render(<QueueRow order={{ ...ORDER, customer_name: null }} />)
    expect(container.querySelector('.admin-row-name')?.textContent).toBe('maya@example.com')
  })

  it('renders Copy for lab as a marked control, not a live button', () => {
    const { container } = render(<QueueRow order={ORDER} />)
    const button = container.querySelector('button')
    expect(button?.getAttribute('aria-disabled')).toBe('true')
    expect(button?.textContent).toContain('Copy for lab')
    expect(button?.textContent).toContain('NOT BUILT')
  })

  it('quarantines a held row with the paid-vs-expected line, in that order', () => {
    const { container } = render(
      <QueueRow held order={{ ...ORDER, status: 'amount_mismatch', amount_paid_cents: 550 }} />,
    )
    expect(container.querySelector('.admin-queue-row')?.className).toContain('admin-held')
    expect(container.querySelector('.admin-mismatch')?.textContent).toBe('MISMATCH')
    // Inverting these turns the quarantine line into a lie about which number
    // is real.
    expect(container.querySelector('.admin-held-line')?.textContent).toBe('paid $5.50 · expected $65')
  })

  it('renders Review as a marked control on a held row', () => {
    const { container } = render(
      <QueueRow held order={{ ...ORDER, status: 'amount_mismatch', amount_paid_cents: 550 }} />,
    )
    expect(container.textContent).toContain('Review')
    expect(container.querySelector('button')?.getAttribute('aria-disabled')).toBe('true')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/admin-tile-row.test.tsx`
Expected: FAIL — cannot resolve `@/components/admin/StatTile`.

- [ ] **Step 3: Create `components/admin/StatTile.tsx`**

```tsx
/**
 * design.md §11.4-A. Labels are written in sentence case and uppercased by CSS
 * text-transform, so tests query sentence case.
 *
 * `alert` is conditional (D3): the prototype's alert variant carries a border,
 * a wash, an alert label AND an alert sub. Around a 0 that is four alarm
 * signals for a healthy console — a status that does not reflect reality.
 */
export function StatTile({
  label, value, sub, alert = false,
}: {
  label: string
  value: number
  sub: string
  alert?: boolean
}) {
  return (
    <div className={alert ? 'admin-tile is-alert' : 'admin-tile'}>
      <p className="admin-tile-label">{label}</p>
      <p className="admin-tile-number">{value}</p>
      <p className="admin-tile-sub">{sub}</p>
    </div>
  )
}
```

- [ ] **Step 4: Create `components/admin/QueueRow.tsx`**

```tsx
import { formatPrice } from '@/lib/format/price'
import { formatRowDate } from '@/lib/admin/dates'
import { MarkedButton } from '@/components/admin/MarkedControl'
import type { QueueOrder } from '@/lib/admin/dashboard'

/**
 * D14 — schema.sql has no order-number column. §11.4-E's JH-20260716-0042 is a
 * design fiction; deriving one from created_at plus an invented counter would
 * fabricate the field Jon uses to reconcile a row against Stripe.
 */
function shortId(id: string): string {
  return id.slice(0, 8)
}

export function QueueRow({ order, held = false }: { order: QueueOrder; held?: boolean }) {
  const works = `${order.workCount} ${order.workCount === 1 ? 'work' : 'works'}`
  const date = formatRowDate(new Date(order.created_at))

  return (
    <li className={held ? 'admin-queue-row admin-held' : 'admin-queue-row'}>
      <span className="admin-row-id">{shortId(order.id)}</span>

      <div>
        {/* customer_name is nullable in schema.sql. */}
        <div className="admin-row-name">{order.customer_name ?? order.customer_email}</div>
        <div className="admin-row-sub">{works} · {date}</div>
        {held ? (
          <div className="admin-held-line">
            paid {formatPrice(order.amount_paid_cents ?? 0)} · expected {formatPrice(order.total_cents)}
          </div>
        ) : null}
      </div>

      {held ? (
        // §11.1: every status carries a text label, never colour alone.
        <span className="admin-mismatch">MISMATCH</span>
      ) : (
        <span className="admin-paid">PAID</span>
      )}

      <MarkedButton label={held ? 'Review' : 'Copy for lab'} />
    </li>
  )
}
```

- [ ] **Step 5: Run the test and the static gate**

```bash
npx vitest run test/admin-tile-row.test.tsx
npm run typecheck
npm run lint
```

Expected: 10 tests PASS; 0 errors; 0 problems.

- [ ] **Step 6: Commit**

```bash
git add components/admin/StatTile.tsx components/admin/QueueRow.tsx test/admin-tile-row.test.tsx
git commit -m "feat(admin): stat tiles and queue rows" -m "The alert treatment is conditional (D3): the prototype's variant carries a border, wash, alert label and alert sub, which around a 0 is four alarm signals on a healthy console. The order id is a uuid prefix, not a fabricated JH- number (D14) — schema.sql has no such column and that field is what Jon reconciles against Stripe. The quarantine line's bindings are pinned: paid = amount_paid_cents, expected = total_cents." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: The dashboard

**Files:**
- Rewrite: `app/admin/(protected)/page.tsx`
- Test: `test/admin-dashboard.test.tsx`
- Delete: `test/admin-landing.test.tsx` (4a's placeholder test — the surface it covers no longer exists)

**Interfaces:**
- Consumes: everything from Tasks 1–7.

**D15 — mismatches render in their own `Held out of the queue` group.** `product.md §6.4` requires them surfaced, and `§11.4-A` puts the row inline — but `§11.4-D` achieves the separation with **tabs**, which `§11.4-A` has none of. Inline, a mismatch produces "In the queue: 0" directly above a visibly non-empty queue.

**Right-rail regions are data-driven, not hardcoded empty.** A string that is true only because nobody has inserted a row yet becomes a lie the first time slice 5 runs.

- [ ] **Step 1: Write the failing test**

Create `test/admin-dashboard.test.tsx`:

```tsx
import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardResult, QueueOrder } from '@/lib/admin/dashboard'

const result: { value: DashboardResult } = { value: { ok: false } }
vi.mock('@/lib/admin/dashboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/dashboard')>()),
  getDashboard: async () => result.value,
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }))

const NOW = new Date('2026-07-16T20:00:00Z') // 4pm EDT — "Good afternoon"

function order(over: Partial<QueueOrder> = {}): QueueOrder {
  return {
    id: 'ab12cd34-5678-90ef-1234-567890abcdef',
    status: 'paid', created_at: '2026-07-16T20:00:00Z',
    customer_name: 'Maya Lindqvist', customer_email: 'maya@example.com',
    total_cents: 6500, amount_paid_cents: null, workCount: 2, ...over,
  }
}
function ok(over: Partial<Extract<DashboardResult, { ok: true }>> = {}): DashboardResult {
  return {
    ok: true,
    summary: {
      queueCount: 0, attentionCount: 0, publishedCount: 0, unlistedCount: 0,
      collectionCount: 0, featuredCollectionName: null,
    },
    queue: [], held: [], ...over,
  }
}
async function renderDash() {
  const Page = (await import('@/app/admin/(protected)/page')).default
  return render(await Page())
}

afterEach(() => { cleanup(); result.value = { ok: false } })

describe('the dashboard', () => {
  it('renders four tiles with live numbers', async () => {
    result.value = ok({
      summary: { queueCount: 3, attentionCount: 1, publishedCount: 16, unlistedCount: 2, collectionCount: 3, featuredCollectionName: 'Relics' },
    })
    const { container } = await renderDash()
    const tiles = container.querySelectorAll('.admin-tile')
    expect(tiles.length).toBe(4)
    const numbers = [...container.querySelectorAll('.admin-tile-number')].map((n) => n.textContent)
    expect(numbers).toEqual(['3', '1', '16', '3'])
    expect(container.textContent).toContain('Relics is featured')
    expect(container.textContent).toContain('2 unlisted')
  })

  it('reports no featured collection honestly', async () => {
    result.value = ok()
    const { container } = await renderDash()
    expect(container.textContent).toContain('no collection is featured')
  })

  // D3
  it('leaves the attention tile quiet at zero and lights it above zero', async () => {
    result.value = ok()
    const quiet = await renderDash()
    expect(quiet.container.querySelectorAll('.admin-tile.is-alert').length).toBe(0)
    cleanup()
    result.value = ok({ summary: { ...ok().summary, attentionCount: 1 }, held: [order({ status: 'amount_mismatch', amount_paid_cents: 550 })] })
    const loud = await renderDash()
    expect(loud.container.querySelectorAll('.admin-tile.is-alert').length).toBe(1)
  })

  // D15 — the state that would otherwise read "In the queue: 0" directly above
  // a visibly non-empty queue.
  it('separates held rows from the queue so the count and the list agree', async () => {
    result.value = ok({
      summary: { ...ok().summary, queueCount: 0, attentionCount: 1 },
      queue: [],
      held: [order({ status: 'amount_mismatch', amount_paid_cents: 550 })],
    })
    const { container } = await renderDash()
    expect(container.textContent).toContain('Held out of the queue')
    expect(container.textContent).toContain('Nothing awaiting the lab.')
    expect(container.querySelectorAll('.admin-held').length).toBe(1)
  })

  it('omits the held section entirely when there is nothing held', async () => {
    result.value = ok({ queue: [order()], summary: { ...ok().summary, queueCount: 1 } })
    const { container } = await renderDash()
    expect(container.textContent).not.toContain('Held out of the queue')
  })

  it('renders the right rail empty states from data, not from assumption', async () => {
    result.value = ok()
    const { container } = await renderDash()
    expect(container.textContent).toContain('No collection leads home yet.')
    expect(container.textContent).toContain('No photographs yet.')
  })

  it('names the featured collection in the rail once one exists', async () => {
    result.value = ok({ summary: { ...ok().summary, collectionCount: 1, featuredCollectionName: 'Relics' } })
    const { container } = await renderDash()
    expect(container.querySelector('.admin-railcard-name')?.textContent).toBe('Relics')
    expect(container.textContent).not.toContain('No collection leads home yet.')
  })

  // D7 — four tiles reading 0 when the read failed is a confident lie about an
  // empty business.
  it('renders the unreadable state with no numbers at all', async () => {
    result.value = { ok: false }
    const { container } = await renderDash()
    expect(container.textContent).toContain('Couldn’t read the studio data.')
    expect(container.querySelectorAll('.admin-tile').length).toBe(0)
    expect(container.textContent).not.toContain('Nothing awaiting the lab.')
  })

  it('computes the greeting and the kicker server-side', async () => {
    result.value = ok()
    const { container } = await renderDash()
    expect(container.textContent).toContain('Good afternoon, Jon.')
    expect(container.textContent).toContain('Thursday · 16 July 2026')
  })

  it('marks every control whose action lands in a later slice', async () => {
    result.value = ok({ queue: [order()], summary: { ...ok().summary, queueCount: 1 } })
    const { container } = await renderDash()
    expect(container.textContent).toContain('＋ Post a photo')
    expect(container.textContent).toContain('All orders →')
    expect(container.textContent).toContain('Change what leads home →')
    // Every button on the surface is marked; none is live.
    const buttons = [...container.querySelectorAll('button')]
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) expect(b.getAttribute('aria-disabled')).toBe('true')
  })
})
```

> **The page reads the real clock**, so the greeting/kicker assertion needs it frozen. Add this to the test file — `toFake: ['Date']` freezes `new Date()` without touching timers, so `await Page()` is unaffected:
>
> ```ts
> import { beforeEach } from 'vitest'
>
> beforeEach(() => {
>   vi.useFakeTimers({ toFake: ['Date'] })
>   vi.setSystemTime(NOW)
> })
> ```
>
> and `vi.useRealTimers()` inside the existing `afterEach`. Do not give the page a `now` prop to work around this — a Next page component receives `params`/`searchParams`, not arbitrary props, and a test-only parameter on a route entry point is the wrong seam.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/admin-dashboard.test.tsx`
Expected: FAIL — the page still renders 4a's placeholder.

- [ ] **Step 3: Rewrite `app/admin/(protected)/page.tsx`**

```tsx
import { getDashboard } from '@/lib/admin/dashboard'
import { formatKicker, greetingFor } from '@/lib/admin/dates'
import { StatTile } from '@/components/admin/StatTile'
import { QueueRow } from '@/components/admin/QueueRow'
import { MarkedButton, MarkedLink } from '@/components/admin/MarkedControl'

function unlistedSub(n: number): string {
  if (n === 0) return 'none unlisted'
  return `${n} unlisted`
}

export default async function AdminDashboard() {
  // getDashboard() calls requireAdmin() as its first statement — the boundary
  // lives there, not in the layout.
  const result = await getDashboard()
  const now = new Date()

  return (
    <>
      <div className="admin-band">
        <div>
          <p className="admin-band-kicker">{formatKicker(now)}</p>
          <h1 className="admin-band-h1">{greetingFor(now)}</h1>
        </div>
        <MarkedButton label="＋ Post a photo" className="admin-btn admin-marked" />
      </div>

      {!result.ok ? (
        // D7 — four tiles reading 0 when the read failed is a confident lie
        // about an empty business. No numbers, and no empty-state copy either,
        // because that would also be a claim.
        <div className="admin-tiles">
          <p className="admin-empty">
            Couldn&rsquo;t read the studio data. The numbers aren&rsquo;t shown rather than guessed.
          </p>
        </div>
      ) : (
        <>
          <div className="admin-tiles">
            <StatTile label="In the queue" value={result.summary.queueCount} sub="paid · awaiting the lab" />
            <StatTile
              label="Needs attention"
              value={result.summary.attentionCount}
              sub="amount mismatch — quarantined"
              alert={result.summary.attentionCount > 0}
            />
            <StatTile
              label="Published works"
              value={result.summary.publishedCount}
              sub={unlistedSub(result.summary.unlistedCount)}
            />
            <StatTile
              label="Collections"
              value={result.summary.collectionCount}
              sub={
                result.summary.featuredCollectionName
                  ? `${result.summary.featuredCollectionName} is featured`
                  : 'no collection is featured'
              }
            />
          </div>

          <div className="admin-cols">
            <section>
              <h2 className="admin-sectionhead">
                Fulfillment queue · oldest first
                <MarkedLink label="All orders →" />
              </h2>
              <ul className="admin-queue">
                {result.queue.length === 0 ? (
                  <li className="admin-empty">Nothing awaiting the lab.</li>
                ) : (
                  result.queue.map((order) => <QueueRow key={order.id} order={order} />)
                )}
              </ul>

              {/* D15 — §11.4-A has no tabs, so an inline mismatch row would
                  contradict the tile count directly above it. */}
              {result.held.length > 0 ? (
                <>
                  <h2 className="admin-sectionhead">Held out of the queue</h2>
                  <ul className="admin-queue">
                    {result.held.map((order) => <QueueRow key={order.id} order={order} held />)}
                  </ul>
                </>
              ) : null}
            </section>

            <aside className="admin-rail">
              <div className="admin-railcard">
                <h2 className="admin-sectionhead">
                  Home focal point
                  <MarkedLink label="Change what leads home →" />
                </h2>
                {result.summary.featuredCollectionName ? (
                  // No plate: cover_photo_id is nullable and no derivative
                  // pipeline exists until slice 5.
                  <p className="admin-railcard-name">{result.summary.featuredCollectionName}</p>
                ) : (
                  <p className="admin-empty">No collection leads home yet.</p>
                )}
              </div>

              <div className="admin-railcard">
                <h2 className="admin-sectionhead">Recent uploads</h2>
                {result.summary.publishedCount + result.summary.unlistedCount === 0 ? (
                  <p className="admin-empty">No photographs yet.</p>
                ) : (
                  <ul className="admin-uploads">
                    <li className="admin-upload">Plates arrive in slice 5</li>
                  </ul>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </>
  )
}
```

- [ ] **Step 4: Delete 4a's placeholder test**

```bash
git rm test/admin-landing.test.tsx
```

It asserted the placeholder's contents ("claims nothing — no stats, no counts"), which the dashboard deliberately contradicts. Its guard-propagation case is covered by `test/admin-dashboard-data.test.ts`'s "calls requireAdmin before touching the database".

- [ ] **Step 5: Run the tests and the static gate**

```bash
npx vitest run test/admin-dashboard.test.tsx
npm run typecheck
npm run lint
```

Expected: 10 tests PASS; 0 errors; 0 problems.

- [ ] **Step 6: Commit**

```bash
git add "app/admin/(protected)/page.tsx" test/admin-dashboard.test.tsx
git commit -m "feat(admin): the §11.4-A dashboard on live counts" -m "Mismatches get their own 'Held out of the queue' group (D15): §11.4-A has no tabs, so an inline mismatch row would put 'In the queue: 0' directly above a visibly non-empty queue. Right-rail empty states are derived from data rather than hardcoded, so they do not become lies the first time slice 5 inserts a row. A failed read renders no numbers at all (D7)." -m "Removes 4a's placeholder test, whose surface no longer exists." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: The full gate and the docs

**Files:**
- Modify: `CLAUDE.md`
- Create: `.superpowers/sdd/progress.md` entry (git-ignored scratch — create if absent)

- [ ] **Step 1: Run the full gate**

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: lint 0 problems; typecheck 0 errors; build succeeds **with no env vars set**; all tests pass.

New tests this slice: 3 + 6 + 12 + 8 + 8 + 7 + 10 + 10 = **64**, minus 4a's 4 deleted landing tests = **+60**. Against 4a's ~1623 that is roughly **1683**. **Read the real total off the output** — do not copy this number.

If the build fails on a missing env var, `force-dynamic` is missing from `app/admin/(protected)/layout.tsx`.

- [ ] **Step 2: Update `CLAUDE.md`**

**(a)** Replace the test-count line (4a set it; update the number to this run's real total):

```
| test | `npm test` | all green (**<TOTAL>** tests as of slice 4b) |
```

**(b)** Replace this line in the directory tree (4a added it):

```
      page.tsx                 # /admin — placeholder (slice 4b: §11.4-A dashboard)
```

with:

```
      page.tsx                 # /admin — §11.4-A dashboard on live counts
```

**(c)** Add to the `lib/` block of the tree, after the admin line 4a added:

```
  admin/{dashboard,dates}.ts   # pure summarize() + guarded read; zone-explicit formatters
  format/price.ts              # priceForSize / priceRangeLabel / formatPrice (shared)
```

**(d)** In the Roadmap section, replace the slice-4 line with:

```
- **Slice 4 — Admin foundation: DONE.** 4a shipped auth (`proxy.ts`, `requireAdmin()` in the DAL, sign-in, the `[data-admin]` token scope); 4b shipped the `§11.3` shell and the `§11.4-A` dashboard on live counts. Ingest is slice 5, collections slice 6, orders + lab export slice 7.
```

- [ ] **Step 3: Record the follow-ups**

Append to `.superpowers/sdd/progress.md` (create the file if it does not exist):

```markdown
## Slice 4 follow-ups (carried, not done)

- **`design.md §11` write-back.** D1, D2, D6, D10, D11, D12, D13 and the §6.0 focus
  treatment are recorded only in the slice-4a/4b specs. Until they are written into §11,
  a later reader takes §11.1's `--faint: .42` as current and "corrects" the token —
  `test/admin-tokens.test.ts`'s contrast assertion is the only thing stopping them.
- **`JH-YYYYMMDD-NNNN` order ids** (D14) have no backing column. 4b renders a uuid
  prefix; slice 7's lab export prints one on a sheet a human pastes into Nations' order
  form, so it needs a real decision.
- **`§11.4-H` mobile admin** supersedes 4b's `<900px` stacking fallback (D9).
- **Orders count pill** (D8) lands with slice 7.
- **Derivative plates** in the right rail land with slice 5 — 4b renders names only.
- **SC 2.2.2 pause mechanism** for `softpulse` (D12's accepted risk).
- **Supabase FREE tier** (`product.md §1.5`) — the documented way the last database died.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md .superpowers/sdd/progress.md
git commit -m "docs(slice-4b): update CLAUDE.md and record the carried follow-ups" -m "The design.md §11 write-back is the one worth watching: until D1/D2/D6/D10/D11/D12/D13 land in §11, a later reader takes §11.1's --faint .42 as current and the contrast assertion is the only thing stopping the revert." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done — and what is NOT done

Slice 4b is complete when the four gate commands are green.

**Report back with:** the real `npm test` total, confirmation that `npm run build` passed with no env vars, and `git status`.

**Not done, deliberately — do not attempt:**

- **Ingest, collections editing, the orders surface, the lab export.** Slices 5–7. Every control for them renders marked.
- **Derivative images.** No plate renders anywhere in 4b.
- **The `design.md §11` write-back** — recorded as a follow-up in Step 3.
- **Any SQL, and the spec's §9.2 manual verification.** Jon's.
