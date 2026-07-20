# Slice 3 — Cart + Checkout Final Visual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dress the money path in the storefront's visual voice across three surfaces — a slide-in cart drawer (§12.5-F), a two-column checkout with a live quote (§12.5-G), and an honest order-confirmation receipt (§12.5-H) — without touching any money code.

**Architecture:** React Context holds the cart (identity-merged lines + drawer open/close state) and persists to `localStorage`. A new pure `previewQuote` mirrors the server's `computeOrderAmounts` for a live checkout quote — it is a display mirror, never a second price authority. The confirmation page is a server component reading via the service key and rendering a frozen `order_items` snapshot (text rows, no thumbnail). The `POST /api/checkout` body and all pricing code are unchanged.

**Tech Stack:** Next.js 16 (App Router, React 19, TypeScript strict), Vitest 2 + @testing-library/react 16 (jsdom for `.tsx`, node for `.ts`), CSS custom properties in `app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-07-19-cart-checkout-visual-design.md` (read it — every task traces to a section there).

## Global Constraints

Every task's requirements implicitly include this section.

- **The money code is UNTOUCHED.** Do not modify `lib/pricing.ts`, `lib/checkout/build.ts`, `lib/checkout/schema.ts`, `app/api/checkout/route.ts`, `app/api/stripe-webhook/route.ts`, or `lib/orders/reconcile.ts`. The server is the sole price authority. The `/api/checkout` POST body stays exactly `{ items:[{photoId,size,register,qty}], customer:{email,name}, shippingAddress:{name,street,city,region,postalCode,country} }`. `previewQuote` mirrors pricing for display only.
- **Branch:** work on `slice-3` (already created off `origin/develop`). NEVER commit to `develop` or `main`. Never use `--no-verify`, `--force`, or bypass hooks.
- **Commit trailer:** every commit ends with a second `-m` body line: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (this is a fixed repo convention — keep it verbatim).
- **Tests — no jest-dom.** This repo has NO `@testing-library/jest-dom`. Use only Vitest + @testing-library/react: `.toBeTruthy()`, `.toBeNull()`, `.toEqual()`, `.toMatchObject()`, `.toHaveProperty('disabled', true)`, `container.querySelector(...)`, `element.getAttribute(...)`, `element.textContent`, `screen.getByRole/getByText/getByLabelText/queryBy.../findBy...`. Do NOT use `.toBeInTheDocument()` / `.toBeVisible()` / `.toBeDisabled()`.
- **Test file extension decides the environment.** `test/**/*.test.tsx` runs in **jsdom** (needed for rendering). `test/**/*.test.ts` runs in **node** (fine for pure functions). Name files accordingly.
- **`@/` alias = repo root.** In any test that renders `Plate`, set `process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'` in `beforeAll` (Plate reads it to build derivative URLs).
- **DB is snake_case.** Orders/`order_items` are service-key only. No order data in `localStorage`, ever — the cart persists only the selection.
- **Design tokens (already in `app/globals.css`):** colors `--paper --ink --dim --faint --hair --btnbg --btnink`; fonts `--font-playfair --font-mono --font-newsreader --font-hanken`. A global `:focus-visible` ink ring and a global `prefers-reduced-motion` reset already exist — new interactive elements inherit both automatically; do not re-declare them per component.
- **Per-step verification is mandatory.** Run the exact command shown and confirm the stated expected result before moving on. Commands are given one per line (the executor's shell may be PowerShell, which lacks `&&`).

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `components/cart/CartContext.tsx` | MODIFY — richer `CartLine`, identity merge, `remove`/`setQty`, drawer state, tolerant rehydrate | 1 |
| `components/cart/AddToCart.tsx` | DELETE — orphaned slice-1 leftover (no importers) | 1 |
| `lib/format/quote.ts` | NEW — pure `previewQuote` mirroring `computeOrderAmounts` | 2 |
| `components/store/Header.tsx` | MODIFY — cart count = Σ qty; "Cart (N)" becomes a button → `open()` | 3 |
| `components/product/ProductInteractive.tsx` | MODIFY — pass `slug`+`altText` into `add()`; announce "Added" | 4 |
| `components/cart/CartDrawer.tsx` | NEW — §12.5-F slide-in drawer | 5 |
| `app/(store)/layout.tsx` | MODIFY — mount `<CartDrawer/>` | 5 |
| `app/(store)/checkout/page.tsx` | REWRITE — §12.5-G two-column, labeled fields, live quote | 6 |
| `app/(store)/order/[id]/page.tsx` | REWRITE — §12.5-H expanded read + `order_items` + honest states | 7 |
| `app/globals.css` | MODIFY (append) — drawer / checkout / confirmation classes | 5,6,7 |

Dependency order: 1 → 2 → 3 → 4 → 5 → 6 → 7.

---

### Task 1: CartContext — identity model, mutations, drawer state, tolerant rehydrate

**Files:**
- Modify: `components/cart/CartContext.tsx`
- Delete: `components/cart/AddToCart.tsx`
- Test: `test/cart-context.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type CartLine = { photoId: string; slug: string; title: string; altText: string; size: string; register: 'colour' | 'silver'; qty: number }
  export function lineKey(l: Pick<CartLine, 'photoId' | 'size' | 'register'>): string
  export function CartProvider(props: { children: React.ReactNode }): JSX.Element
  export function useCart(): {
    lines: CartLine[]
    count: number                              // Σ qty
    add: (l: CartLine) => void                 // merges by lineKey, clamps merged qty ≤ 100
    remove: (key: string) => void
    setQty: (key: string, n: number) => void   // clamps 1..100
    clear: () => void
    isOpen: boolean
    open: () => void
    close: () => void
  }
  ```

- [ ] **Step 1: Write the failing test** — create `test/cart-context.test.tsx`:

```tsx
import { renderHook, act, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CartProvider, useCart, lineKey, type CartLine } from '@/components/cart/CartContext'

const line = (over: Partial<CartLine> = {}): CartLine => ({
  photoId: 'p1', slug: 'a-photo', title: 'A Photo', altText: 'A photo of something',
  size: '8x10', register: 'colour', qty: 1, ...over,
})

const wrapper = ({ children }: { children: React.ReactNode }) => <CartProvider>{children}</CartProvider>

afterEach(() => { cleanup(); localStorage.clear() })

describe('CartContext', () => {
  it('merges identical (photoId,size,register) lines and bumps qty', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => { result.current.add(line()) })
    act(() => { result.current.add(line()) })
    expect(result.current.lines).toHaveLength(1)
    expect(result.current.lines[0].qty).toBe(2)
  })

  it('keeps different size/register as separate lines', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => { result.current.add(line()) })
    act(() => { result.current.add(line({ size: '4x6' })) })
    act(() => { result.current.add(line({ register: 'silver' })) })
    expect(result.current.lines).toHaveLength(3)
  })

  it('count is the sum of quantities', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => { result.current.add(line()) })
    act(() => { result.current.add(line({ size: '4x6' })) })
    act(() => { result.current.setQty(lineKey(line()), 3) })
    expect(result.current.count).toBe(4)
  })

  it('setQty clamps to 1..100', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => { result.current.add(line()) })
    const k = lineKey(line())
    act(() => { result.current.setQty(k, 0) })
    expect(result.current.lines[0].qty).toBe(1)
    act(() => { result.current.setQty(k, 250) })
    expect(result.current.lines[0].qty).toBe(100)
  })

  it('add clamps a merged qty to 100', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => { result.current.add(line()) })
    act(() => { result.current.setQty(lineKey(line()), 99) })
    act(() => { result.current.add(line({ qty: 5 })) })
    expect(result.current.lines[0].qty).toBe(100)
  })

  it('remove drops the line', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => { result.current.add(line()) })
    act(() => { result.current.remove(lineKey(line())) })
    expect(result.current.lines).toHaveLength(0)
  })

  it('open/close toggles drawer state', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    expect(result.current.isOpen).toBe(false)
    act(() => { result.current.open() })
    expect(result.current.isOpen).toBe(true)
    act(() => { result.current.close() })
    expect(result.current.isOpen).toBe(false)
  })

  it('persists to localStorage and rehydrates', () => {
    const { result, unmount } = renderHook(() => useCart(), { wrapper })
    act(() => { result.current.add(line({ qty: 2 })) })
    unmount()
    const { result: r2 } = renderHook(() => useCart(), { wrapper })
    expect(r2.current.lines).toHaveLength(1)
    expect(r2.current.lines[0].qty).toBe(2)
  })

  it('tolerantly rehydrates a legacy line missing slug/altText', () => {
    localStorage.setItem('cart:v1', JSON.stringify([{ photoId: 'p1', title: 'Old', size: '8x10', register: 'colour', qty: 2 }]))
    const { result } = renderHook(() => useCart(), { wrapper })
    expect(result.current.lines).toHaveLength(1)
    expect(result.current.lines[0]).toMatchObject({ photoId: 'p1', slug: '', altText: '', qty: 2 })
  })

  it('drops corrupt storage without crashing', () => {
    localStorage.setItem('cart:v1', '{not json')
    const { result } = renderHook(() => useCart(), { wrapper })
    expect(result.current.lines).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/cart-context.test.tsx`
Expected: FAIL — `lineKey` / `count` / `remove` / `setQty` / `open` are not exported yet.

- [ ] **Step 3: Replace `components/cart/CartContext.tsx` with the full implementation**

```tsx
'use client'
import { createContext, useContext, useEffect, useState } from 'react'

export type CartLine = {
  photoId: string
  slug: string
  title: string
  altText: string
  size: string
  register: 'colour' | 'silver'
  qty: number
}

const MAX_QTY = 100
const STORAGE_KEY = 'cart:v1'

export function lineKey(l: Pick<CartLine, 'photoId' | 'size' | 'register'>): string {
  return `${l.photoId}|${l.size}|${l.register}`
}

function clampQty(n: number): number {
  return Math.min(MAX_QTY, Math.max(1, Math.trunc(n)))
}

// Tolerant rehydrate: corrupt/non-array storage → empty; per-line coercion with defaults so a
// legacy slice-1 line (no slug/altText) degrades instead of crashing.
function parseStored(raw: string | null): CartLine[] {
  if (!raw) return []
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(parsed)) return []
  const out: CartLine[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.photoId !== 'string' || typeof o.size !== 'string') continue
    if (o.register !== 'colour' && o.register !== 'silver') continue
    if (typeof o.qty !== 'number' || !Number.isFinite(o.qty) || o.qty < 1) continue
    out.push({
      photoId: o.photoId,
      slug: typeof o.slug === 'string' ? o.slug : '',
      title: typeof o.title === 'string' ? o.title : '',
      altText: typeof o.altText === 'string' ? o.altText : '',
      size: o.size,
      register: o.register,
      qty: clampQty(o.qty),
    })
  }
  return out
}

type CartValue = {
  lines: CartLine[]
  count: number
  add: (l: CartLine) => void
  remove: (key: string) => void
  setQty: (key: string, n: number) => void
  clear: () => void
  isOpen: boolean
  open: () => void
  close: () => void
}

const Ctx = createContext<CartValue | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [isOpen, setIsOpen] = useState(false)

  // Read localStorage after mount so the first client render matches the SSR (empty) markup — no
  // hydration mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLines(parseStored(localStorage.getItem(STORAGE_KEY))) }, [])
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(lines)) }, [lines])

  function add(line: CartLine) {
    const key = lineKey(line)
    setLines((prev) => {
      const idx = prev.findIndex((l) => lineKey(l) === key)
      if (idx === -1) return [...prev, { ...line, qty: clampQty(line.qty) }]
      const next = [...prev]
      next[idx] = { ...next[idx], qty: Math.min(MAX_QTY, next[idx].qty + line.qty) }
      return next
    })
  }
  function remove(key: string) {
    setLines((prev) => prev.filter((l) => lineKey(l) !== key))
  }
  function setQty(key: string, n: number) {
    const q = clampQty(n)
    setLines((prev) => prev.map((l) => (lineKey(l) === key ? { ...l, qty: q } : l)))
  }
  function clear() { setLines([]) }

  const count = lines.reduce((sum, l) => sum + l.qty, 0)

  return (
    <Ctx.Provider
      value={{
        lines, count, add, remove, setQty, clear,
        isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false),
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useCart() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useCart outside provider')
  return c
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/cart-context.test.tsx`
Expected: PASS — all 10 tests green.

- [ ] **Step 5: Delete the orphaned `AddToCart.tsx` and confirm nothing imports it**

Run: `git grep -n "AddToCart" -- "*.ts" "*.tsx"`
Expected: NO matches in `components/` or `app/` (only this plan/spec docs may match). Then:

Run: `git rm components/cart/AddToCart.tsx`

- [ ] **Step 6: Run the static gate**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm test`
Expected: all green (existing `test/product-interactive.test.tsx` still passes — it uses `toMatchObject`, unaffected by the new `slug`/`altText` fields).

- [ ] **Step 7: Commit**

```bash
git add components/cart/CartContext.tsx test/cart-context.test.tsx
git commit -m "feat(cart): identity-merged cart with remove/setQty, drawer state, tolerant rehydrate" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: previewQuote — pure checkout quote mirror

**Files:**
- Create: `lib/format/quote.ts`
- Test: `test/quote.test.ts`

**Interfaces:**
- Consumes: `computeOrderAmounts` from `@/lib/pricing`, `priceForSize` from `@/lib/format/price` (both client-safe: `lib/pricing.ts` has no `server-only` import and is already used inside client components via `lib/format/price.ts`).
- Produces:
  ```ts
  export type QuoteLine = { size: string; qty: number; title?: string }
  export type QuoteDest = { country: string; region: string }
  export type Quote =
    | { complete: true; subtotal: number; shipping: number; tax: number; total: number }
    | { complete: false; subtotal: number }
  export function previewQuote(lines: QuoteLine[], dest: QuoteDest): Quote
  ```

- [ ] **Step 1: Write the failing test** — create `test/quote.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { previewQuote } from '@/lib/format/quote'
import { computeOrderAmounts } from '@/lib/pricing'

const lines = [{ size: '8x10', qty: 2 }] // 2 * 1500 = 3000 subtotal

describe('previewQuote', () => {
  it('returns an exact quote for a complete US address', () => {
    const q = previewQuote(lines, { country: 'US', region: 'CA' })
    expect(q.complete).toBe(true)
    if (q.complete) {
      expect(q.subtotal).toBe(3000)
      expect(q.shipping).toBe(995)
      expect(q.tax).toBe(Math.round(3000 * 0.0825))
      expect(q.total).toBe(3000 + 995 + Math.round(3000 * 0.0825))
    }
  })

  it('returns subtotal-only for a US address with no region', () => {
    expect(previewQuote(lines, { country: 'US', region: '' })).toEqual({ complete: false, subtotal: 3000 })
  })

  it('quotes a non-US address at the flat international rate', () => {
    const q = previewQuote(lines, { country: 'GB', region: '' })
    expect(q.complete).toBe(true)
    if (q.complete) {
      expect(q.tax).toBe(Math.round(3000 * 0.12))
      expect(q.shipping).toBe(995)
    }
  })

  it('uses the 6% fallback for an unknown US state code', () => {
    const q = previewQuote(lines, { country: 'US', region: 'ZZ' })
    expect(q.complete).toBe(true)
    if (q.complete) expect(q.tax).toBe(Math.round(3000 * 0.06))
  })

  it('is subtotal-only for an empty cart', () => {
    expect(previewQuote([], { country: 'US', region: 'CA' })).toEqual({ complete: false, subtotal: 0 })
  })

  it('mirrors computeOrderAmounts exactly for the same inputs', () => {
    const dest = { country: 'US', region: 'NY' }
    const a = computeOrderAmounts(lines.map((l) => ({ size: l.size, qty: l.qty })), dest)
    const q = previewQuote(lines, dest)
    expect(q).toMatchObject({ complete: true, subtotal: a.subtotal, shipping: a.shipping, tax: a.tax, total: a.total })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/quote.test.ts`
Expected: FAIL — cannot import `previewQuote` (module missing).

- [ ] **Step 3: Create `lib/format/quote.ts`**

```ts
import { computeOrderAmounts } from '@/lib/pricing'
import { priceForSize } from '@/lib/format/price'

export type QuoteLine = { size: string; qty: number; title?: string }
export type QuoteDest = { country: string; region: string }
export type Quote =
  | { complete: true; subtotal: number; shipping: number; tax: number; total: number }
  | { complete: false; subtotal: number }

// A DISPLAY MIRROR of the server's pricing — never a second price authority. Feeds
// computeOrderAmounts the same inputs the checkout route feeds it; on the throw path (e.g. a US
// address with no region) it degrades to a subtotal-only quote. subtotal is always knowable.
export function previewQuote(lines: QuoteLine[], dest: QuoteDest): Quote {
  const subtotal = lines.reduce((sum, l) => sum + priceForSize(l.size) * l.qty, 0)
  try {
    const a = computeOrderAmounts(
      lines.map((l) => ({ size: l.size, qty: l.qty, name: l.title })),
      { country: dest.country, region: dest.region },
    )
    return { complete: true, subtotal: a.subtotal, shipping: a.shipping, tax: a.tax, total: a.total }
  } catch {
    return { complete: false, subtotal }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/quote.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Static gate + commit**

Run: `npm run typecheck`
Run: `npm run lint`

```bash
git add lib/format/quote.ts test/quote.test.ts
git commit -m "feat(checkout): previewQuote, a pure display mirror of computeOrderAmounts" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Header — cart count = Σ qty, "Cart (N)" opens the drawer

**Files:**
- Modify: `components/store/Header.tsx`
- Test: `test/header.test.tsx`

**Interfaces:**
- Consumes: `useCart().count`, `useCart().open` (Task 1).

- [ ] **Step 1: Write the failing test** — create `test/header.test.tsx`:

```tsx
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CartProvider, useCart } from '@/components/cart/CartContext'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { Header } from '@/components/store/Header'

function DrawerProbe() {
  const { isOpen } = useCart()
  return <span data-testid="open">{isOpen ? 'yes' : 'no'}</span>
}
function Seeder() {
  const { add } = useCart()
  return (
    <button onClick={() => add({ photoId: 'p1', slug: 's', title: 't', altText: 'a', size: '8x10', register: 'colour', qty: 3 })}>
      seed
    </button>
  )
}

afterEach(() => { cleanup(); localStorage.clear() })

function setup() {
  return render(
    <ThemeProvider>
      <CartProvider>
        <Header />
        <Seeder />
        <DrawerProbe />
      </CartProvider>
    </ThemeProvider>,
  )
}

describe('Header', () => {
  it('shows the cart count as the sum of quantities', () => {
    setup()
    expect(screen.getByRole('button', { name: /Cart \(0\)/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'seed' }))
    expect(screen.getByRole('button', { name: /Cart \(3\)/ })).toBeTruthy()
  })

  it('opens the drawer when the cart button is clicked', () => {
    setup()
    expect(screen.getByTestId('open').textContent).toBe('no')
    fireEvent.click(screen.getByRole('button', { name: /Cart \(0\)/ }))
    expect(screen.getByTestId('open').textContent).toBe('yes')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/header.test.tsx`
Expected: FAIL — there is no `button` named "Cart (N)" yet (it is a `Link`), and the count reads `lines.length`.

- [ ] **Step 3: Edit `components/store/Header.tsx`**

Change the cart hook read. Replace:

```tsx
  const { lines } = useCart()
  const cartCount = lines.length
```

with:

```tsx
  const { count, open } = useCart()
```

Replace the cart nav `Link`:

```tsx
          <Link href="/checkout" style={styles.navLink}>
            Cart ({cartCount})
          </Link>
```

with a button (keep it visually identical to the nav links):

```tsx
          <button type="button" onClick={open} style={styles.cartBtn}>
            Cart ({count})
          </button>
```

Add a `cartBtn` entry to the `styles` object (a button reset that matches `navLink`):

```tsx
  cartBtn: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--ink)',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
  },
```

(`Link` is still used by the wordmark and the Prints/Collections/Contact items — keep its import.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/header.test.tsx`
Expected: PASS — both tests green.

- [ ] **Step 5: Static gate + commit**

Run: `npm run typecheck`
Run: `npm run lint`

```bash
git add components/store/Header.tsx test/header.test.tsx
git commit -m "feat(header): cart count is sum of qty; Cart button opens the drawer" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: ProductInteractive — snapshot slug/altText into add(); announce "Added"

**Files:**
- Modify: `components/product/ProductInteractive.tsx`
- Test: `test/product-interactive.test.tsx` (add two `it` blocks to the existing file)

**Interfaces:**
- Consumes: `useCart().add` (now expects `slug` + `altText` on the line).

- [ ] **Step 1: Add two failing tests** to the existing `describe('ProductInteractive', ...)` in `test/product-interactive.test.tsx` (append before the closing `})` of the describe):

```tsx
  it('includes slug and altText snapshot in the added line', () => {
    renderWithCart(photoWithBw)
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }))
    const cart = JSON.parse(screen.getByTestId('cart').textContent!)
    expect(cart[0]).toMatchObject({ slug: 'test-photo', altText: 'A test photograph' })
  })

  it('announces an Added confirmation after adding', () => {
    renderWithCart(photoWithBw)
    expect(screen.queryByText(/added to your selection/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }))
    expect(screen.getByText(/added to your selection/i)).toBeTruthy()
  })
```

- [ ] **Step 2: Run the test to verify the new cases fail**

Run: `npx vitest run test/product-interactive.test.tsx`
Expected: the two new tests FAIL (no `slug`/`altText` on the line; no "Added" text). Existing tests still pass.

- [ ] **Step 3: Edit `components/product/ProductInteractive.tsx`**

3a. Add `useEffect` to the React import at the top:

```tsx
import { useEffect, useState } from 'react'
```

3b. Add "added" state inside the component, just after the existing `const { add } = useCart()`:

```tsx
  const [addedAt, setAddedAt] = useState(0)
  const added = addedAt > 0
  useEffect(() => {
    if (addedAt === 0) return
    const t = setTimeout(() => setAddedAt(0), 2500)
    return () => clearTimeout(t)
  }, [addedAt])
```

3c. Update the Add-to-cart `onClick` to snapshot `slug`/`altText` and trigger the confirmation. Replace:

```tsx
        onClick={() =>
          add({ photoId: photo.id, title: photo.title, size, register, qty: 1 })
        }
```

with:

```tsx
        onClick={() => {
          add({
            photoId: photo.id,
            slug: photo.slug,
            title: photo.title,
            altText: photo.alt_text ?? '',
            size,
            register,
            qty: 1,
          })
          setAddedAt((n) => n + 1)
        }}
```

3d. Add the live-region confirmation immediately AFTER the closing `</button>` of the add-to-cart button (before the `<style>` block):

```tsx
      <p className="added-confirm" role="status" aria-live="polite">
        {added ? 'Added to your selection.' : ''}
      </p>
```

3e. Add styling for `.added-confirm` inside the existing `<style>{`...`}</style>` block (append before the closing backtick):

```css
        .added-confirm {
          min-height: 1.25rem;
          margin: 0;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--dim);
        }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/product-interactive.test.tsx`
Expected: PASS — all tests green (the six originals plus the two new ones).

- [ ] **Step 5: Static gate + commit**

Run: `npm run typecheck`
Run: `npm run lint`

```bash
git add components/product/ProductInteractive.tsx test/product-interactive.test.tsx
git commit -m "feat(product): snapshot slug/altText into cart; announce Added via aria-live" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: CartDrawer (§12.5-F) + mount + drawer CSS

**Files:**
- Create: `components/cart/CartDrawer.tsx`
- Modify: `app/(store)/layout.tsx`
- Modify: `app/globals.css` (append drawer classes)
- Test: `test/cart-drawer.test.tsx`

**Interfaces:**
- Consumes: `useCart()` (`lines`, `count`, `isOpen`, `close`, `remove`, `setQty`), `lineKey` (Task 1); `Plate` (`@/components/store/Plate`); `priceForSize` (`@/lib/format/price`).

- [ ] **Step 1: Write the failing test** — create `test/cart-drawer.test.tsx`:

```tsx
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { CartProvider, useCart, type CartLine } from '@/components/cart/CartContext'
import { CartDrawer } from '@/components/cart/CartDrawer'

beforeAll(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co' })
afterEach(() => { cleanup(); localStorage.clear() })

const line = (over: Partial<CartLine> = {}): CartLine => ({
  photoId: 'p1', slug: 'a-photo', title: 'A Photo', altText: 'alt', size: '8x10', register: 'colour', qty: 1, ...over,
})

function Harness({ seed }: { seed: CartLine[] }) {
  const { add, open } = useCart()
  return <button onClick={() => { seed.forEach(add); open() }}>boot</button>
}
function setup(seed: CartLine[] = []) {
  const utils = render(
    <CartProvider>
      <Harness seed={seed} />
      <CartDrawer />
    </CartProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'boot' }))
  return utils
}

describe('CartDrawer', () => {
  it('renders nothing until opened', () => {
    render(<CartProvider><CartDrawer /></CartProvider>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a labelled modal dialog when open', () => {
    setup([line()])
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
  })

  it('moves focus into the dialog (the Close button) on open', () => {
    setup([line()])
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close')
  })

  it('shows an honest empty state', () => {
    setup([])
    expect(screen.getByText(/your selection is empty/i)).toBeTruthy()
  })

  it('renders a row per line with title and line price', () => {
    setup([line(), line({ size: '4x6', title: 'Second' })]) // $15 and $5, subtotal $20
    expect(screen.getByText('A Photo')).toBeTruthy()
    expect(screen.getByText('Second')).toBeTruthy()
    expect(screen.getByText('$15')).toBeTruthy()
    expect(screen.getByText('$5')).toBeTruthy()
    expect(screen.getByText('$20')).toBeTruthy()
  })

  it('increments and decrements quantity with the stepper', () => {
    setup([line({ qty: 2 })])
    const stepper = screen.getByRole('group', { name: /quantity for/i })
    fireEvent.click(within(stepper).getByRole('button', { name: 'Increase quantity' }))
    expect(within(stepper).getByText('3')).toBeTruthy()
    fireEvent.click(within(stepper).getByRole('button', { name: 'Decrease quantity' }))
    fireEvent.click(within(stepper).getByRole('button', { name: 'Decrease quantity' }))
    expect(within(stepper).getByText('1')).toBeTruthy() // clamped at 1
  })

  it('removes a line', () => {
    setup([line()])
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByText(/your selection is empty/i)).toBeTruthy()
  })

  it('shows subtotal only — no shipping/tax/total line (D1/D2)', () => {
    setup([line({ qty: 2 })])
    expect(screen.getByText('Subtotal')).toBeTruthy()
    expect(screen.getByText(/calculated at checkout/i)).toBeTruthy()
    expect(screen.queryByText(/^total$/i)).toBeNull()
    expect(screen.queryByText(/^tax$/i)).toBeNull()
    expect(screen.queryByText(/^shipping$/i)).toBeNull()
  })

  it('closes on Escape', () => {
    setup([line()])
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/cart-drawer.test.tsx`
Expected: FAIL — `CartDrawer` module does not exist.

- [ ] **Step 3: Create `components/cart/CartDrawer.tsx`**

```tsx
'use client'
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useCart, lineKey } from '@/components/cart/CartContext'
import { Plate } from '@/components/store/Plate'
import { priceForSize } from '@/lib/format/price'

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`
}

export function CartDrawer() {
  const { lines, count, isOpen, close, remove, setQty } = useCart()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const opener = document.activeElement as HTMLElement | null // restore focus here on close (F6)
    closeRef.current?.focus()                                    // move focus INTO the dialog on open
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return }
      if (e.key !== 'Tab') return
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
      if (!nodes || nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
      opener?.focus?.() // return focus to the opener on close
    }
  }, [isOpen, close])

  if (!isOpen) return null

  const subtotal = lines.reduce((sum, l) => sum + priceForSize(l.size) * l.qty, 0)

  return (
    <div className="drawer-root">
      <div className="drawer-backdrop" onClick={close} aria-hidden="true" />
      <div className="drawer-panel" role="dialog" aria-modal="true" aria-label="Your selection" ref={panelRef}>
        <header className="drawer-head">
          <span className="drawer-title">Your selection · {count} {count === 1 ? 'work' : 'works'}</span>
          <button ref={closeRef} type="button" className="drawer-close" aria-label="Close" onClick={close}>✕</button>
        </header>

        {lines.length === 0 ? (
          <p className="drawer-empty">Your selection is empty.</p>
        ) : (
          <ul className="drawer-list">
            {lines.map((l) => {
              const key = lineKey(l)
              return (
                <li key={key} className="drawer-row">
                  <div className="drawer-thumb">
                    <Plate
                      photo={{ slug: l.slug, alt_text: l.altText, width_px: null, height_px: null, aspect_ratio: 0.8 }}
                      register={l.register}
                      sizes="76px"
                    />
                  </div>
                  <div className="drawer-meta">
                    <p className="drawer-row-title">{l.title}</p>
                    <p className="drawer-row-sub">{l.size} · {l.register}</p>
                    <div className="drawer-stepper" role="group" aria-label={`Quantity for ${l.title}, ${l.size}`}>
                      <button type="button" aria-label="Decrease quantity" onClick={() => setQty(key, l.qty - 1)}>−</button>
                      <span aria-live="polite">{l.qty}</span>
                      <button type="button" aria-label="Increase quantity" onClick={() => setQty(key, l.qty + 1)}>+</button>
                    </div>
                  </div>
                  <div className="drawer-line-right">
                    <span className="drawer-price">{formatPrice(priceForSize(l.size) * l.qty)}</span>
                    <button type="button" className="drawer-remove" onClick={() => remove(key)}>Remove</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <footer className="drawer-foot">
          <div className="drawer-subtotal">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <p className="drawer-note">Shipping &amp; tax calculated at checkout.</p>
          <Link href="/checkout" className="drawer-checkout" onClick={close}>Review &amp; checkout →</Link>
        </footer>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Mount the drawer in `app/(store)/layout.tsx`** — replace the whole file:

```tsx
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { CartProvider } from '@/components/cart/CartContext'
import { Header } from '@/components/store/Header'
import { CartDrawer } from '@/components/cart/CartDrawer'

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <CartProvider>
        <Header />
        {children}
        <CartDrawer />
      </CartProvider>
    </ThemeProvider>
  )
}
```

- [ ] **Step 5: Append the drawer CSS to `app/globals.css`** (add at the end of the file):

```css
/* --- Cart drawer (§12.5-F) --- */
.drawer-root { position: fixed; inset: 0; z-index: 50; }
.drawer-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(2px); }
.drawer-panel {
  position: absolute; top: 0; right: 0; height: 100%;
  width: min(456px, 100vw);
  background: var(--paper); color: var(--ink);
  border-left: 1px solid var(--hair);
  box-shadow: -8px 0 40px rgba(0, 0, 0, 0.35);
  display: flex; flex-direction: column;
  animation: drawer-in 0.2s ease;
}
@keyframes drawer-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
.drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--hair); }
.drawer-title { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dim); }
.drawer-close { min-width: 44px; min-height: 44px; background: transparent; border: none; color: var(--ink); font-size: 1rem; cursor: pointer; }
.drawer-empty { padding: 2rem 1.5rem; font-family: var(--font-newsreader); color: var(--dim); }
.drawer-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; }
.drawer-row { display: grid; grid-template-columns: 76px 1fr auto; gap: 1rem; padding: 1rem 1.5rem; border-bottom: 1px solid var(--hair); }
.drawer-thumb { width: 76px; }
.drawer-thumb img { width: 76px; height: auto; display: block; }
.drawer-row-title { font-family: var(--font-playfair); font-size: 1rem; margin: 0; }
.drawer-row-sub { font-family: var(--font-mono); font-size: 0.6875rem; color: var(--dim); margin: 0.25rem 0 0.5rem; text-transform: uppercase; letter-spacing: 0.04em; }
.drawer-stepper { display: inline-flex; align-items: center; gap: 0.25rem; border: 1px solid var(--hair); border-radius: 2px; }
.drawer-stepper button { min-width: 44px; min-height: 44px; background: transparent; border: none; color: var(--ink); cursor: pointer; font-size: 1rem; }
.drawer-stepper span { min-width: 1.5rem; text-align: center; font-family: var(--font-mono); }
.drawer-line-right { display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; }
.drawer-price { font-family: var(--font-mono); }
.drawer-remove { background: transparent; border: none; color: var(--dim); cursor: pointer; font-family: var(--font-mono); font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.25rem 0; }
.drawer-foot { padding: 1.25rem 1.5rem; border-top: 1px solid var(--hair); }
.drawer-subtotal { display: flex; justify-content: space-between; font-family: var(--font-playfair); font-size: 1.125rem; }
.drawer-note { font-family: var(--font-mono); font-size: 0.6875rem; color: var(--dim); margin: 0.5rem 0 1rem; }
.drawer-checkout {
  display: block; text-align: center; text-decoration: none;
  background: var(--btnbg); color: var(--btnink);
  padding: 0.875rem; border-radius: 5px;
  font-family: var(--font-mono); font-size: 0.8125rem; letter-spacing: 0.04em; text-transform: uppercase;
}
```

(The existing global `@media (prefers-reduced-motion: reduce)` rule neutralizes `drawer-in`, so the panel appears in place with no slide under reduced motion — no per-component media query needed.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run test/cart-drawer.test.tsx`
Expected: PASS — all 10 tests green.

