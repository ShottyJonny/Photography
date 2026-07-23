# Slice — About + legal surfaces + footer (design spec)

**Date:** 2026-07-22
**Surface:** the storefront surfaces `product.md §4` records as **undesigned** (About, Contact, Privacy, Terms, Refund, Shipping) plus the missing footer. Register per `product.md §1` (honest function) and the literature voice (`design.md §12.3`, Newsreader).
**Status:** approved (brainstorm), ready for writing-plans

## Goal

Build the six storefront content surfaces the site still lacks, and the footer that reaches
them. These are the **last launch blockers**: the admin is feature-complete and the storefront
read-path is built, but `product.md §4` promises About/Contact in the nav while neither is real,
and Stripe requires a refund policy that does not yet exist. This slice makes those pages exist
so the pre-launch `noindex` can be lifted at cutover.

Nothing here touches the money path, the schema, or the admin.

## The governing constraint — honest function (`product.md §1`)

Every claim on these pages must be true. In particular:

- **Shipping/Refund/Privacy describe real fulfillment.** Nations Photo Lab (NPL) prints and
  ships; US only; shipping is included in the price; damage is handled by NPL; there is no
  change-of-mind return because prints are made to order. The pages state exactly this — no
  invented timelines beyond the ranges below, no promises NPL will not honor.
- **Privacy discloses the real data flow**, including that the buyer's name and shipping address
  are **shared with NPL to fulfill the order**, and that payment is handled by Stripe (the seller
  never sees card details).
- **Copy states the fact and stops.** Legal pages are terse and factual; About/Contact are quiet
  and first-person. No softening filler, no marketing register.

## Decisions (locked in brainstorm)

1. **Approach A — copy in the page components.** Each page is a React Server Component with its
   copy written inline, exactly like the existing `app/(store)/contact/page.tsx`. No MDX, no
   Supabase-backed CMS. Legal/About copy changes ~annually; a code edit is the right cost. These
   render as static HTML with zero client JS.
2. **About is minimal (option C).** A few lines only; the photographs carry the page. A portrait
   is added later — until Jon supplies one, **no portrait element renders** (no empty frame). The
   page must read as finished with copy alone.
3. **A shared `Prose` layout.** About + the four legal pages + Contact all render through one
   reading-measure wrapper so they are visually one family and each page file is just its words.
4. **A single `Footer`**, added once to the store layout. Holds legal links, email, copyright.
   Minimal — no social links (none exist yet).
5. **About rejoins the header nav.** Primary nav becomes Prints · Collections · About · Contact ·
   Cart, restoring `design.md §12`'s intended nav. Legal lives in the footer only.
6. **Email is the only contact channel.** No phone, no contact form, no socials.

## Out of scope (do not do in this slice)

