# Slice 4a — Admin auth spine (design spec)

> **STATUS: Brainstormed + adversarially reviewed 2026-07-19, ready for a plan.** Slice 4a is
> the **auth spine only**: Supabase Auth with email + password for a single admin, cookie-backed
> sessions, the authorization boundary, the sign-in surface, and the `[data-admin]` token scope.
> It ends at a verifiable milestone — **signed in, on a deliberately plain protected page, able
> to sign out** — and ships no shell and no dashboard.
>
> **Slice 4b** (`2026-07-19-admin-shell-dashboard-design.md`) builds the `design.md §11.3` shell
> and the `§11.4-A` dashboard on top of this. The split was taken on review: the combined slice
> projected to ~15 tasks and ~3,000 plan lines, and the back half — where the honest-function
> invariants live — is exactly where a long plan degrades.
>
> **The money code is untouched.** `lib/pricing.ts`, `lib/checkout/*`, `app/api/checkout`,
> `app/api/stripe-webhook`, `lib/orders/reconcile.ts`. Slice 4a reads no business data at all.
>
> Built on `develop` at slice 3 (`df15c4b`). Branch: `slice-4`.

Companion: `design.md §11.1` (tokens), `§11.2` (type roles), `§8` (cross-cutting);
`product.md §1` (honest function), `§5.1` (auth); `supabase/schema.sql` (the `authenticated`
policies).

---

## 0. Decisions locked

| Decision | Value | Source |
|---|---|---|
| Auth method | Supabase Auth, **email + password**. Single admin, not a role system | locked pre-brainstorm / `product.md §5.1` |
| Account creation | **Out-of-band**. Public signups stay disabled. The app has no signup path, ever | locked pre-brainstorm |
| Session transport | **`@supabase/ssr`**, cookie-backed. The one new dependency | brainstorm |
| **Authorization boundary** | **`requireAdmin()` in the data-access layer.** Not the layout — see §3.1 | **review finding, verified** |
| Network hook | **`proxy.ts`**, not `middleware.ts` — the latter is deprecated in Next 16 | **review finding, verified** |
| Token validation | **`getUser()` everywhere, never `getSession()`** | brainstorm |
| Admin data client | Cookie-bound `authenticated` client under RLS. Service key stays confined to the three sessionless paths | brainstorm |
| Route shape | `app/admin/` literal segment + `(protected)` group. **Not** `app/(admin)/` | brainstorm |
| Token scope | Admin tokens on a **`[data-admin]` wrapper**, never `:root` | brainstorm |
| Sign-in surface | Centred lockup + form, `§11.1`/`§11.2` vocabulary only. New — undesigned in the handoff | Jon |
| New env vars | **None** | brainstorm |
| Test orders | **Cleaned up by Jon between 4a and 4b.** See §9.3 | Jon, on review |

---

## 0.1 Pre-verified environment state (Supabase dashboard, 2026-07-19)

`schema.sql`'s banner calls this "the sharpest edge, and it is not SQL" — the `authenticated`
policies grant full access to every table, so signup posture *is* the access control.

| Setting | State |
|---|---|
| Allow new users to sign up | **OFF** ✓ |
| Allow anonymous sign-ins | **OFF** ✓ — an anonymous sign-in mints an `authenticated` user; same hole, different name |
| Confirm email | ON |
| Email provider | Enabled ✓ |
| Admin user | `jonhoffmanbusiness@gmail.com`, UID `72862543-f1e3-4bac-b861-d91931effb06` |
| Confirmed at | `16 Jul 2026 23:04` — identical to `created_at`, i.e. auto-confirmed. **Can sign in.** |

**The project's time zone is `America/New_York`** — the dashboard rendered `created_at` as
`GMT-0400`. Slice 4b needs this for date rendering; recorded here because this is where it was
observed.

**✓ Resolved 2026-07-19 — there is exactly one account.** The Users footer's "Total: 10 users
(estimated)" was Postgres's `reltuples` estimate, as suspected; Jon confirmed the real count is
**1**. This mattered because every `authenticated` account has full read *and write* access to
every customer's name, email, address and order (`schema.sql:301-307`, `with check (true)`), so
"how many accounts exist" *is* the authorization model.

> **The control still lives in a dashboard toggle, not in code.** `requireAdmin()` asserts that
> *a* Supabase user exists, never *which* — so the single-admin guarantee rests entirely on
> signups staying disabled, which nothing in this repo enforces or detects. That is the locked
> decision from §0 ("single admin, not a role system"), and it is sound only while the count
> stays 1. **If a second account ever appears, it is a full admin.** An `ADMIN_USER_ID`
> allowlist in `require-admin.ts` would move the control into code; it is deliberately not
> built, and is recorded in §10 so the decision is visible rather than assumed.

