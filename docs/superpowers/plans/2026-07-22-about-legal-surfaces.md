# About + Legal Surfaces + Footer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the six storefront content surfaces the site still lacks (About, Contact voice-check, Shipping, Refunds, Privacy, Terms) plus the site footer that reaches the legal pages, so the last launch blockers in `product.md §4` are cleared.

**Architecture:** Approach A — each page is a React **Server Component** with its copy written inline, rendered through one shared `Prose` reading-measure layout. A single `Footer` is added to the store layout. About rejoins the header nav. No MDX, no CMS, no client JS. Spec: `docs/superpowers/specs/2026-07-22-about-legal-surfaces-design.md`.

**Tech Stack:** Next.js 16 (App Router, Server Components), React 19, TypeScript strict, Vitest + @testing-library/react (jsdom for `.tsx`), existing design tokens in `app/globals.css`.

## Global Constraints

- **Node 22.** Next 16 App Router, React 19, TypeScript strict.
- **Server Components only** for every new page and component — no `'use client'`. These render as static HTML with zero client JS.
- **Design tokens only** — `--ink`, `--dim`, `--paper`, `--hair`, `--font-playfair`, `--font-newsreader`, `--font-mono`. No new tokens, no hardcoded colors. Styling via inline `style={}` objects and/or a scoped `<style>{...}` block (the pattern `EmptyHome` in `app/(store)/page.tsx` already uses).
- **Honest function (`product.md §1`) — copy states only these true facts, and nothing more:**
  - Nations Photo Lab (NPL) prints and ships; **US only**; **shipping is included in the price**.
  - Timing ≈ **3–5 business days to print + 2–5 in transit**.
  - Prints are **made to order** → **no change-of-mind returns**; **damage/defect** is replaced via email within **30 days** of delivery.
  - Payment is **handled by Stripe**; the site never sees or stores card details.
  - Name + shipping address are **shared with NPL to fulfill**; nothing else shared, nothing sold.
  - **No analytics, no advertising, no mailing list.** Cart + theme live in the browser (`localStorage`) only.
  - Register: legal pages terse and factual; About/Contact quiet and first-person.
- **Do NOT touch the pre-launch `noindex`.** Leave `app/layout.tsx` (`robots: { index: false, follow: false }`), `app/robots.ts`, and `test/noindex.test.ts` exactly as they are. Lifting the noindex is a separate go-live step. `test/noindex.test.ts` must stay green.
- **Tests:** page/component tests are `.tsx` (so Vitest runs them in jsdom). Import with the `@/` alias. `afterEach(cleanup)`. Assert on stable facts (headings, key factual lines, link hrefs) — never on full prose, so copy edits don't break tests. No `@testing-library/jest-dom` is installed — use `.getAttribute()` and `.textContent`, not `toHaveAttribute`.
- **Git:** already on branch `slice-about-legal` (off `develop`). Never commit to `main`/`develop`. Every commit ends with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (shown below as a second `-m` so it works in any shell).
- **Gate stays green** after every task: `npm run lint` · `npm run typecheck` · `npm run build` · `npm test` (currently 1840 tests).

**Run a single test file (cross-platform):** `npx vitest run test/<file>.test.tsx`

---

## File Structure

| File | Responsibility |
|---|---|
| `components/store/Prose.tsx` | Shared reading-measure layout: centered column, Playfair `h1`, Newsreader body. One consumer-facing prop pair `{ title, children }`. |
| `components/store/Footer.tsx` | Storefront footer: legal links + email + copyright. |
| `app/(store)/layout.tsx` | Render `<Footer />` after `{children}`. |
| `app/(store)/about/page.tsx` | About — minimal copy via `Prose` (portrait deferred). |
| `app/(store)/shipping/page.tsx` | Shipping policy via `Prose`. |
| `app/(store)/refunds/page.tsx` | Refund/return policy via `Prose`. |
| `app/(store)/privacy/page.tsx` | Privacy via `Prose`. |
| `app/(store)/terms/page.tsx` | Terms of sale via `Prose`. |
| `app/(store)/contact/page.tsx` | Refold existing copy onto `Prose`. |
| `components/store/Header.tsx` | Add `About` nav link between Collections and Contact. |

