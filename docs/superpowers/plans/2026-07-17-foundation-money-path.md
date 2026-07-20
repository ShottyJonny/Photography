# Foundation + Money Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy Vite app with a Next.js scaffold and build the money path — verbatim pricing port, `/api/checkout`, the reconciling Stripe webhook, and order persistence — end-to-end exercisable against Stripe test mode.

**Architecture:** Next.js App Router on Vercel + Supabase. The dangerous money logic is split into **pure, unit-testable cores** (`lib/pricing.ts`, `lib/checkout/build.ts`, `lib/orders/reconcile.ts`) wrapped by **thin I/O route handlers** (`app/api/*/route.ts`). The server is the sole price authority; nothing client-side ever prices. Orders are written and read only through the Supabase **service key** from server code.

**Tech Stack:** Next.js (App Router, TS strict), React 18, `@supabase/supabase-js`, `stripe`, `zod` (request validation), `server-only`, Vitest (tests). `next/font` for the four faces.

**Companion spec:** `docs/superpowers/specs/2026-07-17-rebuild-architecture-money-path-design.md`. Where this plan and the spec disagree, the spec wins — flag it, don't silently diverge.

**Revised 2026-07-17** after a multi-agent adversarial review: 14 verified findings applied — the silver→`original_bw_key` file bug, the ESLint flat-config, lazy Supabase/Stripe clients + `force-dynamic` `/prints` (so `next build` needs no env), the `server-only` Vitest stub, `payment_status`/`payment_method_types` gating, snake_case `shipping_address`, real persistence assertions, honest-function confirmation states, and six low-severity hardening fixes.

## Global Constraints

Every task's requirements implicitly include this section. Values are verbatim from the spec / `CLAUDE.md` / `supabase/schema.sql`.

- **Runtime:** Node **20+**. `.nvmrc` = `20`.
- **The URL trap:** build Stripe redirect URLs from `SITE_URL` (→ `VERCEL_URL` fallback → `http://localhost:3000`). **Never `process.env.URL`** — it is Netlify-only; on Vercel it is undefined and the localhost fallback charges the card then strands the customer.
- **Env renames:** `SUPABASE_URL` (not `VITE_SUPABASE_URL`), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only, **never** `NEXT_PUBLIC_`), `STRIPE_SECRET_KEY` (**test mode**), `STRIPE_WEBHOOK_SECRET`, `SITE_URL`.
- **Price authority:** the server derives every cent from `item.size` and the shipping address. `item.unit`, `item.price`, and client `totals` are **ignored**. `lib/pricing.ts` logic is **byte-identical** to the legacy original, proven by the golden equivalence test — never "improve" it.
- **Orders are service-key only.** `orders`/`order_items` are touched only via `lib/supabase/admin.ts`. Anon has no access (RLS). **No `localStorage` for orders, ever.**
- **DB is snake_case, no exceptions.** Columns are `created_at`, `total_cents`, `shipping_address`, etc. Never read a camelCase field off a row.
- **Order status enum** (`order_status`): `pending | paid | amount_mismatch | submitted_to_lab | shipped | cancelled | refunded`. The legacy `completed` / `expired` / `failed` values **do not exist** — do not write them.
- **Stripe address:** `billing_address_collection: 'required'`. **No `shipping_address_collection`** — we collect and own the shipping address on our form (it is the tax basis and the fulfillment address).
- **Honest function:** render only states that are true. No fake tracking, no "email sent" claim. The customer's only receipt is Stripe's.
- **Commits:** every commit message ends with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Never `--no-verify` / `--force`. Work on the current branch; do not push (nothing is deployed).

---

## File Structure

Created in this slice:

| File | Responsibility |
|---|---|
| `package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.gitignore`, `.nvmrc` | Next scaffold / config |
| `vitest.config.ts` | Test runner config |
| `app/layout.tsx` | Root layout: fonts, base html |
| `app/(store)/layout.tsx` | Store shell + `CartProvider` |
| `app/globals.css` | Design tokens (store light/dark) + font CSS vars |
| `lib/env.ts` | Typed, validated env access |
| `lib/supabase/admin.ts` / `server.ts` / `client.ts` | Supabase clients (service / anon-server / browser) |
| `lib/stripe.ts` | Server-only Stripe client |
| `lib/pricing.ts` | **Verbatim** pricing port (the 4 functions) |
| `lib/checkout/build.ts` | Pure: resolved items → order rows + Stripe line items |
| `lib/checkout/schema.ts` | zod request schema for `/api/checkout` |
| `lib/orders/reconcile.ts` | Pure: `amount_total` vs `total_cents` → status |
| `app/api/checkout/route.ts` | POST: resolve photos → build → insert → Stripe session |
| `app/api/stripe-webhook/route.ts` | POST: verify sig → reconcile → update order |
| `app/(store)/prints/page.tsx` | Minimal published-photo list (cart source; proves ISR read) |
| `app/(store)/checkout/page.tsx` | Functional ship-to form → `/api/checkout` |
| `app/(store)/order/[id]/page.tsx` | Confirmation (service-key read; true states only) |
| `components/cart/*` | Minimal cart context + add-to-cart control |
| `test/fixtures/legacy-pricing.cjs` | Frozen copy of the legacy original (equivalence reference) |
| `test/**/*.test.ts` | Unit tests |

Preserved: `supabase/schema.sql`, `design/*.dc.html`, `CLAUDE.md`, `product.md`, `design.md`, `README.md`, `.github/`.
Removed (Task 1): `src/`, `netlify/`, `index.html`, `vite.config.ts`, old `eslint.config.js`, `tsconfig.node.json`, `netlify.toml`, `NETLIFY_ENV_SETUP.md`, `public/vite.svg`.

---

## Task 1: Replace the legacy Vite app with a Next.js scaffold

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.gitignore`, `.nvmrc`, `vitest.config.ts`, `test/stubs/server-only.ts`, `app/layout.tsx`, `app/page.tsx`, `test/fixtures/legacy-pricing.cjs`
- Remove: `src/`, `netlify/`, `index.html`, `vite.config.ts`, `eslint.config.js`, `tsconfig.node.json`, `netlify.toml`, `NETLIFY_ENV_SETUP.md`, `public/vite.svg`, `package-lock.json`

**Interfaces:**
- Produces: a booting Next.js app; `npm run build`, `npm run lint`, `npm run test` all runnable.

- [ ] **Step 1: Preserve the legacy money source as a test fixture (before deleting it)**

```bash
mkdir -p test/fixtures
cp netlify/functions/lib/pricing.js test/fixtures/legacy-pricing.cjs
```

This frozen CommonJS copy is the reference the golden equivalence test (Task 5) compares against. It must be copied **before** the removal step below.

- [ ] **Step 2: Remove the legacy Vite tree**

```bash
git rm -r src netlify index.html vite.config.ts eslint.config.js tsconfig.node.json netlify.toml NETLIFY_ENV_SETUP.md public/vite.svg package-lock.json
```

- [ ] **Step 3: Write `package.json`**

```json
{
  "name": "jon-hoffman-photography",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.76.1",
    "next": "^15.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "server-only": "^0.0.1",
    "stripe": "^19.1.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^20.17.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@eslint/eslintrc": "^3.2.0",
    "eslint": "^9.17.0",
    "eslint-config-next": "^15.1.0",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 3b: Write `next.config.ts`**

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    // Derivatives bucket is public; ingest slice adds the remote pattern.
    remotePatterns: [],
  },
}

