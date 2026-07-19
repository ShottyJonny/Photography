# Slice 4a — Admin Auth Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship cookie-backed Supabase email+password auth for a single admin, with every route under `/admin` protected, a sign-in surface, and a self-contained dark token scope — ending at a verifiable milestone: signed in, on a plain protected page, able to sign out.

**Architecture:** `proxy.ts` (Next 16's replacement for `middleware.ts`) refreshes the Supabase session cookie on every `/admin` request and redirects for UX. It is **not** the security boundary. The boundary is `requireAdmin()` in the data-access layer, called as the first statement of every admin read, write, and Server Action — because Next.js layouts do not re-render on client-side navigation, so a layout check would silently stop running on route changes. Admin surfaces read as the logged-in user through RLS, keeping the service-role key confined to the three sessionless paths (checkout, webhook, order confirmation).

**Tech Stack:** Next.js 16.2.10 (App Router, Turbopack), React 19, TypeScript strict, `@supabase/ssr` 0.12.3, `@supabase/supabase-js` 2.110.7, zod 3, Vitest 2.

**Spec:** `docs/superpowers/specs/2026-07-19-admin-auth-spine-design.md` — read it before starting. Section references below (`§3.1`, `D10`, …) point into it.

**Two additions to the spec's §8.2 test list**, both closing coverage holes the spec assumes are covered: `test/admin-landing.test.tsx` (Task 8) and `test/admin-clients.test.ts` (Task 4). Nothing else departs from the spec.

---

## Global Constraints

These apply to **every** task. They are not repeated per-task.

**Environment traps — these pass locally and fail on CI:**

- **Node 20 is the CI target** (`.nvmrc`); the dev machine is Node 22. Node 20 has **no global `WebSocket`**, and `@supabase/supabase-js` constructs an (unused) `RealtimeClient` on every `createClient` call that throws without one. **Every Supabase client construction must pass `realtime: { transport: WebSocket }` from the `ws` package**, exactly as `lib/supabase/admin.ts` and `lib/supabase/server.ts` already do. Task 4's `test/admin-clients.test.ts` is the guard.
- **There is no `@testing-library/jest-dom`.** `.toBeInTheDocument()`, `.toBeDisabled()`, `.toHaveAttribute()` are **unavailable**. Assert with `container.textContent`, `container.querySelector(...)`, `el.getAttribute(...)`, `el.hasAttribute(...)`.
- **`redirect()` from `next/navigation` throws** a `NEXT_REDIRECT` error. It must never sit inside a `try` that swallows. When mocked, mock it to **throw** — a no-op mock lets execution continue past the redirect and the test passes while proving nothing.
- **`cookies()` from `next/headers` is async in Next 16** — always `await cookies()`.
- **supabase-js does NOT throw on network failure.** `signInWithPassword` and `getUser` catch every `AuthError` and **return** it — a dead network arrives as `AuthRetryableFetchError` with `status: 0`, not as an exception. Classify by the returned error, not by `try/catch`.

**Code rules:**

- **Apostrophes in user-visible strings use `’`**, never `'` — because `design.md §11.2` specifies typographic apostrophes. This is *not* a lint requirement: `react/no-unescaped-entities` fires on **JSX text only**, so a straight apostrophe in a `.ts` string literal passes lint. Use `’` in both places anyway. JSX precedent: `app/(store)/order/[id]/page.tsx:34`.
- **DB is snake_case**, no exceptions.
- **Do not touch** `lib/pricing.ts`, `lib/checkout/`, `lib/orders/`, `lib/data/`, `app/api/`, `app/(store)/`, `components/{store,cart,product,theme}/`.
- **Do not modify `vitest.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `next.config.ts`, or `.github/workflows/ci.yml`.** Do not add any dependency other than `@supabase/ssr` — in particular **do not add `@testing-library/jest-dom`**; work within the assertion set above. Do not add `eslint-disable` comments. If a gate cannot be satisfied without one of these, **stop and report** rather than changing the gate.

**Scope and safety:**

- **Never run SQL against the Supabase project, and never open the Supabase dashboard.** The spec's §9.1 and §9.3 queries are Jon's to run, not yours. Slice 4a reads no business data at all.
- **The spec's §9.2 manual verification steps are Jon's** — browser, real sign-in, autofill, Back button. Do not attempt them and do not claim them done.
- **Do not build the shell, the nav, or the dashboard.** Those are slice 4b. If you find yourself writing a sidebar, stop.
- **Do not "correct" `--faint: .50` or `--hairform: .37` back to `design.md §11.1`'s literals.** They deviate deliberately (spec D10/D11) because §11.1's values fail WCAG contrast. `test/admin-tokens.test.ts` locks them.

**Process:**

- **Branch:** `slice-4`, already created off `develop`. Run `git checkout slice-4` and confirm `git branch --show-current` prints `slice-4` before Task 1. Never commit to `main` or `develop`; never `--no-verify`, `--force`, or bypass hooks.
- **The gate** is four commands: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`. Baseline: **1563 tests passing** on `develop`. Each task runs typecheck + lint before committing; Task 9 runs all four.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/env.ts` (modify) | Add `supabaseAuthEnv()` — a narrow accessor so admin auth does not depend on the Stripe vars |
| `lib/supabase/auth-server.ts` (new) | Cookie-bound Supabase client for Server Components / Actions |
| `lib/supabase/auth-proxy.ts` (new) | Same client, bound to `NextRequest`/`NextResponse` instead |
| `lib/admin/require-admin.ts` (new) | `requireAdmin()` — **the** authorization boundary |
| `lib/admin/auth-state.ts` (new) | `SignInState` union + error copy. Separate from the actions because a `'use server'` module may export only async functions |
| `lib/admin/auth-actions.ts` (new) | `signIn` / `signOut` Server Actions |
| `proxy.ts` (new, repo root) | Session refresh + redirect + security headers |
| `app/admin/layout.tsx` (new) | `[data-admin]` token scope, noindex metadata |
| `app/admin/sign-in/page.tsx` (new) | Public sign-in surface |
| `app/admin/(protected)/layout.tsx` (new) | `force-dynamic`; calls `requireAdmin()` |
| `app/admin/(protected)/page.tsx` (new) | Plain placeholder landing (replaced wholesale in 4b) |
| `components/admin/SignInForm.tsx` (new) | `useActionState` wrapper + pure `SignInFields` presentational split |
| `components/admin/SignOutButton.tsx` (new) | POST form + button |
| `app/globals.css` (modify) | Append the `[data-admin]` block, `.admin-sr-only`, and the admin classes |
| `CLAUDE.md` (modify) | Route shape, clients, test baseline |

---

## Task 1: `supabaseAuthEnv()` and the dependency

**Files:**
- Modify: `package.json`, `lib/env.ts`
- Test: `test/admin-env.test.ts`

**Interfaces:**
- Produces: `supabaseAuthEnv(source?: Record<string, string | undefined>): { url: string; anonKey: string }`

**Why a narrow accessor:** `env()` validates all five required vars including both Stripe keys and throws if any is missing. It runs on every `/admin` request. Coupling admin sign-in to `STRIPE_WEBHOOK_SECRET` is a latent, confusing outage.

- [ ] **Step 1: Confirm the branch, then install**

```bash
git checkout slice-4
git branch --show-current
npm install @supabase/ssr
npm ls @supabase/ssr
```

Expected: branch prints `slice-4`; `@supabase/ssr@0.12.3` (or newer) resolves. Its peer `@supabase/supabase-js@^2.110.5` is already satisfied by the installed 2.110.7.

- [ ] **Step 2: Write the failing test**

Create `test/admin-env.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { supabaseAuthEnv } from '@/lib/env'

const base = {
  SUPABASE_URL: 'https://x.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
}

describe('supabaseAuthEnv', () => {
  it('returns the url and anon key', () => {
    expect(supabaseAuthEnv(base)).toEqual({ url: 'https://x.supabase.co', anonKey: 'anon' })
  })

  it('falls back to NEXT_PUBLIC_SUPABASE_URL when SUPABASE_URL is absent', () => {
    const s = { NEXT_PUBLIC_SUPABASE_URL: 'https://y.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' }
    expect(supabaseAuthEnv(s).url).toBe('https://y.supabase.co')
  })

  it('throws naming the url when both url vars are absent', () => {
    expect(() => supabaseAuthEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' })).toThrow(/SUPABASE_URL/)
  })

  it('throws naming the anon key when it is absent', () => {
    expect(() => supabaseAuthEnv({ SUPABASE_URL: 'https://x.supabase.co' })).toThrow(/ANON_KEY/)
  })

  it('treats a blank value as missing', () => {
    expect(() => supabaseAuthEnv({ ...base, NEXT_PUBLIC_SUPABASE_ANON_KEY: '   ' })).toThrow(/ANON_KEY/)
  })

  it('does NOT require the Stripe vars', () => {
    expect(() => supabaseAuthEnv(base)).not.toThrow()
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run test/admin-env.test.ts`
Expected: FAIL — `supabaseAuthEnv is not a function`, or an import error.

- [ ] **Step 4: Implement**

Append to `lib/env.ts`. Leave `loadEnv`, `env`, and `Env` exactly as they are.

```ts
/**
 * Narrow accessor for the two values Supabase Auth needs.
 *
 * Deliberately NOT env(): that validates the Stripe keys too, and it runs on
 * every /admin request. A missing STRIPE_WEBHOOK_SECRET must not be able to
 * break admin sign-in.
 */
export function supabaseAuthEnv(source: Source = process.env): { url: string; anonKey: string } {
  const url = (source.SUPABASE_URL ?? source.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const anonKey = (source.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()

  const missing: string[] = []
  if (!url) missing.push('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)')
  if (!anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`)
  }

  return { url, anonKey }
}
```

- [ ] **Step 5: Run the test and the static gate**

```bash
npx vitest run test/admin-env.test.ts
npm run typecheck
npm run lint
```

Expected: 6 tests PASS; 0 type errors; 0 lint problems.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/env.ts test/admin-env.test.ts
git commit -m "feat(admin): add @supabase/ssr and a narrow supabaseAuthEnv accessor" -m "env() validates both Stripe keys and would run on every /admin request; a missing STRIPE_WEBHOOK_SECRET must not be able to break admin sign-in." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: The two Supabase auth clients

**Files:**
- Create: `lib/supabase/auth-server.ts`, `lib/supabase/auth-proxy.ts`

**Interfaces:**
- Consumes: `supabaseAuthEnv()` from Task 1.
- Produces:
  - `createAuthServerClient(): Promise<SupabaseClient>`
  - `createProxyAuthClient(request: NextRequest): { supabase: SupabaseClient; getResponse: () => NextResponse }`

Both are covered by Task 4's tests. Committed together because neither is useful alone.

**Verified API contract** (`@supabase/ssr@0.12.3`, read from its `.d.ts` — do not substitute a remembered shape):

```ts
createServerClient(url, key, options: SupabaseClientOptions & {
  cookies: { getAll: GetAllCookies; setAll?: SetAllCookies; encode?: … }
  cookieOptions?: CookieOptionsWithName
  cookieEncoding?: 'raw' | 'base64url'
})

type SetAllCookies = (
  cookies: { name: string; value: string; options: CookieOptions }[],
  headers: Record<string, string>,   // ← second parameter
) => Promise<void> | void
```

- `getAll` is **required**; `setAll` is optional but omitting it breaks refresh.
- The `get`/`set`/`remove` trio is **deprecated** — do not use it.
- The `headers` argument carries the library's no-store set. Its type comment: a response that sets auth cookies must not be cached by a CDN, *"otherwise one user's session token can be served to a different user."*
- The client uses lazy session init, so the refresh fires on the first `getUser()` — which is why it must be called immediately, before any response is committed.

- [ ] **Step 1: Create `lib/supabase/auth-server.ts`**

```ts
import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WebSocketLikeConstructor } from '@supabase/realtime-js'
import WebSocket from 'ws'
import { supabaseAuthEnv } from '@/lib/env'

// The admin session cookie is served from the same origin as the public
// storefront. Nothing here needs JS access to it — sign-in is a Server Action
// and createBrowserClient is never used — so it is httpOnly. Merged OVER the
// library's options so its maxAge/expires survive.
const SECURE_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
} as const

export async function createAuthServerClient(): Promise<SupabaseClient> {
  // cookies() is async in Next 16. Without the await, getAll() is called on a Promise.
  const cookieStore = await cookies()
  const { url, anonKey } = supabaseAuthEnv()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // Signature is (cookies, headers). The headers argument is unusable from
      // a Server Component (which can set neither cookies nor headers) and is
      // deliberately ignored; proxy.ts sets the equivalent on every response.
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            cookieStore.set(name, value, { ...options, ...SECURE_COOKIE })
          }
        } catch (err) {
          // EXPECTED during a Server Component render: cookies are read-only
          // there, and proxy.ts refreshes on every /admin request, so dropping
          // the write is safe. NOT expected inside a Server Action, where the
          // write IS the sign-in — so leave a trace rather than vanishing.
          console.warn('[admin-auth] cookie write dropped', err)
        }
      },
    },
    // See lib/supabase/admin.ts — Node 20 has no global WebSocket.
    realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
  })
}
```

- [ ] **Step 2: Create `lib/supabase/auth-proxy.ts`**

Note the absence of `import 'server-only'` — this module is imported by `proxy.ts`, which is not a Server Component.

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WebSocketLikeConstructor } from '@supabase/realtime-js'
import WebSocket from 'ws'
import { supabaseAuthEnv } from '@/lib/env'

const SECURE_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
} as const

/**
 * Separate from auth-server.ts for exactly one reason: the two bind cookies to
 * different objects (NextRequest/NextResponse vs next/headers).
 *
 * getResponse() is a thunk, not a value: `response` is REASSIGNED inside
 * setAll, and returning the object directly would hand back the stale one —
 * silently discarding every refreshed cookie.
 */
export function createProxyAuthClient(request: NextRequest): {
  supabase: SupabaseClient
  getResponse: () => NextResponse
} {
  let response = NextResponse.next({ request })
  const { url, anonKey } = supabaseAuthEnv()

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      // All three of spec §3.5's rules live here.
      setAll: (list, headers) => {
        // (2a) Mirror onto the request first, or this same request's later
        // getAll() reads stale values.
        for (const { name, value } of list) request.cookies.set(name, value)
        // (2b) Re-create the response so it carries the updated request.
        response = NextResponse.next({ request })
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, { ...options, ...SECURE_COOKIE })
        }
        // The library's no-store headers: a response that sets auth cookies
        // must not be cached by a CDN, "otherwise one user's session token can
        // be served to a different user."
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value)
        }
      },
    },
    realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
  })

  return { supabase, getResponse: () => response }
}
```

- [ ] **Step 3: Static gate**

```bash
npm run typecheck
npm run lint
```

Expected: 0 errors, 0 problems.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/auth-server.ts lib/supabase/auth-proxy.ts
git commit -m "feat(admin): cookie-bound Supabase auth clients" -m "Two modules because the two bind cookies to different objects. Both supply the ws transport (Node 20 has no global WebSocket). setAll on the server client logs and proceeds: Server Components cannot set cookies, and proxy.ts refreshes on every /admin request." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `requireAdmin()` — the authorization boundary

**Files:**
- Create: `lib/admin/require-admin.ts`
- Test: `test/require-admin.test.ts`

**Interfaces:**
- Consumes: `createAuthServerClient()` from Task 2.
- Produces: `loadAdmin(): Promise<User>` (uncached, exported for tests) and `requireAdmin = cache(loadAdmin)`.

**Why this exists and the layout does not do it:** Next 16's auth guide — *"Due to Partial Rendering, be cautious when doing checks in Layouts as these don't re-render on navigation… Instead, you should do the checks close to your data source."* With slices 5–7's pages under one group, a client-side `<Link>` would render a target page against a cached layout and the check would never run.

**Why `getUser()` and never `getSession()`:** `getSession()` decodes the cookie and trusts it; `getUser()` revalidates the JWT against Supabase's auth server. A cookie is attacker-controllable input.

- [ ] **Step 1: Write the failing test**

Create `test/require-admin.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const authState: { user: unknown; error: unknown } = { user: null, error: null }
const getUser = vi.fn(async () => ({ data: { user: authState.user }, error: authState.error }))
const getSession = vi.fn()

vi.mock('@/lib/supabase/auth-server', () => ({
  createAuthServerClient: async () => ({ auth: { getUser, getSession } }),
}))

// redirect() must THROW. A no-op mock would let execution continue past the
// redirect, and the test would pass while proving nothing.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT;${url}`)
  },
}))

