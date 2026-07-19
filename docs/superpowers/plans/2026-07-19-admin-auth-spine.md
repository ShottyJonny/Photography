# Slice 4a — Admin Auth Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship cookie-backed Supabase email+password auth for a single admin, with every route under `/admin` protected, a sign-in surface, and a self-contained dark token scope — ending at a verifiable milestone: signed in, on a plain protected page, able to sign out.

**Architecture:** `proxy.ts` (Next 16's replacement for `middleware.ts`) refreshes the Supabase session cookie on every `/admin` request and redirects for UX. It is **not** the security boundary. The boundary is `requireAdmin()` in the data-access layer, called as the first statement of every admin read, write, and Server Action — because Next.js layouts do not re-render on client-side navigation, so a layout check would silently stop running on route changes. Admin surfaces read as the logged-in user through RLS, keeping the service-role key confined to the three sessionless paths (checkout, webhook, order confirmation).

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, `@supabase/ssr` 0.12.3, `@supabase/supabase-js` 2.110.7, zod 3, Vitest 2.

**Spec:** `docs/superpowers/specs/2026-07-19-admin-auth-spine-design.md` — read it before starting. Section references below (`§3.1`, `D10`, …) point into it.

**One addition to the spec:** the spec's §8.2 lists seven test files; this plan adds an eighth, `test/admin-landing.test.tsx` (Task 8), so the protected page's guard propagation and its "claims nothing" property are covered rather than assumed. Nothing else departs from the spec.

---

## Global Constraints

These apply to **every** task. They are not repeated per-task.

- **Node 20 is the CI target** (`.nvmrc`). The dev machine may be Node 22. Node 20 has **no global `WebSocket`**, and `@supabase/supabase-js` constructs an (unused) `RealtimeClient` on every `createClient` call that throws without one. **Every Supabase client construction must pass `realtime: { transport: WebSocket }` from the `ws` package**, exactly as `lib/supabase/admin.ts` and `lib/supabase/server.ts` already do. Omitting it passes locally and fails on CI.
- **Never construct a real Supabase client inside a test.** Mock the wrapper module. The one deliberate exception is Task 4's construction smoke test, which constructs but never calls the network.
- **There is no `@testing-library/jest-dom`.** `.toBeInTheDocument()`, `.toBeDisabled()`, `.toHaveAttribute()` are **unavailable**. Assert with `container.textContent`, `container.querySelector(...)`, `el.getAttribute(...)`, `expect(x).toBe(...)`.
- **`redirect()` from `next/navigation` throws** a `NEXT_REDIRECT` error. It must never sit inside a `try` block that swallows. When mocked in tests it must be mocked to **throw**, never as a no-op — a no-op mock lets execution continue past the redirect and the test passes while proving nothing.
- **`cookies()` from `next/headers` is async in Next 16** — always `await cookies()`.
- **Apostrophes in user-visible strings use `’`**, never `'`. `react/no-unescaped-entities` ships in `eslint-config-next/core-web-vitals` and `npm run lint` is a **0-warning** CI gate. Precedent: `app/(store)/order/[id]/page.tsx:34`.
- **DB is snake_case**, no exceptions.
- **Do not touch** `lib/pricing.ts`, `lib/checkout/`, `lib/orders/`, `lib/data/`, `app/api/`, `app/(store)/`, `components/{store,cart,product,theme}/`. Slice 4a adds files; it modifies only `lib/env.ts`, `app/globals.css`, `package.json`, and `CLAUDE.md`.
- **The gate** is four commands, all of which must pass before the final commit: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`. Baseline: **1563 tests passing** on `develop`. Never use `--no-verify`.
- **Branch:** `slice-4`. Never commit to `main` or `develop`.
- **Every commit message ends with:**
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

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
| `app/globals.css` (modify) | Append the `[data-admin]` block and `.admin-sr-only`; append admin classes |

---

## Task 1: `supabaseAuthEnv()` and the dependency

**Files:**
- Modify: `package.json`
- Modify: `lib/env.ts`
- Test: `test/admin-env.test.ts`

**Interfaces:**
- Produces: `supabaseAuthEnv(source?: Record<string, string | undefined>): { url: string; anonKey: string }`

**Why a narrow accessor:** `env()` validates all five required vars including both Stripe keys and throws if any is missing. It runs on every `/admin` request. Coupling admin sign-in to `STRIPE_WEBHOOK_SECRET` is a latent, confusing outage.

- [ ] **Step 1: Install the dependency**

```
npm install @supabase/ssr
```

Expected: resolves `@supabase/ssr@0.12.3` (or newer). Its peer `@supabase/supabase-js@^2.110.5` is already satisfied by the installed 2.110.7. Record the resolved version in the commit message.

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
Expected: FAIL — `supabaseAuthEnv is not a function` / import error.

- [ ] **Step 4: Implement**

Append to `lib/env.ts` (leave `loadEnv`, `env`, and `Env` exactly as they are):

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

- [ ] **Step 5: Run and confirm it passes**

Run: `npx vitest run test/admin-env.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```
git add package.json package-lock.json lib/env.ts test/admin-env.test.ts
git commit
```

Message:
```
feat(admin): add @supabase/ssr and a narrow supabaseAuthEnv accessor

env() validates both Stripe keys and would run on every /admin request;
a missing STRIPE_WEBHOOK_SECRET must not be able to break admin sign-in.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 2: The two Supabase auth clients

**Files:**
- Create: `lib/supabase/auth-server.ts`
- Create: `lib/supabase/auth-proxy.ts`

**Interfaces:**
- Consumes: `supabaseAuthEnv()` from Task 1.
- Produces:
  - `createAuthServerClient(): Promise<SupabaseClient>`
  - `createProxyAuthClient(request: NextRequest): { supabase: SupabaseClient; getResponse: () => NextResponse }`

No test of its own — Task 4 covers construction, and Tasks 3/5 exercise behaviour through mocks. Committed together because neither is useful alone.

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
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            cookieStore.set(name, value, { ...options, ...SECURE_COOKIE })
          }
        } catch {
          // Server Components cannot set cookies — Next throws here. proxy.ts
          // refreshes the session on every /admin request, so dropping the
          // write is safe. Without this catch the admin 500s intermittently,
          // on exactly the renders that coincide with a token refresh.
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
      setAll: (list) => {
        // Mirror onto the request first, or this same request's later getAll()
        // reads stale values.
        for (const { name, value } of list) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, { ...options, ...SECURE_COOKIE })
        }
      },
    },
    realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
  })

  return { supabase, getResponse: () => response }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```
git add lib/supabase/auth-server.ts lib/supabase/auth-proxy.ts
git commit
```

Message:
```
feat(admin): cookie-bound Supabase auth clients

Two modules because the two bind cookies to different objects. Both supply
the ws transport (Node 20 has no global WebSocket). setAll on the server
client swallows the write: Server Components cannot set cookies, and proxy.ts
refreshes on every /admin request.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 3: `requireAdmin()` — the authorization boundary

**Files:**
- Create: `lib/admin/require-admin.ts`
- Test: `test/require-admin.test.ts`

**Interfaces:**
- Consumes: `createAuthServerClient()` from Task 2.
- Produces:
  - `loadAdmin(): Promise<User>` — the uncached inner function, exported for tests
  - `requireAdmin: () => Promise<User>` — `cache(loadAdmin)`, what everything else imports

**Why this exists and the layout does not do it:** Next 16's auth guide — *"Due to Partial Rendering, be cautious when doing checks in Layouts as these don't re-render on navigation, meaning the user session won't be checked on every route change. Instead, you should do the checks close to your data source."* With slices 5–7's pages under one group, a client-side `<Link>` would render a target page against a cached layout and the check would never run.

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

  it('redirects to sign-in when getUser returns an error', async () => {
    authState.user = { id: 'u1', email: 'a@b.com' }
    authState.error = { message: 'jwt expired' }
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

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run test/require-admin.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```
git add lib/admin/require-admin.ts test/require-admin.test.ts
git commit
```

Message:
```
feat(admin): requireAdmin() as the authorization boundary

Not the layout: Next layouts do not re-render on client-side navigation, so a
layout check silently stops running on route changes. getUser() never
getSession() — a cookie is attacker-controllable input.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 4: `proxy.ts` — session refresh and redirects

**Files:**
- Create: `proxy.ts` (repo root, beside `next.config.ts`)
- Test: `test/admin-proxy.test.ts`

**Interfaces:**
- Consumes: `createProxyAuthClient()` from Task 2.
- Produces: `proxy(request: NextRequest): Promise<NextResponse>` and `config.matcher`.

**Why `proxy.ts` and not `middleware.ts`:** Next 16 deprecated the `middleware` filename and renamed it to `proxy`. Verified in the installed package: *"The `middleware` filename is deprecated, and has been renamed to `proxy`… The `edge` runtime is **NOT** supported in `proxy`. The `proxy` runtime is `nodejs`, and it cannot be configured."* Node runtime is why the `ws` transport in Task 2 works here.

- [ ] **Step 1: Write the failing test**

Create `test/admin-proxy.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const state: { user: unknown; throws: boolean; emitCookie: boolean } = {
  user: null,
  throws: false,
  emitCookie: false,
}

vi.mock('@/lib/supabase/auth-proxy', () => ({
  createProxyAuthClient: (request: NextRequest) => {
    let response = NextResponse.next({ request })
    return {
      supabase: {
        auth: {
          getUser: async () => {
            if (state.throws) throw new Error('network down')
            // Simulate a token refresh writing a cookie onto the response.
            if (state.emitCookie) {
              response = NextResponse.next({ request })
              response.cookies.set('sb-refreshed', 'new-token', { path: '/' })
            }
            return { data: { user: state.user }, error: null }
          },
        },
      },
      getResponse: () => response,
    }
  },
}))

function req(pathname: string) {
  return new NextRequest(new URL(pathname, 'http://localhost:3000'))
}

beforeEach(() => {
  state.user = null
  state.throws = false
  state.emitCookie = false
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
    const res = await proxy(req('/admin/sign-in'))
    expect(res.status).toBe(200)
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
    const res = await proxy(req('/admin'))
    expect(res.status).toBe(200)
  })

  it('never fails open when getUser throws', async () => {
    state.throws = true
    const { proxy } = await import('@/proxy')
    const res = await proxy(req('/admin'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/admin/sign-in')
  })

  // The trap: a bare NextResponse.redirect() discards refreshed auth cookies
  // and produces an intermittent logout loop.
  it('carries refreshed cookies onto the redirect response', async () => {
    state.emitCookie = true
    const { proxy } = await import('@/proxy')
    const res = await proxy(req('/admin'))
    expect(res.status).toBe(307)
    expect(res.cookies.get('sb-refreshed')?.value).toBe('new-token')
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

// Deliberate exception to "never construct a real client in a test": this
// constructs but never touches the network, and it is what catches a missing
// ws transport on CI's Node 20.
describe('createProxyAuthClient (real)', () => {
  it('constructs without throwing', async () => {
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
    // importActual bypasses the vi.mock above without needing resetModules.
    const actual = await vi.importActual<typeof import('@/lib/supabase/auth-proxy')>(
      '@/lib/supabase/auth-proxy',
    )
    const { supabase } = actual.createProxyAuthClient(req('/admin'))
    expect(supabase.auth).toBeTypeOf('object')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/admin-proxy.test.ts`
Expected: FAIL — cannot resolve `@/proxy`.

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run test/admin-proxy.test.ts`
Expected: PASS, 9 tests.

> If the final `createProxyAuthClient (real)` test fails on module mocking, replace `vi.doUnmock` + `vi.importActual` with a separate file `test/admin-proxy-client.test.ts` containing only that test and no `vi.mock` at the top. Do not delete the assertion — it is the CI Node-20 guard.

- [ ] **Step 5: Commit**

```
git add proxy.ts test/admin-proxy.test.ts
git commit
```

Message:
```
feat(admin): proxy.ts refreshes the admin session and redirects

proxy.ts, not middleware.ts — the latter is deprecated in Next 16 and the
proxy runtime is nodejs. Refreshed cookies are copied onto redirect responses
(a bare NextResponse.redirect discards them, causing an intermittent logout
loop). getUser() throwing is treated as unauthenticated; never fails open.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 5: Sign-in and sign-out Server Actions

**Files:**
- Create: `lib/admin/auth-state.ts`
- Create: `lib/admin/auth-actions.ts`
- Test: `test/admin-auth-actions.test.ts`

**Interfaces:**
- Consumes: `createAuthServerClient()` from Task 2.
- Produces:
  - `type SignInState`, `INITIAL_SIGN_IN_STATE`, `SIGN_IN_ERROR_COPY` (from `auth-state.ts`)
  - `signIn(prev: SignInState, formData: FormData): Promise<SignInState>`
  - `signOut(): Promise<void>`

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

// ’ rather than a straight apostrophe: react/no-unescaped-entities is a
// 0-warning lint gate, and §11.2 wants typographic apostrophes anyway.
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
  signInError: null,
  signInThrows: false,
  signOutRejects: false,
}
const signInWithPassword = vi.fn(async () => {
  if (state.signInThrows) throw new Error('fetch failed')
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

beforeEach(() => {
  state.signInError = null
  state.signInThrows = false
  state.signOutRejects = false
  deleted.length = 0
  signInWithPassword.mockClear()
  supabaseSignOut.mockClear()
  revalidatePath.mockClear()
})

describe('signIn', () => {
  it('returns field errors for a malformed email and never calls Supabase', async () => {
    const { signIn } = await import('@/lib/admin/auth-actions')
    const result = await signIn(INITIAL_SIGN_IN_STATE, form('not-an-email', 'pw'))
    expect(result.status).toBe('fieldErrors')
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('returns a field error for an empty password', async () => {
    const { signIn } = await import('@/lib/admin/auth-actions')
    const result = await signIn(INITIAL_SIGN_IN_STATE, form('jon@example.com', ''))
    expect(result.status).toBe('fieldErrors')
  })

  it('maps invalid_credentials to the generic credentials error', async () => {
    state.signInError = { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' }
    const { signIn } = await import('@/lib/admin/auth-actions')
    const result = await signIn(INITIAL_SIGN_IN_STATE, form('jon@example.com', 'wrong'))
    expect(result).toEqual({ status: 'error', kind: 'credentials' })
  })

  it('maps a 429 to rate_limited, not transport', async () => {
    state.signInError = { code: 'over_request_rate_limit', status: 429, message: 'too many' }
    const { signIn } = await import('@/lib/admin/auth-actions')
    const result = await signIn(INITIAL_SIGN_IN_STATE, form('jon@example.com', 'pw'))
    expect(result).toEqual({ status: 'error', kind: 'rate_limited' })
  })

  it('maps a thrown fetch failure to transport', async () => {
    state.signInThrows = true
    const { signIn } = await import('@/lib/admin/auth-actions')
    const result = await signIn(INITIAL_SIGN_IN_STATE, form('jon@example.com', 'pw'))
    expect(result).toEqual({ status: 'error', kind: 'transport' })
  })

  it('maps an unrecognised auth error to unknown, not transport', async () => {
    state.signInError = { code: 'email_not_confirmed', status: 400, message: 'Email not confirmed' }
    const { signIn } = await import('@/lib/admin/auth-actions')
    const result = await signIn(INITIAL_SIGN_IN_STATE, form('jon@example.com', 'pw'))
    expect(result).toEqual({ status: 'error', kind: 'unknown' })
  })

  it('redirects to /admin on success', async () => {
    const { signIn } = await import('@/lib/admin/auth-actions')
    await expect(signIn(INITIAL_SIGN_IN_STATE, form('jon@example.com', 'pw')))
      .rejects.toThrow(/NEXT_REDIRECT;\/admin$/)
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
 * Classify by code and HTTP status, NOT by exception-vs-return. A two-bucket
 * split would report email_not_confirmed, a 429 lockout, and user_banned — all
 * returned by a perfectly reachable server — as network failures, so the one
 * message telling Jon he is rate-limited would tell him to check his internet.
 */
function classify(error: { code?: string; status?: number; message?: string }): SignInErrorKind {
  const message = error.message ?? ''
  if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return 'credentials'
  }
  if (error.code === 'over_request_rate_limit' || error.status === 429) return 'rate_limited'
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

- [ ] **Step 5: Run and confirm it passes**

Run: `npx vitest run test/admin-auth-actions.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```
git add lib/admin/auth-state.ts lib/admin/auth-actions.ts test/admin-auth-actions.test.ts
git commit
```

Message:
```
feat(admin): signIn / signOut server actions

Errors classify by code and status, not exception-vs-return, so a 429 lockout
does not render as "check your network". signOut is fail-closed: cookies are
cleared even when the GoTrue call rejects. State lives in a separate module
because a 'use server' file may export only async functions.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 6: The `[data-admin]` token scope

**Files:**
- Modify: `app/globals.css` (append only — change no existing rule)
- Test: `test/admin-tokens.test.ts`

**The bug this fixes is live today:** `app/layout.tsx` stamps `data-theme` on `<html>` from `localStorage['theme:v1']` on **every** route, and `globals.css` has `:root[data-theme='light']` redefining `--paper` to `#f2efe8`. `design.md §11.1` says dark is the only admin theme. Unscoped, toggling the storefront to light and opening the admin renders the admin on light paper.

Custom properties resolve per element, so a declaration on the `[data-admin]` wrapper beats the value inherited from `:root` regardless of selector specificity.

**Two token values deviate from `design.md §11.1` deliberately** (spec D10/D11) — do not "correct" them back:
- `--faint` is `.50`, not `.42`. At `.42` it computes to **3.58:1** on `--paper`, failing the 4.5:1 body-text minimum, and it is where the `NOT BUILT` marker and the stat-tile subs live in 4b.
- `--hairform` is new at `.37` (**3.02:1**) for form-control borders. `--hair` at `.15` gives a **1.42:1** boundary, failing SC 1.4.11's 3:1 — an input with no perceivable edge.

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
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/admin-tokens.test.ts`
Expected: FAIL — the `[data-admin]` block does not exist.

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
   border is 1.42:1 and fails SC 1.4.11. See spec D10 / D11.
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

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run test/admin-tokens.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```
git add app/globals.css test/admin-tokens.test.ts
git commit
```

Message:
```
feat(admin): [data-admin] token scope, unreachable by the storefront toggle

app/layout.tsx stamps data-theme on <html> for every route, so without
scoping, a light-mode storefront session renders the admin on light paper.
Tokens go on the wrapper, not :root. Adds color-scheme:dark (autofill and UA
widgets are not custom properties) and reclaims the body background.

--faint raised to .50 and --hairform added at .37: §11.1's values compute to
3.58:1 and 1.42:1, failing AA and SC 1.4.11. Locked by contrast assertions.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 7: The admin layout and the sign-in surface

**Files:**
- Create: `app/admin/layout.tsx`
- Create: `app/admin/sign-in/page.tsx`
- Create: `components/admin/SignInForm.tsx`
- Test: `test/sign-in.test.tsx`

**Interfaces:**
- Consumes: `signIn`, `INITIAL_SIGN_IN_STATE`, `SIGN_IN_ERROR_COPY` from Task 5; the CSS classes from Task 6.
- Produces: `SignInFields({ state, pending })` — the pure presentational component; `SignInForm()` — the `useActionState` wrapper.

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

describe('SignInFields', () => {
  it('binds each label to its input', () => {
    const { container } = render(<SignInFields state={INITIAL_SIGN_IN_STATE} pending={false} />)
    const email = container.querySelector('input[name="email"]')
    const password = container.querySelector('input[name="password"]')
    expect(email?.getAttribute('id')).toBe('email')
    expect(password?.getAttribute('id')).toBe('password')
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

  it('renders per-field errors inline', () => {
    const { container } = render(
      <SignInFields state={{ status: 'fieldErrors', email: 'Enter your email.' }} pending={false} />,
    )
    expect(container.textContent).toContain('Enter your email.')
  })

  it('disables the submit button while pending', () => {
    const { container } = render(<SignInFields state={INITIAL_SIGN_IN_STATE} pending />)
    const button = container.querySelector('button[type="submit"]')
    expect(button?.hasAttribute('disabled')).toBe(true)
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
        <input id="email" name="email" type="email" autoComplete="email" required />
      </label>
      {fieldErrors?.email ? <p className="admin-field-error">{fieldErrors.email}</p> : null}

      <label className="admin-field" htmlFor="password">
        <span>Password</span>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </label>
      {fieldErrors?.password ? <p className="admin-field-error">{fieldErrors.password}</p> : null}

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

- [ ] **Step 6: Run and confirm it passes**

Run: `npx vitest run test/sign-in.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 7: Commit**

```
git add app/admin/layout.tsx app/admin/sign-in/page.tsx components/admin/SignInForm.tsx test/sign-in.test.tsx
git commit
```

Message:
```
feat(admin): sign-in surface and the admin token-scope layout

The sign-in surface is invented — it appears nowhere in design.md §11 or the
prototype — so it uses only §11.1/§11.2 vocabulary. Presentation is split from
the useActionState wrapper so all five error states are tested deterministically.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 8: The protected route and the placeholder landing

**Files:**
- Create: `app/admin/(protected)/layout.tsx`
- Create: `app/admin/(protected)/page.tsx`
- Create: `components/admin/SignOutButton.tsx`
- Test: `test/admin-landing.test.tsx`

**Interfaces:**
- Consumes: `requireAdmin()` from Task 3; `signOut` from Task 5.
- Produces: the `/admin` route. Slice 4b replaces `(protected)/page.tsx` wholesale and wraps `(protected)/layout.tsx` in the shell.

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
    const text = container.textContent ?? ''
    expect(text.toLowerCase()).not.toContain('orders')
    expect(text.toLowerCase()).not.toContain('queue')
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

- [ ] **Step 6: Run and confirm it passes**

Run: `npx vitest run test/admin-landing.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```
git add "app/admin/(protected)/layout.tsx" "app/admin/(protected)/page.tsx" components/admin/SignOutButton.tsx test/admin-landing.test.tsx
git commit
```

Message:
```
feat(admin): protected route and the slice-4a placeholder landing

(protected) adds no URL segment, so the landing serves /admin while sitting
under the guard and sign-in stays outside it with no redirect loop. The page
calls requireAdmin() itself rather than trusting the layout; cache() dedupes.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 9: Structural guard test, CLAUDE.md, and the full gate

**Files:**
- Create: `test/admin-routes.test.ts`
- Modify: `CLAUDE.md`

**Why a structural test:** protection is opt-in by file placement inside a route group that is **invisible in the URL**, and `proxy.ts` redirects anonymous users for `/admin/*` regardless — so a page misfiled outside `(protected)` looks and behaves correctly in every manual test while having no guard. The same applies to Server Actions, which are reachable by direct POST independent of the page that rendered them.

- [ ] **Step 1: Write the failing test**

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

describe("every 'use server' export in lib/admin guards itself", () => {
  // signIn is public by design; signOut is a no-op when unauthenticated.
  // Listed explicitly so adding a third exemption is a deliberate act.
  const EXEMPT = new Set(['signIn', 'signOut'])

  it('calls requireAdmin, or is a named exemption', () => {
    const files = walk(resolve(ROOT, 'lib/admin')).filter((f) => f.endsWith('.ts'))
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      if (!/^\s*['"]use server['"]/m.test(source)) continue

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

- [ ] **Step 2: Run it and confirm it passes**

Run: `npx vitest run test/admin-routes.test.ts`
Expected: PASS, 3 tests. (This test guards structure that Tasks 7–8 already established correctly, so it passes on first run. Verify it can fail: temporarily create an empty `app/admin/page.tsx`, re-run, see it fail, then delete the file.)

- [ ] **Step 3: Update `CLAUDE.md`**

Three edits. Do not restructure the file.

1. In the **Architecture** section's directory tree, add the admin routes and note the correction, replacing the line that says the admin half is not built:

```
  admin/                       # ADMIN — dark only, auth-gated (slice 4a)
    layout.tsx                 # [data-admin] token scope; noindex
    sign-in/page.tsx           # public sign-in
    (protected)/               # everything here is guarded
      layout.tsx               # force-dynamic; requireAdmin()
      page.tsx                 # /admin — placeholder (slice 4b: §11.4-A dashboard)
proxy.ts                       # session refresh + redirect for /admin/:path*
```

Add, in the admin paragraph: *the route shape is `app/admin/` with a `(protected)` group — **not** an `(admin)` route group, which would add no URL segment. `app/admin/page.tsx` must never exist.*

2. In the **Money path** client list, add a row so the new client's boundary is explicit:

*`lib/supabase/auth-server.ts` — cookie-bound `authenticated` client; every `/admin` surface reads through it under RLS. The service key stays confined to `/api/checkout`, `/api/stripe-webhook`, and `/order/[id]` — the three paths with no user session. Authorization is `requireAdmin()` in the DAL, never a layout: Next layouts do not re-render on client-side navigation.*

3. In **Verification — the gate**, replace the stale test count `**1498**` with the new total from Step 4.

- [ ] **Step 4: Run the full gate**

Run each and record the output:

```
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: lint 0 problems; typecheck 0 errors; build succeeds with no secrets present, and tests all pass.

The new tests total **50** (6 + 4 + 9 + 9 + 7 + 8 + 4 + 3), so the run should report about **1613**. Do not hardcode that number from this plan — read the real total off the `npm test` output and put *that* in `CLAUDE.md`. If the count is materially lower, a test file is not being picked up.

If `npm run build` fails on a missing env var, that is a real defect in this slice — the admin routes must not be prerendered. Confirm `export const dynamic = 'force-dynamic'` is on `app/admin/(protected)/layout.tsx`.

- [ ] **Step 5: Commit**

```
git add test/admin-routes.test.ts CLAUDE.md
git commit
```

Message:
```
test(admin): structural guard for route placement and server actions

Protection is opt-in by placement inside a route group invisible in the URL,
and proxy.ts redirects anonymous users regardless — so a misfiled page looks
correct in every manual test while having no guard. Server Actions are
reachable by direct POST independent of the page that rendered them.

Updates CLAUDE.md: admin route shape, the auth client's boundary, test count.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Done — and what is NOT done

Slice 4a is complete when the gate is green and this holds manually:

1. `/admin` signed out → redirects to `/admin/sign-in`
2. Wrong password → `Those credentials didn’t work.`, no session
3. Correct credentials → lands on `/admin`, showing the real signed-in email
4. `/admin/sign-in` signed in → redirects to `/admin`
5. Storefront toggled to light, then `/admin` → **still dark**, including the autofill dropdown on the password field
6. Sign out → redirected, and browser Back does **not** restore the protected page
7. A signup attempt against the Supabase project → rejected

**Explicitly not in this slice:** the `§11.3` shell, the nav, the `§11.4-A` dashboard, any read of `orders`/`photos`/`collections`, password reset, MFA. All of those are slice 4b or later. Do not add them.

**Do not run any SQL against the live database.** The spec's §9.1 and §9.3 queries are Jon's to run.