export default nextConfig
```

- [ ] **Step 3c: Write `tsconfig.json`** (strict; `@/*` path alias)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3d: Write `eslint.config.mjs`, `.nvmrc` (`20`), `.gitignore`, `vitest.config.ts`**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      // `server-only` throws unless the bundler sets the `react-server` export
      // condition, which Vitest does not. Stub it so server modules import in tests.
      'server-only': resolve(__dirname, 'test/stubs/server-only.ts'),
    },
  },
})
```

`test/stubs/server-only.ts` (empty stub so `import 'server-only'` is a no-op under Vitest):
```ts
export {}
```

`.gitignore` (append Next entries): `.next/`, `node_modules/`, `.env*.local`, `next-env.d.ts`, `*.tsbuildinfo`.

`eslint.config.mjs` (Next 15 + ESLint 9 flat-config bridge — the default export is a legacy eslintrc object, not a callable, so it must go through `FlatCompat`):
```mjs
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })
export default [...compat.extends('next/core-web-vitals', 'next/typescript')]
```

- [ ] **Step 4: Write a placeholder root layout + page**

`app/layout.tsx`:
```tsx
export const metadata = { title: 'Jon Hoffman Photography' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

`app/page.tsx`:
```tsx
export default function Home() {
  return <main>Jon Hoffman Photography — rebuild in progress.</main>
}
```

- [ ] **Step 5: Install and verify the app boots and builds**

```bash
npm install
npm run build
```
Expected: build completes with no errors; `.next/` produced. (`npm run dev` should serve `http://localhost:3000` showing the placeholder — optional manual check.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: replace legacy Vite app with Next.js scaffold" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Typed, validated environment access — `lib/env.ts`

**Files:**
- Create: `lib/env.ts`, `.env.example`
- Test: `test/env.test.ts`

**Interfaces:**
- Produces: `loadEnv(source?: Record<string,string|undefined>): Env` and a memoized `env: Env`. `Env` includes `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `siteUrl: string` (resolved base origin).

- [ ] **Step 1: Write the failing test**

`test/env.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { loadEnv } from '@/lib/env'

const base = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'svc',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
}

describe('loadEnv', () => {
  it('throws with the missing key name when a required var is absent', () => {
    const { SUPABASE_URL, ...missing } = base
    expect(() => loadEnv(missing)).toThrow(/SUPABASE_URL/)
  })

  it('uses SITE_URL as the site origin when present', () => {
    const env = loadEnv({ ...base, SITE_URL: 'https://jonhoffman.com' })
    expect(env.siteUrl).toBe('https://jonhoffman.com')
  })

  it('falls back to https://$VERCEL_URL when SITE_URL is absent', () => {
    const env = loadEnv({ ...base, VERCEL_URL: 'preview-abc.vercel.app' })
    expect(env.siteUrl).toBe('https://preview-abc.vercel.app')
  })

  it('falls back to localhost when neither is set', () => {
    expect(loadEnv(base).siteUrl).toBe('http://localhost:3000')
  })

  it('never reads process.env.URL', () => {
    const env = loadEnv({ ...base, URL: 'https://netlify-trap.example' })
    expect(env.siteUrl).toBe('http://localhost:3000')
  })

  it('throws in production when no site origin is configured', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(/site origin/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/env.test.ts`
Expected: FAIL — cannot resolve `@/lib/env`.

- [ ] **Step 3: Write `lib/env.ts`**

```ts
type Source = Record<string, string | undefined>

export interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  siteUrl: string
}

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
] as const

function resolveSiteUrl(s: Source): string {
  // NEVER process.env.URL (Netlify-only). SITE_URL is set per Vercel env.
  if (s.SITE_URL && s.SITE_URL.trim()) return s.SITE_URL.trim()
  if (s.VERCEL_URL && s.VERCEL_URL.trim()) return `https://${s.VERCEL_URL.trim()}`
  // In production, refuse to silently fall back to localhost (spec §3.1/§4.2): a
  // misconfigured deploy must fail at boot, not charge the card then redirect to localhost.
  if (s.NODE_ENV === 'production') {
    throw new Error('No site origin: set SITE_URL (or deploy on Vercel, where VERCEL_URL is set)')
  }
  return 'http://localhost:3000'
}

export function loadEnv(source: Source = process.env): Env {
  const missing = REQUIRED.filter((k) => !source[k] || !source[k]!.trim())
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`)
  }
  return {
    SUPABASE_URL: source.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: source.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    STRIPE_SECRET_KEY: source.STRIPE_SECRET_KEY!,
    STRIPE_WEBHOOK_SECRET: source.STRIPE_WEBHOOK_SECRET!,
    siteUrl: resolveSiteUrl(source),
  }
}

let cached: Env | null = null
export function env(): Env {
  return (cached ??= loadEnv())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/env.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write `.env.example`** (names only, no values)

```
SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
SITE_URL=http://localhost:3000
```

- [ ] **Step 6: Commit**

```bash
git add lib/env.ts test/env.test.ts .env.example
git commit -m "feat: typed env access with SITE_URL resolution (no process.env.URL)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Supabase + Stripe clients

**Files:**
- Create: `lib/supabase/admin.ts`, `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/stripe.ts`
- Test: `test/clients.test.ts`

**Interfaces:**
- Produces: `supabaseAdmin(): SupabaseClient` (service key, bypasses RLS, server-only), `supabaseServer(): SupabaseClient` (anon, server), `supabaseBrowser(): SupabaseClient` (anon, browser), `stripe(): Stripe` (lazy getter — do NOT construct at module scope).

- [ ] **Step 1: Write the failing test** (smoke: clients construct under fake env)

`test/clients.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  process.env.STRIPE_SECRET_KEY = 'sk_test_x'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x'
})

it('constructs the admin client', async () => {
  const { supabaseAdmin } = await import('@/lib/supabase/admin')
  expect(supabaseAdmin().from).toBeTypeOf('function')
})

it('constructs the stripe client', async () => {
  const { stripe } = await import('@/lib/stripe')
  expect(stripe().checkout.sessions.create).toBeTypeOf('function')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/clients.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the clients**

`lib/supabase/admin.ts`:
```ts
import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

let client: SupabaseClient | null = null
export function supabaseAdmin(): SupabaseClient {
  if (client) return client
  const e = env()
  client = createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}
```

`lib/supabase/server.ts`:
```ts
import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

export function supabaseServer(): SupabaseClient {
  const e = env()
  return createClient(e.SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
}
```

`lib/supabase/client.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function supabaseBrowser(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

> Note: the browser client needs a `NEXT_PUBLIC_`-prefixed URL to read it client-side. Add `NEXT_PUBLIC_SUPABASE_URL` to `.env.example` and Vercel env (same value as `SUPABASE_URL`). It is public by design (published-catalog reads only).

`lib/stripe.ts` (lazy — a module-scope `new Stripe(env()…)` would evaluate `env()` during `next build` before env exists):
```ts
import 'server-only'
import Stripe from 'stripe'
import { env } from '@/lib/env'

let client: Stripe | null = null
export function stripe(): Stripe {
  return (client ??= new Stripe(env().STRIPE_SECRET_KEY))
}
```

- [ ] **Step 3b: Add `NEXT_PUBLIC_SUPABASE_URL=` to `.env.example`.**

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/clients.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/supabase lib/stripe.ts test/clients.test.ts test/stubs .env.example
git commit -m "feat: supabase (admin/server/browser) and stripe clients" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Design tokens + fonts + store layout

**Files:**
- Create: `app/globals.css`, `app/(store)/layout.tsx`, `components/theme/ThemeProvider.tsx`
- Modify: `app/layout.tsx` (load fonts, import globals)

**Interfaces:**
- Produces: CSS custom properties for store light/dark tokens (`design.md §12.2`) and the four font CSS variables, consumed by later surfaces.

- [ ] **Step 1: Write `app/globals.css`** with the `design.md §12.2` tokens

```css
:root {
  --paper: #0b0b0b;
  --ink: #efeae0;
  --dim: rgba(239, 234, 224, 0.62);
  --faint: rgba(239, 234, 224, 0.45);
  --hair: rgba(239, 234, 224, 0.18);
  --btnbg: #efeae0;
  --btnink: #0b0b0b;
}
:root[data-theme='light'] {
  --paper: #f2efe8;
  --ink: #1c1a17;
  --dim: rgba(28, 26, 23, 0.66);
  --faint: rgba(28, 26, 23, 0.42);
  --hair: rgba(28, 26, 23, 0.18);
  --btnbg: #1c1a17;
  --btnink: #f2efe8;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--font-hanken), system-ui, sans-serif; }
```

> Admin dark-only tokens (`§11.1`) are added in the admin slice — not needed here.

- [ ] **Step 2: Load the four faces in `app/layout.tsx` via `next/font`**

```tsx
import './globals.css'
import { Playfair_Display, Newsreader, IBM_Plex_Mono, Hanken_Grotesk } from 'next/font/google'

const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' })
const newsreader = Newsreader({ subsets: ['latin'], variable: '--font-newsreader' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' })
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken' })

export const metadata = { title: 'Jon Hoffman Photography' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${newsreader.variable} ${mono.variable} ${hanken.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Write `components/theme/ThemeProvider.tsx`** (spec §5 lists a ThemeProvider in-scope; the mark-as-toggle wiring lands with the store header in a later slice)

```tsx
'use client'
import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'
const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark') // dark is the default (design.md §12.2)
  useEffect(() => { setTheme((localStorage.getItem('theme:v1') as Theme | null) ?? 'dark') }, [])
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('theme:v1', theme) }, [theme])
  return (
    <Ctx.Provider value={{ theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }}>
      {children}
    </Ctx.Provider>
  )
}
export function useTheme() { return useContext(Ctx) }
```

- [ ] **Step 3b: Write `app/(store)/layout.tsx`** (store shell; `CartProvider` nests inside in Task 9)

```tsx
import { ThemeProvider } from '@/components/theme/ThemeProvider'

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>
}
```

- [ ] **Step 4: Verify the build still passes**

Run: `npm run build`
Expected: build succeeds; fonts fetched at build time.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx "app/(store)/layout.tsx" components/theme
git commit -m "feat: design tokens + four-face type system + store layout + theme provider" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Verbatim pricing port — `lib/pricing.ts`

**Files:**
- Create: `lib/pricing.ts`
- Test: `test/pricing.equivalence.test.ts`, `test/pricing.test.ts`

**Interfaces:**
- Produces: `computeOrderAmounts(items, shippingAddress): { lineItems, subtotal, shipping, tax, total }`, `PRICE_BY_SIZE`, `ALL_SIZES`, `estimateTaxRate`, `estimateShipping`. `lineItems[i] = { name, size, qty, unit, amount }`, index-aligned with input `items`.

- [ ] **Step 1: Write the golden equivalence test**

`test/pricing.equivalence.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import * as port from '@/lib/pricing'

const require = createRequire(import.meta.url)
const legacy = require('./fixtures/legacy-pricing.cjs') as typeof port

const sizes = ['4x6', '5x7', '8x10', '11x14', '12x16', '16x20', '20x30']
const countries = ['us', 'usa', 'united states', 'United States', 'Canada', 'germany', '']
const regions = ['CA', 'NY', 'WA', 'TX', 'FL', 'IL', 'PA', 'MA', 'ZZ', ''] // every US_STATE_RATES key + unlisted + empty
const qtys = [1, 2, 100]

describe('pricing port is behaviorally identical to the legacy original', () => {
  for (const size of sizes)
    for (const country of countries)
      for (const region of regions)
        for (const qty of qtys) {
          it(`${size} · ${country} · ${region || '∅'} · x${qty}`, () => {
            const items = [{ name: 'Print', size, qty }]
            const addr = { country, region }
            // Both throw or both return — assert identical behavior either way.
            let a: unknown, b: unknown, ae: string | null = null, be: string | null = null
            try { a = port.computeOrderAmounts(items, addr) } catch (e) { ae = (e as Error).message }
            try { b = legacy.computeOrderAmounts(items, addr) } catch (e) { be = (e as Error).message }
            expect(ae).toBe(be)
            expect(a).toEqual(b)
          })
        }

  it('multi-item order (mixed sizes and quantities) matches the legacy original', () => {
    const items = [
      { name: 'A', size: '4x6', qty: 3 },
      { name: 'B', size: '20x30', qty: 1 },
      { name: 'C', size: '11x14', qty: 2 },
    ]
    const addr = { country: 'us', region: 'NY' }
    expect(port.computeOrderAmounts(items, addr)).toEqual(legacy.computeOrderAmounts(items, addr))
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/pricing.equivalence.test.ts`
Expected: FAIL — cannot resolve `@/lib/pricing`.

- [ ] **Step 3: Write `lib/pricing.ts` — copy the legacy bodies verbatim; adapt only exports + boundary types**

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
// VERBATIM port of the legacy netlify/functions/lib/pricing.js (spec §4.1).
// Inputs are `any` on purpose: these functions accept UNTRUSTED request data
// and validate it at runtime. Do NOT tighten types into the bodies or change
// any value/branch — the golden equivalence test guards against drift.

const ALL_SIZES = ['4x6', '5x7', '8x10', '11x14', '12x16', '16x20', '20x30']

const PRICE_BY_SIZE: Record<string, number> = {
  '4x6': 500,
  '5x7': 1000,
  '8x10': 1500,
  '11x14': 2000,
  '12x16': 3000,
  '16x20': 3500,
  '20x30': 6500,
}

const US_STATE_RATES: Record<string, number> = {
  CA: 0.0825, NY: 0.0887, WA: 0.092, TX: 0.0825,
  FL: 0.07, IL: 0.1025, PA: 0.06, MA: 0.0625,
}

function isUnitedStates(country: any) {
  const c = String(country).trim().toLowerCase()
  return c === 'united states' || c === 'usa' || c === 'us'
}

function estimateTaxRate(country: any, region?: any) {
  if (!country) return { rate: 0, source: 'none' }
  const c = String(country).trim().toLowerCase()
  if (c === 'united states' || c === 'usa' || c === 'us') {
    const code = String(region || '').trim().toUpperCase()
    if (!code) return { rate: 0, source: 'us-state', note: 'Enter state for estimate' }
    const rate = US_STATE_RATES[code] ?? 0.06 // fallback nominal 6%
    return { rate, source: 'us-state' }
  }
  return { rate: 0.12, source: 'country-flat', note: 'Flat international estimate' }
}

function estimateShipping(subtotalCents: any, country?: any, method?: any) {
  const base = 995
  return { cost: base, free: false, threshold: Infinity, note: undefined as string | undefined }
}

const MAX_QTY = 100
const MAX_NAME_LEN = 200

function computeOrderAmounts(items: any, shippingAddress: any) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Order must include at least one item')
  }

  if (!shippingAddress || typeof shippingAddress !== 'object' || Array.isArray(shippingAddress)) {
    throw new Error('Shipping address is required')
  }
  if (typeof shippingAddress.country !== 'string' || shippingAddress.country.trim() === '') {
    throw new Error('Shipping country is required')
  }
  const country = shippingAddress.country
  const region = typeof shippingAddress.region === 'string' ? shippingAddress.region : ''
  if (isUnitedStates(country) && region.trim() === '') {
    throw new Error('Shipping region is required for US destinations')
  }

  const lineItems = items.map((item: any) => {
    const size = item && item.size
    if (typeof size !== 'string' || !ALL_SIZES.includes(size)) {
      throw new Error('Invalid item size')
    }
    const qty = item && item.qty
    if (typeof qty !== 'number' || !Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
      throw new Error('Invalid item quantity')
    }
    if (qty > MAX_QTY) {
      throw new Error('Item quantity exceeds maximum allowed')
    }
    const unit = PRICE_BY_SIZE[size]
    const rawName = item && item.name != null ? String(item.name) : 'Print'
    const name = rawName.slice(0, MAX_NAME_LEN)
    return { name, size, qty, unit, amount: unit * qty }
  })

  const subtotal = lineItems.reduce((sum: number, li: any) => sum + li.amount, 0)
  const shippingEst = estimateShipping(subtotal, country)
  const shipping = shippingEst.cost
  const taxRate = estimateTaxRate(country, region)
  const tax = Math.round(subtotal * taxRate.rate)
  const total = subtotal + shipping + tax

  return { lineItems, subtotal, shipping, tax, total }
}

export { ALL_SIZES, PRICE_BY_SIZE, estimateTaxRate, estimateShipping, computeOrderAmounts }
```

- [ ] **Step 4: Run the equivalence test to verify it passes**

Run: `npx vitest run test/pricing.equivalence.test.ts`
Expected: PASS (all grid combinations identical).

- [ ] **Step 5: Write the documented-behavior unit tests**

`test/pricing.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeOrderAmounts } from '@/lib/pricing'

describe('computeOrderAmounts documented behavior', () => {
  it('prices a US order by size and applies the state rate', () => {
    const r = computeOrderAmounts([{ size: '8x10', qty: 2, name: 'X' }], { country: 'us', region: 'CA' })
    expect(r.subtotal).toBe(3000)          // 1500 * 2
    expect(r.shipping).toBe(995)
    expect(r.tax).toBe(Math.round(3000 * 0.0825)) // 248
    expect(r.total).toBe(3000 + 995 + 248)
  })

  it('applies the 6% fallback for an unlisted US state', () => {
    const r = computeOrderAmounts([{ size: '4x6', qty: 1 }], { country: 'us', region: 'ZZ' })
    expect(r.tax).toBe(Math.round(500 * 0.06)) // 30
  })

  it('applies a flat 12% for non-US destinations', () => {
    const r = computeOrderAmounts([{ size: '4x6', qty: 1 }], { country: 'Canada' })
    expect(r.tax).toBe(Math.round(500 * 0.12)) // 60
  })

  it('throws on an invalid size', () => {
    expect(() => computeOrderAmounts([{ size: '9x12', qty: 1 }], { country: 'us', region: 'CA' })).toThrow(/Invalid item size/)
  })

  it('throws when a US order omits the region', () => {
    expect(() => computeOrderAmounts([{ size: '4x6', qty: 1 }], { country: 'us' })).toThrow(/region is required/)
  })

  it('throws above MAX_QTY (100)', () => {
    expect(() => computeOrderAmounts([{ size: '4x6', qty: 101 }], { country: 'us', region: 'CA' })).toThrow(/exceeds maximum/)
  })
})
```

- [ ] **Step 6: Run all pricing tests**

Run: `npx vitest run test/pricing.test.ts test/pricing.equivalence.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/pricing.ts test/pricing.test.ts test/pricing.equivalence.test.ts test/fixtures/legacy-pricing.cjs
git commit -m "feat: verbatim pricing port proven equivalent to the legacy original" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Pure checkout core — `lib/checkout/build.ts`

**Files:**
- Create: `lib/checkout/build.ts`, `lib/checkout/schema.ts`
- Test: `test/checkout-build.test.ts`

**Interfaces:**
- Consumes: `computeOrderAmounts` (Task 5).
- Produces:
  - `CheckoutRequest` (zod-inferred): `{ items: {photoId, size, register, qty}[], customer: {email, name}, shippingAddress: {name, street, city, region, postalCode, country} }`.
  - `ResolvedItem = { photoId: string; title: string; originalKey: string | null; size: string; register: 'colour'|'silver'; qty: number }`.
  - `StoredShippingAddress` (snake_case) + `toStoredShippingAddress(a)` — the persisted address shape, shared with the admin slice so its reads can't drift.
  - `buildCheckout(items: ResolvedItem[], shippingAddress): { amounts, orderItems, stripeLineItems }` where `orderItems[i] = { photo_id, title, size, register, qty, unit_cents, original_key }` and `stripeLineItems` is Stripe `line_items` incl. shipping/tax lines.

- [ ] **Step 1: Write `lib/checkout/schema.ts`** (zod request contract)

```ts
import { z } from 'zod'

export const checkoutSchema = z.object({
  items: z.array(z.object({
    photoId: z.string().uuid(),
    size: z.string(),
    register: z.enum(['colour', 'silver']),
    qty: z.number().int().positive().max(100),
  })).min(1),
  customer: z.object({
    email: z.string().email(),
    name: z.string().min(1).max(200),
  }),
  shippingAddress: z.object({
    name: z.string().min(1).max(200),
    street: z.string().min(1),
    city: z.string().min(1),
    region: z.string(),          // required for US enforced by computeOrderAmounts
    postalCode: z.string().min(1),
    country: z.string().length(2), // ISO-2
  }),
})

export type CheckoutRequest = z.infer<typeof checkoutSchema>

// Persisted shape is snake_case to match the rest of the model (schema.sql:164-166:
// "snake_case, everywhere, no exceptions"). Shared so the admin fulfillment slice reads
// the same keys. postalCode -> postal_code is the one that differs.
export interface StoredShippingAddress {
  name: string
  street: string
  city: string
  region: string
  postal_code: string
  country: string
}
export function toStoredShippingAddress(a: CheckoutRequest['shippingAddress']): StoredShippingAddress {
  return { name: a.name, street: a.street, city: a.city, region: a.region, postal_code: a.postalCode, country: a.country }
}
```

- [ ] **Step 2: Write the failing test**

`test/checkout-build.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildCheckout, type ResolvedItem } from '@/lib/checkout/build'

const item: ResolvedItem = {
  photoId: '11111111-1111-1111-1111-111111111111',
  title: 'Deterioration', originalKey: 'originals/deterioration/colour.jpg',
  size: '8x10', register: 'colour', qty: 2,
}
const shipping = { name: 'A', street: '1 Rd', city: 'LA', region: 'CA', postalCode: '90001', country: 'US' }

describe('buildCheckout', () => {
  it('derives order-item cents from the server pricing, snapshotting photo fields', () => {
    const { orderItems, amounts } = buildCheckout([item], shipping)
    expect(orderItems[0]).toMatchObject({
      photo_id: item.photoId, title: 'Deterioration', size: '8x10',
      register: 'colour', qty: 2, unit_cents: 1500, original_key: item.originalKey,
    })
    expect(amounts.subtotal).toBe(3000)
    expect(amounts.total).toBe(3000 + 995 + Math.round(3000 * 0.0825))
  })

  it('emits Stripe line items with shipping and tax lines when > 0', () => {
    const { stripeLineItems } = buildCheckout([item], shipping)
    const names = stripeLineItems.map((l) => l.price_data.product_data.name)
    expect(names).toContain('Shipping')
    expect(names).toContain('Tax')
    expect(stripeLineItems[0].price_data.unit_amount).toBe(1500)
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/checkout-build.test.ts`
Expected: FAIL — `@/lib/checkout/build` not found.

- [ ] **Step 4: Write `lib/checkout/build.ts`**

```ts
import { computeOrderAmounts } from '@/lib/pricing'

export interface ResolvedItem {
  photoId: string
  title: string
  originalKey: string | null
  size: string
  register: 'colour' | 'silver'
  qty: number
}

export interface ShippingAddress {
  name: string; street: string; city: string; region: string; postalCode: string; country: string
}

export function buildCheckout(items: ResolvedItem[], shipping: ShippingAddress) {
  const amounts = computeOrderAmounts(
    items.map((i) => ({ size: i.size, qty: i.qty, name: i.title })),
    { country: shipping.country, region: shipping.region },
  )

  const orderItems = items.map((i, idx) => ({
    photo_id: i.photoId,
    title: i.title,
    size: i.size,
    register: i.register,
    qty: i.qty,
    unit_cents: amounts.lineItems[idx].unit,
    original_key: i.originalKey,
  }))

  const stripeLineItems = amounts.lineItems.map((li) => ({
    price_data: {
      currency: 'usd',
      product_data: { name: li.name, description: `Size: ${li.size}` },
      unit_amount: li.unit,
    },
    quantity: li.qty,
  }))
  if (amounts.shipping > 0) {
    stripeLineItems.push({
      price_data: { currency: 'usd', product_data: { name: 'Shipping', description: 'Standard shipping' }, unit_amount: amounts.shipping },
      quantity: 1,
    })
  }
  if (amounts.tax > 0) {
    stripeLineItems.push({
      price_data: { currency: 'usd', product_data: { name: 'Tax', description: 'Sales tax' }, unit_amount: amounts.tax },
      quantity: 1,
    })
  }

  return { amounts, orderItems, stripeLineItems }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run test/checkout-build.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/checkout test/checkout-build.test.ts
git commit -m "feat: pure checkout core (order rows + stripe line items) with zod contract" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Checkout route — `app/api/checkout/route.ts`

**Files:**
- Create: `app/api/checkout/route.ts`
- Test: `test/checkout-route.test.ts`

**Interfaces:**
- Consumes: `checkoutSchema`, `buildCheckout` (Task 6); `supabaseAdmin` (Task 3); `stripe` (Task 3); `env` (Task 2).
- Produces: `POST` handler → `200 { url }` on success, `400 { error }` on invalid input.

- [ ] **Step 1: Write the failing test** (mock the I/O deps)

`test/checkout-route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sessionCreate = vi.fn()
const insert = vi.fn()

const PHOTOS = [{
  id: '11111111-1111-1111-1111-111111111111', title: 'Deterioration', published: true,
  has_bw_variant: true, original_key: 'originals/d/colour.jpg', original_bw_key: 'originals/d/silver.jpg',
}]

vi.mock('@/lib/stripe', () => ({ stripe: () => ({ checkout: { sessions: { create: sessionCreate } } }) }))
vi.mock('@/lib/env', () => ({ env: () => ({ siteUrl: 'https://jonhoffman.com' }) }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'photos') return { select: () => ({ in: () => Promise.resolve({ data: PHOTOS, error: null }) }) }
      if (table === 'orders') return {
        insert: (row: unknown) => { insert('orders', row); return { select: () => ({ single: () => Promise.resolve({ data: { id: 'order-123' }, error: null }) }) } },
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }
      return { insert: (rows: unknown) => { insert('order_items', rows); return Promise.resolve({ error: null }) } }
    },
  }),
}))

const body = {
  items: [{ photoId: '11111111-1111-1111-1111-111111111111', size: '8x10', register: 'colour', qty: 1 }],
  customer: { email: 'buyer@example.com', name: 'Buyer' },
  shippingAddress: { name: 'Buyer', street: '1 Rd', city: 'LA', region: 'CA', postalCode: '90001', country: 'US' },
}
const post = (payload: unknown) => new Request('http://localhost/api/checkout', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
})
const orderInsert = () => insert.mock.calls.find((c) => c[0] === 'orders')?.[1] as Record<string, unknown>
const itemsInsert = () => insert.mock.calls.find((c) => c[0] === 'order_items')?.[1] as Record<string, unknown>[]

beforeEach(() => { sessionCreate.mockReset(); insert.mockReset(); sessionCreate.mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.com/x' }) })

describe('POST /api/checkout', () => {
  it('rejects an invalid body with 400', async () => {
    const { POST } = await import('@/app/api/checkout/route')
    expect((await POST(post({ items: [] }))).status).toBe(400)
  })

  it('creates a card-only session with billing collection, no shipping collection, and a SITE_URL success_url', async () => {
    const { POST } = await import('@/app/api/checkout/route')
    const res = await POST(post(body))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/x' })

    const args = sessionCreate.mock.calls[0][0]
    expect(args.payment_method_types).toEqual(['card'])
    expect(args.billing_address_collection).toBe('required')
    expect(args.shipping_address_collection).toBeUndefined()
    expect(args.success_url).toContain('https://jonhoffman.com/order/order-123')
    expect(args.success_url).not.toContain('localhost')
    expect(args.metadata.orderId).toBe('order-123')
  })

  it('persists the order with a snake_case shipping address and server-derived cents', async () => {
    const { POST } = await import('@/app/api/checkout/route')
    await POST(post(body))
    expect(orderInsert()).toMatchObject({
      status: 'pending',
      shipping_address: { postal_code: '90001', country: 'US', region: 'CA' },
      subtotal_cents: 1500,
      total_cents: 1500 + 995 + Math.round(1500 * 0.0825),
    })
    expect(itemsInsert()[0]).toMatchObject({ order_id: 'order-123', unit_cents: 1500, original_key: 'originals/d/colour.jpg', register: 'colour' })
  })

  it('snapshots the B&W master (original_bw_key) for a silver-register item', async () => {
    const { POST } = await import('@/app/api/checkout/route')
    await POST(post({ ...body, items: [{ ...body.items[0], register: 'silver' }] }))
    expect(itemsInsert()[0]).toMatchObject({ register: 'silver', original_key: 'originals/d/silver.jpg' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/checkout-route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Write `app/api/checkout/route.ts`**

```ts
import { checkoutSchema, toStoredShippingAddress } from '@/lib/checkout/schema'
import { buildCheckout, type ResolvedItem } from '@/lib/checkout/build'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { env } from '@/lib/env'

export async function POST(req: Request): Promise<Response> {
  let json: unknown
  try { json = await req.json() } catch { return Response.json({ error: 'Invalid request body' }, { status: 400 }) }

  const parsed = checkoutSchema.safeParse(json)
  if (!parsed.success) return Response.json({ error: 'Invalid order' }, { status: 400 })
  const { items, customer, shippingAddress } = parsed.data

  const db = supabaseAdmin()

  // Resolve each cart item against photos: exists + published; snapshot title/original_key.
  const ids = items.map((i) => i.photoId)
  const { data: photos, error: photoErr } = await db
    .from('photos').select('id, title, published, has_bw_variant, original_key, original_bw_key').in('id', ids)
  if (photoErr) return Response.json({ error: 'Could not validate your order' }, { status: 400 })

  const byId = new Map((photos ?? []).map((p) => [p.id, p]))
  const resolved: ResolvedItem[] = []
  for (const i of items) {
    const p = byId.get(i.photoId)
    if (!p || !p.published) return Response.json({ error: 'A selected print is unavailable' }, { status: 400 })
    if (i.register === 'silver' && !p.has_bw_variant) return Response.json({ error: 'Silver variant unavailable' }, { status: 400 })
    // Silver orders must snapshot the B&W master (original_bw_key), not the colour original.
    const originalKey = i.register === 'silver' ? p.original_bw_key : p.original_key
    if (i.register === 'silver' && !originalKey) return Response.json({ error: 'Silver variant unavailable' }, { status: 400 })
    resolved.push({ photoId: p.id, title: p.title, originalKey, size: i.size, register: i.register, qty: i.qty })
  }

  // computeOrderAmounts (inside buildCheckout) throws on invalid size / missing destination.
  let built
  try { built = buildCheckout(resolved, shippingAddress) } catch { return Response.json({ error: 'Could not validate your order' }, { status: 400 }) }
  const { amounts, orderItems, stripeLineItems } = built

  // Insert the order (pending) with the COMPLETE shipping address and server-derived cents.
  const { data: order, error: orderErr } = await db.from('orders').insert({
    customer_email: customer.email,
    customer_name: customer.name,
    shipping_address: toStoredShippingAddress(shippingAddress), // snake_case at the boundary
    status: 'pending',
    subtotal_cents: amounts.subtotal,
    shipping_cents: amounts.shipping,
    tax_cents: amounts.tax,
    total_cents: amounts.total,
  }).select('id').single()
  if (orderErr || !order) return Response.json({ error: 'Could not start checkout' }, { status: 500 })

  const { error: itemsErr } = await db.from('order_items')
    .insert(orderItems.map((oi) => ({ ...oi, order_id: order.id })))
  if (itemsErr) {
    await db.from('orders').delete().eq('id', order.id) // don't leave an orphan pending order
    return Response.json({ error: 'Could not start checkout' }, { status: 500 })
  }

  const base = env().siteUrl
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'], // synchronous card only (matches legacy); no async/delayed methods
    line_items: stripeLineItems,
    customer_email: customer.email,
    billing_address_collection: 'required',
    // NO shipping_address_collection — we own the shipping address (Global Constraints).
    success_url: `${base}/order/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/checkout?canceled=1`,
    metadata: { orderId: order.id },
    payment_intent_data: { receipt_email: customer.email, metadata: { orderId: order.id } },
  })

  return Response.json({ url: session.url })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/checkout-route.test.ts`
Expected: PASS (4 tests).

> The Supabase mock returns awaited `{ data, error }` shapes matching `@supabase/supabase-js` v2. If a chain shape drifts from the installed version, adjust the mock — but keep the persistence assertions (snake_case `shipping_address`, the `*_cents`, and the silver→`original_bw_key` snapshot); they are the load-bearing checks the review added.

- [ ] **Step 5: Commit**

```bash
git add app/api/checkout/route.ts test/checkout-route.test.ts
git commit -m "feat: /api/checkout — resolve, persist order, create Stripe session (billing-only, SITE_URL)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Reconciliation core + webhook route

**Files:**
- Create: `lib/orders/reconcile.ts`, `app/api/stripe-webhook/route.ts`
- Test: `test/reconcile.test.ts`, `test/webhook-route.test.ts`

**Interfaces:**
- Consumes: `stripe`, `env`, `supabaseAdmin`.
- Produces: `reconcile(amountTotalCents: number, order: { total_cents: number }): { status: 'paid'|'amount_mismatch'; amountPaidCents: number }`; `POST` webhook handler.

- [ ] **Step 1: Write the failing reconcile test**

`test/reconcile.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { reconcile } from '@/lib/orders/reconcile'

describe('reconcile', () => {
  it('marks paid when amounts match', () => {
    expect(reconcile(4243, { total_cents: 4243 })).toEqual({ status: 'paid', amountPaidCents: 4243 })
  })
  it('marks amount_mismatch and records the amount actually paid when they differ', () => {
    expect(reconcile(550, { total_cents: 6500 })).toEqual({ status: 'amount_mismatch', amountPaidCents: 550 })
  })
})
```

- [ ] **Step 2: Run to verify it fails; then write `lib/orders/reconcile.ts`**

Run: `npx vitest run test/reconcile.test.ts` → FAIL.

```ts
export function reconcile(
  amountTotalCents: number,
  order: { total_cents: number },
): { status: 'paid' | 'amount_mismatch'; amountPaidCents: number } {
  const status = amountTotalCents === order.total_cents ? 'paid' : 'amount_mismatch'
  return { status, amountPaidCents: amountTotalCents }
}
```

Run again → PASS (2 tests).

- [ ] **Step 3: Write the failing webhook test** (mock sig verification + admin client)

`test/webhook-route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const constructEvent = vi.fn()
const update = vi.fn(() => ({ eq: () => ({ eq: () => ({ error: null }) }) }))
const single = vi.fn()

vi.mock('@/lib/stripe', () => ({ stripe: () => ({ webhooks: { constructEvent } }) }))
vi.mock('@/lib/env', () => ({ env: () => ({ STRIPE_WEBHOOK_SECRET: 'whsec_x' }) }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single }) }),
      update,
    }),
  }),
}))

function evt(type: string, object: unknown) { constructEvent.mockReturnValue({ type, data: { object } }) }
function req() {
  return new Request('http://localhost/api/stripe-webhook', {
    method: 'POST', headers: { 'stripe-signature': 't=1,v1=x' }, body: '{}',
  })
}

beforeEach(() => { update.mockClear(); single.mockReset(); single.mockResolvedValue({ data: { id: 'o1', status: 'pending', total_cents: 4243 }, error: null }) })

describe('POST /api/stripe-webhook', () => {
  it('returns 400 on a bad signature', async () => {
    constructEvent.mockImplementation(() => { throw new Error('bad sig') })
    const { POST } = await import('@/app/api/stripe-webhook/route')
    expect((await POST(req())).status).toBe(400)
  })

  it('marks a matching order paid', async () => {
    evt('checkout.session.completed', { metadata: { orderId: 'o1' }, payment_intent: 'pi_1', amount_total: 4243, payment_status: 'paid' })
    const { POST } = await import('@/app/api/stripe-webhook/route')
    await POST(req())
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid', amount_paid_cents: 4243 }))
  })

  it('quarantines an underpaid order as amount_mismatch', async () => {
    evt('checkout.session.completed', { metadata: { orderId: 'o1' }, payment_intent: 'pi_1', amount_total: 550, payment_status: 'paid' })
    const { POST } = await import('@/app/api/stripe-webhook/route')
    await POST(req())
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'amount_mismatch', amount_paid_cents: 550 }))
  })

  it('ignores a completed session whose payment_status is not paid', async () => {
    evt('checkout.session.completed', { metadata: { orderId: 'o1' }, payment_intent: 'pi_1', amount_total: 4243, payment_status: 'unpaid' })
    const { POST } = await import('@/app/api/stripe-webhook/route')
    await POST(req())
    expect(update).not.toHaveBeenCalled()
  })

  it('cancels an expired session', async () => {
    evt('checkout.session.expired', { metadata: { orderId: 'o1' } })
    const { POST } = await import('@/app/api/stripe-webhook/route')
    await POST(req())
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
  })
})
```

- [ ] **Step 4: Run to verify it fails; then write `app/api/stripe-webhook/route.ts`**

Run: `npx vitest run test/webhook-route.test.ts` → FAIL (route not found).

```ts
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { reconcile } from '@/lib/orders/reconcile'

export async function POST(req: Request): Promise<Response> {
  const sig = req.headers.get('stripe-signature') ?? ''
  const raw = await req.text() // raw body required for signature verification

  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(raw, sig, env().STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return Response.json({ error: `Webhook Error: ${(err as Error).message}` }, { status: 400 })
  }

  const db = supabaseAdmin()

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const orderId = session.metadata?.orderId
    if (!orderId) return Response.json({ received: true })

    // Only a genuinely-paid session advances the order. Card is synchronous so this is
    // always 'paid' here; the guard defends against any async/delayed method settling later.
    if (session.payment_status !== 'paid') return Response.json({ received: true })

    const { data: order } = await db.from('orders').select('id, status, total_cents').eq('id', orderId).single()
    // Idempotent: only advance a pending order (Stripe may deliver more than once).
    if (!order || order.status !== 'pending') return Response.json({ received: true })

    const amountTotal = session.amount_total
    if (amountTotal == null) {
      // Anomalous: a paid session with no total. Quarantine without inventing a number.
      await db.from('orders').update({ status: 'amount_mismatch', amount_paid_cents: 0 })
        .eq('id', orderId).eq('status', 'pending')
      return Response.json({ received: true })
    }

    const { status, amountPaidCents } = reconcile(amountTotal, order)
    await db.from('orders').update({
      status,
      amount_paid_cents: amountPaidCents,
      stripe_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    }).eq('id', orderId).eq('status', 'pending')
    return Response.json({ received: true })
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session
    const orderId = session.metadata?.orderId
    if (orderId) {
      await db.from('orders').update({ status: 'cancelled' }).eq('id', orderId).eq('status', 'pending')
    }
    return Response.json({ received: true })
  }

  // payment_intent.payment_failed: leave the order 'pending' (retryable); there is no
  // 'failed' status in the enum. Log-only. (See spec §4.3 open detail.)
  return Response.json({ received: true })
}
```

- [ ] **Step 5: Run all money-path tests**

Run: `npx vitest run`
Expected: PASS across env, clients, pricing, checkout-build, checkout-route, reconcile, webhook-route.

- [ ] **Step 6: Commit**

```bash
git add lib/orders/reconcile.ts app/api/stripe-webhook/route.ts test/reconcile.test.ts test/webhook-route.test.ts
git commit -m "feat: reconciling Stripe webhook (paid | amount_mismatch | cancelled), idempotent" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Minimal storefront to exercise the path — prints, cart, checkout form, confirmation

**Files:**
- Create: `components/cart/CartContext.tsx`, `components/cart/AddToCart.tsx`, `app/(store)/prints/page.tsx`, `app/(store)/checkout/page.tsx`, `app/(store)/order/[id]/page.tsx`
- Modify: `app/(store)/layout.tsx` (wrap in `CartProvider`)

**Interfaces:**
- Consumes: `supabaseServer` (published reads), `supabaseAdmin` (confirmation read), `/api/checkout`.
- Produces: a functional (not final-pixel) purchase flow. Replaced by the `§12.5` build in later slices.

- [ ] **Step 1: Minimal cart context** (`components/cart/CartContext.tsx`) — client, `localStorage`-backed for the *cart only* (never orders)

```tsx
'use client'
import { createContext, useContext, useEffect, useState } from 'react'

export type CartLine = { photoId: string; title: string; size: string; register: 'colour' | 'silver'; qty: number }
const Ctx = createContext<{ lines: CartLine[]; add: (l: CartLine) => void; clear: () => void } | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([])
  useEffect(() => { const s = localStorage.getItem('cart:v1'); if (s) setLines(JSON.parse(s)) }, [])
  useEffect(() => { localStorage.setItem('cart:v1', JSON.stringify(lines)) }, [lines])
  return <Ctx.Provider value={{ lines, add: (l) => setLines((p) => [...p, l]), clear: () => setLines([]) }}>{children}</Ctx.Provider>
}
export function useCart() { const c = useContext(Ctx); if (!c) throw new Error('useCart outside provider'); return c }
```

- [ ] **Step 2: Nest `CartProvider` inside the store layout's `ThemeProvider`.**

```tsx
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { CartProvider } from '@/components/cart/CartContext'

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <ThemeProvider><CartProvider>{children}</CartProvider></ThemeProvider>
}
```

- [ ] **Step 3: Minimal prints page** (`app/(store)/prints/page.tsx`) — server component, published reads (per-request this slice; see note)

```tsx
import { supabaseServer } from '@/lib/supabase/server'
import { AddToCart } from '@/components/cart/AddToCart'

// Slice 1: rendered per-request so the build needs no live Supabase/env. Proper ISR +
// tagged fetches + revalidate-on-publish land in the storefront slice (spec §7).
export const dynamic = 'force-dynamic'

export default async function Prints() {
  const { data: photos } = await supabaseServer()
    .from('photos').select('id, slug, title, has_bw_variant').eq('published', true)
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontFamily: 'var(--font-playfair)' }}>Prints</h1>
      <ul>
        {(photos ?? []).map((p) => (
          <li key={p.id}>{p.title} <AddToCart photoId={p.id} title={p.title} hasBw={p.has_bw_variant} /></li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 4: Add-to-cart control** (`components/cart/AddToCart.tsx`) — client; size + register picker

```tsx
'use client'
import { useState } from 'react'
import { useCart } from './CartContext'

const SIZES = ['4x6', '5x7', '8x10', '11x14', '12x16', '16x20', '20x30']
export function AddToCart({ photoId, title, hasBw }: { photoId: string; title: string; hasBw: boolean }) {
  const { add } = useCart()
  const [size, setSize] = useState('8x10')
  const [register, setRegister] = useState<'colour' | 'silver'>('colour')
  return (
    <span>
      <select value={size} onChange={(e) => setSize(e.target.value)}>{SIZES.map((s) => <option key={s}>{s}</option>)}</select>
      <select value={register} onChange={(e) => setRegister(e.target.value as 'colour' | 'silver')} disabled={!hasBw}>
        <option value="colour">colour</option>{hasBw && <option value="silver">silver</option>}
      </select>
      <button onClick={() => add({ photoId, title, size, register, qty: 1 })}>Add</button>
    </span>
  )
}
```

- [ ] **Step 5: Checkout form** (`app/(store)/checkout/page.tsx`) — client; ISO-2 select; posts to `/api/checkout`

```tsx
'use client'
import { useState } from 'react'
import { useCart } from '@/components/cart/CartContext'

const COUNTRIES = [['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'], ['DE', 'Germany']]
export default function Checkout() {
  const { lines } = useCart()
  const [f, setF] = useState({ email: '', name: '', street: '', city: '', region: '', postalCode: '', country: 'US' })
  const [err, setErr] = useState<string | null>(null)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  async function pay() {
    setErr(null)
    const res = await fetch('/api/checkout', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: lines.map((l) => ({ photoId: l.photoId, size: l.size, register: l.register, qty: l.qty })),
        customer: { email: f.email, name: f.name },
        shippingAddress: { name: f.name, street: f.street, city: f.city, region: f.region, postalCode: f.postalCode, country: f.country },
      }),
    })
    const json = await res.json()
    if (!res.ok) { setErr(json.error ?? 'Checkout failed'); return }
    window.location.href = json.url
  }

  return (
    <main style={{ padding: 24, maxWidth: 480 }}>
      <h1 style={{ fontFamily: 'var(--font-playfair)' }}>Checkout</h1>
      <input placeholder="Email" value={f.email} onChange={set('email')} />
      <input placeholder="Full name" value={f.name} onChange={set('name')} />
      <input placeholder="Street" value={f.street} onChange={set('street')} />
      <input placeholder="City" value={f.city} onChange={set('city')} />
      <input placeholder="State/Region" value={f.region} onChange={set('region')} />
      <input placeholder="Postal code" value={f.postalCode} onChange={set('postalCode')} />
      <select value={f.country} onChange={set('country')}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
      {err && <p role="alert">{err}</p>}
      <button onClick={pay} disabled={!lines.length}>Pay with Stripe →</button>
    </main>
  )
}
```

- [ ] **Step 6: Confirmation page** (`app/(store)/order/[id]/page.tsx`) — server; service-key read; TRUE states only

```tsx
import { supabaseAdmin } from '@/lib/supabase/admin'

export default async function OrderConfirmation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: order } = await supabaseAdmin()
    .from('orders').select('id, status, total_cents, customer_name').eq('id', id).single()

  if (!order) return <main style={{ padding: 24 }}><p>We couldn’t find that order.</p></main>

  // Honest function: only true states. No fake tracking, no "email sent"; Stripe's receipt
  // is the only receipt. Cancelled/refunded orders never show a thank-you.
  const active = order.status === 'paid' || order.status === 'amount_mismatch' || order.status === 'pending'
  const message =
    order.status === 'paid' ? 'Your order is confirmed. Your receipt comes from Stripe.'
    : order.status === 'cancelled' ? 'This order was cancelled.'
    : order.status === 'refunded' ? 'This order was refunded.'
    : active ? 'We’ve received your order and are reviewing it. Your receipt comes from Stripe.'
    : 'This order is no longer active.'

  return (
    <main style={{ padding: 24 }}>
      <p style={{ fontFamily: 'var(--font-mono)' }}>{order.id}</p>
      <h1 style={{ fontFamily: 'var(--font-playfair)' }}>{active ? 'Thank you.' : 'Order update'}</h1>
      <p style={{ fontFamily: 'var(--font-newsreader)' }}>{message}</p>
    </main>
  )
}
```

- [ ] **Step 7: Verify build + typecheck + lint + all tests**

Run: `npm run build && npm run typecheck && npm run lint && npm run test`
Expected: all pass. The build needs no env — the Supabase/Stripe clients are lazy getters and `/prints` is `force-dynamic`, so nothing evaluates `env()` at build time.

- [ ] **Step 8: Commit**

```bash
git add "app/(store)" components/cart
git commit -m "feat: minimal prints/cart/checkout/confirmation to exercise the money path" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: End-to-end verification against Stripe test mode

**Files:** none (verification task). Produces evidence, not code.

**Interfaces:** exercises Tasks 5–9 end-to-end.

- [ ] **Step 1: Seed one published test photo** (Supabase SQL editor, new project)

```sql
insert into photos (slug, title, alt_text, published, has_bw_variant, original_key)
values ('test-print', 'Test Print', 'A test photograph for checkout verification.', true, true, 'originals/test-print/colour.jpg')
on conflict (slug) do nothing;
```

- [ ] **Step 2: Fill `.env.local`** with the new project's `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, **test-mode** `STRIPE_SECRET_KEY`, and (Step 4) `STRIPE_WEBHOOK_SECRET`. Leave `SITE_URL=http://localhost:3000`.

- [ ] **Step 3: Run the app; add the test print; go to `/checkout`; pay with Stripe test card `4242 4242 4242 4242`.**

Run: `npm run dev` → `http://localhost:3000/prints` → Add → `/checkout` → fill US/CA address → Pay.
Expected: redirect to Stripe test Checkout; after paying, redirect to `http://localhost:3000/order/<id>` — **verify the origin is localhost:3000 and NOT a stray host** (the `SITE_URL` trap, observed not assumed).

- [ ] **Step 4: Forward webhooks with the Stripe CLI and confirm reconciliation**

```bash
stripe listen --forward-to localhost:3000/api/stripe-webhook
# copy the printed whsec_... into STRIPE_WEBHOOK_SECRET, restart dev, repeat the purchase
```
Expected observations (Supabase table editor):
- The `orders` row moved `pending` → **`paid`**; `amount_paid_cents == total_cents`; `stripe_session_id`/`stripe_payment_intent_id` set.
- `shipping_address` holds the **complete** address in **snake_case** (name, street, city, region, postal_code, country) — written at insert, not empty.
- `order_items` rows carry snapshotted `title`, `size`, `register`, `unit_cents`, `original_key`.

- [ ] **Step 5: Force an `amount_mismatch` and confirm quarantine**

Temporarily insert an order via the checkout flow, then in a scratch script fire a `checkout.session.completed` with an `amount_total` below `total_cents` for that `orderId` (or use `stripe trigger` with an overridden amount). Expected: the row lands **`amount_mismatch`** with `amount_paid_cents` recorded — never silently `paid`.

- [ ] **Step 6: Record the evidence** in the PR description (command output + the observed row states). Do not claim "verified" without pasting it (`CLAUDE.md`: evidence before assertions).

- [ ] **Step 7: Final gate**

Run: `npm run build && npm run typecheck && npm run lint && npm run test`
Expected: all green. This is necessary but **not** sufficient — the Step 3–5 observations are the real gate for the money path.

---

## Self-Review — spec coverage

- App Router skeleton (§2) — Tasks 1, 4, 7, 8, 9. *(Admin route group + middleware are slice 4, per spec §5/§7 — deliberately out of scope.)*
- ISR + revalidate (§0) — deferred: slice-1 `/prints` is `force-dynamic` (functional cart source only), so `next build` needs no live data. Full ISR + tagged fetches + `revalidateTag`-on-publish land in slices 2/8 — noted, not silently dropped.
- Pre-generate derivatives (§0) — slice 5, out of scope here.
- Shipping-on-form / billing-on-Stripe (§0, §4.2) — Tasks 7, 9 (no `shipping_address_collection`; `billing_address_collection: 'required'`; full address written at insert).
- Env renames + `SITE_URL` trap (§3) — Tasks 2, 7 + the checkout-route assertion.
- Verbatim pricing port (§4.1) — Task 5 + golden equivalence test.
- `/api/checkout` (§4.2) — Tasks 6, 7.
- Reconciling webhook (§4.3) — Task 8 (paid / amount_mismatch / cancelled; idempotent; no `completed`/`failed`).
- Confirmation true-states (§4.4) — Task 9 Step 6 (cancelled/refunded show a true state, never a thank-you).
- Type + token infra incl. `ThemeProvider` (spec §5) — Task 4.
- Verification closes the money hole (§6) — Tasks 5, 7, 8 unit tests + Task 10 integration.
- Legacy removal (§1) — Task 1.

**Carried open (spec §8), intentionally not built here:** per-photo pricing, crop→Nations, focus states, aura fate, `payment_failed` policy, `sharp`-on-Vercel, the cutover checklist.

**Type consistency check:** `computeOrderAmounts` return shape, `ResolvedItem`, `reconcile` signature, and the order-row column names (`total_cents`, `amount_paid_cents`, `shipping_address`, snake_case) are used identically across Tasks 5–9.
