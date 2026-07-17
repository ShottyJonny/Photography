# product.md

> **STATUS: Groundwork for the rebuild — design landed 2026-07-16.** Records what each surface **is** and **does**, and what the data model must become for any of it to work. Decided items are marked ✓; stubs and open questions are marked ▢ and are **not** build commitments.
>
> **Both halves are now designed** (`design.md §11` admin, `design.md §12` storefront), which answered §8 q1 (the lab), q2 (caption/description/alt), and q6 (portfolio-vs-store). What the design did **not** cover is recorded honestly: About, Contact, and every legal page are still undesigned (§4), and the storefront has no home link (`design.md §10 q1`). Nothing here is built yet.

Companion to `design.md`. **`design.md` = how it looks and moves. `product.md` = what each surface is and does** — information architecture, per-surface behaviour, and the honest-function rules. Questions about *appearance* → design.md. Questions about *behaviour or IA* → here. Questions about *commands, constraints, or the money path* → CLAUDE.md.

---

## 1. Honest function — the governing rule ✓

**A control's label must match what it actually does. A status must reflect reality. Copy must not claim an action the system never performed.**

This is not an abstract principle here — it is a correction. As of 2026-07-16 the live site did all three of these things wrong:

- `Order.tsx` set `shipped = true` on a 900ms `setTimeout` and generated a fake UPS-style tracking number, telling **every** customer their print had shipped before it existed.
- The same page said "We've sent a confirmation email with your order details." No email was ever sent — `sendOrderNotification()` was written and never called.
- `/#/order/<anything>` told any stranger "Your payment has been processed successfully."

All three are removed. They were removed rather than fixed because there was no truth to point them at. **The admin is what makes them true**: a real fulfillment state, a real tracking number, entered by a human who actually did the thing.

**Rule:** if a surface cannot tell the truth about a state, it does not display that state. It says less instead of guessing.

---

## 1.5. The rebuild — stack and hosting ✓

Decided 2026-07-16. **This repo is being rebuilt. The current stack is legacy.**

| | Now (legacy) | Target |
|---|---|---|
| Framework | Vite + React 18, hand-rolled hash router | **Next.js** (App Router) |
| Hosting | Netlify + `netlify/functions/*` | **Vercel** |
| Data | `products.ts` / `collections.ts` as TS files | Supabase tables (§3) |
| Images | 369MB committed to git | Object storage, derivatives at ingest (§3) |
| Design | system colours, no type system | **`design.md §11`–§12** — specified 2026-07-16 |

**Why:** three of the biggest outstanding items — image pipeline, routing/SEO, per-page metadata — are hand-rolled work on Vite and native features in Next.js. The presentation layer was being rewritten anyway for the redesign, so the marginal cost of the stack move is negative: it removes work. Vercel follows from Next.js (first-party support), and it's already in use on the owner's other projects. Astro was seriously considered and rejected: it's the better fit for a content site, but an authenticated CRUD admin (§5, §6) breaks that premise, and Astro's MPA model would force a rewrite of all five React Contexts.

### Rules for the rebuild

- **Do not invest in the legacy stack.** No build-time image pipeline, no hash-router migration, no Netlify config work beyond keeping the live site alive. That work is throwaway.
- **The current site stays live** until the new one is real. It takes real money today. Build beside it; cut over when it works.
- **Port the money logic verbatim.** `computeOrderAmounts()`, `PRICE_BY_SIZE`, `estimateTaxRate`, `estimateShipping` are pure functions with no framework in them. They are the most dangerous code in the repo and the easiest to move. Do not "improve" them in transit.

### Migration hazards — read before porting the functions