**Not blocking:** the project is on the **FREE tier**. `product.md §1.5` puts leaving it at the
top of the cutover checklist — the free-tier pause is how the last database died.

---

## 1. What slice 4a does NOT do

- **No shell, no nav, no dashboard** → slice 4b. The protected page is a deliberately plain
  placeholder (§6.3).
- **No business data reads.** No `orders`, `photos`, or `collections` query exists in 4a.
- **No money code changes.**
- **No password reset, no MFA, no "remember me".** One admin, created out-of-band; Supabase's
  dashboard is the recovery path. See §9.1 for the two zero-code settings that compensate.
- **No app-level login rate limiting.** Supabase enforces auth rate limits server-side.
- **No typed `Database` generics** — still carried from slice 1.
- **No return-path (`?next=`) preservation** — see §3.5's constraint for when it lands.

---

## 2. File changes

```
package.json                        # MODIFY  — add @supabase/ssr (record the resolved version)
proxy.ts                            # NEW     — root; matcher ['/admin/:path*']; refresh + redirect
lib/env.ts                          # MODIFY  — add supabaseAuthEnv() (§3.4)
lib/supabase/
  auth-server.ts                    # NEW     — server-only; createServerClient bound to cookies()
  auth-proxy.ts                     # NEW     — createServerClient bound to NextRequest/NextResponse
lib/admin/
  require-admin.ts                  # NEW     — server-only; requireAdmin(); THE boundary
  auth-actions.ts                   # NEW     — 'use server'; signIn / signOut (async exports only)
  auth-state.ts                     # NEW     — SignInState + INITIAL_SIGN_IN_STATE (see §3.6)
app/admin/
  layout.tsx                        # NEW     — [data-admin] scope + noindex metadata
  sign-in/page.tsx                  # NEW     — centred lockup + form
  (protected)/layout.tsx            # NEW     — force-dynamic; requireAdmin(); renders children bare
  (protected)/page.tsx              # NEW     — plain placeholder landing (§6.3)
components/admin/
  SignInForm.tsx                    # NEW     — 'use client'; useActionState
  SignOutButton.tsx                 # NEW     — POST form + button
app/globals.css                     # MODIFY  — append the [data-admin] token block + .admin-sr-only
CLAUDE.md                           # MODIFY  — route shape, client table, test baseline (§10)
test/
  admin-env.test.ts                 # NEW
  admin-proxy.test.ts               # NEW
  require-admin.test.ts             # NEW
  admin-auth-actions.test.ts        # NEW
  admin-routes.test.ts              # NEW     — structural: nothing unprotected under app/admin/
  sign-in.test.tsx                  # NEW
  admin-tokens.test.ts              # NEW
```

Nothing under `app/(store)/`, `components/{store,cart,product}/`, `lib/pricing.ts`,
`lib/checkout/`, `lib/orders/`, or `lib/data/` is modified.

---

## 3. Auth architecture

### 3.1 The boundary is the data-access layer — not the layout

**This corrects the first draft of this spec, which named the protected layout as the boundary.**
Next 16's own auth guide (`node_modules/next/dist/docs/01-app/02-guides/authentication.md:1350`):

> "Due to Partial Rendering, be cautious when doing checks in Layouts as these don't re-render on
> navigation, meaning the user session won't be checked on every route change. Instead, you
> should do the checks close to your data source."

With one protected page nothing is exploitable. With slices 5–7's four pages under the same
group, a client-side `<Link>` renders the target's RSC payload against a **cached layout** and
the guard never re-runs. A rule written now propagates into those slices, so it has to be right
now.

**Therefore:**

```ts
// lib/admin/require-admin.ts
import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

export const requireAdmin = cache(async (): Promise<User> => {
  const supabase = await createAuthServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) redirect('/admin/sign-in')
  return data.user
})
```

- **`cache()`** dedupes within a single request, so the layout and every DAL call share one
  `getUser()` round-trip.
- **Every** admin read or write calls it **as its first statement** — including
  `getDashboard()` in 4b and every ingest / collections / fulfillment function in slices 5–7.
- The `(protected)` layout still calls it (it needs the user, and it covers a direct page load),
  but it is **not** the boundary and this spec no longer describes it as one.

**`proxy.ts` is not the boundary either.** Next's own migration note calls the feature "a last
resort" and moved it out of the app runtime deliberately. It refreshes the cookie and redirects
for UX. Nothing else.

### 3.2 Server Actions are public POST endpoints

`node_modules/next/dist/docs/01-app/02-guides/data-security.md:281`:

> "when a Server Action is created and exported, it is reachable via a direct POST request, not
> just through your application's UI. This means, even if a Server Action or utility function is
> not imported elsewhere in your code, it can still be called externally."