- [ ] **Step 7: Static gate + commit**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm test`
Expected: all green.

```bash
git add components/cart/CartDrawer.tsx app/(store)/layout.tsx app/globals.css test/cart-drawer.test.tsx
git commit -m "feat(cart): slide-in drawer with stepper, subtotal-only footer, focus trap" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Checkout (§12.5-G) — labeled form, live quote, unchanged POST

**Files:**
- Rewrite: `app/(store)/checkout/page.tsx`
- Modify: `app/globals.css` (append checkout classes)
- Test: `test/checkout.test.tsx`

**Interfaces:**
- Consumes: `useCart().lines` (Task 1), `previewQuote` (Task 2), `priceForSize` (`@/lib/format/price`).
- Preserves: the exact POST body (see Global Constraints).

- [ ] **Step 1: Write the failing test** — create `test/checkout.test.tsx`:

```tsx
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CartProvider } from '@/components/cart/CartContext'
import Checkout from '@/app/(store)/checkout/page'

const SEED = [{ photoId: 'p1', slug: 's', title: 'A Photo', altText: 'a', size: '8x10', register: 'colour', qty: 2 }]

beforeEach(() => { localStorage.setItem('cart:v1', JSON.stringify(SEED)) })
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

function fillValidAddress() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'buyer@example.com' } })
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Buyer' } })
  fireEvent.change(screen.getByLabelText('Street'), { target: { value: '1 Rd' } })
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'LA' } })
  fireEvent.change(screen.getByLabelText('State / Region'), { target: { value: 'CA' } })
  fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: '90001' } })
}

describe('Checkout', () => {
  it('shows subtotal-only until the address is complete, then the full quote', async () => {
    render(<CartProvider><Checkout /></CartProvider>)
    await screen.findByText(/A Photo/)
    expect(screen.getByText(/calculated once your address is complete/i)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('State / Region'), { target: { value: 'CA' } })
    expect(screen.queryByText(/calculated once your address is complete/i)).toBeNull()
    expect(screen.getByText('Total')).toBeTruthy()
  })

  it('disables Pay until the form is valid and the cart is non-empty', async () => {
    render(<CartProvider><Checkout /></CartProvider>)
    await screen.findByText(/A Photo/)
    const pay = () => screen.getByRole('button', { name: /pay with stripe/i })
    expect(pay()).toHaveProperty('disabled', true)
    fillValidAddress()
    expect(pay()).toHaveProperty('disabled', false)
  })

  it('POSTs only {photoId,size,register,qty} per item — no slug/altText leak (F5)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'stop' }) }))
    vi.stubGlobal('fetch', fetchMock)
    render(<CartProvider><Checkout /></CartProvider>)
    await screen.findByText(/A Photo/)
    fillValidAddress()
    fireEvent.click(screen.getByRole('button', { name: /pay with stripe/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sent.items).toEqual([{ photoId: 'p1', size: '8x10', register: 'colour', qty: 2 }])
    expect(Object.keys(sent.items[0]).sort()).toEqual(['photoId', 'qty', 'register', 'size'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/checkout.test.tsx`