beforeEach(() => {
  authState.user = null
  authState.error = null
  getUser.mockClear()
  getSession.mockClear()
})

describe('loadAdmin', () => {
  it('redirects to sign-in when there is no user', async () => {
    const { loadAdmin } = await import('@/lib/admin/require-admin')
    await expect(loadAdmin()).rejects.toThrow(/NEXT_REDIRECT;\/admin\/sign-in/)
  })

  // supabase-js RETURNS auth errors rather than throwing, so this is the
  // shape a real expired/invalid session arrives in.
  it('redirects when getUser returns an error, even alongside a user', async () => {
    authState.user = { id: 'u1', email: 'a@b.com' }
    authState.error = { name: 'AuthApiError', status: 401, message: 'jwt expired' }
    const { loadAdmin } = await import('@/lib/admin/require-admin')
    await expect(loadAdmin()).rejects.toThrow(/NEXT_REDIRECT/)
  })

  it('returns the user when authenticated', async () => {
    authState.user = { id: 'u1', email: 'jon@example.com' }
    const { loadAdmin } = await import('@/lib/admin/require-admin')
    const user = await loadAdmin()
    expect(user.email).toBe('jon@example.com')
  })

  it('uses getUser, never getSession', async () => {
    authState.user = { id: 'u1', email: 'jon@example.com' }
    const { loadAdmin } = await import('@/lib/admin/require-admin')
    await loadAdmin()
    expect(getUser).toHaveBeenCalled()
    expect(getSession).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/require-admin.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin/require-admin`.

- [ ] **Step 3: Implement**

Create `lib/admin/require-admin.ts`:

```ts
import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

/**
 * THE authorization boundary for the admin.
 *
 * Next.js layouts do NOT re-render on client-side navigation, so a check in a
 * layout stops running on route changes. Every admin read, write, and Server
 * Action calls this as its FIRST statement — including in slices 5-7.
 *
 * Exported uncached so it is testable; requireAdmin is the cached export
 * everything else imports.
 */
export async function loadAdmin(): Promise<User> {
  const supabase = await createAuthServerClient()
  // getUser(), never getSession(): getSession decodes the cookie and trusts it.
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) redirect('/admin/sign-in')
  return data.user
}

/** Deduped per request, so the layout and the page share one round-trip. */
export const requireAdmin = cache(loadAdmin)
```

- [ ] **Step 4: Run the test and the static gate**

```bash
npx vitest run test/require-admin.test.ts
npm run typecheck
npm run lint
```

Expected: 4 tests PASS; 0 errors; 0 problems.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/require-admin.ts test/require-admin.test.ts
git commit -m "feat(admin): requireAdmin() as the authorization boundary" -m "Not the layout: Next layouts do not re-render on client-side navigation, so a layout check silently stops running on route changes. getUser() never getSession() — a cookie is attacker-controllable input." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `proxy.ts` — session refresh and redirects

**Files:**
- Create: `proxy.ts` (repo root, beside `next.config.ts`)
- Test: `test/admin-proxy.test.ts`, `test/admin-clients.test.ts`

**Interfaces:**
- Consumes: `createProxyAuthClient()` from Task 2.
- Produces: `proxy(request: NextRequest): Promise<NextResponse>` and `config.matcher`.

**Why `proxy.ts` and not `middleware.ts`:** Next 16 deprecated the `middleware` filename and renamed it to `proxy`. Verified in the installed package: *"The `middleware` filename is deprecated, and has been renamed to `proxy`… The `edge` runtime is **NOT** supported in `proxy`. The `proxy` runtime is `nodejs`, and it cannot be configured."* The Node runtime is why the `ws` transport works here.

**Note the mocking strategy.** `test/admin-proxy.test.ts` mocks **`@supabase/ssr`**, not `lib/supabase/auth-proxy` — so the real `setAll` adapter runs and spec §3.5's three rules are actually exercised. Mocking the wrapper would leave rules 1 and 2 with zero coverage while every test stayed green.

- [ ] **Step 1: Write `test/admin-clients.test.ts`**

This is the deliberate exception to "never construct a real Supabase client in a test": it constructs but never touches the network, and it is the only thing that catches a missing `ws` transport on CI's Node 20. It has no `vi.mock`, so it must live in its own file.

```ts
import { it, expect, beforeAll, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'

// The one place this suite writes process.env. test/env.test.ts and
// test/admin-env.test.ts both inject their own source, so nothing collides.
const saved = { url: process.env.SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
})
afterAll(() => {
  process.env.SUPABASE_URL = saved.url
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key
})

it('constructs the proxy auth client (catches a missing ws transport on Node 20)', async () => {
  const { createProxyAuthClient } = await import('@/lib/supabase/auth-proxy')
  const { supabase } = createProxyAuthClient(
    new NextRequest(new URL('/admin', 'http://localhost:3000')),
  )
  expect(supabase.auth).toBeTypeOf('object')
})

it('constructs the server auth client (same guard, other module)', async () => {
  vi.doMock('next/headers', () => ({
    cookies: async () => ({ getAll: () => [], set: () => {} }),
  }))
  const { createAuthServerClient } = await import('@/lib/supabase/auth-server')
  const supabase = await createAuthServerClient()
  expect(supabase.auth).toBeTypeOf('object')
})
```

- [ ] **Step 2: Write `test/admin-proxy.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type CookieList = { name: string; value: string; options: Record<string, unknown> }[]
type SetAll = (list: CookieList, headers: Record<string, string>) => void

const state: { user: unknown; error: unknown; throws: boolean; emitCookie: boolean } = {
  user: null, error: null, throws: false, emitCookie: false,
}
const captured: { setAll?: SetAll } = {}

// Mock the LIBRARY, not our wrapper — so the real setAll adapter in
// lib/supabase/auth-proxy.ts runs and spec §3.5's three rules are exercised.
vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { getAll: () => unknown; setAll?: SetAll } },
  ) => {
    captured.setAll = opts.cookies.setAll
    return {
      auth: {
        getUser: async () => {
          if (state.throws) throw new Error('network down')
          if (state.emitCookie) {
            // Drive the adapter exactly as the library would on a refresh.
            captured.setAll?.(
              [{ name: 'sb-refreshed', value: 'new-token', options: { path: '/', maxAge: 3600 } }],
              { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' },
            )
          }
          return { data: { user: state.user }, error: state.error }
        },
      },
    }
  },
}))