and `:291`: encrypted action IDs "reduce the risk in cases where an authentication layer is
missing. However, you should still treat Server Actions as reachable via direct POST requests."

**Rule, normative for slices 5–7:** every `'use server'` export that touches admin data calls
`requireAdmin()` as its first statement. A page-level check does not extend into the actions
defined under it.

4a's own two actions are the exception that proves it: `signIn` is public by design, and an
unauthenticated `signOut` is a no-op. **They are safe by luck, which is exactly why the rule
would not have been noticed as missing.** `admin-routes.test.ts` enforces it mechanically (§8).

### 3.3 Which client reads what

| Client | Used by | Why |
|---|---|---|
| `lib/supabase/auth-server.ts` (**new**, anon key + user cookies) | every `/admin` surface | Reads/writes as the logged-in user; the `*_admin_all` policies are what permit it, making them **live and exercised** rather than decorative SQL |
| `lib/supabase/auth-proxy.ts` (**new**, same, request-bound) | `proxy.ts` only | Different cookie binding — `NextRequest`/`NextResponse` rather than `next/headers` |
| `lib/supabase/admin.ts` (service key) | `/api/checkout`, `/api/stripe-webhook`, `/order/[id]` | The three paths with **no user session by definition** |
| `lib/supabase/server.ts` (anon, no cookies) | public catalogue reads | unchanged |

`lib/supabase/client.ts` uses plain `createClient` with its own storage and **does not share the
cookie session** — no admin surface may reach for it.

The argument for the authenticated client is not defence-in-depth in the strong sense (the
policies are `using (true)`, so a logged-in attacker gets everything either way). It is that the
alternative leaves a security control in the schema that nothing exercises, and this repo has a
documented instance of exactly that decay — `products.ts:price`, the dead field that "sat there
until a designer copied it onto a mockup and it nearly became spec" (`design.md §11.7`).

### 3.4 Env and client construction

**No new variables.** But `env()` validates all five required vars including both Stripe keys,
and it would run on every `/admin` request. Coupling admin sign-in to `STRIPE_WEBHOOK_SECRET` is
a latent, confusing outage. `lib/env.ts` gains:

```ts
export function supabaseAuthEnv(source: Source = process.env): { url: string; anonKey: string }
```