- **`process.env.URL` is Netlify-only.** `create-checkout-session.js:89-90` builds Stripe's `success_url` and `cancel_url` from `${process.env.URL || 'http://localhost:5181'}`. Netlify sets `URL`; **Vercel does not.** On Vercel the fallback fires and every paying customer is redirected to `http://localhost:5181`. The session creates fine, the card charges, the webhook still marks the order paid, and nothing logs an error — you get the money, they get a dead link. Vercel's equivalents are `VERCEL_URL` (no protocol) and `VERCEL_PROJECT_PRODUCTION_URL`. `node --check` and every CI job pass this. Nothing catches it.
- **The Stripe webhook endpoint must be re-registered** at the new URL in Stripe's dashboard. Miss it and payments silently stop being confirmed; orders sit at `pending` forever.
- **`VITE_SUPABASE_URL` is read server-side** in `stripe-webhook.js:5` despite the `VITE_` prefix, which only means anything to Vite. Rename on the way over.
- `netlify.toml` (SPA catch-all, `NODE_VERSION`) and `netlify/functions/package.json` are Netlify-specific and do not travel.

---

## 2. The two halves ✓

| | Storefront | Admin |
|---|---|---|
| Audience | Strangers, unauthenticated | Jon, authenticated |
| Job | Show the work clearly; sell a print without pressure | Get photos in; get orders out |
| Shape | Mostly static, image-heavy, fast | Stateful CRUD, file handling, workflow |
| Failure mode | Feels like a catalog instead of a gallery | Slower than doing it by hand |

That last one is the admin's real test. **If it is slower than editing `products.ts` and checking Stripe by hand, it has failed**, regardless of how it looks. It is replacing a workflow that currently works, badly, but works.

---

## 3. What the data model has to become ✓

The admin is impossible against the current model. These are prerequisites, not nice-to-haves:

| Today | Must become | Why |
|---|---|---|
| `src/data/products.ts` — hand-edited TS, compiled into the bundle. Its own header claims it is auto-generated by `scripts/generate-products.mjs`, which does not exist. | A `products` table | You cannot upload a photo into a TypeScript file. The file also currently lies about its own provenance. |
| `src/data/collections.ts` — same, including the Relics `literature` essay | A `collections` table + join to products, with ordering | §1 of design.md puts the emotional register in `literature`. The admin owns the writing. |
| `public/images/` — **369MB committed to git**. `thumbs/` are byte-identical copies of `prints/`. | Object storage, two tiers (below) | 369MB leaves the repo. The clone stops being a download. Thumbnails stop being a lie. |
| Orders in Supabase that **no admin ever reads** | Same table, richer status, read by the admin | `Order.tsx:33` reads a single order back via `getOrder()` for the customer's own confirmation — that is the only working reader, and it needs the id. There is no view of *all* orders that functions: `Orders.tsx:17` reads `o.createdAt` while every order saves `created_at`, so every row renders "Invalid Date" and the sort is `NaN`. |

### Storage tiers ✓

Two tiers, and the split is load-bearing:

- **Originals — private.** The full-resolution print file. Only ever touched by fulfillment. Never served to a browser. Today `prints/bw/Omniprominence.jpg` is 32MB and is sent to phones; that stops.
- **Derivatives — public.** Generated **once, on upload**: thumbnail, display, and `srcset` widths, in a modern format.

**Derivatives are generated at ingest, not at build time.** A build-time `sharp` script is a workaround for not having an upload path. Once photos arrive through the admin, the thing that has the file in hand makes the sizes. The thumbnail problem stops existing rather than being papered over.

`averageColor()` (`src/utils/color.ts`) becomes a **stored column**, computed once on upload. Today it fetches full-resolution images in a `useEffect`, which is why `loading="lazy"` is a no-op site-wide — killing that runtime fetch is worth doing on its own terms.

> **Superseded 2026-07-16 — the aura is speculative now, not a feature.** This paragraph used to justify the column with *"design.md §1 names borrowed colour as the preferred direction; this is what makes it free instead of a liability."* **`design.md §12.1` rejected borrowed colour.** Nothing on the storefront reads an aura — the hero's colour bleed is a blur of the *actual plate*, not a computed average, so it does not rescue the justification. The column is retained because it is cheap with the file in hand at ingest and expensive to backfill later — **not** because anything consumes it. Do not build UI implying otherwise (`design.md §11.4-C`). Decide its fate before it becomes another `sendOrderNotification()`: written, never called, permanent. Tracked at `design.md §10 q3`.

---

## 4. Storefront surfaces

Carried over from the current site. Status reflects the **rebuild**, not the live site. Appearance is `design.md §12`.