function req(pathname: string) {
  return new NextRequest(new URL(pathname, 'http://localhost:3000'))
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  state.user = null; state.error = null; state.throws = false; state.emitCookie = false
  captured.setAll = undefined
})

describe('proxy', () => {
  it('redirects an unauthenticated request to sign-in', async () => {
    const { proxy } = await import('@/proxy')
    const res = await proxy(req('/admin'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/admin/sign-in')
  })

  it('lets an unauthenticated request through to sign-in', async () => {
    const { proxy } = await import('@/proxy')
    expect((await proxy(req('/admin/sign-in'))).status).toBe(200)
  })

  it('redirects an authenticated request away from sign-in', async () => {
    state.user = { id: 'u1' }
    const { proxy } = await import('@/proxy')
    const res = await proxy(req('/admin/sign-in'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/\/admin$/)
  })

  it('lets an authenticated request through', async () => {
    state.user = { id: 'u1' }
    const { proxy } = await import('@/proxy')
    expect((await proxy(req('/admin'))).status).toBe(200)
  })

  it('never fails open when getUser throws', async () => {
    state.throws = true
    const { proxy } = await import('@/proxy')
    const res = await proxy(req('/admin'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/admin/sign-in')
  })

  // supabase-js RETURNS network errors rather than throwing — this is the real
  // Supabase-down shape, and the case the `!error &&` conjunct exists for.
  it('never fails open when getUser RETURNS an error', async () => {
    state.error = { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' }
    const { proxy } = await import('@/proxy')
    const res = await proxy(req('/admin'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/admin/sign-in')
  })

  it('treats a user present alongside an error as unauthenticated', async () => {
    state.user = { id: 'u1' }
    state.error = { name: 'AuthApiError', status: 401, message: 'jwt expired' }
    const { proxy } = await import('@/proxy')
    expect((await proxy(req('/admin'))).status).toBe(307)
  })

  // THE TRAP: a bare NextResponse.redirect() discards refreshed auth cookies
  // and produces an intermittent logout loop. The real adapter sets these.
  it('carries refreshed cookies onto the redirect response, attributes intact', async () => {
    state.emitCookie = true
    const { proxy } = await import('@/proxy')
    const res = await proxy(req('/admin'))
    expect(res.status).toBe(307)
    expect(res.cookies.get('sb-refreshed')?.value).toBe('new-token')
    expect(res.cookies.get('sb-refreshed')?.httpOnly).toBe(true)
    expect(res.cookies.get('sb-refreshed')?.maxAge).toBe(3600)
  })

  it('sets no-store and noindex on every response', async () => {
    state.user = { id: 'u1' }
    const { proxy } = await import('@/proxy')
    const res = await proxy(req('/admin'))
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
  })

  it('matches /admin and everything under it, and nothing else', async () => {
    const { config } = await import('@/proxy')
    expect(config.matcher).toEqual(['/admin/:path*'])
  })
})

// Spec §3.5 rules 1 and 2, driven directly against the real adapter.
describe('the setAll adapter', () => {
  it('mirrors cookies onto the request and applies the library headers', async () => {
    const { createProxyAuthClient } = await import('@/lib/supabase/auth-proxy')
    const request = req('/admin')
    const { getResponse } = createProxyAuthClient(request)
    captured.setAll?.(
      [{ name: 'sb-x', value: 'v1', options: { path: '/' } }],
      { 'Cache-Control': 'private, no-store' },
    )
    expect(request.cookies.get('sb-x')?.value).toBe('v1')
    expect(getResponse().cookies.get('sb-x')?.value).toBe('v1')
    expect(getResponse().headers.get('cache-control')).toContain('no-store')
  })
})
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `npx vitest run test/admin-proxy.test.ts test/admin-clients.test.ts`
Expected: `admin-proxy` FAILs — cannot resolve `@/proxy`. `admin-clients` PASSES already (Task 2 created both modules).

- [ ] **Step 4: Implement**

Create `proxy.ts` at the repo root:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createProxyAuthClient } from '@/lib/supabase/auth-proxy'

// Matches /admin itself as well as everything beneath it. Nothing outside
// /admin is intercepted, so no _next/static exclusion is needed.
export const config = { matcher: ['/admin/:path*'] }

const SIGN_IN = '/admin/sign-in'

function harden(res: NextResponse): NextResponse {
  // no-store is what actually stops bfcache restoring a post-sign-out page.
  res.headers.set('Cache-Control', 'no-store, private')
  // Covers response shapes a <meta robots> tag cannot reach.
  res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return res
}

function redirectTo(request: NextRequest, from: NextResponse, pathname: string): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''
  const res = NextResponse.redirect(url)
  // THE TRAP: without this, refreshed auth cookies are discarded and the admin
  // gets an intermittent logout loop.
  for (const cookie of from.cookies.getAll()) res.cookies.set(cookie)
  return res
}

/**
 * Session refresh + UX redirect. NOT the security boundary — that is
 * requireAdmin() in the data-access layer (lib/admin/require-admin.ts).
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { supabase, getResponse } = createProxyAuthClient(request)

  // Must be called immediately after construction, or the refresh races the
  // response object.
  let signedIn = false
  try {
    const { data, error } = await supabase.auth.getUser()
    // supabase-js RETURNS auth errors rather than throwing; the !error conjunct
    // is what keeps a Supabase outage from failing open.
    signedIn = !error && Boolean(data?.user)
  } catch {
    signedIn = false // never fail open
  }

  const onSignIn = request.nextUrl.pathname === SIGN_IN
  const response = getResponse()

  if (!signedIn && !onSignIn) return harden(redirectTo(request, response, SIGN_IN))
  if (signedIn && onSignIn) return harden(redirectTo(request, response, '/admin'))
  return harden(response)
}
```

- [ ] **Step 5: Run the tests, then prove Next actually picks the file up**

```bash
npx vitest run test/admin-proxy.test.ts test/admin-clients.test.ts
npm run typecheck
npm run lint
npm run build
```

Expected: 11 + 2 tests PASS; 0 errors; 0 problems; **and the build output lists a `ƒ Proxy` entry**. A unit test would pass even if Next never picked the file up — the build is the only thing that proves the convention. If no proxy appears, confirm the file is at the repo root beside `next.config.ts` and exports a function named `proxy`.

- [ ] **Step 6: Commit**

```bash
git add proxy.ts test/admin-proxy.test.ts test/admin-clients.test.ts
git commit -m "feat(admin): proxy.ts refreshes the admin session and redirects" -m "proxy.ts, not middleware.ts — the latter is deprecated in Next 16 and the proxy runtime is nodejs. Refreshed cookies are copied onto redirect responses (a bare NextResponse.redirect discards them, causing an intermittent logout loop). Tests mock @supabase/ssr rather than our wrapper so the real setAll adapter is exercised." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Sign-in and sign-out Server Actions

**Files:**
- Create: `lib/admin/auth-state.ts`, `lib/admin/auth-actions.ts`
- Test: `test/admin-auth-actions.test.ts`

**Interfaces:**
- Consumes: `createAuthServerClient()` from Task 2.
- Produces: `SignInState`, `INITIAL_SIGN_IN_STATE`, `SIGN_IN_ERROR_COPY`; `signIn(prev, formData)`, `signOut()`.

**Why two files:** a `'use server'` module may export **only async functions**. An `export const` beside the actions is a build error.

**Why `(prev, formData)`:** `useActionState` requires that signature. A bare `(formData)` action compiles under `<form action={…}>` but discards the return value, making every error state unreachable dead code.

- [ ] **Step 1: Create `lib/admin/auth-state.ts`**

```ts
export type SignInErrorKind = 'credentials' | 'rate_limited' | 'transport' | 'unknown'

export type SignInState =
  | { status: 'idle' }
  | { status: 'error'; kind: SignInErrorKind }
  | { status: 'fieldErrors'; email?: string; password?: string }

export const INITIAL_SIGN_IN_STATE: SignInState = { status: 'idle' }

// Typographic apostrophes per design.md §11.2.
export const SIGN_IN_ERROR_COPY: Record<SignInErrorKind, string> = {
  // Deliberately generic — never reveals whether an address exists. GoTrue
  // returns a uniform invalid_credentials for both cases, so this matches.
  credentials: 'Those credentials didn’t work.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
  // Says only what is known. "Couldn't reach the authentication service"
  // asserts a network fact the app cannot establish — a 500 was reached fine.
  transport: 'Sign-in isn’t working right now. Not your password.',
  unknown: 'Sign-in failed.',
}
```

- [ ] **Step 2: Write the failing test**

Create `test/admin-auth-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { INITIAL_SIGN_IN_STATE } from '@/lib/admin/auth-state'

const state: { signInError: unknown; signInThrows: boolean; signOutRejects: boolean } = {
  signInError: null, signInThrows: false, signOutRejects: false,
}
const signInWithPassword = vi.fn(async () => {
  if (state.signInThrows) throw new Error('boom')
  return { error: state.signInError }
})
const supabaseSignOut = vi.fn(async () => {
  if (state.signOutRejects) throw new Error('gotrue down')
  return { error: null }
})

vi.mock('@/lib/supabase/auth-server', () => ({
  createAuthServerClient: async () => ({
    auth: { signInWithPassword, signOut: supabaseSignOut },
  }),
}))

const deleted: string[] = []
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [{ name: 'sb-access-token', value: 'x' }, { name: 'theme:v1', value: 'dark' }],
    delete: (name: string) => { deleted.push(name) },
    set: () => {},
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT;${url}`) },
}))

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

function form(email: string, password: string) {
  const fd = new FormData()
  fd.set('email', email)
  fd.set('password', password)
  return fd
}
async function run(email: string, password: string) {
  const { signIn } = await import('@/lib/admin/auth-actions')
  return signIn(INITIAL_SIGN_IN_STATE, form(email, password))
}

beforeEach(() => {
  state.signInError = null; state.signInThrows = false; state.signOutRejects = false
  deleted.length = 0
  signInWithPassword.mockClear(); supabaseSignOut.mockClear(); revalidatePath.mockClear()
})

describe('signIn', () => {
  it('returns field errors for a malformed email and never calls Supabase', async () => {
    const result = await run('not-an-email', 'pw')
    expect(result.status).toBe('fieldErrors')
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('returns a field error for an empty password', async () => {
    expect((await run('jon@example.com', '')).status).toBe('fieldErrors')
  })

  it('maps invalid_credentials to the generic credentials error', async () => {
    state.signInError = { name: 'AuthApiError', code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' }
    expect(await run('jon@example.com', 'wrong')).toEqual({ status: 'error', kind: 'credentials' })
  })

  it('maps a 429 to rate_limited, not transport', async () => {
    state.signInError = { name: 'AuthApiError', code: 'over_request_rate_limit', status: 429, message: 'too many' }
    expect(await run('jon@example.com', 'pw')).toEqual({ status: 'error', kind: 'rate_limited' })
  })

  // THE ONE THAT MATTERS: supabase-js does NOT throw on a dead network. It
  // catches every AuthError and RETURNS it, with status 0. Without an explicit
  // branch the transport copy is unreachable dead code.
  it('maps a RETURNED AuthRetryableFetchError to transport', async () => {
    state.signInError = { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' }
    expect(await run('jon@example.com', 'pw')).toEqual({ status: 'error', kind: 'transport' })
  })

  it('maps a 5xx from GoTrue to transport', async () => {
    state.signInError = { name: 'AuthApiError', status: 503, message: 'service unavailable' }
    expect(await run('jon@example.com', 'pw')).toEqual({ status: 'error', kind: 'transport' })
  })

  it('maps an unrecognised auth error to unknown, not transport', async () => {
    state.signInError = { name: 'AuthApiError', code: 'email_not_confirmed', status: 400, message: 'Email not confirmed' }
    expect(await run('jon@example.com', 'pw')).toEqual({ status: 'error', kind: 'unknown' })
  })

  it('maps a thrown non-auth error to transport', async () => {
    state.signInThrows = true
    expect(await run('jon@example.com', 'pw')).toEqual({ status: 'error', kind: 'transport' })
  })

  it('redirects to /admin on success', async () => {
    await expect(run('jon@example.com', 'pw')).rejects.toThrow(/NEXT_REDIRECT;\/admin$/)
  })
})

describe('signOut', () => {
  it('clears sb- cookies, revalidates, and redirects', async () => {
    const { signOut } = await import('@/lib/admin/auth-actions')
    await expect(signOut()).rejects.toThrow(/NEXT_REDIRECT;\/admin\/sign-in/)
    expect(deleted).toContain('sb-access-token')
    expect(deleted).not.toContain('theme:v1')
    expect(revalidatePath).toHaveBeenCalledWith('/admin', 'layout')
  })

  // Fail-closed: a rejected signOut must not leave the admin signed in on a
  // screen that says otherwise.
  it('clears cookies and redirects even when Supabase signOut rejects', async () => {
    state.signOutRejects = true
    const { signOut } = await import('@/lib/admin/auth-actions')
    await expect(signOut()).rejects.toThrow(/NEXT_REDIRECT;\/admin\/sign-in/)
    expect(deleted).toContain('sb-access-token')
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run test/admin-auth-actions.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin/auth-actions`.

- [ ] **Step 4: Implement**

Create `lib/admin/auth-actions.ts`:

```ts
'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import type { SignInErrorKind, SignInState } from '@/lib/admin/auth-state'

const credentials = z.object({
  email: z.string().trim().min(1, 'Enter your email.').email('That doesn’t look like an email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

/**
 * Classify by the RETURNED error's code, name and HTTP status.
 *
 * supabase-js does not throw on a dead network: signInWithPassword catches
 * every AuthError and returns it, so a failed fetch arrives here as
 * AuthRetryableFetchError with status 0. Without that branch the transport
 * copy is unreachable and a Supabase outage renders as "Sign-in failed."
 *
 * Classifying by exception-vs-return would also report email_not_confirmed, a
 * 429 lockout, and user_banned — all from a perfectly reachable server — as
 * network failures, so the one message telling Jon he is rate-limited would
 * tell him to check his internet.
 */
function classify(error: {
  name?: string
  code?: string
  status?: number
  message?: string
}): SignInErrorKind {
  const message = error.message ?? ''
  if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return 'credentials'
  }
  if (error.code === 'over_request_rate_limit' || error.status === 429) return 'rate_limited'
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'transport'
  if (typeof error.status === 'number' && error.status >= 500) return 'transport'
  return 'unknown'
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors
    return { status: 'fieldErrors', email: fields.email?.[0], password: fields.password?.[0] }
  }

  let kind: SignInErrorKind | null = null
  try {
    const supabase = await createAuthServerClient()
    const { error } = await supabase.auth.signInWithPassword(parsed.data)
    if (error) kind = classify(error)
  } catch {
    // Only non-AuthError throws reach here — the network case is returned, above.
    kind = 'transport'
  }
  if (kind) return { status: 'error', kind }

  // OUTSIDE the try: redirect() signals by throwing NEXT_REDIRECT, so a
  // swallowing catch would turn every success into a silent failure.
  redirect('/admin')
}

export async function signOut(): Promise<void> {
  // Fail-closed and local-first. If the call to GoTrue rejects we still clear
  // the cookies — otherwise the admin is left signed in on a screen that says
  // they signed out, on a free-tier project subject to cold starts.
  try {
    const supabase = await createAuthServerClient()
    await supabase.auth.signOut()
  } catch {
    // deliberately swallowed; the local clear below is what matters
  }

  const store = await cookies()
  for (const cookie of store.getAll()) {
    if (cookie.name.startsWith('sb-')) store.delete(cookie.name)
  }

  // Purge the client Router Cache on an auth-state change.
  revalidatePath('/admin', 'layout')
  redirect('/admin/sign-in')
}
```

- [ ] **Step 5: Run the test and the static gate**

```bash
npx vitest run test/admin-auth-actions.test.ts
npm run typecheck
npm run lint
```

Expected: 11 tests PASS; 0 errors; 0 problems.

- [ ] **Step 6: Commit**

```bash
git add lib/admin/auth-state.ts lib/admin/auth-actions.ts test/admin-auth-actions.test.ts
git commit -m "feat(admin): signIn / signOut server actions" -m "Errors classify by the returned error, because supabase-js does not throw on a dead network — it returns AuthRetryableFetchError with status 0. Without that branch the transport copy is dead code and a Supabase outage renders as 'Sign-in failed.' signOut is fail-closed: cookies are cleared even when the GoTrue call rejects." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: The `[data-admin]` token scope

**Files:**
- Modify: `app/globals.css` (append only — change no existing rule)
- Test: `test/admin-tokens.test.ts`

**The bug this fixes is live today:** `app/layout.tsx` stamps `data-theme` on `<html>` from `localStorage['theme:v1']` on **every** route, and `globals.css` has `:root[data-theme='light']` redefining `--paper` to `#f2efe8`. `design.md §11.1` says dark is the only admin theme. Unscoped, toggling the storefront to light and opening the admin renders the admin on light paper.

Custom properties resolve per element, so a declaration on the `[data-admin]` wrapper beats the value inherited from `:root` regardless of selector specificity.

- [ ] **Step 1: Write the failing test**

Create `test/admin-tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')

const block = (() => {
  const start = css.indexOf('[data-admin] {')
  if (start === -1) return ''
  return css.slice(start, css.indexOf('}', start))
})()

const TOKENS = [
  '--paper', '--panel', '--panel2', '--ink', '--dim', '--faint', '--hair',
  '--hairform', '--hairsoft', '--btnbg', '--btnink', '--ok', '--warn',
  '--alert', '--info', '--nb',
]

// WCAG 2.x relative luminance.
function luminance([r, g, b]: number[]): number {
  const f = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function ratio(fg: number[], bg: number[]): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}
function over(fg: number[], alpha: number, bg: number[]): number[] {
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha))
}
function alphaOf(token: string): number {
  const m = block.match(new RegExp(`${token}\\s*:\\s*rgba\\(239,\\s*234,\\s*224,\\s*([\\d.]+)\\)`))
  if (!m) throw new Error(`${token} is not an rgba(239,234,224,a) value in the [data-admin] block`)
  return Number(m[1])
}
function hexOf(token: string): number[] {
  const m = block.match(new RegExp(`${token}\\s*:\\s*#([0-9a-f]{6})`, 'i'))
  if (!m) throw new Error(`${token} is not a #rrggbb value in the [data-admin] block`)
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16))
}

const INK = [239, 234, 224]
const PAPER = [11, 11, 11]

describe('the [data-admin] token scope', () => {
  it('declares every token', () => {
    for (const token of TOKENS) {
      expect(block, `${token} missing from [data-admin]`).toContain(`${token}:`)
    }
  })

  it('sets color-scheme: dark (UA widgets and autofill are not custom properties)', () => {
    expect(block.replace(/\s/g, '')).toContain('color-scheme:dark')
  })

  it('reclaims the html and body backgrounds', () => {
    expect(css).toContain('html:has([data-admin])')
    expect(css.replace(/\s+/g, ' ')).toContain('html:has([data-admin]) body')
  })

  it('provides a visually-hidden utility', () => {
    expect(css).toContain('.admin-sr-only')
  })

  // design.md §8 / §10 q2: "It does not get to fail twice." The admin relies on
  // the global rule rather than re-declaring it — so assert both that the rule
  // is intact and that nothing in the admin CSS opts out.
  it('keeps the global focus ring intact and never suppresses it in the admin', () => {
    expect(css.replace(/\s+/g, ' ')).toContain(':focus-visible { outline: 1px solid var(--ink); outline-offset: 2px; }')
    expect(css.slice(css.indexOf('[data-admin] {'))).not.toMatch(/outline\s*:\s*(none|0)\b/)
  })

  // D10 / D11 — these must not be silently reverted to §11.1's literals.
  it('keeps --faint readable as body text (>= 4.5:1 on --paper)', () => {
    expect(ratio(over(INK, alphaOf('--faint'), PAPER), PAPER)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps --dim readable as body text (>= 4.5:1 on --paper)', () => {
    expect(ratio(over(INK, alphaOf('--dim'), PAPER), PAPER)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps --hairform visible as a control boundary (>= 3:1 on --paper)', () => {
    expect(ratio(over(INK, alphaOf('--hairform'), PAPER), PAPER)).toBeGreaterThanOrEqual(3)
  })

  // --alert renders .admin-field-error: real body text, on the one screen where
  // something has already gone wrong. Same rule as D10, and it has little headroom.
  it('keeps --alert readable as body text (>= 4.5:1 on --paper)', () => {
    expect(ratio(hexOf('--alert'), PAPER)).toBeGreaterThanOrEqual(4.5)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/admin-tokens.test.ts`
Expected: FAIL — the `[data-admin]` block does not exist, so the token assertion fails and the contrast helpers throw.

- [ ] **Step 3: Implement**

Append to the **end** of `app/globals.css`. Change nothing above it.

```css
/* ===================================================================
   Admin (design.md §11) — dark only, and structurally unreachable by
   the storefront theme toggle.

   Tokens are declared on the [data-admin] wrapper, never :root. Custom
   properties resolve per element, so this beats the value inherited
   from :root[data-theme='light'] regardless of selector specificity.

   --faint (.50) and --hairform (.37) deviate from §11.1 deliberately:
   §11.1's .42 computes to 3.58:1 and fails AA, and --hair as a control
   border is 1.42:1 and fails SC 1.4.11. See spec D10 / D11. Locked by
   contrast assertions in test/admin-tokens.test.ts — do not "correct".
   =================================================================== */
[data-admin] {
  --paper: #0b0b0b;
  --panel: #0e0e0e;
  --panel2: #131313;
  --ink: #efeae0;
  --dim: rgba(239, 234, 224, 0.62);
  --faint: rgba(239, 234, 224, 0.50);
  --hair: rgba(239, 234, 224, 0.15);
  --hairform: rgba(239, 234, 224, 0.37);
  --hairsoft: rgba(239, 234, 224, 0.08);
  --btnbg: #efeae0;
  --btnink: #0b0b0b;
  --ok: #8fae8b;
  --warn: #cf934f;
  --alert: #c85b3d;
  --info: #8a9db0;
  --nb: var(--ink);

  background: var(--paper);
  color: var(--ink);
  min-height: 100dvh;
  /* Not a custom property, so the block above does not cover it. Without it
     Chrome's autofill paints a light ground over the password field — on the
     saved-credentials path, which is the normal path for the only user. */
  color-scheme: dark;
}

/* body { background: var(--paper) } still resolves --paper from :root, so a
   light body box survives behind the wrapper. */
html:has([data-admin]) { background: #0b0b0b; color-scheme: dark; }
html:has([data-admin]) body { background: #0b0b0b; }

.admin-sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* --- Sign-in (spec §6.1, D1) --- */
.admin-signin { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2rem; padding: 2rem 1.5rem; }
.admin-signin-lockup { display: flex; align-items: center; gap: 0.875rem; color: var(--ink); }
.admin-signin-name { margin: 0; font-family: var(--font-playfair); font-size: 1.375rem; line-height: 1.2; }
.admin-signin-kicker { margin: 0.125rem 0 0; font-family: var(--font-mono); font-size: 0.625rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--dim); }
.admin-signin-form { width: min(22rem, 100%); display: flex; flex-direction: column; gap: 0.875rem; }
.admin-field { display: block; }
.admin-field > span { display: block; font-family: var(--font-mono); font-size: 0.625rem; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--dim); margin-bottom: 0.375rem; }
.admin-field input { width: 100%; min-height: 44px; padding: 0.625rem 0.75rem; background: var(--panel2); color: var(--ink); border: 1px solid var(--hairform); border-radius: 0; font-family: var(--font-hanken), system-ui, sans-serif; font-size: 1rem; }
.admin-field-error { margin: -0.375rem 0 0; font-family: var(--font-mono); font-size: 0.6875rem; color: var(--alert); }
.admin-alert { min-height: 1.25rem; margin: 0; font-family: var(--font-mono); font-size: 0.75rem; color: var(--ink); }
.admin-btn { min-height: 44px; padding: 14px 22px; background: var(--btnbg); color: var(--btnink); border: none; border-radius: 0; font-family: var(--font-mono); font-size: 11px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; }
.admin-btn:hover { opacity: 0.88; }
.admin-btn:active { transform: translateY(1px); }
.admin-btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* --- Placeholder landing (spec §6.3; replaced wholesale in slice 4b) --- */
.admin-landing { padding: 3rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; align-items: flex-start; }
.admin-h1 { margin: 0; font-family: var(--font-playfair); font-weight: 400; font-size: 2.75rem; }
.admin-meta { margin: 0; font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.06em; color: var(--dim); }
.admin-linkbtn { min-height: 44px; padding: 0; background: transparent; border: none; color: var(--ink); font-family: var(--font-mono); font-size: 0.625rem; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
```

- [ ] **Step 4: Run the test and the static gate**

```bash
npx vitest run test/admin-tokens.test.ts
npm run typecheck
npm run lint
```

Expected: 9 tests PASS; 0 errors; 0 problems.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css test/admin-tokens.test.ts
git commit -m "feat(admin): [data-admin] token scope, unreachable by the storefront toggle" -m "app/layout.tsx stamps data-theme on <html> for every route, so without scoping, a light-mode storefront session renders the admin on light paper. Tokens go on the wrapper, not :root. Adds color-scheme:dark (autofill and UA widgets are not custom properties) and reclaims the body background." -m "--faint raised to .50 and --hairform added at .37: §11.1's values compute to 3.58:1 and 1.42:1, failing AA and SC 1.4.11. Locked by contrast assertions, along with the global focus ring design.md §8 says does not get to fail twice." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: The admin layout and the sign-in surface

**Files:**
- Create: `app/admin/layout.tsx`, `app/admin/sign-in/page.tsx`, `components/admin/SignInForm.tsx`
- Test: `test/sign-in.test.tsx`

**Interfaces:**
- Consumes: `signIn`, `INITIAL_SIGN_IN_STATE`, `SIGN_IN_ERROR_COPY` from Task 5; the CSS classes from Task 6.
- Produces: `SignInFields({ state, pending })` (pure presentational) and `SignInForm()` (the `useActionState` wrapper).

**Why the split:** `useActionState` is bound to a real Server Action and is awkward to drive from a test. Splitting the presentation out means all five states are tested deterministically by passing `state` directly.

**This surface is invented (spec D1)** — `grep -oi "sign[- ]\?\(in\|out\)"` over `design/Jon Hoffman Admin.dc.html` returns zero matches. It uses only `§11.1`/`§11.2` vocabulary.

- [ ] **Step 1: Write the failing test**

Create `test/sign-in.test.tsx`:

```tsx
import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SignInFields } from '@/components/admin/SignInForm'
import { INITIAL_SIGN_IN_STATE, SIGN_IN_ERROR_COPY } from '@/lib/admin/auth-state'

afterEach(cleanup)

describe('the admin layout', () => {
  // The entire §5 token-scope fix hangs on this one attribute existing. The CSS
  // test proves the RULE exists; this proves an element MATCHES it.
  it('renders [data-admin] so the token scope applies', async () => {
    const Layout = (await import('@/app/admin/layout')).default
    const { container } = render(<Layout><span>x</span></Layout>)
    expect(container.querySelector('[data-admin]')).not.toBeNull()
  })
})

describe('SignInFields', () => {
  it('binds each label to its input', () => {
    const { container } = render(<SignInFields state={INITIAL_SIGN_IN_STATE} pending={false} />)
    expect(container.querySelector('input[name="email"]')?.getAttribute('id')).toBe('email')
    expect(container.querySelector('input[name="password"]')?.getAttribute('id')).toBe('password')
    expect(container.querySelector('label[for="email"]')).not.toBeNull()
    expect(container.querySelector('label[for="password"]')).not.toBeNull()
  })

  it('sets the autocomplete and type attributes a password manager needs', () => {
    const { container } = render(<SignInFields state={INITIAL_SIGN_IN_STATE} pending={false} />)
    const email = container.querySelector('input[name="email"]')
    const password = container.querySelector('input[name="password"]')
    expect(email?.getAttribute('autocomplete')).toBe('email')
    expect(email?.getAttribute('type')).toBe('email')
    expect(password?.getAttribute('autocomplete')).toBe('current-password')
    expect(password?.getAttribute('type')).toBe('password')
  })

  it('always renders the alert region so it can announce', () => {
    const { container } = render(<SignInFields state={INITIAL_SIGN_IN_STATE} pending={false} />)
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('renders the generic credentials copy and never names the field at fault', () => {
    const { container } = render(
      <SignInFields state={{ status: 'error', kind: 'credentials' }} pending={false} />,
    )
    expect(container.textContent).toContain(SIGN_IN_ERROR_COPY.credentials)
    expect(container.textContent?.toLowerCase()).not.toContain('no account')
    expect(container.textContent?.toLowerCase()).not.toContain('wrong password')
  })

  it('distinguishes the rate-limited state from the transport state', () => {
    const limited = render(<SignInFields state={{ status: 'error', kind: 'rate_limited' }} pending={false} />)
    expect(limited.container.textContent).toContain(SIGN_IN_ERROR_COPY.rate_limited)
    cleanup()
    const down = render(<SignInFields state={{ status: 'error', kind: 'transport' }} pending={false} />)
    expect(down.container.textContent).toContain(SIGN_IN_ERROR_COPY.transport)
    expect(down.container.textContent).not.toContain(SIGN_IN_ERROR_COPY.rate_limited)
  })

  it('renders the unknown-error copy without claiming a cause', () => {
    const { container } = render(<SignInFields state={{ status: 'error', kind: 'unknown' }} pending={false} />)
    expect(container.textContent).toContain(SIGN_IN_ERROR_COPY.unknown)
  })

  it('associates a per-field error with its input for assistive tech', () => {
    const { container } = render(
      <SignInFields state={{ status: 'fieldErrors', email: 'Enter your email.' }} pending={false} />,
    )
    expect(container.textContent).toContain('Enter your email.')
    const email = container.querySelector('input[name="email"]')
    expect(email?.getAttribute('aria-invalid')).toBe('true')
    const describedBy = email?.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(container.querySelector(`#${describedBy}`)?.textContent).toContain('Enter your email.')
  })

  it('disables the submit button while pending', () => {
    const { container } = render(<SignInFields state={INITIAL_SIGN_IN_STATE} pending />)
    expect(container.querySelector('button[type="submit"]')?.hasAttribute('disabled')).toBe(true)
  })

  // design.md §10 q2 — every control must be reachable and keep the global ring.
  it('renders three focusable controls and takes none out of the tab order', () => {
    const { container } = render(<SignInFields state={INITIAL_SIGN_IN_STATE} pending={false} />)
    expect(container.querySelectorAll('input, button').length).toBe(3)
    expect(container.querySelector('[tabindex="-1"]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/sign-in.test.tsx`
Expected: FAIL — cannot resolve `@/components/admin/SignInForm`.

- [ ] **Step 3: Create `components/admin/SignInForm.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { signIn } from '@/lib/admin/auth-actions'
import { INITIAL_SIGN_IN_STATE, SIGN_IN_ERROR_COPY, type SignInState } from '@/lib/admin/auth-state'

/**
 * Presentational only, so every state is testable without driving a real
 * Server Action through useActionState.
 */
export function SignInFields({ state, pending }: { state: SignInState; pending: boolean }) {
  const fieldErrors = state.status === 'fieldErrors' ? state : null

  return (
    <>
      <label className="admin-field" htmlFor="email">
        <span>Email</span>
        <input
          id="email" name="email" type="email" autoComplete="email" required
          aria-invalid={fieldErrors?.email ? true : undefined}
          aria-describedby={fieldErrors?.email ? 'email-error' : undefined}
        />
      </label>
      {fieldErrors?.email ? (
        <p className="admin-field-error" id="email-error">{fieldErrors.email}</p>
      ) : null}

      <label className="admin-field" htmlFor="password">
        <span>Password</span>
        <input
          id="password" name="password" type="password" autoComplete="current-password" required
          aria-invalid={fieldErrors?.password ? true : undefined}
          aria-describedby={fieldErrors?.password ? 'password-error' : undefined}
        />
      </label>
      {fieldErrors?.password ? (
        <p className="admin-field-error" id="password-error">{fieldErrors.password}</p>
      ) : null}

      {/* Rendered unconditionally: a live region must already exist in the DOM
          for its later content to be announced. */}
      <p className="admin-alert" role="alert">
        {state.status === 'error' ? SIGN_IN_ERROR_COPY[state.kind] : null}
      </p>

      <button type="submit" className="admin-btn" disabled={pending}>
        Sign in
      </button>
    </>
  )
}

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signIn, INITIAL_SIGN_IN_STATE)
  return (
    <form action={formAction} className="admin-signin-form">
      <SignInFields state={state} pending={pending} />
    </form>
  )
}
```

- [ ] **Step 4: Create `app/admin/layout.tsx`**

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Studio Admin',
  // Covers rendered pages. proxy.ts also sets X-Robots-Tag, which covers
  // response shapes a meta tag cannot reach.
  robots: { index: false, follow: false },
}

/**
 * Wraps BOTH the public sign-in page and the protected tree, so sign-in is
 * dark without inheriting a shell whose nav means nothing to someone who is
 * not signed in yet.
 *
 * The data-admin attribute is what the entire §5 token scope hangs on.
 */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div data-admin>{children}</div>
}
```

- [ ] **Step 5: Create `app/admin/sign-in/page.tsx`**

```tsx
import { SignInForm } from '@/components/admin/SignInForm'

export default function SignInPage() {
  return (
    <main className="admin-signin">
      <div className="admin-signin-lockup">
        <svg
          width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <path d="M7 18h10a4 4 0 0 0 .5-7.98A5 5 0 0 0 7.5 8.5 4 4 0 0 0 7 18z" />
        </svg>
        <div>
          <p className="admin-signin-name">Jon Hoffman</p>
          <p className="admin-signin-kicker">Studio Admin</p>
        </div>
      </div>
      <SignInForm />
    </main>
  )
}
```

- [ ] **Step 6: Run the test and the static gate**

```bash
npx vitest run test/sign-in.test.tsx
npm run typecheck
npm run lint
```

Expected: 10 tests PASS; 0 errors; 0 problems.

- [ ] **Step 7: Commit**

```bash
git add app/admin/layout.tsx app/admin/sign-in/page.tsx components/admin/SignInForm.tsx test/sign-in.test.tsx
git commit -m "feat(admin): sign-in surface and the admin token-scope layout" -m "The sign-in surface is invented — it appears nowhere in design.md §11 or the prototype — so it uses only §11.1/§11.2 vocabulary. Presentation is split from the useActionState wrapper so all five error states are tested deterministically, and the data-admin attribute the token scope depends on is asserted rather than assumed." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: The protected route and the placeholder landing

**Files:**
- Create: `app/admin/(protected)/layout.tsx`, `app/admin/(protected)/page.tsx`, `components/admin/SignOutButton.tsx`
- Test: `test/admin-landing.test.tsx`

**Interfaces:**
- Consumes: `requireAdmin()` from Task 3; `signOut` from Task 5.
- Produces: the `/admin` route. Slice 4b replaces `(protected)/page.tsx` wholesale and wraps the layout in the shell.

`(protected)` is a route group and adds **no URL segment**, so `(protected)/page.tsx` serves `/admin`. **`app/admin/page.tsx` must never be created** — it would collide and fail the build with a parallel-pages error.

- [ ] **Step 1: Write the failing test**

Create `test/admin-landing.test.tsx`:

```tsx
import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const user: { value: { email: string } | null } = { value: { email: 'jon@example.com' } }

vi.mock('@/lib/admin/require-admin', () => ({
  requireAdmin: async () => {
    if (!user.value) throw new Error('NEXT_REDIRECT;/admin/sign-in')
    return user.value
  },
}))

vi.mock('@/lib/admin/auth-actions', () => ({ signOut: async () => {} }))

afterEach(() => {
  cleanup()
  user.value = { email: 'jon@example.com' }
})

describe('the protected landing', () => {
  it('shows the real signed-in email', async () => {
    const Page = (await import('@/app/admin/(protected)/page')).default
    const { container } = render(await Page())
    expect(container.textContent).toContain('jon@example.com')
    expect(container.textContent).toContain('Studio Admin')
  })

  it('renders sign-out as a form button, never a link', async () => {
    const Page = (await import('@/app/admin/(protected)/page')).default
    const { container } = render(await Page())
    const button = container.querySelector('form button[type="submit"]')
    expect(button).not.toBeNull()
    expect(button?.textContent).toContain('Sign out')
    // A GET sign-out is CSRF-able and gets fired by link prefetching.
    expect(container.querySelector('a[href*="sign-out"]')).toBeNull()
  })

  it('claims nothing it cannot know — no stats, no counts', async () => {
    const Page = (await import('@/app/admin/(protected)/page')).default
    const { container } = render(await Page())
    const text = (container.textContent ?? '').toLowerCase()
    expect(text).not.toContain('orders')
    expect(text).not.toContain('queue')
  })

  it('propagates the guard redirect when there is no user', async () => {
    user.value = null
    const Page = (await import('@/app/admin/(protected)/page')).default
    await expect(Page()).rejects.toThrow(/NEXT_REDIRECT/)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/admin-landing.test.tsx`
Expected: FAIL — cannot resolve `@/app/admin/(protected)/page`.

- [ ] **Step 3: Create `components/admin/SignOutButton.tsx`**

A Server Component — no `'use client'`. `<form action={serverAction}>` works without it.

```tsx
import { signOut } from '@/lib/admin/auth-actions'

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className="admin-linkbtn">
        Sign out
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Create `app/admin/(protected)/layout.tsx`**

```tsx
import { requireAdmin } from '@/lib/admin/require-admin'

// cookies() forces these routes dynamic anyway, but the CI build job runs with
// NO secrets — without this, whether `next build` survives would depend on
// statement ordering inside the client factory. Every store server page
// already carries the same declaration.
export const dynamic = 'force-dynamic'

/**
 * Calls requireAdmin() so a direct page load is guarded, but it is NOT the
 * boundary — layouts do not re-render on client-side navigation. The boundary
 * is requireAdmin() in the data-access layer, called by every read and action.
 *
 * Renders children bare in slice 4a; slice 4b wraps them in the §11.3 shell.
 */
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
```

- [ ] **Step 5: Create `app/admin/(protected)/page.tsx`**

```tsx
import { requireAdmin } from '@/lib/admin/require-admin'
import { SignOutButton } from '@/components/admin/SignOutButton'

/**
 * Slice 4a's placeholder — deliberately plain, and NOT a design surface.
 * It exists to make the milestone verifiable and is replaced wholesale by
 * slice 4b's §11.4-A dashboard. It claims nothing, so there is nothing for it
 * to claim falsely (product.md §1).
 *
 * requireAdmin() is called here and not only in the layout, because the layout
 * is not the boundary. React cache() dedupes the two into one round-trip.
 */
export default async function AdminLanding() {
  const user = await requireAdmin()

  return (
    <main className="admin-landing">
      <h1 className="admin-h1">Studio Admin</h1>
      <p className="admin-meta">Signed in as {user.email}</p>
      <SignOutButton />
    </main>
  )
}
```

- [ ] **Step 6: Run the test and the static gate**

```bash
npx vitest run test/admin-landing.test.tsx
npm run typecheck
npm run lint
```

Expected: 4 tests PASS; 0 errors; 0 problems.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/(protected)/layout.tsx" "app/admin/(protected)/page.tsx" components/admin/SignOutButton.tsx test/admin-landing.test.tsx
git commit -m "feat(admin): protected route and the slice-4a placeholder landing" -m "(protected) adds no URL segment, so the landing serves /admin while sitting under the guard and sign-in stays outside it with no redirect loop. The page calls requireAdmin() itself rather than trusting the layout; cache() dedupes." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Structural guard test, CLAUDE.md, and the full gate

**Files:**
- Create: `test/admin-routes.test.ts`
- Modify: `CLAUDE.md`

**Why a structural test:** protection is opt-in by file placement inside a route group that is **invisible in the URL**, and `proxy.ts` redirects anonymous users for `/admin/*` regardless — so a page misfiled outside `(protected)` looks and behaves correctly in every manual test while having no guard. The same applies to Server Actions, which are reachable by direct POST independent of the page that rendered them.

- [ ] **Step 1: Write the test**

Create `test/admin-routes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = process.cwd()

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

describe('admin route structure', () => {
  const files = walk(resolve(ROOT, 'app/admin')).map((f) => f.replace(/\\/g, '/'))

  it('places every page and route handler under (protected), except sign-in', () => {
    const routes = files.filter((f) => /\/(page|route)\.tsx?$/.test(f))
    const unguarded = routes.filter(
      (f) => !f.includes('/(protected)/') && !f.endsWith('/admin/sign-in/page.tsx'),
    )
    expect(unguarded, `unguarded admin routes: ${unguarded.join(', ')}`).toEqual([])
  })

  it('has no app/admin/page.tsx (it would collide with (protected)/page.tsx)', () => {
    expect(existsSync(resolve(ROOT, 'app/admin/page.tsx'))).toBe(false)
  })
})

describe("every 'use server' export guards itself", () => {
  // signIn is public by design; signOut is a no-op when unauthenticated.
  // Listed explicitly so adding a third exemption is a deliberate act.
  const EXEMPT = new Set(['signIn', 'signOut'])

  it('calls requireAdmin, or is a named exemption', () => {
    // Walk all three admin directories: slices 5-7 will add inline 'use server'
    // actions inside components, not only in lib/admin.
    const files = [
      ...walk(resolve(ROOT, 'lib/admin')),
      ...walk(resolve(ROOT, 'app/admin')),
      ...walk(resolve(ROOT, 'components/admin')),
    ].filter((f) => /\.tsx?$/.test(f))
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      if (!/['"]use server['"]/.test(source)) continue

      for (const match of source.matchAll(/export async function (\w+)/g)) {
        const name = match[1]
        if (EXEMPT.has(name)) continue
        const body = source.slice(match.index ?? 0)
        const end = body.indexOf('\nexport ', 1)
        const fnBody = end === -1 ? body : body.slice(0, end)
        if (!fnBody.includes('requireAdmin')) {
          offenders.push(`${file.replace(/\\/g, '/')}: ${name}`)
        }
      }
    }

    expect(offenders, `server actions missing requireAdmin: ${offenders.join(', ')}`).toEqual([])
  })
})
```

- [ ] **Step 2: Run it, and prove it can fail**

```bash
npx vitest run test/admin-routes.test.ts
```

Expected: 3 tests PASS (Tasks 7–8 already established the structure correctly).

Now prove the guard is live rather than vacuous:

```bash
printf 'export default function Probe() { return null }\n' > app/admin/page.tsx
npx vitest run test/admin-routes.test.ts
rm app/admin/page.tsx
npx vitest run test/admin-routes.test.ts
git status --short
```

Expected: 2 failures with the probe present, 3 passes after removing it, and **`git status` shows no `app/admin/page.tsx`**. Do not continue until that file is gone — if it survives, Step 4's `npm run build` fails with a parallel-pages error that looks nothing like its cause.

- [ ] **Step 3: Update `CLAUDE.md` — four exact replacements**

**(a)** Replace this line:

```
| test | `npm test` | all green (**1498** tests as of slice 1) |
```

with (substituting the real total from Step 4):

```
| test | `npm test` | all green (**<TOTAL>** tests as of slice 4a) |
```

**(b)** Replace this line:

```
  supabase/{admin,server,client}.ts  # service-key / anon-server / browser clients
```

with:

```
  supabase/{admin,server,client}.ts  # service-key / anon-server / browser clients
  supabase/{auth-server,auth-proxy}.ts # cookie-bound authenticated clients (slice 4a)
  admin/{require-admin,auth-actions,auth-state}.ts  # requireAdmin() boundary + sign-in/out
```

**(c)** Inside the same fenced tree, immediately after these two lines:

```
    checkout/route.ts          # POST — the money endpoint
    stripe-webhook/route.ts    # POST — payment confirmation
```

insert:

```
  admin/                       # ADMIN — dark only, auth-gated (slice 4a)
    layout.tsx                 # [data-admin] token scope; noindex
    sign-in/page.tsx           # public sign-in
    (protected)/               # everything here is guarded
      layout.tsx               # force-dynamic; requireAdmin()
      page.tsx                 # /admin — placeholder (slice 4b: §11.4-A dashboard)
```

and immediately **after** the closing ``` ``` `` of that fenced block, before the "The **admin half**" paragraph, note that `proxy.ts` lives at the repo root by adding it to the tree's root level (same indentation as `lib/`):

```
proxy.ts                       # session refresh + redirect for /admin/:path*
```

**(d)** Replace this entire line:

```
The **admin half** (`(admin)` route group, Supabase Auth, ingest, orders queue, lab export) is **not built yet** — slices 4+.
```

with:

```
The **admin half** is partly built. Slice 4a shipped auth: the route shape is `app/admin/` with a `(protected)` group — **not** an `(admin)` route group, which would add no URL segment. `app/admin/page.tsx` must never exist (it collides with `(protected)/page.tsx`). Ingest, collections, the orders queue and the lab export are slices 5–7.

**Admin surfaces read as the logged-in user** through `lib/supabase/auth-server.ts` under RLS, so `schema.sql`'s `authenticated` policies are exercised rather than decorative. The service key stays confined to the three sessionless paths (`/api/checkout`, `/api/stripe-webhook`, `/order/[id]`). **Authorization is `requireAdmin()` in the data-access layer, never a layout** — Next layouts do not re-render on client-side navigation, so a layout check stops running on route changes. Every admin read, write, and Server Action calls it first.
```

- [ ] **Step 4: Run the full gate**

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: lint 0 problems; typecheck 0 errors; build succeeds with no secrets present.

New tests total **60** (6 + 0 + 4 + 13 + 11 + 9 + 10 + 4 + 3), so the run should report about **1623**. **Read the real total off the `npm test` output** and put that number into `CLAUDE.md` (a). Do not copy 1623 from this plan.

If the count is materially lower, run `npx vitest run --reporter=verbose` and confirm all nine new test files appear. Do not proceed to the commit until every file is running, and do not adjust the counts to match a short run.

If `npm run build` fails on a missing env var, that is a real defect — the admin routes must not be prerendered. Confirm `export const dynamic = 'force-dynamic'` is on `app/admin/(protected)/layout.tsx`.

- [ ] **Step 5: Commit**

```bash
git add test/admin-routes.test.ts CLAUDE.md
git commit -m "test(admin): structural guard for route placement and server actions" -m "Protection is opt-in by placement inside a route group invisible in the URL, and proxy.ts redirects anonymous users regardless — so a misfiled page looks correct in every manual test while having no guard. Server Actions are reachable by direct POST independent of the page that rendered them." -m "Updates CLAUDE.md: admin route shape, the auth clients and their boundary, test count." -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done — and what is NOT done

Slice 4a is complete when the four gate commands are green and all nine files exist.

**Report back with:** the actual `npm test` total, the `npm run build` output line showing the proxy entry, and confirmation that `git status` is clean.

**Not done, deliberately — do not attempt:**

- **The `§11.3` shell, the nav, the `§11.4-A` dashboard**, and any read of `orders` / `photos` / `collections`. Slice 4b.
- **The `design.md §11` write-back** of D1, D6, D10, D11 and the §6.0 focus treatment. Record it in `.superpowers/sdd/progress.md` as a slice-4a follow-up, so slice 4b's builder does not read `§11.1`'s `--faint: .42` as current and "correct" the token back.
- **The spec's §9.2 manual verification** (browser, real sign-in, autofill, Back button) — Jon's.
- **The spec's §9.1 and §9.3 SQL** — Jon's. Never run SQL against the Supabase project.
- Password reset, MFA, rate limiting.