---

## Task 1: `Prose` shared layout (+ refold Contact onto it)

**Files:**
- Create: `components/store/Prose.tsx`
- Create: `test/prose.test.tsx`
- Modify: `app/(store)/contact/page.tsx` (whole file)
- Create: `test/contact.test.tsx`

**Interfaces:**
- Produces: `export function Prose({ title, children }: { title: string; children: React.ReactNode }): JSX.Element` — renders `<main class="prose">` containing an `<h1 class="prose-title">{title}</h1>` and a `<div class="prose-body">{children}</div>`. The `.prose-body` class styles descendant `p`, `h2`, and `a` (and `a.email`), so consumers write plain semantic tags.

- [ ] **Step 1: Write the failing test** — `test/prose.test.tsx`

```tsx
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Prose } from '@/components/store/Prose'

afterEach(cleanup)

describe('Prose', () => {
  it('renders the title as an h1 and shows its children', () => {
    render(
      <Prose title="Colophon">
        <p>body copy here</p>
      </Prose>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Colophon' })).toBeTruthy()
    expect(screen.getByText('body copy here')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/prose.test.tsx`
Expected: FAIL — cannot resolve `@/components/store/Prose`.

- [ ] **Step 3: Implement `components/store/Prose.tsx`**

```tsx
export function Prose({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <main className="prose">
      <h1 className="prose-title">{title}</h1>
      <div className="prose-body">{children}</div>
      <style>{`
        .prose {
          max-width: 640px;
          margin: 0 auto;
          padding: 3rem 1.5rem 4rem;
        }
        .prose-title {
          font-family: var(--font-playfair);
          font-size: 2rem;
          font-weight: 400;
          margin: 0 0 2rem;
          color: var(--ink);
        }
        .prose-body {
          font-family: var(--font-newsreader);
          font-size: 1.125rem;
          line-height: 1.7;
          color: var(--dim);
        }
        .prose-body h2 {
          font-family: var(--font-playfair);
          font-size: 1.25rem;
          font-weight: 400;
          color: var(--ink);
          margin: 2.5rem 0 0.75rem;
        }
        .prose-body p {
          margin: 0 0 1.5rem;
        }
        .prose-body a {
          color: var(--ink);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .prose-body a.email {
          font-family: var(--font-mono);
          font-size: 0.875rem;
          letter-spacing: 0.02em;
          text-decoration: none;
        }
      `}</style>
    </main>
  )
}
```

- [ ] **Step 4: Run the Prose test and confirm it passes**

Run: `npx vitest run test/prose.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing Contact test** — `test/contact.test.tsx`

```tsx
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ContactPage from '@/app/(store)/contact/page'

afterEach(cleanup)

describe('Contact page', () => {
  it('renders the Contact heading and the mailto link', () => {
    render(<ContactPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Contact' })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /jonhoffmanbusiness@gmail.com/ }).getAttribute('href'),
    ).toBe('mailto:jonhoffmanbusiness@gmail.com')
  })
})
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npx vitest run test/contact.test.tsx`
Expected: PASS on the heading but the test as a whole should be run against the CURRENT contact page — it may already pass (current page has an `h1` "Contact" and the mailto). If it already passes, that is fine; it becomes the guard that the refold preserves behavior. Proceed to refold and keep it green.

- [ ] **Step 7: Refold `app/(store)/contact/page.tsx` onto `Prose`** (replace the whole file — same copy)

```tsx
import { Prose } from '@/components/store/Prose'

export const metadata = { title: 'Contact — Jon Hoffman Photography' }

export default function ContactPage() {
  return (
    <Prose title="Contact">
      <p>
        If you are interested in a print, a commission, or simply have a question about the work,
        I would be glad to hear from you. Write when you are ready — there is no rush, and every
        enquiry is read personally.
      </p>
      <p>
        <a className="email" href="mailto:jonhoffmanbusiness@gmail.com">
          jonhoffmanbusiness@gmail.com
        </a>
      </p>
    </Prose>
  )
}
```

- [ ] **Step 8: Run both tests and confirm they pass**

Run: `npx vitest run test/prose.test.tsx test/contact.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```
git add components/store/Prose.tsx test/prose.test.tsx app/(store)/contact/page.tsx test/contact.test.tsx
git commit -m "feat(store): shared Prose layout; refold Contact onto it" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: About page

**Files:**
- Create: `app/(store)/about/page.tsx`
- Create: `test/about.test.tsx`

**Interfaces:**
- Consumes: `Prose` from Task 1.
- Produces: route `/about`. Copy is a DRAFT — Jon replaces the words later; the test asserts only the heading, so his edits won't break it. No portrait element renders until an asset exists.

- [ ] **Step 1: Write the failing test** — `test/about.test.tsx`

```tsx
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import AboutPage from '@/app/(store)/about/page'

afterEach(cleanup)

describe('About page', () => {
  it('renders the About heading', () => {
    render(<AboutPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'About' })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/about.test.tsx`
Expected: FAIL — cannot resolve `@/app/(store)/about/page`.

- [ ] **Step 3: Implement `app/(store)/about/page.tsx`**

```tsx
import { Prose } from '@/components/store/Prose'

export const metadata = { title: 'About — Jon Hoffman Photography' }

export default function AboutPage() {
  return (
    <Prose title="About">
      {/* DRAFT copy — Jon to replace with his own words. Portrait added later. */}
      <p>
        I photograph the quiet places that light passes through. Each print is made to order and
        sent from a professional lab — if a piece speaks to you, it can hang on your wall.
      </p>
    </Prose>
  )
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run test/about.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add app/(store)/about/page.tsx test/about.test.tsx
git commit -m "feat(store): About page (minimal, draft copy)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Shipping page

**Files:**
- Create: `app/(store)/shipping/page.tsx`
- Create: `test/shipping.test.tsx`

**Interfaces:**
- Consumes: `Prose`. Produces route `/shipping`.

- [ ] **Step 1: Write the failing test** — `test/shipping.test.tsx`

```tsx
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ShippingPage from '@/app/(store)/shipping/page'

afterEach(cleanup)

describe('Shipping page', () => {
  it('states US-only and that shipping is included', () => {
    render(<ShippingPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Shipping' })).toBeTruthy()
    expect(screen.getByText(/United States only/)).toBeTruthy()
    expect(screen.getByText(/included in the price/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/shipping.test.tsx`
Expected: FAIL — cannot resolve the page module.

- [ ] **Step 3: Implement `app/(store)/shipping/page.tsx`**

```tsx
import { Prose } from '@/components/store/Prose'

export const metadata = { title: 'Shipping — Jon Hoffman Photography' }

export default function ShippingPage() {
  return (
    <Prose title="Shipping">
      <p>
        Every print is made to order and produced by a professional photographic lab, which ships
        it directly to you.
      </p>
      <p>Shipping is included in the price — there is no separate charge at checkout.</p>
      <p>
        Most orders take about three to five business days to print, and two to five business days
        in transit.
      </p>
      <p>Prints ship within the United States only for now.</p>
    </Prose>
  )
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run test/shipping.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add app/(store)/shipping/page.tsx test/shipping.test.tsx
git commit -m "feat(store): Shipping policy page" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Refunds page

**Files:**
- Create: `app/(store)/refunds/page.tsx`
- Create: `test/refunds.test.tsx`

**Interfaces:**
- Consumes: `Prose`. Produces route `/refunds`.

- [ ] **Step 1: Write the failing test** — `test/refunds.test.tsx`

```tsx
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import RefundsPage from '@/app/(store)/refunds/page'

afterEach(cleanup)

describe('Refunds page', () => {
  it('states made-to-order and the damage path', () => {
    render(<RefundsPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Refunds' })).toBeTruthy()
    expect(screen.getByText(/made to order/)).toBeTruthy()
    expect(screen.getByText(/damaged or defective/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/refunds.test.tsx`
Expected: FAIL — cannot resolve the page module.

- [ ] **Step 3: Implement `app/(store)/refunds/page.tsx`**

```tsx
import { Prose } from '@/components/store/Prose'

export const metadata = { title: 'Refunds — Jon Hoffman Photography' }

export default function RefundsPage() {
  return (
    <Prose title="Refunds">
      <p>
        Because each print is made to order, an order cannot be returned or refunded for a change
        of mind.
      </p>
      <p>
        If a print arrives damaged or defective, it will be replaced. Email{' '}
        <a className="email" href="mailto:jonhoffmanbusiness@gmail.com">
          jonhoffmanbusiness@gmail.com
        </a>{' '}
        within 30 days of delivery with a photo of the damage, and the lab will make it right.
      </p>
    </Prose>
  )
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run test/refunds.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add app/(store)/refunds/page.tsx test/refunds.test.tsx
git commit -m "feat(store): Refunds policy page" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Privacy page

**Files:**
- Create: `app/(store)/privacy/page.tsx`
- Create: `test/privacy.test.tsx`

**Interfaces:**
- Consumes: `Prose`. Produces route `/privacy`. Uses `<h2>` sub-sections (styled by `.prose-body h2`).

- [ ] **Step 1: Write the failing test** — `test/privacy.test.tsx`

```tsx
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import PrivacyPage from '@/app/(store)/privacy/page'

afterEach(cleanup)

describe('Privacy page', () => {
  it('discloses Stripe, the NPL sharing, and no tracking', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeTruthy()
    expect(screen.getByText(/handled by Stripe/)).toBeTruthy()
    expect(screen.getByText(/Nations Photo Lab/)).toBeTruthy()
    expect(screen.getByText(/no analytics/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/privacy.test.tsx`
Expected: FAIL — cannot resolve the page module.

- [ ] **Step 3: Implement `app/(store)/privacy/page.tsx`**

```tsx
import { Prose } from '@/components/store/Prose'

export const metadata = { title: 'Privacy — Jon Hoffman Photography' }

export default function PrivacyPage() {
  return (
    <Prose title="Privacy">
      <p>This site collects only what it needs to send you a print.</p>

      <h2>What is collected</h2>
      <p>
        When you place an order, your name, email address, and shipping address are stored so the
        order can be fulfilled.
      </p>

      <h2>Payment</h2>
      <p>
        Payments are handled by Stripe. Card details are entered on Stripe’s checkout and are never
        seen or stored by this site.
      </p>

      <h2>Sharing</h2>
      <p>
        Your name and shipping address are shared with the print lab that fulfills your order,
        Nations Photo Lab, so it can be printed and shipped. Nothing else is shared, and nothing is
        ever sold.
      </p>

      <h2>Tracking</h2>
      <p>
        There is no analytics, no advertising, and no mailing list. Your cart and your light or dark
        preference are stored only in your own browser and are never sent to a server.
      </p>

      <h2>Questions</h2>
      <p>
        Write to{' '}
        <a className="email" href="mailto:jonhoffmanbusiness@gmail.com">
          jonhoffmanbusiness@gmail.com
        </a>
        .
      </p>
    </Prose>
  )
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run test/privacy.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add app/(store)/privacy/page.tsx test/privacy.test.tsx
git commit -m "feat(store): Privacy page with honest data disclosures" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Terms page

**Files:**
- Create: `app/(store)/terms/page.tsx`
- Create: `test/terms.test.tsx`

**Interfaces:**
- Consumes: `Prose`. Produces route `/terms`. (Governing-law clause omitted — see spec Open items.)

- [ ] **Step 1: Write the failing test** — `test/terms.test.tsx`

```tsx
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import TermsPage from '@/app/(store)/terms/page'

afterEach(cleanup)

describe('Terms page', () => {
  it('states USD, US-only, and copyright retention', () => {
    render(<TermsPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Terms' })).toBeTruthy()
    expect(screen.getByText(/US dollars/)).toBeTruthy()
    expect(screen.getByText(/copyright remain/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/terms.test.tsx`
Expected: FAIL — cannot resolve the page module.

- [ ] **Step 3: Implement `app/(store)/terms/page.tsx`**

```tsx
import { Prose } from '@/components/store/Prose'

export const metadata = { title: 'Terms — Jon Hoffman Photography' }

export default function TermsPage() {
  return (
    <Prose title="Terms">
      <p>
        Prices are shown in US dollars. The price at checkout is the total — shipping is included.
      </p>
      <p>Prints are made to order and ship within the United States only.</p>
      <p>
        All photographs and their copyright remain the property of Jon Hoffman. Buying a print does
        not grant any right to reproduce the image.
      </p>
    </Prose>
  )
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run test/terms.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add app/(store)/terms/page.tsx test/terms.test.tsx
git commit -m "feat(store): Terms of sale page" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Footer + layout wiring + About nav link

**Files:**
- Create: `components/store/Footer.tsx`
- Create: `test/footer.test.tsx`
- Modify: `app/(store)/layout.tsx` (add `<Footer />` after `{children}`)
- Modify: `components/store/Header.tsx` (add the About nav link)
- Modify: `test/header.test.tsx` (add an About-link assertion)

**Interfaces:**
- Consumes: routes `/shipping`, `/refunds`, `/privacy`, `/terms` (Tasks 3–6), `/about` (Task 2).
- Produces: `export function Footer(): JSX.Element`.

- [ ] **Step 1: Write the failing Footer test** — `test/footer.test.tsx`

```tsx
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Footer } from '@/components/store/Footer'

afterEach(cleanup)

describe('Footer', () => {
  it('links to each legal page', () => {
    render(<Footer />)
    expect(screen.getByRole('link', { name: 'Shipping' }).getAttribute('href')).toBe('/shipping')
    expect(screen.getByRole('link', { name: 'Refunds' }).getAttribute('href')).toBe('/refunds')
    expect(screen.getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy')
    expect(screen.getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/terms')
  })

  it('shows the contact email as a mailto link', () => {
    render(<Footer />)
    expect(
      screen.getByRole('link', { name: /jonhoffmanbusiness@gmail.com/ }).getAttribute('href'),
    ).toBe('mailto:jonhoffmanbusiness@gmail.com')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/footer.test.tsx`
Expected: FAIL — cannot resolve `@/components/store/Footer`.

- [ ] **Step 3: Implement `components/store/Footer.tsx`**

```tsx
import Link from 'next/link'

export function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.inner}>
        <nav aria-label="Legal" style={styles.links}>
          <Link href="/shipping" style={styles.link}>
            Shipping
          </Link>
          <Link href="/refunds" style={styles.link}>
            Refunds
          </Link>
          <Link href="/privacy" style={styles.link}>
            Privacy
          </Link>
          <Link href="/terms" style={styles.link}>
            Terms
          </Link>
        </nav>
        <a href="mailto:jonhoffmanbusiness@gmail.com" style={styles.email}>
          jonhoffmanbusiness@gmail.com
        </a>
        <p style={styles.copy}>© Jon Hoffman</p>
      </div>
    </footer>
  )
}

const styles: Record<string, React.CSSProperties> = {
  footer: {
    borderTop: '1px solid var(--hair)',
    background: 'var(--paper)',
    color: 'var(--dim)',
    marginTop: '4rem',
  },
  inner: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem 2rem',
    maxWidth: 1200,
    margin: '0 auto',
    padding: '2rem 1.5rem',
  },
  links: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1.25rem',
  },
  link: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.6875rem',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--dim)',
    textDecoration: 'none',
  },
  email: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    letterSpacing: '0.02em',
    color: 'var(--ink)',
    textDecoration: 'none',
  },
  copy: {
    margin: 0,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.6875rem',
    letterSpacing: '0.06em',
    color: 'var(--dim)',
  },
}
```

- [ ] **Step 4: Run the Footer test and confirm it passes**

Run: `npx vitest run test/footer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire `<Footer />` into `app/(store)/layout.tsx`** (replace the whole file)

```tsx
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { CartProvider } from '@/components/cart/CartContext'
import { Header } from '@/components/store/Header'
import { Footer } from '@/components/store/Footer'
import { CartDrawer } from '@/components/cart/CartDrawer'

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <CartProvider>
        <Header />
        {children}
        <Footer />
        <CartDrawer />
      </CartProvider>
    </ThemeProvider>
  )
}
```

- [ ] **Step 6: Add the About-link assertion to `test/header.test.tsx`** (append inside the `describe('Header', ...)` block, after the existing tests)

```tsx
  it('links About to /about in the primary nav', () => {
    setup()
    expect(screen.getByRole('link', { name: 'About' }).getAttribute('href')).toBe('/about')
  })
```

- [ ] **Step 7: Run it and confirm it fails**

Run: `npx vitest run test/header.test.tsx`
Expected: FAIL — no link named "About" yet.

- [ ] **Step 8: Add the About link to `components/store/Header.tsx`** (insert between the Collections and Contact links, matching their style)

```tsx
          <Link href="/collections" style={styles.navLink}>
            Collections
          </Link>
          <Link href="/about" style={styles.navLink}>
            About
          </Link>
          <Link href="/contact" style={styles.navLink}>
            Contact
          </Link>
```

- [ ] **Step 9: Run the header test and confirm it passes**

Run: `npx vitest run test/header.test.tsx`
Expected: PASS (all three tests).

- [ ] **Step 10: Commit**

```
git add components/store/Footer.tsx test/footer.test.tsx app/(store)/layout.tsx components/store/Header.tsx test/header.test.tsx
git commit -m "feat(store): footer with legal links; About rejoins the nav" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Run the full gate**

Run: `npm run lint`
Expected: 0 errors/warnings.

Run: `npm run typecheck`
Expected: 0 errors.

Run: `npm run build`
Expected: build passes; the new routes `/about`, `/shipping`, `/refunds`, `/privacy`, `/terms` appear as static pages.

Run: `npm test`
Expected: all green — 1840 prior + the new tests (Prose, Contact, About, Shipping, Refunds, Privacy, Terms, Footer, + the added Header case). `test/noindex.test.ts` still green (untouched).

- [ ] **Confirm noindex untouched**

Verify `app/layout.tsx`, `app/robots.ts`, and `test/noindex.test.ts` are unchanged in `git diff develop...slice-about-legal`.

---

## Open items carried from the spec (resolve before or at PR; non-blocking to build)

1. **About final copy** — Task 2 ships a clearly-marked draft paragraph. Jon replaces the words; the test asserts only the heading, so no test change is needed.
2. **Refund window** — Task 4 states 30 days. Confirm it matches (or is stricter than) NPL's actual damage-claim window so the page promises nothing NPL won't honor.
3. **Governing law** — omitted from Terms (Task 6). Add a clause naming Jon's state if he decides to.
4. **Lab naming** — Privacy names "Nations Photo Lab" (honest data-recipient disclosure); Shipping keeps it generic ("a professional lab"). Jon can genericize Privacy if he prefers not to name the lab publicly.