Expected: FAIL — the current checkout has no labeled fields (`getByLabelText` fails) and no quote note.

- [ ] **Step 3: Rewrite `app/(store)/checkout/page.tsx`** — replace the whole file:

```tsx
'use client'
import { useMemo, useState } from 'react'
import { useCart } from '@/components/cart/CartContext'
import { previewQuote } from '@/lib/format/quote'
import { priceForSize } from '@/lib/format/price'

const COUNTRIES: [string, string][] = [
  ['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'], ['DE', 'Germany'],
]

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`
}
function emailValid(e: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) }

type Fields = { email: string; name: string; street: string; city: string; region: string; postalCode: string; country: string }
const EMPTY: Fields = { email: '', name: '', street: '', city: '', region: '', postalCode: '', country: 'US' }

export default function Checkout() {
  const { lines } = useCart()
  const [f, setF] = useState<Fields>(EMPTY)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [err, setErr] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }))
  const blur = (k: keyof Fields) => () => setTouched((p) => ({ ...p, [k]: true }))

  const quote = useMemo(
    () => previewQuote(lines.map((l) => ({ size: l.size, qty: l.qty, title: l.title })), { country: f.country, region: f.region }),
    [lines, f.country, f.region],
  )

  const requiredText: (keyof Fields)[] = ['name', 'street', 'city', 'postalCode']
  const usNeedsRegion = f.country === 'US'
  const formValid =
    emailValid(f.email) &&
    requiredText.every((k) => f[k].trim() !== '') &&
    (!usNeedsRegion || f.region.trim() !== '') &&
    f.country.trim() !== ''
  const canPay = formValid && lines.length > 0 && !submitting

  async function pay() {
    setErr(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: lines.map((l) => ({ photoId: l.photoId, size: l.size, register: l.register, qty: l.qty })),
          customer: { email: f.email, name: f.name },
          shippingAddress: { name: f.name, street: f.street, city: f.city, region: f.region, postalCode: f.postalCode, country: f.country },
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error ?? 'Checkout failed'); setSubmitting(false); return }
      window.location.href = json.url
    } catch {
      setErr('Checkout failed'); setSubmitting(false)
    }
  }

  return (
    <main className="checkout">
      <h1 className="checkout-h1">Checkout</h1>
      <div className="checkout-cols">
        <form className="checkout-form" onSubmit={(e) => { e.preventDefault(); if (canPay) pay() }}>
          <fieldset className="checkout-field-group">
            <legend>Contact</legend>
            <label className="field"><span>Email</span>
              <input type="email" value={f.email} onChange={set('email')} onBlur={blur('email')} autoComplete="email" />
            </label>
            {touched.email && !emailValid(f.email) && <p role="alert" className="field-error">Enter a valid email address.</p>}
          </fieldset>

          <fieldset className="checkout-field-group">
            <legend>Ship to</legend>
            <label className="field"><span>Full name</span>
              <input value={f.name} onChange={set('name')} onBlur={blur('name')} autoComplete="name" /></label>
            {touched.name && f.name.trim() === '' && <p role="alert" className="field-error">Name is required.</p>}
            <label className="field"><span>Street</span>
              <input value={f.street} onChange={set('street')} onBlur={blur('street')} autoComplete="address-line1" /></label>
            {touched.street && f.street.trim() === '' && <p role="alert" className="field-error">Street is required.</p>}
            <label className="field"><span>City</span>
              <input value={f.city} onChange={set('city')} onBlur={blur('city')} autoComplete="address-level2" /></label>
            {touched.city && f.city.trim() === '' && <p role="alert" className="field-error">City is required.</p>}
            <label className="field"><span>State / Region</span>
              <input value={f.region} onChange={set('region')} onBlur={blur('region')} autoComplete="address-level1" /></label>
            {touched.region && usNeedsRegion && f.region.trim() === '' && <p role="alert" className="field-error">Region is required for US destinations.</p>}
            <label className="field"><span>Postal code</span>
              <input value={f.postalCode} onChange={set('postalCode')} onBlur={blur('postalCode')} autoComplete="postal-code" /></label>
            {touched.postalCode && f.postalCode.trim() === '' && <p role="alert" className="field-error">Postal code is required.</p>}
            <label className="field"><span>Country</span>
              <select value={f.country} onChange={set('country')}>
                {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select></label>
          </fieldset>
        </form>

        <aside className="checkout-summary" aria-label="Order summary">
          <ul className="summary-lines">
            {lines.map((l) => (
              <li key={`${l.photoId}|${l.size}|${l.register}`}>
                <span>{l.title} · {l.size} · {l.register} × {l.qty}</span>
                <span>{formatPrice(priceForSize(l.size) * l.qty)}</span>
              </li>
            ))}
          </ul>
          <dl className="summary-totals">
            <div><dt>Subtotal</dt><dd>{formatPrice(quote.subtotal)}</dd></div>
            {quote.complete ? (
              <>
                <div><dt>Shipping</dt><dd>{formatPrice(quote.shipping)}</dd></div>
                <div><dt>Tax</dt><dd>{formatPrice(quote.tax)}</dd></div>
                <div className="summary-total"><dt>Total</dt><dd>{formatPrice(quote.total)}</dd></div>
              </>
            ) : (
              <p className="summary-note">Shipping &amp; tax calculated once your address is complete.</p>
            )}
          </dl>
          {err && <p role="alert" className="checkout-error">{err}</p>}
          <button type="button" className="checkout-pay" onClick={pay} disabled={!canPay}>Pay with Stripe →</button>
          <p className="checkout-secure">Secure payment on Stripe&rsquo;s page · card never touches this site.</p>
        </aside>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Append the checkout CSS to `app/globals.css`** (at the end of the file):

```css
/* --- Checkout (§12.5-G) --- */
.checkout { max-width: 1000px; margin: 0 auto; padding: 2rem 1.5rem; }
.checkout-h1 { font-family: var(--font-playfair); font-weight: 400; }
.checkout-cols { display: grid; grid-template-columns: 1fr; gap: 2rem; }
@media (min-width: 720px) { .checkout-cols { grid-template-columns: 1.4fr 1fr; align-items: start; } }
.checkout-field-group { border: 1px solid var(--hair); border-radius: 5px; padding: 1.25rem; margin: 0 0 1.5rem; }
.checkout-field-group legend { font-family: var(--font-mono); font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--dim); padding: 0 0.5rem; }
.field { display: block; margin: 0 0 0.875rem; }
.field span { display: block; font-family: var(--font-mono); font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dim); margin-bottom: 0.375rem; }
.field input, .field select { width: 100%; min-height: 44px; padding: 0.625rem 0.75rem; background: var(--paper); color: var(--ink); border: 1px solid var(--hair); border-radius: 3px; font-family: var(--font-hanken), system-ui, sans-serif; font-size: 1rem; }
.field-error { color: var(--ink); background: rgba(200, 60, 60, 0.12); font-family: var(--font-mono); font-size: 0.6875rem; padding: 0.375rem 0.5rem; margin: -0.5rem 0 0.875rem; border-radius: 3px; }
.checkout-summary { border: 1px solid var(--hair); border-radius: 5px; padding: 1.25rem; position: sticky; top: 1rem; }
.summary-lines { list-style: none; margin: 0 0 1rem; padding: 0; }
.summary-lines li { display: flex; justify-content: space-between; gap: 1rem; font-family: var(--font-mono); font-size: 0.8125rem; padding: 0.375rem 0; border-bottom: 1px solid var(--hair); }
.summary-totals { margin: 0; }
.summary-totals div { display: flex; justify-content: space-between; padding: 0.25rem 0; font-family: var(--font-mono); font-size: 0.875rem; }
.summary-totals dt, .summary-totals dd { margin: 0; }
.summary-totals .summary-total { font-family: var(--font-playfair); font-size: 1.125rem; border-top: 1px solid var(--hair); margin-top: 0.5rem; padding-top: 0.5rem; }
.summary-note { font-family: var(--font-mono); font-size: 0.6875rem; color: var(--dim); }
.checkout-pay { display: block; width: 100%; margin-top: 1rem; padding: 0.875rem; background: var(--btnbg); color: var(--btnink); border: none; border-radius: 5px; font-family: var(--font-mono); font-size: 0.8125rem; letter-spacing: 0.04em; text-transform: uppercase; cursor: pointer; }
.checkout-pay:disabled { opacity: 0.45; cursor: not-allowed; }
.checkout-secure { font-family: var(--font-mono); font-size: 0.625rem; color: var(--dim); text-align: center; margin: 0.75rem 0 0; }
.checkout-error { color: var(--ink); background: rgba(200, 60, 60, 0.12); font-family: var(--font-mono); font-size: 0.75rem; padding: 0.5rem; border-radius: 3px; }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/checkout.test.tsx`
Expected: PASS — all 3 tests green.

- [ ] **Step 6: Guard the money contract — the existing route test must still pass**

Run: `npx vitest run test/checkout-route.test.ts`
Expected: PASS (unchanged — this task did not touch `app/api/checkout/route.ts`).

- [ ] **Step 7: Static gate + commit**

Run: `npm run typecheck`
Run: `npm run lint`

```bash
git add "app/(store)/checkout/page.tsx" app/globals.css test/checkout.test.tsx
git commit -m "feat(checkout): two-column labeled form with live previewQuote; POST body unchanged" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Confirmation (§12.5-H) — expanded read, order_items snapshot, honest states

**Files:**
- Rewrite: `app/(store)/order/[id]/page.tsx`
- Modify: `app/globals.css` (append confirmation classes)
- Test: `test/order-confirmation.test.tsx`

**Interfaces:**
- Consumes: `supabaseAdmin` (`@/lib/supabase/admin`) — service-key read. Two queries: `orders` (`.select(...).eq('id', id).single()`) and `order_items` (`.select(...).eq('order_id', id)`).

- [ ] **Step 1: Write the failing test** — create `test/order-confirmation.test.tsx`:

```tsx
import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state: { order: unknown; items: unknown[] } = { order: null, items: [] }

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          table === 'orders'
            ? { single: async () => ({ data: state.order }) }
            : Promise.resolve({ data: state.items }),
      }),
    }),
  }),
}))