- **Do NOT lift the `noindex`.** The site-wide pre-launch noindex lives in `app/layout.tsx:15`
  (`robots: { index: false, follow: false }`) and `app/robots.ts`, and is guarded by
  `test/noindex.test.ts` so it cannot be dropped by accident. Stripe is still test mode; indexing
  a store that cannot take real money would itself be dishonest. Lifting the noindex (remove both
  files' directives **and** the guard test together) is a deliberate go-live step, tracked on the
  cutover checklist (`product.md §1.5`) alongside the `SITE_URL` fix and test-order cleanup. This
  slice must leave all three noindex artifacts untouched and green.
- **No portrait asset.** About renders copy-only until Jon provides an image (separate change).
- **No admin surface** for editing these pages (rejected approach C).

## Route & files

New top-level routes under `(store)`, matching the existing `/contact` pattern:
`/about`, `/shipping`, `/refunds`, `/privacy`, `/terms`.

| File | Change |
|---|---|
| `components/store/Prose.tsx` | **new** — shared reading-measure wrapper (server component) |
| `components/store/Footer.tsx` | **new** — storefront footer (legal links + email + copyright) |
| `app/(store)/layout.tsx` | render `<Footer />` after `{children}` |
| `app/(store)/about/page.tsx` | **new** — About (minimal copy via `Prose`) |
| `app/(store)/shipping/page.tsx` | **new** — Shipping policy via `Prose` |
| `app/(store)/refunds/page.tsx` | **new** — Refund/return policy via `Prose` |
| `app/(store)/privacy/page.tsx` | **new** — Privacy via `Prose` |
| `app/(store)/terms/page.tsx` | **new** — Terms of sale via `Prose` |
| `app/(store)/contact/page.tsx` | **edit** — refold onto `Prose` (same copy, dedupe inline styles) |
| `components/store/Header.tsx` | **edit** — add the `About` nav link between Collections and Contact |
| `app/globals.css` | add any shared `.prose` / `.site-footer` classes if not done via inline style (follow the file's existing convention) |

Each page exports `metadata = { title: '<Page> — Jon Hoffman Photography' }`.

## `Prose` component

`components/store/Prose.tsx` — a server component. Centralizes what `contact/page.tsx` currently
does inline: a centered reading column (`max-width` ≈ 640px, `margin: 0 auto`, generous top/bottom
padding), a Playfair `h1`, and Newsreader body copy at ~1.125rem / 1.7 line-height in `--dim`,
with `--ink` for the heading. Uses the existing design tokens (`--ink`, `--dim`, `--paper`,
`--hair`, `--font-playfair`, `--font-newsreader`, `--font-mono`) — no new tokens.

```tsx
export function Prose({ title, children }: { title: string; children: React.ReactNode }) {
  // <main> with the reading-measure column; <h1> in Playfair; children are the body.
}
```

Consumers pass their title and write body copy as semantic `<p>` (and `<h2>` where a page needs
sub-sections, e.g. Privacy). Keep the same visual result Contact has today.

## `Footer` component

`components/store/Footer.tsx` — a server component, rendered once in `app/(store)/layout.tsx`
below `{children}` (so it sits under every storefront page; admin has its own layout and is
unaffected). Quiet and minimal:

- A row of legal links: **Shipping · Refunds · Privacy · Terms** (mono, small, `--dim`, uppercase
  or small-caps consistent with the nav treatment in `Header.tsx`).
- The contact email as a `mailto:` link.
- A `© Jon Hoffman` line. **Do not** hardcode a year that will silently go stale — either omit the
  year or derive it; if derived, keep it a pure render with no honest-function claim attached.
- Top border via `--hair`, `--paper` background, matching the header's seam.

No newsletter field, no social icons.

## Per-page content

Draft copy below is the starting point Jon reviews in this spec. Legal pages are terse and
factual; About/Contact are quiet. Final About wording and the exact refund window are Jon's to
confirm (see Open items).

### About (`/about`) — minimal, Jon to finalize
> Draft placeholder — a few lines in first person about what he photographs and why; portrait
> added later. Example shape (Jon to replace):
>
> "I photograph [subjects] — [one line of why]. Prints are made to order and sent from a
> professional lab. If a piece speaks to you, it can hang on your wall."

Renders copy-only; no portrait element until an asset exists.

### Contact (`/contact`) — keep current copy
Keep the existing, in-voice copy ("Write when you are ready — there is no rush, and every enquiry
is read personally") and the `mailto:jonhoffmanbusiness@gmail.com` link. Only change: render it
through `Prose` instead of bespoke inline styles.

### Shipping (`/shipping`)
States, plainly:
- Prints are made to order and produced by a professional photographic lab (Nations Photo Lab),
  which ships directly.
- **Shipping is included in the price** — there is no separate shipping charge.
- Typical timing: about **3–5 business days to print** and **2–5 business days in transit**.
- **United States only** for now.

### Refunds (`/refunds`)
States, plainly:
- Because each print is **made to order**, orders cannot be returned for a change of mind.
- If a print **arrives damaged or defective**, it is replaced — email
  `jonhoffmanbusiness@gmail.com` within **30 days of delivery** with a photo of the damage, and
  the lab (NPL) makes it right. *(Window to be confirmed against NPL's actual claim window — see
  Open items.)*

### Privacy (`/privacy`)
States, plainly, in short sub-sections:
- **What is collected:** to fulfill an order — your name, email, and shipping address.
- **Payment:** handled by **Stripe**; card details are never seen or stored by this site.
- **Sharing:** your name and shipping address are shared with **Nations Photo Lab** to print and
  ship your order. Nothing else is shared or sold.
- **No tracking:** no analytics, no advertising cookies, no newsletter. Cart contents and your
  light/dark preference are stored only in your own browser and are never sent to a server.
- **Contact:** questions to `jonhoffmanbusiness@gmail.com`.

### Terms (`/terms`)
States, plainly:
- Prices are in **US dollars**; the price shown at checkout is the total (shipping included).
- Prints are **made to order** and shipped within the **United States** only.
- All photographs and their copyright remain the property of Jon Hoffman; purchase of a print
  conveys no license to reproduce the image.
- (Governing-law clause **omitted** pending Jon's decision — see Open items.)

## Testing

Vitest + React Testing Library, following the existing storefront test patterns
(`test/header.test.tsx`, `test/contact.test.tsx` if present). Add:

- **Each new route renders** its heading and its key factual line (e.g. Shipping renders "United
  States", Refunds renders the made-to-order line, Privacy renders the Stripe + NPL disclosures).
- **`Prose` renders** its `title` as an `<h1>` and its children.
- **`Footer` renders** all four legal links pointing at the correct hrefs, plus the `mailto:`.
- **Header nav includes `About`** at `/about` (extend `test/header.test.tsx`).
- **The noindex guard (`test/noindex.test.ts`) stays green** — this slice must not alter it.

Full gate must stay green: `npm run lint` · `npm run typecheck` · `npm run build` · `npm test`
(currently 1840 tests).

## Open items (Jon to confirm; non-blocking for planning)

1. **About final copy** — the minimal lines. Drafted at implementation; Jon replaces the words.
2. **Refund window** — spec says 30 days; confirm this matches (or is stricter than) NPL's actual
   damage-claim window so the page promises nothing NPL won't honor.
3. **Governing law** — a state for the Terms clause, or omit it. Currently omitted.