| Surface | Status | Notes |
|---|---|---|
| Home | ✓ `design.md §12.5-A` | "Must be grander" is answered: a full-height, uncropped, full-bleed plate with an index rail. Replaces the ~440px boxed hero. |
| Shop → **Prints** | ✓ `design.md §12.5-B` | 3-col 4:5 grid. Title leads, price recedes. Currently 20 products, unpaginated — pagination is still unaddressed. |
| Product | ✓ `design.md §12.5-D` | Crop-guide overlay **kept** — genuinely novel, and it survives precisely because five of seven sizes crop. Colour/B&W kept as the **Colour / Silver** register toggle: both registers, neither named correct (§1). |
| Collections / Collection detail | ✓ `design.md §12.5-C` | Masthead → literature at reading measure → works as a film-strip. `.shop-grid`'s missing CSS rule dies with the rewrite. |
| Cart / Checkout | ✓ `design.md §12.5-F/G` | Money path works and is hardened. **Port `netlify/functions/lib/pricing.js` verbatim** (§1.5). |
| Order confirmation | ✓ `design.md §12.5-H` | Shows only states that are true (§1, §6). The customer's only receipt is Stripe's — say so, imply nothing else. |
| About | ▢ **stub, and not designed** | Still `<p>Coming soon.</p>`. **The handoff does not design it** — yet `design.md §12`'s nav links to it. |
| Contact | ▢ **not designed** | Emoji-corporate register today, social links point at `#/`. **The handoff does not design it** — yet the nav links to it. Rewrite to sound like the Relics essay (§1's falsifiable test). |
| Privacy / Terms / Refund / Shipping | ▢ **missing entirely, and not designed** | Still no pages and **still no footer** — the handoff adds neither. Stripe expects a refund policy. |

> **Gap in the handoff — the nav promises two surfaces that do not exist.** `design.md §12` specifies seven storefront surfaces (Home, Prints, Collection, Product, Cart, Checkout, Confirmation) plus mobile. Its nav is **Prints / Collections / About / Contact / Cart** — but there is no About surface and no Contact surface anywhere in the prototype, and no footer or legal page of any kind (`grep -ci '<footer' design/*.dc.html` → 0; no Privacy/Terms/Refund/Shipping link at all). Building §12 exactly as written ships **two nav links that go nowhere**, which is §1's own rule broken: a control's label must match what it does. These four-plus surfaces need design before the storefront is buildable end-to-end, and the refund policy is not optional — Stripe expects it.

There is also **no home link** anywhere in the nav, and the cloud mark is bound to the theme toggle instead. Tracked at `design.md §10 q1`.

---

## 5. Admin — content

### 5.1 Auth ✓
Single admin (Jon). Supabase Auth. Not a role system — there is one user and no plan for a second.

**This forces the RLS question**, which has been open and unverified since the audit: the anon key ships in the bundle, and if RLS is not set on `orders`, every customer's name, email, and address is public. The admin cannot be built without answering it. Originals bucket private, derivatives public, `orders` readable only by the authenticated admin.

### 5.2 Photo library ✓ specified
Drag-and-drop upload. On ingest, in one pass: store the original privately, generate derivatives, measure aspect ratio, compute the aura colour, create the row.

Designed as `design.md §11.4-C` (surface C, "Post a photo").

**Resolved 2026-07-16 — caption vs description vs alt are four fields, because they are four jobs.** This was open ("which does an uploaded photo get, and is there a third thing?"). The answer is all of them, named and separated:

| Field | Face | Job |
|---|---|---|
| **Title** | Playfair | The work's name. |
| **Caption** | Newsreader | The short line on the card. |
| **Description** | Newsreader | The print's own page. |
| **Alt text** | Hanken | **Describes the image.** Accessibility, and nothing else. |

`Collection.literature` remains separate and belongs to the collection, not the photo (§5.3).

The alt field is the one that fixes a real defect: the a11y audit found every image uses the product's *title* as alt text, so a blind customer cannot learn what a print depicts. A title is not a description — "Deterioration" tells you nothing about the photograph. Alt is now a field a human fills in, which is the only thing that could ever have fixed it.

Also per photo: aspect, price/size availability, published/unlisted, optional B&W (Silver) variant.

### 5.3 Collections + literature ✓ specified
Create a collection, add photos, **order them** (sequence is editorial — it is how a collection reads), set a cover, write the literature.

Designed as `design.md §11.4-F`: drag-reorder rows with a cover toggle, beside a Newsreader literature editor with title, dek, body, word count, and a small formatting toolbar.

The literature editor is not a nice-to-have. It is where the site's voice lives. Whatever it is, it has to be pleasant enough to write a real essay in, because a bad editor means the essays stop getting written and §1's whole thesis quietly dies. The design sets it in Newsreader — the same face the essay renders in on the storefront (`design.md §12.3`), so what Jon writes it in is what a reader sees. That is the point, not a coincidence.

---

## 6. Admin — fulfillment ✓ specified

**Model: a lab, ordered manually.** Jon places the order on the lab's site himself. The admin does not talk to a lab; it tracks state and hands him what he needs to place the order without retyping anything.

**This model is now confirmed rather than assumed.** The lab is Nations Photo Lab (§8 q1) and it offers no way to integrate — so "the admin does not talk to a lab" stopped being a design choice and became a fact of the world. Everything below was specced against a hypothetical manual lab and turned out to be right. Appearance: `design.md §11.4-D/E`.

### 6.1 The state machine

| State | Set by | Means |
|---|---|---|
| `pending` | Checkout, before payment | Order saved; payment not confirmed. |
| `paid` | Stripe webhook | Payment confirmed. Replaces today's `completed`, which is misleading — nothing is complete. |
| `amount_mismatch` | Stripe webhook | **`session.amount_total` ≠ the stored order total.** See §6.3. |
| `submitted_to_lab` | Jon, manually | He placed the order at the lab. |
| `shipped` | Jon, manually + tracking | The only state that may ever display a tracking number. |
| `cancelled` / `refunded` | Jon, manually | |

Forward-only except for cancel/refund. No state is ever set by a timer (§1).

### 6.2 The lab export — the core feature ✓ specified

The reason this beats the current workflow. For an order, produce everything needed to place it at the lab without retyping:

- Per line: a link to the **original** (not a derivative), the size, quantity, and colour vs B&W.
- The shipping address, copyable.
- The order id, for reconciling later.

**Resolved 2026-07-16 — the lab is Nations Photo Lab.** This was q1 in §8 and "the single highest-value unknown here." It is answered, and the answer costs less than feared: **Nations offers no integration to hook into, which confirms the manual model above rather than threatening it.** There is no API to build against, no unknown consumer, and no generic exporter — the export is a plain-text block a human copies into Nations' own order form. Format specified at `design.md §11.4-E`; the surface is `design.md §11.4-E` (surface E). `finish` is a settable field, default **Lustre**.

**Still open — how the ordered crop reaches Nations.** The export links `<slug>_orig.tif`, the untouched original, which carries the plate's native aspect and *not* the ordered one. But only `8x10` and `16x20` of the seven sizes in `ALL_SIZES` are 4:5; the other five crop. Meanwhile the storefront's crop guide (`design.md §12.5-D`) has already shown the customer exactly what their size cuts — a promise nothing currently keeps on the fulfillment side. Someone or something must produce the print-ready, correctly-cropped file, and the design does not yet say who. Until it does, the export **says nothing about crop rather than guessing** (§1). The handoff's draft NOTES line, `Match crop to 4:5 as delivered`, was removed for exactly this reason: it would mis-print five of seven sizes.

**Confirm before building:** Nations' exact surface/paper vocabulary, so the `finish` enum and the NOTES block match their real order form.

### 6.3 Amount reconciliation ✓ (known gap, still open)

`create-checkout-session` prices whatever `items` the request claims and never checks them against the order already saved under that `orderId`. Someone can save a $65 order, submit the same id with a 4x6, pay ~$5.50, and the webhook still marks the $65 row complete.

The webhook must compare `session.amount_total` to the stored total and set `amount_mismatch` instead of `paid`. **The admin is what makes that fix meaningful** — a flag nothing surfaces is not a fix. A mismatched order must be visibly quarantined out of the fulfillment queue, because the failure mode is shipping $65 of prints for $5.50.

This is the top of the money list and it is unchanged by the rebuild.

### 6.4 Orders list ✓ specified
Default view is the work queue: `paid`, oldest first. Mismatches surfaced, never silently queued. Search by order id or email — the customer's only receipt is Stripe's, so the id is what they will quote.

Designed as `design.md §11.4-D`: tabs (Queue / Needs attention / Shipped / All), expandable rows showing each work's size, register, and price, and a per-row copy of name + address. A mismatched order is held out of the queue on an alert wash with a pulsing chip — **and is excluded from the queue tab count**, so it cannot be fulfilled by someone working the list top-to-bottom (§6.3).

---

## 7. What the admin fixes as a byproduct

Not chores — consequences of building it right:

- `products.ts` stops lying about being generated, because it becomes data.
- 369MB leaves git.
- Thumbnails become real, at ingest.
- `averageColor()` becomes a column instead of a full-resolution fetch.
- Full-resolution originals get a legitimate home: fulfillment, not `<img>`.
- RLS gets answered because auth forces it.
- `Orders.tsx`'s "Invalid Date" (`createdAt` vs `created_at`) dies with the page.
- Orders that fell back to localStorage and sit at `pending` forever stop existing — there is no localStorage fallback in an admin-backed model.
- "Shipped" and its tracking number become true.

---

## 8. Open questions

**The numbering is stable and load-bearing** — `design.md §11.7` cites q3/q4/q5 by number. Answered questions are marked in place, never renumbered away.

1. ✓ **Which lab? — answered 2026-07-16: Nations Photo Lab.** It offers no way to integrate, which **confirms** the manual model in §6 rather than threatening it: there is no API to build, no unknown consumer, no generic exporter. This was "the single highest-value unknown here" and it unblocked §6.2 at a cost of nothing. See §6.2.
2. ✓ **Caption vs description vs alt — answered 2026-07-16: four fields.** Title, Caption, Description, Alt (§5.2). Three jobs crammed into one field became four fields doing four jobs. Alt is the one that fixes a real defect.
3. ▢ **Do prices stay size-only?** — **open.** `PRICE_BY_SIZE` is keyed *only* by size today; product identity does not affect price. An admin invites per-photo pricing. If that changes, `netlify/functions/lib/pricing.js` must change with it — it is a hand-maintained mirror with no test enforcing it. Note the design mock shows a "$150 base" that is pure fiction: the real ladder is `$5.00 → $65.00`.
4. ▢ **What happens to `unlisted`?** — **open.** Currently a `products.ts` boolean for direct-link-only prints. `design.md §11.4-B/C` surface it as a real, first-class status, which leans hard toward "kept" — but leaning is not deciding. Confirm it is a feature and not a leftover being cemented by a mockup.
5. ▢ **Does the storefront read the DB at request time, or build-time static?** — **open, and now printed in the UI.** Decides whether publishing a photo needs a redeploy. A Next.js question specifically (§1.5): static generation with on-demand revalidation, or server components reading Supabase per request. Leaning revalidation. **Raised urgency:** `design.md §11.4-G` puts "publishing needs no redeploy" on screen as copy. Until this is confirmed, that copy is a promise the system may not keep — a §1 violation waiting to ship.
6. ✓ **Portfolio-vs-store — answered 2026-07-16: portfolio that sells.** The layout decided it before any prose did; it is now recorded in `design.md §1`. Home is an index of works, the shop is titled "Prints," title leads and price recedes.
7. ▢ **How does the ordered crop reach Nations?** — **new, open.** The export links the untouched original; five of seven sizes crop; the storefront's crop guide has already promised the customer a specific crop. Nothing currently produces the print-ready file. See §6.2.

**Resolved without ever being a question here:** the print size list. `ALL_SIZES` keeps all seven (`4x6, 5x7, 8x10, 11x14, 12x16, 16x20, 20x30`) and `PRICE_BY_SIZE` is untouched (decided 2026-07-16). The handoff's "all 4:5" was loose wording, not a proposal — but it is recorded because it nearly became one silently, and it would have landed in the money code. See `design.md §12.5-D`.