const ORDER = {
  id: 'order-abc', status: 'paid', created_at: '2026-07-19T00:00:00Z',
  customer_name: 'Buyer', customer_email: 'b@e.com',
  shipping_address: { name: 'Buyer', street: '1 Rd', city: 'LA', region: 'CA', postal_code: '90001', country: 'US' },
  subtotal_cents: 3000, shipping_cents: 995, tax_cents: 248, total_cents: 4243,
}
const ITEMS = [{ title: 'A Photo', size: '8x10', register: 'colour', qty: 2, unit_cents: 1500 }]

async function renderConfirm(id = 'order-abc') {
  const Page = (await import('@/app/(store)/order/[id]/page')).default
  return render(await Page({ params: Promise.resolve({ id }) }))
}

afterEach(() => { cleanup(); state.order = null; state.items = [] })

describe('OrderConfirmation', () => {
  it('renders a thank-you and the ship-window note for a paid order', async () => {
    state.order = { ...ORDER, status: 'paid' }; state.items = ITEMS
    const { container } = await renderConfirm()
    expect(container.textContent).toContain('Thank you.')
    expect(container.textContent).toContain('made to order')
  })

  it('shows works as text rows with snapshot prices and NO image (D4)', async () => {
    state.order = { ...ORDER }; state.items = ITEMS
    const { container } = await renderConfirm()
    expect(container.textContent).toContain('A Photo')
    expect(container.textContent).toContain('8x10')
    expect(container.textContent).toContain('$30') // 1500 * 2, from the snapshot
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders the stored shipping address', async () => {
    state.order = { ...ORDER }; state.items = ITEMS
    const { container } = await renderConfirm()
    expect(container.textContent).toContain('1 Rd')
    expect(container.textContent).toContain('90001')
  })

  it('treats amount_mismatch as active but never claims paid or promises shipping (F2/F3)', async () => {
    state.order = { ...ORDER, status: 'amount_mismatch' }; state.items = ITEMS
    const { container } = await renderConfirm()
    expect(container.textContent).toContain('Thank you.')
    expect(container.textContent).toContain('reviewing it')
    expect(container.textContent).not.toContain('made to order')
  })

  it('shows an update heading and no ship-window for a cancelled order', async () => {
    state.order = { ...ORDER, status: 'cancelled' }; state.items = ITEMS
    const { container } = await renderConfirm()
    expect(container.textContent).toContain('Order update')
    expect(container.textContent).toContain('cancelled')
    expect(container.textContent).not.toContain('made to order')
  })

  it('renders a not-found message when the order is missing', async () => {
    state.order = null
    const { container } = await renderConfirm('nope')
    expect(container.textContent).toContain('find that order')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/order-confirmation.test.tsx`
Expected: FAIL — the current page has no `order_items` query, no "made to order" / "Your works" / address rendering.

- [ ] **Step 3: Rewrite `app/(store)/order/[id]/page.tsx`** — replace the whole file:

```tsx
import { supabaseAdmin } from '@/lib/supabase/admin'

type OrderStatus = 'pending' | 'paid' | 'amount_mismatch' | 'submitted_to_lab' | 'shipped' | 'cancelled' | 'refunded'

type Order = {
  id: string
  status: OrderStatus
  created_at: string
  customer_name: string | null
  customer_email: string
  shipping_address: { name?: string; street?: string; city?: string; region?: string; postal_code?: string; country?: string }
  subtotal_cents: number
  shipping_cents: number
  tax_cents: number
  total_cents: number
}
type Item = { title: string; size: string; register: string; qty: number; unit_cents: number }

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`
}

// Honest status map (product.md §1). Active = not cancelled/refunded. The ship-window promise is
// gated to payment-confirmed states; pending/amount_mismatch get the reviewing note and never a
// 'paid' claim or a shipment.
const PAYMENT_CONFIRMED: OrderStatus[] = ['paid', 'submitted_to_lab', 'shipped']

function noteFor(status: OrderStatus): string {
  if (status === 'cancelled') return 'This order was cancelled.'
  if (status === 'refunded') return 'This order was refunded.'
  if (PAYMENT_CONFIRMED.includes(status)) {
    return 'Every print is made to order and typically ships within 5–7 days. Your receipt comes from Stripe. — Jon'
  }
  return 'We’ve received your order and are reviewing it. Your receipt comes from Stripe. — Jon'
}

export default async function OrderConfirmation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = supabaseAdmin()
  const { data: order } = await db
    .from('orders')
    .select('id, status, created_at, customer_name, customer_email, shipping_address, subtotal_cents, shipping_cents, tax_cents, total_cents')
    .eq('id', id)
    .single()

  if (!order) {
    return <main className="confirm"><p className="confirm-notfound">We couldn&rsquo;t find that order.</p></main>
  }

  const o = order as Order
  const { data: itemsData } = await db
    .from('order_items')
    .select('title, size, register, qty, unit_cents')
    .eq('order_id', id)
  const items = (itemsData ?? []) as Item[]

  const active = o.status !== 'cancelled' && o.status !== 'refunded'
  const a = o.shipping_address ?? {}

  return (
    <main className="confirm">
      <p className="confirm-id">{o.id}</p>
      <h1 className="confirm-h1">{active ? 'Thank you.' : 'Order update'}</h1>
      <p className="confirm-note">{noteFor(o.status)}</p>

      <div className="confirm-cells">
        <section className="confirm-cell">
          <h2 className="confirm-cell-h">Shipping to</h2>
          <address className="confirm-address">
            {a.name && <span>{a.name}</span>}
            {a.street && <span>{a.street}</span>}
            <span>{[a.city, a.region, a.postal_code].filter(Boolean).join(', ')}</span>
            {a.country && <span>{a.country}</span>}
          </address>
        </section>

        <section className="confirm-cell">
          <h2 className="confirm-cell-h">Your works</h2>
          <ul className="confirm-works">
            {items.map((it, i) => (
              <li key={i}>
                <span>{it.title} · {it.size} · {it.register} × {it.qty}</span>
                <span>{formatPrice(it.unit_cents * it.qty)}</span>
              </li>
            ))}
          </ul>
          <dl className="confirm-totals">
            <div><dt>Subtotal</dt><dd>{formatPrice(o.subtotal_cents)}</dd></div>
            <div><dt>Shipping</dt><dd>{formatPrice(o.shipping_cents)}</dd></div>
            <div><dt>Tax</dt><dd>{formatPrice(o.tax_cents)}</dd></div>
            <div className="confirm-total"><dt>Total</dt><dd>{formatPrice(o.total_cents)}</dd></div>
          </dl>
        </section>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Append the confirmation CSS to `app/globals.css`** (at the end of the file):

```css
/* --- Confirmation (§12.5-H) --- */
.confirm { max-width: 720px; margin: 0 auto; padding: 3rem 1.5rem; text-align: center; }
.confirm-id { font-family: var(--font-mono); font-size: 0.6875rem; color: var(--dim); letter-spacing: 0.06em; }
.confirm-h1 { font-family: var(--font-playfair); font-weight: 400; font-size: clamp(2.5rem, 8vw, 4.75rem); margin: 0.5rem 0 1rem; }
.confirm-note { font-family: var(--font-newsreader); font-size: 1.0625rem; color: var(--ink); max-width: 34rem; margin: 0 auto 2.5rem; }
.confirm-notfound { font-family: var(--font-newsreader); }
.confirm-cells { display: grid; grid-template-columns: 1fr; gap: 1.5rem; text-align: left; }
@media (min-width: 640px) { .confirm-cells { grid-template-columns: 1fr 1fr; } }
.confirm-cell { border: 1px solid var(--hair); border-radius: 5px; padding: 1.25rem; }
.confirm-cell-h { font-family: var(--font-mono); font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--dim); margin: 0 0 0.75rem; }
.confirm-address { font-style: normal; font-family: var(--font-newsreader); }
.confirm-address span { display: block; }
.confirm-works { list-style: none; margin: 0 0 1rem; padding: 0; }
.confirm-works li { display: flex; justify-content: space-between; gap: 1rem; font-family: var(--font-mono); font-size: 0.8125rem; padding: 0.375rem 0; border-bottom: 1px solid var(--hair); }
.confirm-totals div { display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 0.8125rem; padding: 0.2rem 0; }
.confirm-totals dt, .confirm-totals dd { margin: 0; }
.confirm-totals .confirm-total { font-family: var(--font-playfair); font-size: 1.0625rem; border-top: 1px solid var(--hair); margin-top: 0.4rem; padding-top: 0.4rem; }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/order-confirmation.test.tsx`
Expected: PASS — all 6 tests green.

- [ ] **Step 6: Full static gate**

Run: `npm run typecheck`
Run: `npm run lint`
Run: `npm test`
Run: `npm run build`
Expected: all green. `npm run build` needs no secrets (clients are lazy); confirm it completes.

- [ ] **Step 7: Commit**

```bash
git add "app/(store)/order/[id]/page.tsx" app/globals.css test/order-confirmation.test.tsx
git commit -m "feat(order): honest confirmation receipt — order_items snapshot, gated states, no thumbnail" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (manual — after all tasks)

The static gate is necessary but not sufficient (repo rule: evidence before assertions). Do a real browser pass against the slice-2 seed:

1. Run: `npm run dev`
2. On a product page, click **Add to cart** twice for the same size → header count reads **2** (Σ qty), and an "Added to your selection." line appears.
3. Click the header **Cart (N)** → drawer slides in; verify: stepper +/− (clamped at 1), Remove, the **subtotal-only** footer with "Shipping & tax calculated at checkout.", Esc closes, backdrop click closes, focus lands in the drawer.
4. **Review & checkout →** → the summary shows **subtotal only** with "…calculated once your address is complete."; fill a US address with a state → the quote flips to subtotal/shipping/tax/**total**; **Pay** enables only once every field is valid.
5. Resize to 375px → the drawer is full-width, checkout and confirmation stack, hit targets stay ≥44px.
6. Load `/order/<id>` for a paid order → "Thank you.", "made to order… ships within 5–7 days", text-row works with **no image**, the stored shipping address, and the order totals. (Confirming a real Stripe round-trip is the separate, manual `develop → main` money gate — out of scope here.)

## Traceability

| Spec section | Task |
|---|---|
| §3 CartContext (identity, mutations, drawer state, tolerant rehydrate F4) | 1 |
| §5 previewQuote (faithful mirror) | 2 |
| Header count = Σ qty, opens drawer | 3 |
| §6 slug/altText snapshot + "Added" aria-live (F5, F6) | 4 |
| §4 CartDrawer, §9.1 mobile (F1), §8.1 D1/D2 | 5 |
| §6 Checkout, two-gate, unchanged POST (F5) | 6 |
| §7 Confirmation, amount_mismatch + ship-window gating (F2, F3), D4 | 7 |