Mirrors `loadEnv`'s injectable-source shape so `admin-env.test.ts` needs no `process.env`
mutation (which would risk cross-file pollution with `test/env.test.ts`). It reads
`SUPABASE_URL` (falling back to `NEXT_PUBLIC_SUPABASE_URL`) and `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
and throws loudly if either is missing or blank. `loadEnv()` and `env()` are unchanged.

**Both new clients supply the `ws` transport**, exactly as `lib/supabase/{admin,server}.ts` do:

```ts
realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor }
```

`@supabase/supabase-js` constructs an (unused) `RealtimeClient` on every `createClient` call and
throws without a WebSocket global, which Node exposes only from v22 — and `.nvmrc` is **20**.
Next 16 does polyfill `globalThis.WebSocket` inside its node server runtime
(`next/dist/server/node-environment-baseline.js:9`), so runtime would survive without this — but
that is an undocumented internal, and matching the three existing clients costs one line.

> **Note for the plan:** this repo's dev machine is Node 22 (which has `WebSocket` natively) and
> CI is Node 20. A missing transport therefore passes locally and fails on CI. This is the same
> trap `test/clients.test.ts` exists to cover.

`auth-proxy.ts` is a separate module from `auth-server.ts` **solely because the two bind cookies
to different objects.** (The first draft justified the split with an Edge-runtime argument; that
argument is void — see §3.5 — and has been removed rather than left as plausible-sounding
reasoning.)

**Cookie attributes.** The admin session cookie is served from the same origin as the public
storefront, which renders customer-supplied data. Nothing in this project needs JS access to it
— sign-in is a Server Action and `createBrowserClient` is never used. The `setAll` adapter
therefore **merges these over the library-supplied options**, preserving the library's
`maxAge`/`expires`:

```ts
{ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }
```

Set in the adapter rather than via a library option name this spec cannot verify against an
uninstalled package.

**`auth-server.ts` shape** — two details that are easy to get wrong:

```ts
export async function createAuthServerClient() {   // async: cookies() returns a Promise in Next 16
  const cookieStore = await cookies()
  const { url, anonKey } = supabaseAuthEnv()
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try { /* set each, merging the attributes above */ }
        catch { /* Server Component render — cookies are read-only here; proxy.ts refreshes instead */ }
      },
    },
    realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
  })
}
```

Without the `await`, `getAll` is called on a Promise. Without the `try/catch`, the first render
that coincides with a token refresh throws *"Cookies can only be modified in a Server Action or
Route Handler"* and the admin 500s intermittently. The asyncness cascades: `requireAdmin()`,
both actions, and 4b's `getDashboard()` all `await` the factory.

### 3.5 `proxy.ts` — the network hook

`middleware.ts` is **deprecated in Next 16**
(`docs/.../03-file-conventions/proxy.md:11`; `upgrading/version-16.md:627`):

> "The `middleware` filename is deprecated, and has been renamed to `proxy`… The `edge` runtime
> is **NOT** supported in `proxy`. The `proxy` runtime is `nodejs`, and it cannot be configured."

Verified signature: `export function proxy(request: NextRequest)` (may be `async`) plus
`export const config = { matcher: [...] }`.

```ts
export const config = { matcher: ['/admin/:path*'] }
```

Verified empirically against Next's bundled `path-to-regexp`: matches `/admin`, `/admin/`,
`/admin/orders`, `/admin/sign-in`; rejects `/adminx`. Nothing outside `/admin` is intercepted, so
no `_next/static` exclusion is needed.

| Request | Authenticated? | Result |
|---|---|---|
| `/admin`, `/admin/*` | no | 307 → `/admin/sign-in` |
| `/admin/sign-in` | no | pass through |
| `/admin/sign-in` | yes | 307 → `/admin` |
| `/admin`, `/admin/*` | yes | pass through, refreshed cookies on the response |
| `getUser()` **throws** (Supabase unreachable) | — | treat as unauthenticated → `/admin/sign-in`, where §6.1's transport copy explains it. **Never fail open** |

**Three rules that must all hold, not one.** The first draft named only the third:

1. **Call `getUser()` immediately after client construction**, with no intervening code, or the
   refresh races the response.
2. **`setAll` writes to both** `request.cookies` *and* a freshly re-created
   `NextResponse.next({ request })`, then sets them on that response — writing only to the
   response leaves the same request's later `getAll()` reading stale values.
3. **On redirect, copy the cookies from that response object** onto the redirect. A bare
   `NextResponse.redirect()` discards the refreshed session and produces an intermittent logout
   loop that is genuinely nasty to diagnose.

**Every `/admin` response carries:**

```
Cache-Control: no-store, private
X-Robots-Tag: noindex, nofollow
```

`no-store` is what actually defeats bfcache restoring a post-sign-out page, so §9.2 step 6
verifies a real property rather than a hoped-for one. `X-Robots-Tag` covers response shapes a
`<meta robots>` tag cannot — route handlers and generated image routes that slices 5–7 may add.
Do **not** add `/admin` to `robots.txt`; that publishes the path.

**Constraint for later slices:** if a return-path parameter is ever added so `/admin/orders`
survives sign-in, it is accepted only as a same-origin **relative** path matching `^/admin(/|$)`
— never a full URL, never protocol-relative `//host`. Writing it down now costs a sentence.

### 3.6 Sign-in and sign-out

Both are Server Actions in `lib/admin/auth-actions.ts` (`'use server'`). Server Actions *can*
set cookies, so sign-in does not depend on the proxy.

> A `'use server'` module may export **only async functions**. `SignInState` and the initial-state
> constant therefore live in `lib/admin/auth-state.ts` — an `export const` in a `'use server'`
> file is a build error.

**Signature — pinned, because the first draft gave two incompatible ones** (`<form action={signIn}>`
implies `(formData)`, while `useActionState` requires `(prevState, formData)`; wiring the former
into the latter is a typecheck error, and the error copy would have been unreachable dead code):

```ts
// lib/admin/auth-state.ts
export type SignInState =
  | { status: 'idle' }
  | { status: 'error'; kind: 'credentials' | 'rate_limited' | 'transport' | 'unknown' }
  | { status: 'fieldErrors'; email?: string; password?: string }
export const INITIAL_SIGN_IN_STATE: SignInState = { status: 'idle' }

// lib/admin/auth-actions.ts
export async function signIn(prev: SignInState, formData: FormData): Promise<SignInState>
export async function signOut(): Promise<void>
```

The success path never returns, because `redirect()` throws.

**`signIn`** — zod-parses `email`/`password` (zod is already a dependency), calls
`signInWithPassword`, then `redirect('/admin')`.

- `redirect()` signals by throwing `NEXT_REDIRECT` and must sit **outside** any `try` that
  swallows, or the success path silently becomes a failure path.
- **Errors classify by code and HTTP status, not by exception-vs-return** — see §6.1.

**`signOut`** — **fail-closed and local-first.** The first draft had no failure path: if the
call to GoTrue rejects, `redirect()` never runs, the cookies are never cleared, and the admin is
left signed in on a screen that says otherwise — on a free-tier project subject to cold starts.
That is the mirror of the `redirect()`-inside-`try` trap: the first draft caught the
false-failure case and missed the false-success case. So:

1. Call `supabase.auth.signOut()` inside a `try/catch` that **swallows and proceeds**.
2. Clear the auth cookies unconditionally.
3. `revalidatePath('/admin', 'layout')` — purges the client Router Cache on an auth-state change.
4. `redirect('/admin/sign-in')`, outside the `try`.

Rendered as a `<button>` inside a POST `<form>`, **not** an `<a>`: a GET sign-out is CSRF-able
and gets fired by link prefetching.

> **Known property, not a defect:** the Supabase Data API validates a JWT by signature and `exp`
> with no revocation lookup, so a *copied* access token retains `authenticated` database access
> for the remainder of its ~1h life after sign-out. Inherent to the architecture, recorded so it
> is not a later surprise. It is an argument for shortening the access-token TTL (§10).

---

## 4. Route structure

```
app/admin/
  layout.tsx              →  wraps everything below; [data-admin] scope; noindex
  sign-in/page.tsx        →  /admin/sign-in          PUBLIC (proxy exempts it)
  (protected)/
    layout.tsx            →  force-dynamic; requireAdmin(); renders children
    page.tsx              →  /admin                  placeholder landing (4a) → dashboard (4b)
```

`(protected)` adds no URL segment, so the landing stays at `/admin` while sitting under the
guard, and sign-in lives inside `/admin` without a redirect loop. The token scope is in the
**outer** layout so sign-in is dark without inheriting a shell.

**Three normative rules for slices 5–7:**

- **`app/admin/page.tsx` must never exist** — it collides with `(protected)/page.tsx` and fails
  the build with a parallel-pages error. §4 is the document that should prevent it.
- **Every new page/route under `app/admin/` goes inside `(protected)/`.** Protection is opt-in by
  file placement in a group that is *invisible in the URL*, and the proxy redirect would make a
  misplaced file look correct in every manual test — the two-layer design silently degrading to
  one. `admin-routes.test.ts` enforces this structurally.
- **These conventions render outside the layout even inside `(protected)/`** and each needs its
  own `requireAdmin()`: `route.ts` handlers, `opengraph-image`/`twitter-image`/`icon` generated
  routes, `default.tsx`, and root `global-error.tsx`.

`export const dynamic = 'force-dynamic'` is declared on `(protected)/layout.tsx`. `cookies()`
would force it dynamic anyway, but the CI build job runs **with no secrets**, and whether
`next build` survives would otherwise depend on statement ordering inside the client factory.
All five existing store server pages already carry it.

---

## 5. Token scope — and the theme collision it fixes

**The bug is live today.** `app/layout.tsx` stamps `data-theme` on `<html>` from
`localStorage['theme:v1']` on **every** route, and `globals.css` has `:root[data-theme='light']`
redefining `--paper` to `#f2efe8`. `§11.1` says dark is the only admin theme. Unscoped, toggling
the storefront to light and opening the admin renders the admin on light paper.

**Fix:** `app/admin/layout.tsx` renders a wrapper carrying `data-admin`; the admin's tokens are
declared *on that wrapper*. Custom properties resolve per element, so a declaration on the
wrapper beats the value inherited from `:root` regardless of selector specificity — the
storefront toggle becomes structurally unable to reach the admin.

Appended to `app/globals.css`; no existing rule is modified:

```css
[data-admin] {
  --paper:#0b0b0b;  --panel:#0e0e0e;  --panel2:#131313;
  --ink:#efeae0;
  --dim:rgba(239,234,224,.62);
  --faint:rgba(239,234,224,.50);      /* D10 — §11.1 says .42; see §7 */
  --hair:rgba(239,234,224,.15);
  --hairform:rgba(239,234,224,.37);   /* D11 — form-control borders; see §7 */
  --hairsoft:rgba(239,234,224,.08);
  --btnbg:#efeae0;  --btnink:#0b0b0b;
  --ok:#8fae8b;  --warn:#cf934f;  --alert:#c85b3d;  --info:#8a9db0;
  --nb:var(--ink);                    /* D6 */
  background:var(--paper); color:var(--ink); min-height:100dvh;
  color-scheme: dark;
}
html:has([data-admin]) { background:#0b0b0b; color-scheme: dark; }
html:has([data-admin]) body { background:#0b0b0b; }

.admin-sr-only {
  position:absolute; width:1px; height:1px; padding:0; margin:-1px;
  overflow:hidden; clip-path:inset(50%); white-space:nowrap; border:0;
}
```

Three details the first draft missed:

- **`color-scheme: dark`** is not a custom property and is not covered by the token block. Without
  it, Chrome's autofill paints a light ground over `--panel2` on the password field — on the
  saved-credentials path, which is the *normal* path for the only user — and scrollbars, the
  password-reveal control and the UA focus ring all render for a light scheme.
- **`html:has([data-admin]) body`** — `body { background: var(--paper) }` still resolves `--paper`
  from `:root`, so a light body box survives behind the wrapper, hidden only by the wrapper's
  `min-height:100dvh` happening to cover it.
- **`.admin-sr-only`** — no visually-hidden utility exists in `globals.css` today, and 4b's
  signed-in chip needs one.

`:has()` is unsupported on Safari <15.4, where only the overscroll gutter degrades.

The existing global `prefers-reduced-motion` block already neutralises animations
(`animation-iteration-count:1 !important`), which matters in 4b.

---

## 6. Surfaces

### 6.0 Focus — closing `design.md §10 q2`

`design.md §8`: *"The focus row is load-bearing and is this document's alone. §11 and §12 do not
mention focus states… It is the one accessibility rule the handoff dropped, and the current site
already fails it. **It does not get to fail twice.**"* And `§10 q2` asks for a specified
treatment *"before anyone builds a keyboard-reachable surface."* This is that surface.

`globals.css` already carries `:focus-visible { outline: 1px solid var(--ink); outline-offset: 2px; }`.
Inside `[data-admin]` it resolves against the admin `--ink` (`#efeae0`) at **16.4:1** on `--paper`
— it works, but 4a **states** that it relies on it rather than inheriting it by accident, and
tests it. On the `--btnbg` primary button (a near-white ground) the 2px offset is what keeps the
ring visible; that is why the offset is not zero.

Written back into `design.md §11.5` on merge, closing `§10 q2`.

### 6.1 Sign-in — `/admin/sign-in` (**D1**)

Undesigned in the handoff: `grep -oi "sign[- ]\?\(in\|out\)"` against
`design/Jon Hoffman Admin.dc.html` returns **zero matches**. Built strictly from `§11.1`/`§11.2`.

Centred on `--paper`: the cloud mark + "Jon Hoffman / Studio Admin" lockup, then two fields and
a button.

- Labels: mono `10px/500`, `.16em`, uppercase, `--dim` (6.6:1). Written **sentence case in JSX,
  uppercased by CSS `text-transform`** — so tests query sentence case.
- Inputs: `--panel2` ground, `1px --hairform` border (**D11** — `--hair` at `.15` gives a 1.42:1
  boundary, failing SC 1.4.11's 3:1; the field would have no perceivable edge), square corners,
  `--ink` text, `min-height:44px`.
- Button: `§11.3` primary — `--btnbg`/`--btnink`, mono `11px` `.14em` uppercase, `14px 22px`,
  square, hover `opacity:.88`, active `translateY(1px)`. Label **Sign in**.
- No card, no shadow (`§11.5` allows exactly one, on the shell card, which this surface has none of).
- `<label for>`/`id` bound; `autocomplete="email"` / `autocomplete="current-password"`;
  `type="email"` / `type="password"`; submittable by Enter.

**Errors classify by code and status.** A two-bucket exception-vs-return split would report
`email_not_confirmed`, a 429 lockout, and `user_banned` — all returned by a perfectly reachable
server — as network failures. The one message telling Jon he is rate-limited would be the one
telling him to check his internet.

| `kind` | Trigger | Copy |
|---|---|---|
| `credentials` | `invalid_credentials` | `Those credentials didn&rsquo;t work.` |
| `rate_limited` | `over_request_rate_limit` / HTTP 429 | `Too many attempts. Wait a minute and try again.` |
| `transport` | thrown `fetch` error, or 5xx | `Sign-in isn&rsquo;t working right now. Not your password.` |
| `unknown` | anything else | `Sign-in failed.` |
| `fieldErrors` | zod | inline, per field |

- The `credentials` copy is deliberately generic and never reveals whether an address exists.
  GoTrue returns a uniform `invalid_credentials` for both cases, so the copy matches the server.
- The `transport` copy says only what is known. The first draft's *"Couldn't reach the
  authentication service."* asserts a network fact the app cannot establish — a 500 was reached
  perfectly well — and is vendor jargon in a voice measured against the Relics essay.
- **Apostrophes are `&rsquo;`/`’`**, never `'`. `react/no-unescaped-entities` ships in
  `eslint-config-next/core-web-vitals` and lint is a 0-warning CI gate;
  `app/(store)/order/[id]/page.tsx` already works around this. `§11.2` wants typographic
  apostrophes anyway.
- Rendered in a `role="alert"` region so it is announced, not merely displayed.

### 6.2 `app/admin/layout.tsx`

Renders the `[data-admin]` wrapper. Exports `metadata` with
`robots: { index: false, follow: false }` — which covers rendered pages; §3.5's `X-Robots-Tag`
header covers everything else.

### 6.3 The protected landing — 4a's placeholder

Deliberately plain, and **explicitly not a design surface**. It exists to make the milestone
verifiable and is replaced wholesale by 4b's `§11.4-A` dashboard.

- Playfair `Studio Admin`
- Mono `Signed in as {email}` — the real value from `requireAdmin()`
- The sign-out button

No stats, no nav, no queue, no empty states. It claims nothing, so there is nothing for it to
claim falsely.

---

## 7. Deviations from `design.md §11`

| # | Deviation | Why |
|---|---|---|
| **D1** | Sign-in surface is new | Absent from `§11` and the prototype (0 grep matches). Built from `§11.1`/`§11.2` only |
| **D6** | `--nb` defaulted to `var(--ink)` | `§11.3` uses it for the nav dot; `§11.1`'s token table never defines it. A **`design.md` gap** |
| **D10** | `--faint` raised `.42` → `.50` in the admin block | `.42` computes to **3.58:1** on `--paper`, failing the 4.5:1 body-text minimum. `.50` gives **4.63:1**. `§11.1` assigns `--faint` to "tertiary text, meta, placeholder" — all real text. 4b's `NOT BUILT` marker and stat-tile subs both land here, so the string carrying the honest-function mechanism would otherwise be the least readable text on screen |
| **D11** | New `--hairform` (`.37`) for form-control borders; `--hair` stays `.15` for dividers | `--hair` as an input border gives **1.42:1**, failing SC 1.4.11's 3:1 for non-text UI. `.37` is the first passing value at **3.02:1**. Dividers are decorative and 3:1 does not apply, so the token splits by role rather than moving |

D1, D6, D10 and D11 are `design.md` **gaps or defects**, not disagreements — all four get written
back into `§11` on merge, together with §6.0's focus treatment, so slices 5–7 do not rediscover
them.

> Contrast figures computed with the WCAG 2.x relative-luminance formula, alpha composited over
> the stated ground. Reproduced as assertions in §8's `admin-tokens.test.ts`.

---

## 8. Testing

Vitest. `environment: 'node'`, `jsdom` for `.test.tsx` (keyed purely on the extension — a
`.test.ts` file cannot render). Gate unchanged: lint / typecheck / build / test.
Baseline to beat: **1563 tests green** on `develop` (verified; `CLAUDE.md`'s "1498" is stale).

### 8.1 Constraints the builder must know

- **There is no `@testing-library/jest-dom`.** `.toBeInTheDocument()`, `.toBeDisabled()` and
  friends are unavailable. Assert on `document.querySelector`, `textContent`, attributes.
- **Never construct a real Supabase client in a test.** Node 20 has no global `WebSocket` and
  Next's polyfill does not load under Vitest, so an unmocked `createServerClient()` throws on CI
  and passes on a Node 22 dev machine. Mock `@supabase/ssr`, or the local wrapper modules.
- **`cookies()` from `next/headers` throws outside a request scope** — mock it with a fake store.
- **`redirect()` must be mocked to *throw*** a `NEXT_REDIRECT`-shaped error. Mocking it as a
  no-op lets the guard keep executing past the redirect, so the test passes while proving
  nothing. Assert `await expect(fn()).rejects.toThrow(/NEXT_REDIRECT/)`.
- The repo's async-server-component idiom is `test/order-confirmation.test.tsx`:
  `render(await Page({ … }))` with `vi.mock` of the data module.

### 8.2 Coverage

| File | Covers |
|---|---|
| `admin-env.test.ts` | `supabaseAuthEnv()` returns both values; throws on each missing/blank; the `NEXT_PUBLIC_SUPABASE_URL` fallback; **does not** require the Stripe vars |
| `admin-proxy.test.ts` | The full §3.5 matrix. Plus: the mocked `createServerClient` invokes the `setAll` callback it was handed with a synthetic cookie, and the returned 307 is asserted to carry it in `Set-Cookie` — the cookie-survival trap tested by *driving* the adapter rather than hoping a refresh happens. Plus `Cache-Control: no-store, private` and `X-Robots-Tag` on every response. Plus: `getUser()` throwing redirects to sign-in (never fails open) |
| `require-admin.test.ts` | Throws `NEXT_REDIRECT` when `getUser()` returns null **and** when it returns an error; returns the user otherwise; uses `getUser`, not `getSession` |
| `admin-auth-actions.test.ts` | `signIn` zod-rejects malformed input; maps each of the four error kinds by code/status; returns the **generic** credential error (never distinguishing unknown email from wrong password); redirects on success. **`signOut` clears cookies and redirects even when `supabase.auth.signOut()` rejects** |
| `admin-routes.test.ts` | Structural. Walks `app/admin/`: every `page.tsx`/`route.ts` except `sign-in/page.tsx` lies under a `(protected)` segment, and `app/admin/page.tsx` does not exist. Walks `lib/admin/`: every exported async function in a `'use server'` module contains `requireAdmin` — except the two named exemptions, listed explicitly so adding a third is a deliberate act |
| `sign-in.test.tsx` | Labels bound to inputs; `autocomplete` attributes; all five error states; the error region is `role="alert"`; the focus ring is present on the button and both inputs |
| `admin-tokens.test.ts` | Parses `app/globals.css`; asserts the `[data-admin]` block declares all **sixteen** tokens (`--paper --panel --panel2 --ink --dim --faint --hair --hairform --hairsoft --btnbg --btnink --ok --warn --alert --info --nb`), plus `color-scheme:dark`, the `html:has([data-admin]) body` rule, and `.admin-sr-only`. **Plus computed contrast assertions**: `--faint` and `--dim` ≥ 4.5:1 on `--paper`, `--hairform` ≥ 3:1 — so D10/D11 cannot be silently reverted to `§11.1`'s literals |

---

## 9. Out-of-band and verification

### 9.1 Before build — Jon, in the Supabase dashboard

1. **Blocking:** run `select count(*), array_agg(email) from auth.users;` and record the result
   in this spec. One account is the entire safety argument for the `authenticated` policies.
2. **Blocking:** confirm no additional auth provider is enabled (any OAuth/SSO provider is a
   second door to `authenticated`), and no third-party auth / JWT signing key is configured.
3. Turn **leaked-password protection ON** and raise the **minimum password length**. Zero code —
   and after 4a a single password with no second factor is the sole control over every customer's
   name, email, address and order, with write access.

### 9.2 After build — manual

1. `/admin` signed out → redirects to `/admin/sign-in`.
2. Wrong password → the generic credential copy, no session.
3. Correct credentials → lands on `/admin`; the page shows the real signed-in email.
4. `/admin/sign-in` signed in → redirects to `/admin`.
5. **Toggle the storefront to light, then open `/admin`** → still dark (§5). Check the autofill
   dropdown on the password field too — that is what `color-scheme` fixes.
6. Sign out → redirected; **browser Back does not restore the protected page** (now a real
   property: `no-store` + `revalidatePath`, §3.5/§3.6).
7. Attempt a signup against the project → rejected. The load-bearing one: `schema.sql`'s
   policies are only safe while it stays true.

### 9.3 Test orders — cleared between 4a and 4b

The money-gate verification left test orders in `orders`, **including a forced
`amount_mismatch`**. Not a 4a concern (4a reads no business data), but 4b's dashboard would
render the Needs-attention tile permanently alarmed on a fake row — precisely the state 4b's D3
exists to prevent — and would make 4b's "tile counts match the table" check self-fulfilling.

```sql
select id, created_at, customer_email, status, total_cents, amount_paid_cents
from orders
order by created_at;
```

Deleting an order cascades to `order_items`. **Jon runs this**, not Composer — a delete against
the live database is not an agent's to make.

---

## 10. Carried forward

- **`CLAUDE.md` is updated in this slice**, not later: the admin route shape (`app/admin/`, not
  `app/(admin)/`), the new clients in the Money-path client table, and the stale 1498 baseline.
  Left alone, the next slice's agent reads `(admin)` as authoritative and rebuilds the mistake
  this spec exists to prevent.
- `design.md §11` needs D1, D6, D10, D11 and §6.0's focus treatment written back in.
- Typed Supabase `Database` generics (from slice 1) — now also `auth-server.ts`/`auth-proxy.ts`.
- **Consider shortening the access-token TTL** (§3.6's known property).
- **MFA** — explicitly weighed and deferred; blast radius recorded in §9.1.
- **`ADMIN_USER_ID` allowlist.** `requireAdmin()` authenticates but does not authorize a specific
  user. Single-admin safety currently depends on the Supabase signup toggle, which no test or
  code path can see. Cheap to add (one env var, one equality check); deferred because §0 locked
  "no new env vars" and the account count is verified at 1. Revisit the moment a second account
  is needed for any reason.
- `@media print` for `[data-admin]`: `--ink` is `#efeae0` and browsers drop backgrounds when
  printing, so a printed admin page is near-white on white. Deliberately out of scope until
  slice 7, the surface anyone would actually print.
- Supabase **FREE tier** (`product.md §1.5`) — the documented way the last database died.
- `JH-YYYYMMDD-NNNN` order ids (`design.md §11.4-E`) have **no backing column** in `schema.sql`.
  4b renders a uuid prefix; slice 7's lab export needs a real decision.
