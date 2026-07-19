# Slice 4 — Admin foundation + auth (design spec)

> **STATUS: Brainstormed 2026-07-19, ready for a plan.** Slice 4 opens the site's second half
> (`product.md §2`): Supabase Auth with email + password for a single admin, cookie-backed
> session handling that is **net-new to this repo**, route protection over everything under
> `/admin`, the `design.md §11.3` dark shell, and the `§11.4-A` dashboard wired to live data.
>
> **The money code is untouched.** `lib/pricing.ts`, `lib/checkout/*`, `app/api/checkout`,
> `app/api/stripe-webhook`, and `lib/orders/reconcile.ts` do not change. The dashboard **reads**
> `orders`; it never writes one, and it advances no fulfillment state (that is slice 7).
>
> Built on `develop` at slice 3 (`df15c4b`). Branch: `slice-4`.

Companion: `design.md §11.1` (tokens), `§11.2` (type roles), `§11.3` (the shell), `§11.4-A`
(dashboard), `§11.5` (shape/elevation/motion), `§11.6` (do/don't), `§8` (cross-cutting);
`product.md §1` (honest function), `§5.1` (auth), `§6.1`/`§6.3`/`§6.4` (states, reconciliation,
queue); `supabase/schema.sql` (the `authenticated` policies).

---

## 0. Decisions locked in this brainstorm

| Decision | Value | Source |
|---|---|---|
| Auth method | Supabase Auth, **email + password**. Single admin (Jon), not a role system | locked pre-brainstorm / `product.md §5.1` |
| Account creation | **Out-of-band** in the Supabase dashboard. Public signups stay disabled. The app has no signup path, ever | locked pre-brainstorm |
| Session transport | **`@supabase/ssr`**, cookie-backed. The one new dependency | brainstorm |
| Guard architecture | **Middleware refreshes + redirects; the server component enforces.** Both, deliberately | brainstorm |
| Token validation | **`getUser()` everywhere, never `getSession()`** | brainstorm |
| Admin data client | **Cookie-bound `authenticated` client, reading under RLS.** The service key stays confined to the three sessionless paths | brainstorm |
| Route shape | `app/admin/` literal segment + `(protected)` group. **Not** `app/(admin)/` — a parenthesized group adds no URL segment | brainstorm (corrects the briefing) |
| Token scope | Admin tokens on a **`[data-admin]` wrapper**, never `:root` | brainstorm |
| Nav in slice 4 | **All five `§11.3` items render; four are disabled + marked** `NOT BUILT` | Jon, brainstorm |
| Dashboard scope | **`§11.4-A` complete** — header band, four live tiles, queue rows, right rail with honest empty states. Not-yet-wired controls render disabled + marked | Jon, brainstorm |
| Sign-in surface | Centered lockup + form, **`§11.1`/`§11.2` vocabulary only**. New — undesigned in the handoff | Jon, brainstorm |
| Sign-out control | **Mono link beside "View live site ↗"** in the sidebar footer. A POST form button, not an anchor | Jon, brainstorm |
| Test orders | **Left in place**, noted here with the cleanup query. Jon is the only reader and knows what they are | Jon, brainstorm |
| New env vars | **None.** Supabase Auth runs on the URL + anon key already present | brainstorm |

---

## 0.1 Pre-verified environment state (checked 2026-07-19, Supabase dashboard)

`schema.sql`'s banner calls this "the sharpest edge, and it is not SQL" — the `authenticated`
policies grant full access to every table, so signup posture *is* the access control. Verified
directly rather than assumed:

| Setting | State |
|---|---|
| Allow new users to sign up | **OFF** ✓ |
| Allow anonymous sign-ins | **OFF** ✓ — an anonymous sign-in mints an `authenticated` user; this is the same hole under a different name |
| Confirm email | ON |
| Email provider | Enabled ✓ |
| Admin user | `jonhoffmanbusiness@gmail.com`, UID `72862543-f1e3-4bac-b861-d91931effb06` |
| Confirmed at | `16 Jul 2026 23:04` — identical to `created_at`, i.e. auto-confirmed. **Can sign in.** |
| Last signed in | never (nothing to sign into yet) |

**Two notes, neither blocking slice 4:**

- **The project is on the FREE tier.** `product.md §1.5` puts leaving it at the top of the
  cutover checklist, with the reason attached: the free-tier pause is how the last database died.
- The Users footer reads "Total: 10 users (estimated)" while the list shows one. Believed to be
  Postgres's `reltuples` estimate rather than nine hidden accounts, but **not confirmed by
  query.** If it is ever worth being certain, `select count(*) from auth.users` settles it.

---

## 1. What this slice does NOT do (deferred, not dropped)

- **No money code changes.** See the header. The dashboard reads `orders`/`order_items` and
  writes nothing.
- **No fulfillment state transitions.** `submitted_to_lab`, `shipped`, tracking entry → slice 7.
  Slice 4 renders status; it never advances it. (`product.md §6.1`: no state is ever set by
  anything but an explicit human action, and slice 4 offers no such action.)
- **No lab export.** `Copy for lab` and `Review` render disabled → slice 7 (`§11.4-E`).
- **No ingest.** `＋ Post a photo` renders disabled → slice 5 (`§11.4-C`).
- **No collections editor or home-feature picker.** `Change what leads home →` renders disabled
  → slices 6 (`§11.4-F`) and 6/`§11.4-G`.
- **No `§11.4-H` mobile admin.** Slice 4 ships the desktop `§11.3` shell plus a minimal stacking
  fallback (see §6.4). The designed phone surfaces are slice 5+.
- **No password reset, no MFA, no "remember me", no session-length tuning.** One admin, created
  out-of-band; Supabase's dashboard is the recovery path.
- **No app-level login rate limiting.** Supabase enforces auth rate limits server-side. Stated
  rather than silently assumed.
- **No typed `Database` generics** on the new client — still carried from slice 1.
- **No test-order cleanup.** Deferred by decision; query recorded in §9.3.

---

## 2. File changes

```
package.json                        # MODIFY  — add @supabase/ssr (pin whatever npm resolves)
middleware.ts                       # NEW     — root; matcher ['/admin/:path*']; refresh + redirect
lib/env.ts                          # MODIFY  — add narrow supabaseAuthEnv() (see §3.4)
lib/supabase/
  auth-server.ts                    # NEW     — server-only; createServerClient bound to cookies()
  auth-middleware.ts                # NEW     — createServerClient bound to NextRequest/Response
lib/admin/
  auth-actions.ts                   # NEW     — 'use server'; signIn / signOut
  dashboard.ts                      # NEW     — pure summarize() + thin authenticated read
app/admin/
  layout.tsx                        # NEW     — [data-admin] token scope + noindex metadata
  sign-in/page.tsx                  # NEW     — centered lockup + form
  (protected)/layout.tsx            # NEW     — getUser() guard → AdminShell
  (protected)/page.tsx              # NEW     — §11.4-A dashboard
components/admin/
  AdminShell.tsx                    # NEW     — 242px sidebar + fluid main, inside the card
  AdminNav.tsx                      # NEW     — 'use client'; usePathname; 1 live + 4 disabled
  SignOutButton.tsx                 # NEW     — POST form, styled to the mono link register
  SignInForm.tsx                    # NEW     — 'use client'; useActionState error rendering
  StatTile.tsx                      # NEW     — label / Playfair number / faint sub; alert variant
  QueueRow.tsx                      # NEW     — compact order row; mismatch quarantine treatment
app/globals.css                     # MODIFY  — append the [data-admin] block; no existing rule changes
test/
  admin-env.test.ts                 # NEW     — supabaseAuthEnv()
  admin-middleware.test.ts          # NEW     — redirect matrix + cookie survival
  admin-guard.test.ts               # NEW     — protected layout redirect / render
  admin-auth-actions.test.ts        # NEW     — signIn / signOut
  admin-dashboard.test.ts           # NEW     — pure summarize(); the queue-count invariant
  admin-nav.test.tsx                # NEW     — 1 link, 4 non-interactive + marked
  admin-shell.test.tsx              # NEW     — lockup, footer links, sign-out is a form button
  admin-dashboard.test.tsx          # NEW     — tiles, empty states, disabled controls
  sign-in.test.tsx                  # NEW     — labels, autocomplete, error states
  admin-tokens.test.ts              # NEW     — globals.css [data-admin] block declares every token
```

Nothing under `app/(store)/`, `components/store/`, `components/cart/`, `components/product/`,
`lib/pricing.ts`, `lib/checkout/`, `lib/orders/`, or `lib/data/` is modified.

---

## 3. Auth architecture

### 3.1 Why the guard is in two places

**Middleware is not the security boundary.** It is the only place a Supabase session cookie
*can* be refreshed — Next.js Server Components cannot set cookies, so a layout-only guard would
refresh the access token and then discard it, leaving the cookie to expire (1h default) and
every request to pay a refresh round-trip that never lands. That constraint is why
`@supabase/ssr` mandates middleware rather than suggesting it.

But middleware is one interceptor, and Next.js has shipped a middleware auth-bypass class before
(CVE-2025-29927, `x-middleware-subrequest`; 16 is patched). A guard that exists in exactly one
routing hook is one routing bug away from being nothing. So:

- **`middleware.ts`** — refreshes the session cookie, and redirects for UX.
- **`app/admin/(protected)/layout.tsx`** — the actual authorization boundary. Every protected
  page renders inside it. Route handlers added in slices 5–7 must perform their own check; the
  matcher is not a substitute.

### 3.2 `getUser()`, never `getSession()`

`getSession()` decodes the cookie and trusts it. `getUser()` revalidates the JWT against
Supabase's auth server. A cookie is attacker-controllable input. **Every guard in this slice
uses `getUser()`.** This is a rule for slices 5–7 too, not a slice-4 detail.

### 3.3 Which client reads what

| Client | Used by | Why |
|---|---|---|
| `lib/supabase/auth-server.ts` (**new**, anon key + user cookies) | every `/admin` surface | Reads/writes as the logged-in user. The `*_admin_all` policies in `schema.sql` are what permit it — this makes them **live and exercised** rather than decorative SQL |
| `lib/supabase/admin.ts` (service key) | `/api/checkout`, `/api/stripe-webhook`, `/order/[id]` | The three paths that have **no user session by definition** |
| `lib/supabase/server.ts` (anon, no cookies) | public catalogue reads | unchanged |

The argument for the authenticated client is not defence-in-depth in the strong sense — the
policies are `to authenticated using (true)`, so a logged-in attacker gets everything either
way. It is that **option B leaves a security control in the schema that nothing exercises**, and
this repo has a documented instance of exactly that decay: `products.ts:price`, a dead field
that "sat there until a designer copied it onto a mockup and it nearly became spec"
(`design.md §11.7`). An unexercised RLS policy is the same failure in a more dangerous place.
It also confines the service key away from every surface that renders HTML into a browser session.

### 3.4 Env

**No new variables.** But `env()` validates all five required vars including both Stripe keys,
and middleware runs on the Edge runtime for every `/admin` request. Coupling admin sign-in to
the presence of `STRIPE_WEBHOOK_SECRET` is a latent, confusing outage. `lib/env.ts` gains a
narrow accessor:

```ts
export function supabaseAuthEnv(): { url: string; anonKey: string }
```

It reads `SUPABASE_URL` (falling back to `NEXT_PUBLIC_SUPABASE_URL`) and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and **throws loudly** if either is missing or blank — the same
philosophy as `loadEnv()`, scoped to what auth actually needs. `loadEnv()` and `env()` are
unchanged; nothing that exists today changes behaviour.

`lib/supabase/auth-middleware.ts` is a separate module from `auth-server.ts` because
`lib/supabase/server.ts`'s pattern (`import 'server-only'` plus the `ws` transport) does not
survive the Edge runtime, and because the two bind cookies to different objects.

### 3.5 Middleware behaviour

`export const config = { matcher: ['/admin/:path*'] }` — this matches `/admin` itself as well as
everything beneath it. Nothing outside `/admin` is intercepted.

| Request | Authenticated? | Result |
|---|---|---|
| `/admin`, `/admin/anything` | no | 307 → `/admin/sign-in` |
| `/admin/sign-in` | no | pass through |
| `/admin/sign-in` | yes | 307 → `/admin` |
| `/admin`, `/admin/anything` | yes | pass through, refreshed cookies on the response |
| anything not under `/admin` | — | not matched |

**The one detail that must not be missed:** when redirecting, the refreshed auth cookies must be
copied onto the redirect response. Returning a bare `NextResponse.redirect()` discards them and
produces an intermittent logout loop that is genuinely nasty to diagnose. This has its own test
(§8).

### 3.6 Sign-in and sign-out

Both are Server Actions in `lib/admin/auth-actions.ts` (`'use server'`). Server Actions *can*
set cookies, so sign-in does not depend on the middleware.

**`signIn`** — zod-parses `email`/`password` from `FormData` (zod is already a dependency),
calls `signInWithPassword` on the cookie-bound server client, then `redirect('/admin')`.

- `redirect()` signals by throwing `NEXT_REDIRECT`. It must sit **outside** any `try` that
  swallows, or the success path silently becomes a failure path.
- The form is `<form action={signIn}>` and works with JavaScript disabled; `useActionState` in
  `SignInForm.tsx` renders the error when JS is present.
- The password never enters React state.

**`signOut`** — calls `supabase.auth.signOut()`, then `redirect('/admin/sign-in')`. Rendered as
a `<button>` inside a POST `<form>`, **not** an `<a>`: a GET sign-out is CSRF-able and gets
fired by link prefetching.

---

## 4. Route structure

```
app/admin/
  layout.tsx              →  wraps everything below; [data-admin] token scope; noindex
  sign-in/page.tsx        →  /admin/sign-in          PUBLIC (middleware exempts it)
  (protected)/
    layout.tsx            →  getUser() guard + AdminShell
    page.tsx              →  /admin                  dashboard
```

`(protected)` is a route group and adds no URL segment, so the dashboard stays at `/admin` while
sitting under the guard — and sign-in lives inside `/admin` without a redirect loop. The token
scope is deliberately in the **outer** layout so the sign-in page is dark without being wrapped
in a shell whose nav means nothing to someone who is not in yet.

Slices 5–7 add `photographs/`, `orders/`, `collections/`, `home-feature/` under `(protected)/`
and inherit both guard and shell.

**This corrects the `app/(admin)/` in the slice-4 briefing:** `app/(admin)/sign-in/page.tsx`
would serve `/sign-in`, not `/admin/sign-in`. The intent (protect everything admin) is preserved.

---

## 5. Token scope — and the theme collision it fixes

**The bug this prevents is live today.** `app/layout.tsx` runs a pre-hydration script that
stamps `data-theme` on `<html>` from `localStorage['theme:v1']` on **every** route, and
`app/globals.css` has `:root[data-theme='light']` redefining `--paper` to `#f2efe8`. `§11.1`
says dark is the only admin theme. Without scoping, toggling the storefront to light and then
opening the admin renders the admin on light paper.

**Fix:** `app/admin/layout.tsx` renders a wrapper carrying `data-admin`, and the admin's tokens
are declared on that wrapper. Custom properties resolve per element, so a declaration on the
wrapper beats the value inherited from `:root` regardless of selector specificity. The storefront
toggle becomes structurally unable to reach the admin — not merely overridden, but unreachable.

Appended to `app/globals.css` (no existing rule is modified):

```css
[data-admin] {
  --paper:#0b0b0b;  --panel:#0e0e0e;  --panel2:#131313;
  --ink:#efeae0;
  --dim:rgba(239,234,224,.62);
  --faint:rgba(239,234,224,.42);      /* §11.1 — differs from the storefront's .45 */
  --hair:rgba(239,234,224,.15);       /* §11.1 — differs from the storefront's .18 */
  --hairsoft:rgba(239,234,224,.08);
  --btnbg:#efeae0;  --btnink:#0b0b0b;
  --ok:#8fae8b;  --warn:#cf934f;  --alert:#c85b3d;  --info:#8a9db0;
  --nb:var(--ink);                    /* see D6 */
  background:var(--paper); color:var(--ink); min-height:100dvh;
}
html:has([data-admin]) { background:#0b0b0b; }   /* overscroll gutter */
```

`html:has(…)` keeps the overscroll gutter from flashing light paper, since `body`'s background
still resolves against `:root`. Literal value per `§11.1`'s "all values are literal."

The existing global `prefers-reduced-motion` block already neutralises animations, which covers
`§11.5`'s `softpulse` — closing the gap `§11.5` itself flags in the prototype.

---

## 6. Surfaces

### 6.1 Sign-in — `/admin/sign-in` (**new; D1**)

Undesigned in the handoff: `grep -oi "sign[- ]\?\(in\|out\)"` against
`design/Jon Hoffman Admin.dc.html` returns zero matches. Built strictly from `§11.1`/`§11.2`,
inventing no new vocabulary.

Centred on `--paper`: the sidebar's cloud mark + "Jon Hoffman / Studio Admin" lockup, then two
fields and a button.

- Labels: mono `10px/500`, `.16em`, uppercase, `--dim` (`§11.2`).
- Inputs: `--panel2` ground, `1px --hair` border, square corners, `--ink` text, `min-height:44px`.
- Button: `§11.3` primary — `--btnbg`/`--btnink`, mono `11px` `.14em` uppercase, `14px 22px`,
  square, hover `opacity:.88`, active `translateY(1px)`. Labelled **Sign in**.
- No card, no shadow. `§11.5` allows exactly one shadow on the outer shell card, and this
  surface has no shell.
- `<label for>`/`id` bound; `autocomplete="email"` and `autocomplete="current-password"`;
  `type="email"`/`type="password"`; the form is submittable by Enter.

**Error states are distinguished, because they are different facts (`§1`):**

| Cause | Copy |
|---|---|
| Wrong email or wrong password | "Those credentials didn't work." — deliberately generic; never reveals whether the address exists |
| Supabase unreachable / non-auth failure | "Couldn't reach the authentication service." |
| Empty or malformed field (zod) | Inline per field |

The error is rendered in a `role="alert"` region so it is announced, not merely displayed.

### 6.2 The shell — `§11.3`

`AdminShell.tsx`: 242px fixed sidebar + fluid main, inside a card (`border-radius:6px`, one soft
drop shadow; interior elements square, `§11.5`).

**Sidebar** (`--panel`, right `--hair` border, `padding:26px 18px 24px`):

1. Cloud mark + "Jon Hoffman / Studio Admin" lockup
2. Hairline
3. Nav (§6.3)
4. Footer pinned bottom (`margin-top:auto`): **"View live site ↗"** (`target="_blank"`,
   `rel="noopener noreferrer"`), **"Sign out"** (D2), and the 32px circle signed-in chip.

The chip renders **"JH"** per `§11.3`'s literal, with the signed-in email as its accessible text
so it is a labelled element rather than decoration. The email comes from `getUser()` in the
protected layout and is passed down as a prop — the shell itself does no fetching.

**Main header band:** mono kicker (date) over a Playfair `44px` H1, primary action top-right.

### 6.3 Nav — five items, one live (**D5**)

| Item | Slice 4 |
|---|---|
| Dashboard | **live** — `<a href="/admin">`, active state |
| Photographs | disabled + marked → slice 5 |
| Orders | disabled + marked → slice 7 |
| Collections | disabled + marked → slice 6 |
| Home feature | disabled + marked → slice 6 |

Per `§11.3`: `10px 13px`, radius 7px, mono 13px, 5px leading dot (`--nb`, opacity `.35` → `1`
when active). Active = `background rgba(239,234,224,.09)` + ink text. Hover =
`rgba(239,234,224,.05)`.

**The disabled-control rule — applies to every marked control in this slice, nav and dashboard
alike:**

| Would have been | Renders as |
|---|---|
| `<a href>` (nav items, `All orders →`, `Change what leads home →`) | `<span>` — no `href`, no `role`, no `tabindex`. Nothing to focus, nothing to click; a screen reader reads it as text, which is what it is |
| `<button>` (`＋ Post a photo`, `Copy for lab`, `Review`) | `<button disabled>` — still a button, natively conveyed as unavailable to assistive tech, and not reachable by keyboard |

Never a live `<a>` to a 404, and never a `<button>` whose handler is a no-op. In both cases the
marker is the literal string `NOT BUILT` in mono `--faint`, carried in the element's **text
content** — not a `title`, not a tooltip, not a colour. This satisfies `§11.1`'s "status is
never carried by colour alone" and `§1`'s "a control's label must match what it does": the label
says it does nothing, and it does nothing.

Copy note: `NOT BUILT` over `SOON` deliberately — "soon" claims a timeline nothing guarantees.

`AdminNav.tsx` is `'use client'` for `usePathname`. One active item today; the seam is for
slices 5–7.

**The Orders item's amber count pill (`§11.3`) is not rendered in slice 4** — Orders is disabled,
and a count pill on a dead item advertises a queue you cannot open. It arrives with the surface
in slice 7.

### 6.4 Responsive fallback

`§11.4-H` (the designed phone admin) is out of scope, but a fixed 242px sidebar on a phone is
simply broken, so *something* must happen. Minimal, least-invention rule: below `900px` the
sidebar stops being fixed and stacks above main, full-width; nav becomes a horizontal row. No
drawer, no hamburger, no new components. Hit targets ≥44px (`§8`, `§11.4-H`).

Recorded as mild invention. `§11.4-H` supersedes it in a later slice.

### 6.5 Dashboard — `/admin`, `§11.4-A`

Header band: mono kicker with the date, Playfair `44px` **"Good evening, Jon."**, and the
primary **`＋ Post a photo`** button top-right — **disabled + marked** (D4; slice 5).

> The greeting is `§11.4-A`'s literal copy. It is rendered as written rather than computed from
> the clock; making it time-aware is a later nicety, and a wrong greeting is a small `§1` lie.
>
> **The kicker date, however, must be computed — and computed server-side, from the request
> time, formatted with an explicit fixed locale and time zone.** A client-side `new Date()`
> hydrate-mismatches against the server's render, and an implicit locale makes the rendered
> string depend on the machine that happened to render it. This is the same class of defect as
> the legacy admin's "Invalid Date" (`schema.sql`, `orders.created_at`), and it is worth not
> repeating in the first surface that displays a date.

**Four stat tiles** (`1px --hair`, `22px 20px`: mono uppercase label, Playfair 42px number,
faint sub) — every one honestly computable today:

| Tile | Number | Sub | Source |
|---|---|---|---|
| In the queue | `paid` count | `paid · awaiting the lab` | `orders` |
| Needs attention | `amount_mismatch` count | `amount mismatch — quarantined` | `orders` |
| Published works | `published` count | `N unlisted` | `photos` |
| Collections | total | `<name> is featured` / `no collection is featured` | `collections` |

**The invariant (`product.md §6.3`): the "In the queue" count excludes `amount_mismatch`.** The
failure mode this exists to prevent is shipping $65 of prints for $5.50. It has a dedicated test.

**Two-column split below.**

*Left — fulfillment queue, oldest first.* Rows per `§11.4-A`: order id + date, customer, works
count, Playfair total, status chip. Both `paid` and `amount_mismatch` orders appear — mismatches
are *surfaced, never silently queued* (`product.md §6.4`) — but a mismatch row is quarantined:
alert wash, 2px left `--alert` rule, `paid $X · expected $Y`, and a `MISMATCH` chip using
`§11.5`'s `softpulse` (the only looping animation in the system). `Copy for lab`, `Review`, and
`All orders →` render **disabled + marked** (slice 7). Empty: "Nothing awaiting the lab."

*Right rail.* Home focal point card and 3-up recent uploads. Both have no data — there are no
photos, no collections, and no derivative pipeline until slice 5 — so both render honest empty
states: **"No collection leads home yet."** and **"No photographs yet."** `Change what leads
home →` renders disabled + marked (slice 6). The regions are built, not omitted; only their
populated state is deferred.

### 6.6 Zero is not the same as unreadable (**D7**)

If the Supabase read fails, four tiles reading `0` is a confident lie about an empty business —
the `§1` violation that is easiest to commit by accident. `getDashboard()` returns a
discriminated result:

```ts
type DashboardResult =
  | { ok: true;  summary: Summary; queue: QueueOrder[] }
  | { ok: false; reason: string }
```

On `ok: false` the surface renders an explicit unreadable state — no numbers, no empty-state
copy (which would also be a claim), just the fact that the data could not be read. Tiles never
render a number they did not receive.

### 6.7 Data access

`lib/admin/dashboard.ts` splits pure from impure, mirroring `lib/checkout/build.ts`:

- **`summarize(data: DashboardData): Summary`** — pure, fully unit-tested, no client.
- **`getDashboard(): Promise<DashboardResult>`** — the thin authenticated read.

Queries (all through `auth-server.ts`, under RLS):

```ts
db.from('orders')
  .select('id, status, created_at, customer_name, customer_email, total_cents, amount_paid_cents, order_items(count)')
  .in('status', ['paid', 'amount_mismatch'])
  .order('created_at', { ascending: true })

db.from('photos').select('id', { count: 'exact', head: true }).eq('published', true)
db.from('photos').select('id', { count: 'exact', head: true }).eq('published', false)
db.from('collections').select('name, featured_on_home')
```

**No `unstable_cache` on any admin read.** `lib/data/photos.ts` caches because those reads are
shared, anonymous and public; admin reads are neither shared nor anonymous, and a cross-request
cache over a per-session read is a leak seam. `cookies()` forces these routes dynamic regardless
— this is a stated rule so it does not get "optimised" back in later.

`app/admin/layout.tsx` exports `metadata` with `robots: { index: false, follow: false }`.

---

## 7. Deviations from `design.md §11` (numbered, deliberate)

| # | Deviation | Why |
|---|---|---|
| **D1** | Sign-in surface is new | Absent from `§11` and the prototype (0 grep matches). Built from `§11.1`/`§11.2` only |
| **D2** | Sign-out added to the `§11.3` sidebar footer | `§11.3` specifies the chip and "View live site ↗" but no sign-out. A console you cannot leave is a defect |
| **D3** | Needs-attention tile's `--alert` border + wash is **conditional on count > 0** | `§11.4-A` states it flatly; applied literally a healthy console shows a permanently alarmed tile reading `0` — status not reflecting reality (`§1`) |
| **D4** | Controls belonging to slices 5–7 render **disabled + marked**, not omitted and not wired | Jon's decision, applied consistently with D5 |
| **D5** | All five nav items render; four disabled + marked | Jon's decision |
| **D6** | `--nb` defaulted to `var(--ink)` | `§11.3` uses `--nb` for the nav dot; `§11.1`'s token table never defines it. Defaulted rather than invented — **a `design.md` gap to correct** |
| **D7** | Tiles distinguish zero from unreadable | `§11.4-A` assumes data is always available |
| **D8** | Orders' amber count pill deferred to slice 7 | A count pill on a disabled item advertises a queue that cannot be opened |
| **D9** | `< 900px` stacking fallback | `§11.4-H` is out of scope but a fixed 242px sidebar on a phone is broken |

D1, D2 and D6 are `design.md` **gaps**, not disagreements — they should be written back into
`§11` once built, so the next slice does not rediscover them.

---

## 8. Testing

Vitest, matching the existing split (`environment: 'node'`, `jsdom` for `.test.tsx`). The gate
is unchanged: lint / typecheck / build / test, each its own CI job. Baseline to beat: **1563
tests green** on `develop` (`CLAUDE.md`'s "1498" is stale as of slice 3).

| File | Covers |
|---|---|
| `admin-env.test.ts` | `supabaseAuthEnv()` returns both values; throws on each missing/blank; `NEXT_PUBLIC_SUPABASE_URL` fallback; **does not** require the Stripe vars |
| `admin-middleware.test.ts` | The full §3.5 matrix, **plus: refreshed cookies survive the redirect response** — the failure mode that produces an intermittent logout loop |
| `admin-guard.test.ts` | Protected layout redirects when `getUser()` returns null; renders children on a user; uses `getUser`, not `getSession` |
| `admin-auth-actions.test.ts` | `signIn` zod-rejects malformed input; returns the **generic** credential error (never distinguishes unknown email from wrong password); distinguishes a transport failure; redirects on success. `signOut` calls `signOut()` then redirects |
| `admin-dashboard.test.ts` | Pure `summarize()`: **queue count excludes `amount_mismatch`**; mismatch rows still appear in the list; empty-state copy; `ok:false` ≠ all-zeroes |
| `admin-nav.test.tsx` | Exactly one item is a link; the other four are non-interactive (no `href`, not focusable) and carry `NOT BUILT` in their text content; active state on `/admin` |
| `admin-shell.test.tsx` | Lockup; "View live site ↗" has `rel="noopener noreferrer"`; **sign-out is a `<button>` inside a `<form>`, not an anchor**; chip exposes the signed-in email |
| `admin-dashboard.test.tsx` | Four tiles; alert treatment only when count > 0 (D3); disabled controls marked; both empty states; unreadable state renders no numbers |
| `sign-in.test.tsx` | Labels bound to inputs; `autocomplete` attributes; all three error states; error region is `role="alert"` |
| `admin-tokens.test.ts` | Parses `app/globals.css`, asserts the `[data-admin]` block declares all **fifteen** tokens (`--paper --panel --panel2 --ink --dim --faint --hair --hairsoft --btnbg --btnink --ok --warn --alert --info --nb`). Cheap regression guard on §5 |

---

## 9. Out-of-band and verification

### 9.1 Already done (§0.1)
Admin user created and confirmed; signups off; anonymous sign-ins off; email provider enabled.

### 9.2 Manual verification after build

Not a CI gate — a checked list, in the spirit of the money-path gate:

1. `/admin` while signed out → redirects to `/admin/sign-in`.
2. Wrong password → "Those credentials didn't work.", no session.
3. Correct credentials → lands on `/admin`; the chip shows the signed-in email.
4. `/admin/sign-in` while signed in → redirects to `/admin`.
5. **Toggle the storefront to light, then open `/admin`** → the admin is still dark (§5).
6. Sign out → redirected to sign-in; browser Back does **not** restore the dashboard.
7. Tile counts match the `orders` table (including the test orders, §9.3).
8. Attempt a signup against the project → rejected. This is the load-bearing one:
   `schema.sql`'s policies are only safe while it stays true.

### 9.3 Test orders — left in place by decision

The money-gate verification left test orders in `orders`. They will render in the queue and in
the "In the queue" count. Acceptable here in a way it would not be on the storefront: Jon is the
only reader and knows what they are. To identify them when it is time:

```sql
select id, created_at, customer_email, status, total_cents
from orders
order by created_at;
```

Deleting an order cascades to `order_items` (`on delete cascade`). **Not** performed by this
slice, and not by Composer — a delete against the live database is Jon's to run.

---

## 10. Carried forward

- Typed Supabase `Database` generics (from slice 1) — now also applies to `auth-server.ts`.
- `design.md §11` needs D1, D2 and D6 written back in.
- `§11.4-H` mobile admin supersedes §6.4's fallback.
- Orders count pill (D8) lands with slice 7.
- The `ThemeProvider` theme-flash is **not** an admin concern once §5 lands — the admin never
  reads `data-theme`.
- Supabase FREE tier (`product.md §1.5`) — outstanding, and the documented way the last
  database died.
- `CLAUDE.md`'s test baseline (1498) is stale; update it when this slice merges.
