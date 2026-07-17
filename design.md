# design.md

> **STATUS: Target specified 2026-07-16.** [§11](#11-admin-studio-admin) (admin) and [§12](#12-storefront-jon-hoffman-photography) (storefront) **are the design** — stated as settled fact, and between them they resolve every question §1 previously left open. [§1](#1-aesthetic-direction) records the posture and what was decided.
>
> **§2–§7 are a legacy inventory of `src/styles.css`** — the stylesheet the rebuild deletes. They describe the live site until cutover and they expire then. **Do not read them as targets.** §8 (cross-cutting rules) and §9 (regressions the rebuild must not inherit) are **live** and apply to the new stack.

Companion to `CLAUDE.md` and `product.md`. **`design.md` = how it looks and moves. `product.md` = what each surface is and does. `CLAUDE.md` = how to work in the repo, and the money path.**

**Start here:** §1 for the posture and the decisions → §12 for the storefront → §11 for the admin.

The pixel references are `design/Jon Hoffman Photography.dc.html` (storefront, surfaces A–I) and `design/Jon Hoffman Admin.dc.html` (admin, surfaces A–H), with `design/Home Directions.dc.html` kept as provenance for the three home explorations the built direction was chosen from. **Where a §11/§12 rule and a prototype disagree, the rule wins; where a rule is silent, the prototype does.**

> **Reading the prototypes:** they reference `assets/photos/*.jpg` and `assets/CloudLogoWhiteHalf.png`, which **do not resolve in this repo** — the photographs are the 369MB problem (`product.md §3`) and never travelled. Type, tokens, spacing, layout, and the wired interactions all render; the plates come up empty. Read them for structure, not imagery. They are design references, **not production code to copy** — the surfaces get recreated in the Next.js target using its own patterns, and every price comes from the ported pure functions (`product.md §1.5`), never from the mock's hard-coded numbers.

§2–§7 were measured against `src/styles.css` (1,688 lines, single stylesheet) on 2026-07-16.

---

## 1. Aesthetic direction

Posture decided 2026-07-16, and **unchanged by the redesign** — the handoff was judged against it, not the reverse. Colour, type, and IA were open when this section was written and are now decided; see "Resolved" below, and §11–§12 for the specification.

### The organizing logic: duality, held privately

The cloud mark is not a cloud. It is a cloud **interrupted** — a soft, billowing form severed by a hard vertical cut at its widest point. It is a metaphor for bipolar disorder and for the other dualities the work occupies.

**This is the site's organizing logic, and it is never announced.**

Announced metaphors stop working the moment they are announced. The Relics literature is the proof: it is the most personal thing on the site — it opens on a dictionary definition, wanders through lost media, and only then puts a hand on your chest — and it works *because* it never explains itself. The design follows the same rule the prose already follows.

**Rule:** the duality may inform every decision. It may never be captioned. It is a dial that can be turned up later once there is a real substrate to judge against; it cannot be turned back down once it is loud.

### A stranger owes the site no feeling on arrival

Someone landing here needs to feel nothing in particular. The work is seen clearly; the writing is there if they want it. Do not engineer a mood at the door.

### Not a museum

Rejected explicitly. A museum asks the viewer to revere the work, and that posture is unearned by definition — reaching for it is exactly what reads as self-important. **Restraint is welcome; reverence is the failure mode.**

The antidote is already in the voice. "How utterly asinine" and "Hell, I hope they find my baby teeth" are not the sentences of a pretentious person. **If the site's voice stops sounding like the Relics essay, the site is wrong.** That is the falsifiable test for this section.

### The feeling lives in the writing, not the chrome

`Collection.literature` (`src/data/collections.ts:7`) is where emotional register belongs. The chrome stays quiet because the essay carries it better than any colour could. This is not suppression — it is putting the feeling where it is strongest, and the data model already says so.

The per-print colour/B&W toggle (`imageBW`) is the same principle at the image level: the viewer is handed both registers and picks one. The site never says which mood is correct.

### Duality is already in the code — it is just unintentional

These are currently generic features. They are the thesis. Treat them as such:

- The light/dark theme (`ThemeContext`) — currently a bare `color-scheme` flip (§2).
- The colour/B&W toggle on every print (`imageBW`, `thumbnailBW`) — currently a checkbox.
- The mark itself — `Cloud Logo Black Half.png` / `Cloud Logo White Half.png` are the same silhouette in two values (a pair for placing on dark vs light grounds, not two interlocking halves).

Neither theme state should be the "real" one with the other as a preference. Both are fully intended.

**The handoff honoured all three.** The mark became the theme control itself (§12.2), the checkbox became the Colour/Silver register toggle (§12.5-D), and neither theme is canonical. None of it is captioned anywhere — the rule above held.

### Home must be grander

The landing page is currently the weakest expression of the work on the site. `.hero` splits the 960px shell 1fr/1fr (`src/styles.css:848`, §4), so the photograph lands at roughly 440px — *narrower than the interior collection pages*, which were widened to 1200px. The most important "sell the work" moment is the smallest. This needs the most ambition of any surface.

### Resolved 2026-07-16

Everything this section left open was decided by the design handoff. Recorded here as decisions; specified in full in §12 (storefront) and §11 (admin).

- **Colour — decided: strict black-and-white with warm-paper ink.** The photograph carries all the colour on the page (§12.1). The palette is literal tokens on `:root`; the system-colour model inventoried in §2 does not survive.

  **Borrowed colour was rejected** — despite being this section's stated first preference. The reason is this section's own counterpoint: the site read flat for want of typography and rhythm, not hue, and once a real type system exists the monochrome chrome is enough. Temperature, rust, and colour-as-event were not taken either; colour-as-event survives in spirit, at the image level rather than in transitions.

  Colour enters in exactly two places, both quiet: the **Colour/Silver register toggle** on a print (§12.5-D), and a heavily blurred, dimmed copy of the hero plate bleeding under the chrome (§12.1). Felt, not announced.

  **Consequence:** `averageColor()`'s justification in `product.md §3` no longer holds — nothing on the storefront reads an aura. It is retained at ingest as **speculative**, not as a feature. See §10 and `product.md §3`.

- **Typography — decided: four faces with fixed jobs.** Playfair Display (titles, names, totals), Newsreader (all prose, and the literature), IBM Plex Mono (chrome, labels, metadata), Hanken Grotesk (neutral UI). Full roles in §12.3, shared verbatim by the admin (§11.2). The counterpoint above called this the highest-leverage question and was right twice: it resolved first, and colour resolved *because* of it.

- **Portfolio-that-sells vs store-that-showcases — decided: portfolio that sells.** No prose ever decided this; **the layout did**, and it is written down here so it stops being ambient. Evidence: home is an index of *works*, not a shop grid (§12.5-A); the shop is titled "Prints" (§12.5-B); title leads and price recedes (§12.5-B); price is stated once, quietly (§12.7). The current `.product-card` — price plus two buttons on every card — is precisely what this rejects.

- **Home — decided: a full-height, uncropped, full-bleed plate** (§12.5-A). Answers "must be grander," and the ~440px boxed hero directly.

- **Light/dark — decided: both first-class on the storefront** (§12.2). Neither is canonical, per this section's rule. The **admin is dark-only** (§11.1) — it is a workspace, not a mood. The cloud mark is the storefront's theme toggle: the duality expressed as an interaction rather than captioned, which is this section's rule honoured rather than broken. **It also leaves the site with no way home — see §10.**

---

# §2–§7 — LEGACY INVENTORY

> **These six sections describe `src/styles.css` as it exists today — the stylesheet the rebuild deletes.** They are not targets and never were; they were recorded so a redesign started from a known baseline instead of a blank page. **The target is §11–§12.**
>
> They stay only because the current site is still live and still taking real money (`CLAUDE.md` §Key constraints), and something has to describe it until cutover. **They expire at cutover — delete them with the stylesheet.** The gap between this inventory and §11–§12 is not a migration path: it is total. The stylesheet is being replaced, not moved toward.
>
> What survives from here is in §8 (rules) and §9 (regressions not to inherit). Those two are live.

## 2. Color — current state

**There is no brand palette. There are no brand colors anywhere in the codebase.** Every color derives from the browser's *system* colors via CSS system keywords and `color-mix`. This is the single most consequential fact about the site's current appearance, and it is why it reads as undesigned rather than as badly designed — it is wearing OS defaults by construction.

`src/styles.css:3-14`:

| Token | Value | Notes |
|---|---|---|
| `--bg` | `canvas` | System color keyword |
| `--text` | `canvasText` | System color keyword |
| `--bg-subtle` | `color-mix(in oklab, canvas 96%, canvasText 4%)` | |
| `--bg-elev` | `color-mix(in oklab, canvas 92%, canvasText 8%)` | |
| `--bg-elev-2` | `color-mix(in oklab, canvas 94%, canvasText 6%)` | |
| `--border` | `color-mix(in oklab, canvasText 15%, transparent)` | |
| `--border-soft` | `#0002` | The only literal color token; does not adapt to theme |
| `--muted` | `color-mix(in oklab, canvasText 12%, transparent)` | |

**Gotcha — the elevation scale is inverted relative to its name.** `--bg-elev` mixes 8% `canvasText`; `--bg-elev-2` mixes only 6%. So `--bg-elev-2` sits *closer* to the base canvas than `--bg-elev` does, despite the name implying a higher step. This has already caused one real bug: `.nav-buttons button:focus` sets `background: var(--bg-elev-2)`, which is the button's own resting background, so focused and unfocused nav buttons render identically (`src/styles.css:177-180`).

**Theme model.** `:root{color-scheme: light dark}` plus `[data-theme="light"]` / `[data-theme="dark"]` blocks that set nothing but `color-scheme` (`src/styles.css:52-57`). The toggle flips a system hint; the OS supplies the actual colors. Consequence: **no brand color can be introduced without replacing this system.** That is a §1 decision, not a §2 one.

**Hardcoded colors that escape the token system** (each will need a theme-aware replacement): `.field .error{color:#c23}` (`:996`) — ~3.0:1 on dark, fails AA; `.cart-badge{background:#e63946}` (`:248`) — ~4.17:1 at 12px bold, fails AA.

### Open questions
- Keep the system-color approach (genuinely novel, zero-maintenance, accessible by default) or replace it with a real palette? A brand identity requires replacing it.
- If replaced: does the palette need to work in both light and dark, or does the site commit to one?

---

## 3. Typography — current state

**There is no type system.** One `font-family` declaration exists in 1,688 lines (`src/styles.css:61`):

```css
font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif;
```

The only others are `font-family: inherit` (`:1246`) and a `system-ui ... !important` override (`:1312`). There is no type scale, no heading rules beyond a few page-specific overrides, and no display face. Every heading — collection titles, print names, the Relics essay itself — renders in the OS UI font at default weights.

**`index.html:17-18` preconnects to `fonts.googleapis.com` and never loads a font.** It is a vestige of an abandoned attempt. Either use it or remove it.

### Open questions
- One face or two (display/serif for headings + sans for body)?
- The Relics essay is long-form prose and deserves a real reading measure and rhythm. Does the type system serve the *essay* or the *catalog*? They want different things.

---

## 4. Layout & spacing — current state

- **Container:** `.container{width:min(100%,960px);padding:24px}` (`:79`); padding drops to `16px` at ≤480px (`:82-83`).
- **Hero:** `.hero{grid-template-columns:1fr 1fr}` (`:848`) — so the homepage carousel image occupies roughly 440px on a standard laptop.
- **Divergence already in the code:** `.collections-page{max-width:1200px}` (`:1343`) and `.collection-literature-section{max-width:1200px}` (`:1522`) were widened past the 960px shell, but Home was not. The most important "sell the work" moment is narrower than the interior pages.
- **No spacing scale.** Padding and gap values are ad hoc throughout.

**Breakpoints are unsystematized.** Five distinct values are in use with no rationale, and `768`/`769`/`720` coexist:

| Breakpoint | Usage |
|---|---|
| `max-width: 480px` | container padding, misc |
| `max-width: 720px` | the most common — most component reflow |
| `max-width: 768px` / `min-width: 769px` | a separate, overlapping set |
| `min-width: 960px` | one usage |

Any redesign should pick a scale and collapse these.

---

## 5. Shape & elevation — current state

No radius token exists; every value is hardcoded. Observed distribution:

| Radius | Occurrences |
|---|---|
| `10px` | 15 |
| `8px` | 13 |
| `999px` (pill) | 7 |
| `12px` | 4 |
| `50%` (circle) | 5 |
| `6px` | 4 |

`10px` and `8px` are used near-interchangeably with no evident rule. Elevation is carried by the `--bg-elev*` tokens plus ad hoc `box-shadow`; there is no elevation scale.

---

## 6. Motion — current state

Timings cluster at `.2s ease` for state changes, `.06s` for press, `.18s`–`.5s` for larger transitions. No motion tokens; all values are inline.

Seven keyframe animations exist:

| Keyframe | Line | Purpose |
|---|---|---|
| `routeIn` | `:127` | Route fade on navigation |
| `slideUpToast` / `slideDownToast` | `:401` / `:417` | Toast enter/exit |
| `iconOrbitOut` / `iconOrbitIn` | `:816` / `:817` | Theme-toggle icon arc |
| `progress` | `:871` | Carousel progress segment |
| `slideInFromBottom` | `:1148` | — |

**There is no `prefers-reduced-motion` support anywhere** — a grep of the full stylesheet returns zero matches. Both carousels (`Home.tsx` hero at 4s, `Collections.tsx` `RotatingThumbnail` at 2s) auto-advance; the Collections one has no pause mechanism at all, not even hover. Content that auto-updates with no way to stop it is a WCAG 2.2.2 Level A failure. **Any redesign must fix this rather than inherit it.**

---

## 7. Component patterns — current state

Inventory only; none of these are endorsed. See the audit findings in `CLAUDE.md` §Known gaps for what's broken.

| Component | File | Note |
|---|---|---|
| ProductCard | `src/components/ProductCard.tsx` | 180×220 cropped thumb + title + description + price + 2 buttons. Catalog-shaped. Used on Home, Shop, and CollectionDetail. |
| Dropdown | `src/components/Dropdown.tsx` | Size picker. Renders its `<ul role="listbox">` unconditionally; hidden via opacity only, so closed options stay in the tab order. |
| CartDrawer | `src/components/CartDrawer.tsx` | `role="dialog" aria-modal="true"` with no focus trap; stays tabbable when closed. |
| Hero carousel | `src/pages/Home.tsx` | Auto-advances 4s; pauses on hover only. Dots misuse `role="tablist"`/`role="tab"` without the ARIA keyboard pattern. |
| Film-roll | `src/pages/CollectionDetail.tsx` | |
| Crop guides | `src/pages/Product.tsx` | Shades the area cropped at the selected print size. Genuinely novel; worth keeping. |
| Theme toggle | `src/styles.css:809-817` | Orbiting icon animation. |

**`.shop-grid` (`CollectionDetail.tsx:82`) has no CSS rule anywhere in the repo.** The collection product grid silently falls back to unstyled block stacking. `Shop.tsx` uses the styled `.grid` instead.

---

# §8–§10 — LIVE

> The legacy inventory ends at §7. Everything from here applies to the rebuild.

## 8. Do / Don't — cross-cutting

Rules with evidence behind them, applying to **both halves**. §12.7 and §11.6 extend this per-half; they do not replace it.

| Do | Don't |
|---|---|
| Give the photograph the dominant share of any card or view | Let title, description, price, and two buttons out-mass the image (current `.product-card`) |
| Let the writing carry the voice — it already does | Use emoji as section headers or in UI copy (current `Contact.tsx`) |
| Gate every animation behind `prefers-reduced-motion` | Ship an auto-advancing carousel with no pause control |
| **Keep focus visible on every interactive element** | `outline: none` without a `:focus-visible` replacement (current `:1224-1248`) |
| Let people zoom a photograph on mobile | `user-scalable=no` on a site whose product is image detail (current `index.html:5`) |
| Verify a surface against the code before assuming it's built | Assume §11/§12 are built because they are written as settled fact |

**The focus row is load-bearing and is this document's alone.** §11 and §12 do not mention focus states, and neither prototype contains a single `:focus` rule (`grep -ci ':focus' design/*.dc.html` → 0, 0). It is the one accessibility rule the handoff dropped, and the current site already fails it. It does not get to fail twice. See §9 and §10.

---

## 9. Regressions the rebuild must not inherit

This section used to say "this document describes no target" and promised to track the spec-vs-`styles.css` gap once §1 landed. §1 has landed, and that job no longer makes sense: **the gap is total.** The stylesheet is deleted, not migrated. What is worth carrying across is the list of things the current site got wrong, so the new one does not reinvent them.

| Regression (current site) | Status in the target |
|---|---|
| Viewport blocks pinch-zoom (`index.html:5`) | **Fixed by spec** — §12.5-E/I requires pinch-zoom on the plate. |
| Home hero boxed to the 960px shell while collection pages run 1200px | **Fixed by spec** — §12.5-A is a full-bleed, full-height plate. |
| `.shop-grid` has no rule anywhere (`CollectionDetail.tsx:82`) | **Dies with the rewrite** — no equivalent silent-fallback class in §12. |
| Thumbnails byte-identical to the full prints (`CLAUDE.md` §Known gaps) | **Dies at ingest** — derivatives generated once on upload (`product.md §3`). |
| No `prefers-reduced-motion` anywhere | **Rule carried** — §11.5 and §12.6 both require it. Note the prototypes do **not** implement it (`grep -ci 'prefers-reduced-motion' design/*.dc.html` → 0, 0); the spec carries the rule, the mock does not. Do not read the prototype as evidence here. |
| Focus ring removed globally without replacement (`.icon-btn`, `.menu-toggle`, `.dropdown-option`, `.nav-buttons button`) | **NOT addressed.** §11 and §12 are silent on focus, and both prototypes contain zero `:focus` rules. §8's row is the only thing covering it. This is the handoff's one accessibility gap — see §10. |

---

## 10. Open questions

**All six of this section's original questions are answered** — aesthetic direction, portfolio-vs-store, the theme model, typography, and light/dark are recorded as decisions in §1 and specified in §11–§12; `product.md` exists, which answers the sixth. What remains is new, and all three came out of reading the handoff against the code.

1. **There is no way home.** The storefront nav is Prints / Collections / About / Contact / Cart — there is no Home item anywhere in the prototype (`grep -c '>Home<'` → 0) — and §12.2 binds the cloud mark to the theme (`title="Switch light / dark"`, `alt="Jon Hoffman — switch theme"`). So from any interior surface there is no route back to the landing page, and the one element every visitor would click for it does something else instead. The mark is not *dishonest* — its label says exactly what it does (`product.md §1`) — but the navigation has a hole. Three ways out: add an index/Home item to the nav; let the mark go home and move the toggle to its own control; or decide the landing plate is an entrance and not a destination, and say so. **Blocks §12.5's nav.**
2. **Focus states are unspecified.** §8 requires a visible focus indicator on every interactive element and the current site fails it. §11 and §12 never say what focus *looks like* in this ink-on-paper system, and neither prototype has a `:focus` rule. Needs a specified treatment — a hairline ink ring is the obvious candidate — before anyone builds a keyboard-reachable surface.
3. **The aura's future.** `averageColor()` lost its justification when §12.1 rejected borrowed colour, and is retained at ingest as **speculative** (§1, `product.md §3`). It is cheap at ingest and expensive to backfill, which is why it stays — but nothing reads it. Decide what it is for, or delete it before it becomes another `sendOrderNotification()`: written, never called, permanent.

`product.md §8` owns the questions that are about behaviour rather than appearance — per-photo pricing, `unlisted`, storefront freshness, and how the ordered crop reaches the lab.

---

# §11–§12 — THE TARGET

> The design, stated as settled fact. §11 is the admin, §12 is the storefront. The section numbering is the handoff's and is load-bearing — the two sections cross-reference each other (§12.8 ↔ §11.2) and `product.md` cites them. Read §12 first; §11 is its darkroom.
>
> **Annotated where the handoff was wrong.** Three corrections are marked inline as blockquotes: the size list (§12.5-D), the lab NOTES crop line (§11.4-E), and the aura's status (§11.4-C). Everything else is the handoff as written.

---

## 11. Admin (Studio Admin)

> **STATUS: Specified.** The admin's appearance and behaviour, as settled fact. Visual/motion companion to `product.md §2, §5, §6`. Source of truth for the pixels: `design/Jon Hoffman Admin.dc.html` (surfaces A–H, one canvas). Where this section and the prototype disagree, this section wins; where it is silent, the prototype does.

The admin is the site's second half (`product.md §2`): authenticated, stateful, utilitarian. It shares the storefront's visual language (§12 — black paper, warm-paper ink, hairline chrome, Playfair / IBM Plex Mono / Newsreader) but runs **denser** — it is a console, not a gallery. Its falsifiable test is `product.md §2`'s: **if it is slower than editing `products.ts` and checking Stripe by hand, it has failed.** Restraint still applies; reverence never did here.

### 11.1 Tokens

Dark is the only admin theme (the storefront's light/dark toggle does not travel here — the admin is a workspace, not a mood). All values are literal; there is no system-colour dependency (the deliberate break from the legacy §2).

| Token | Value | Role |
|---|---|---|
| `--paper` | `#0b0b0b` | Page / card ground |
| `--panel` | `#0e0e0e` | Sidebar, raised rows |
| `--panel2` | `#131313` | Code/export blocks, literature editor field |
| `--ink` | `#efeae0` | Primary text, primary-button ground |
| `--dim` | `rgba(239,234,224,.62)` | Secondary text, labels |
| `--faint` | `rgba(239,234,224,.42)` | Tertiary text, meta, placeholder |
| `--hair` | `rgba(239,234,224,.15)` | Standard 1px divider / input border |
| `--hairsoft` | `rgba(239,234,224,.08)` | Soft divider between list rows |
| `--btnbg` / `--btnink` | `#efeae0` / `#0b0b0b` | Primary button ground / label |

**Status colours** (muted, desaturated — they read as ink stains, not dashboard candy):

| Token | Value | Meaning |
|---|---|---|
| `--ok` | `#8fae8b` (sage) | `paid`, published/live, toggle-on, completed step |
| `--warn` | `#cf934f` (amber) | queue-count pill, attention-not-danger |
| `--alert` | `#c85b3d` (rust) | `amount_mismatch`, quarantine, underpaid |
| `--info` | `#8a9db0` (slate) | links to originals, secondary metadata links |

Status is **never** carried by colour alone — every state also has a text label (PAID, MISMATCH, Live, Unlisted) so it survives colour-blindness and greyscale. This is the `product.md §1` honest-function rule at the pixel level.

### 11.2 Type roles

Four faces, same as the storefront (§12.3), with fixed jobs:

- **Playfair Display** — page titles, photo/work names, order totals, customer name on the detail. The one "voice" face in an otherwise mono chrome.
- **IBM Plex Mono** — every label, nav item, badge, table header, metadata line, order id, and the **entire lab-export block**. Weights 400/500. This is the admin's default register.
- **Newsreader** — caption + description fields, and the **literature editor** (`product.md §5.3`). Prose only.
- **Hanken Grotesk** — body UI, form values, helper text, descriptions. The neutral.

Labels are `10px/500`, letter-spacing `.16–.24em`, `text-transform:uppercase`, colour `--dim`. Never set body copy below 12px.

### 11.3 The shell

Every desktop surface is a **242px fixed sidebar + fluid main**, inside a card (`border-radius:6px`, one soft drop shadow; interior elements are square).

- **Sidebar** (`--panel`, right `--hair` border, `padding:26px 18px 24px`): cloud mark + "Jon Hoffman / Studio Admin" lockup → hairline → nav → footer pinned bottom (`margin-top:auto`) with "View live site ↗" and the signed-in chip (32px circle avatar "JH").
- **Nav item**: `10px 13px`, radius 7px, mono 13px, a 5px leading dot (`--nb`, opacity .35 → 1 when active). Active = `background rgba(239,234,224,.09)`, ink text. Hover = `rgba(239,234,224,.05)`. The **Orders** item carries a right-aligned amber count pill (`--warn` ground, `#1a1200` text, 999px).
- **Main header band**: mono kicker (date/breadcrumb) over a Playfair H1 (`44px`), primary action button top-right.
- **Primary button**: `--btnbg` ground, `--btnink` text, mono 11px `.14em` uppercase, `14px 22px`, square. Hover drops opacity to .88; active nudges 1px down. Secondary button = same type, transparent ground, `1px --hair` border.

### 11.4 Surfaces

#### A · Dashboard
Header "Good evening, Jon." → row of **4 stat tiles** (`1px --hair`, `22px 20px`: mono uppercase label, Playfair 42px number, faint sub). The **Needs-attention** tile is bordered `--alert` on a `rgba(200,91,61,.06)` wash. Below, a 2-col split: left = **fulfillment queue** (oldest first) as compact rows each with a "Copy for lab" ghost button; the mismatch row sits on the alert wash with a pulsing MISMATCH chip. Right rail = **home focal point** card (cover image, gradient scrim, Playfair collection name, "Change what leads home →") + a 3-up **recent uploads** grid.

#### B · Photographs
Header + count + "＋ Post a photo". **Filter chips** row (All / Published / Unlisted / by-collection) — active chip inverts to ink ground. 4-col grid of work cards: 4:5 image; a top-left status badge (`rgba(11,11,11,.7)` ground, a coloured dot + "Live" `--ok` / "Unlisted" `--faint`, the unlisted image dimmed to `brightness(.7)`); Playfair title + mono price; a mono meta line (`collection · size range`).

#### C · Post a photo (ingest — `product.md §5.2`)
Two columns. **Left**: dashed dropzone holding the 4:5 preview with a "Replace ↺" chip; below it two info tiles — **Detected** (aspect, pixel dims, MB) and **Aura — computed** (three swatches; the stored `averageColor()` from `product.md §3`); then a mono note describing the ingest pass (original stored privately · derivatives generated once · aura written). **Right**: the form — **Title** (Playfair field), **Caption** (Newsreader, "short line on the card"), **Description** (Newsreader, "the print's page"), **Alt text** (Hanken, labelled in `--ok` "describes the image — accessibility"). These are the three distinct jobs from `product.md §5.2`'s open question, resolved as three fields plus alt. Then **Collection** + **Base price** selects, **Sizes offered** as priced chips (selected = ink ground), and two labelled **toggles**: "Offer a silver (B&W) variant" (on) and "Publish now" (off = unlisted). Footer: "Save & publish" / "Save as draft".

> **Correction — the aura is speculative, not a feature.** The handoff presents the "Aura — computed" tile as live, citing `product.md §3`. That justification died: §12.1 rejected borrowed colour, so **nothing on the storefront reads an aura.** It is retained at ingest because it is cheap with the file in hand and expensive to backfill — not because anything consumes it. Do not build a surface that implies otherwise. See §10 q3.

#### D · Orders (the work queue — `product.md §6.4`)
Playfair "Orders" → **tabs** (Queue · N / Needs attention · N / Shipped / All; active tab underlined ink) + search-by-id/email. A mono column-header row, then order rows on a `120px 1.4fr 130px 90px auto auto` grid: order id + date, customer (name, email, and a **"⧉ Name + address"** copy button that copies clean multi-line text), a **thumbnail group with a ⌄ caret**, Playfair total, PAID chip, and "Open →". **Rows expand on click** (caret rotates 180°) into a sub-grid listing each work: thumb · name (Playfair) · size · register (Colour / Silver B&W) · price. The **mismatch row** is quarantined: alert wash, 2px left `--alert` rule, "paid $X · expected $Y", pulsing MISMATCH chip, "Review" action — and a standalone alert banner sits under the table. It is **not** in the queue tab count.

#### E · Order detail + Nations Photo Lab export (`product.md §6.2`)
Breadcrumb → header: mono order id/date, Playfair customer name with a **"⧉ Copy name"** button, PAID · total chip. A two-cell **Ship-to / Contact** panel; the Ship-to cell has **Copy address** + **Copy name** buttons (real multi-line clipboard text). Then the line items (thumb · Playfair name · mono `size · register · finish · qty` · a `--info` "↓ original.tif" link — fulfillment pulls the **original**, per `product.md §3`/`§6.2`). Right column: the **lab export** — a `--panel2` `<pre>` in mono, **one line per print**, headed by a "Copy block" primary button; format below. Under it, the **fulfillment status rail**: Paid (done) → Submitted to lab → Shipped, forward-only, each advanced by an explicit button; "Mark shipped + tracking" reveals a tracking row. No timer ever advances it (`product.md §1, §6.1`).

**Lab export format (Nations Photo Lab):**

```
ORDER  JH-20260716-0042
DATE   2026-07-16
LAB    Nations Photo Lab

SHIP TO
  <name>
  <street>
  <city, ST ZIP>
  <country>
  <email>

PRINTS  (finish: Lustre · paper: Fuji Crystal Archive)
  1x  <Title>   <WxH>  <Colour|Silver B&W>   file: <slug>_orig.tif
  ...

NOTES
  Borderless. No auto-correct — files are print-ready.
```

Copyable as plain text (chosen format, `product.md §6.2`). `finish` is a settable field (default **Lustre**); the exporter substitutes it across every line.

> **Correction — a NOTES line was removed because it was false.** The handoff's NOTES carried a third line: `Match crop to 4:5 as delivered.` **Deleted.** Only `8x10` and `16x20` of the seven sizes in `ALL_SIZES` are 4:5 — `4x6` and `20x30` are 2:3, `12x16` is 3:4, and `5x7` and `11x14` are neither. Instructing a lab to match a 2:3 print to a 4:5 crop mis-prints five of seven sizes, and this is a sheet a human pastes into a real order form: the failure mode is a reprint, at cost, on Jon.
>
> **How the ordered crop reaches Nations is genuinely open** (`product.md §8`). The sheet links `<slug>_orig.tif` — the untouched original — which does not carry the ordered aspect, while the storefront's crop guide (§12.5-D) has already promised the customer a specific crop. Something has to reconcile those and nothing currently does. Until it is decided, the export **says nothing about crop rather than guessing** (`product.md §1`).

#### F · Collections (`product.md §5.3`)
Left = collection list (cover thumb, Playfair name, mono status; Relics carries a `--ok` "Featured" tag). Right = editor: title + "Featured on home" tag + Playfair "Save collection"; a 2-col body — **Works** (drag rows: ⠿ handle, thumb, Playfair name, cover ★ toggle in `--warn`; "＋ Add works" dashed) and **The literature** (a `--panel2` Newsreader editor with title, italic dek, essay body, and a word-count + B/i/quote/¶ toolbar). A mono note restates the §1 thesis: *this is where the voice lives; if it stops sounding like the essay, it's wrong.*

#### G · Home feature (`product.md §4` "grander home")
Left = radio list of collections (cover, name, count; selected = ink border + filled radio) → "Set as home focal point" + a note that publishing needs no redeploy (`product.md §8 q5`). Right = **live home-hero preview** that swaps image, collection name, title, and literature dek as the selection changes.

#### H · Mobile (`device: both` — "post from anywhere")
Three 376×812 phones: **Dashboard** (stat pair, queue, "＋ Post a photo" pinned), **Post a photo** (dropzone + Title/Caption/Alt + B&W/Publish toggles), **Order + lab export** (compact sheet + "Copy" + "Mark submitted to lab"). Phone-screen children are `flex-shrink:0` so 4:5 previews keep their height. Hit targets ≥44px.

### 11.5 Shape, elevation, motion

- **Radius:** 0 everywhere except the outer card (6px), pills (badge count, toggle track — 999px), and the avatar (50%). Sharp corners are the admin's tell vs the softer storefront cards.
- **Elevation:** exactly one soft shadow on the outer card. Interior depth is **hairlines + subtle bg tints** (`rgba(239,234,224,.02–.09)`), never nested shadows.
- **Motion:** state changes `.16–.2s`; button press `translateY(1px)`; caret rotate `.18s`; toggle knob `.2s`. The alert chip uses `softpulse` (2.2s ease-in-out, opacity .5↔1) — the **only** looping animation, reserved for a quarantined order. Everything else is discrete. Gate any motion behind `prefers-reduced-motion` (§8; the prototype does not — see §9).

### 11.6 Do / Don't (admin)

Extends §8; does not replace it.

| Do | Don't |
|---|---|
| Keep the mono register for all chrome; reserve Playfair for names/titles/totals | Introduce a UI sans for labels — mono *is* the label voice here |
| Pair every status colour with a text label | Signal `paid` vs `mismatch` by colour alone |
| Quarantine `amount_mismatch` out of the queue, visibly | Let an underpaid order sit silently in the fulfillment count |
| Advance fulfillment state only by explicit human action | Auto-advance status on a timer, or show tracking before shipped |
| Copy plain, paste-ready text (name, address, whole lab block) | Make Jon retype anything into the lab's site |
| Density: compact rows, hairline dividers, one shadow | Card-in-card shadow stacks or storefront-scale whitespace |
| Pull the **original** for fulfillment links | Link a derivative/thumbnail from the lab sheet |

### 11.7 Open items to resolve in build

- **Sizes — resolved 2026-07-16: all seven stay.** `ALL_SIZES` is unchanged (`4x6, 5x7, 8x10, 11x14, 12x16, 16x20, 20x30`) and `PRICE_BY_SIZE` is untouched. The handoff's "all 4:5" (§12.5-D) was loose wording, not a product decision.
- **The mock's "$150 base" is not fiction — it is a dead field, which is worse.** Surface C shows a "$150 base." That number is real: `src/data/products.ts` carries `price: 15000` on all 24 rows. It is also **dead** — `PricingContext` overrides it at runtime with `PRICE_BY_SIZE`, every `ProductCard` caller passes the re-priced product, and no customer has ever seen it. The real ladder is `$5.00 → $65.00`, keyed only by size (`netlify/functions/lib/pricing.js`). A field that nothing reads cannot be wrong loudly enough to get fixed, so it sat there until a designer copied it onto a mockup and it nearly became spec. **Money comes from the ported pure functions, never from the mock** (`product.md §1.5`), and `products.ts:price` does not survive the rebuild — `supabase/schema.sql` deliberately has no price column on `photos`.
- **Per-photo pricing** (`product.md §8 q3`): still open. Today price is keyed **only** by size; product identity does not affect it. If per-photo pricing lands, surface C's size chips become per-photo and `netlify/functions/lib/pricing.js` must move in lockstep — it is a hand-maintained mirror with no test enforcing it.
- **`unlisted`** (`product.md §8 q4`): surfaced as a real status in B/C; confirm it is a kept feature and not a leftover.
- **Storefront freshness** (`product.md §8 q5`): surface G's "publishes without redeploy" copy **assumes** on-demand revalidation. That is a promise printed in the UI — confirm it before shipping it, or the copy lies (`product.md §1`).
- **How the ordered crop reaches the lab**: open. See §11.4-E.
- **Nations' vocabulary**: confirm their exact surface/paper terms so the `finish` enum and the NOTES block match their real order form.
- **Focus states**: unspecified here and in §12. §8's rule applies regardless. See §10 q2.

---

## 12. Storefront (Jon Hoffman Photography)

> **STATUS: Specified.** The storefront's appearance and behaviour, as settled fact. Companion to `product.md §4`. Source of truth for the pixels: `design/Jon Hoffman Photography.dc.html` (surfaces A–I on one canvas). The direction was chosen from `design/Home Directions.dc.html` (three explorations, 1a Borrowed Light / 1b The Index / 1c Interruption) — **the built site is 1b, "The Index."** Where this section and the prototype disagree, this section wins.

The storefront is the site's first half (`product.md §2`): strangers, unauthenticated, image-heavy, fast. It resolves §1's open questions — **colour** → black-and-white with warm-paper ink (not borrowed colour, see 12.1); **type** → a four-face system; **grander home** → a full-height uncropped plate. The falsifiable test is unchanged from §1: **if the site's voice stops sounding like the Relics essay, the site is wrong.** Restraint is welcome; reverence is the failure mode. Not a museum.

### 12.1 The colour decision

§1 left colour open, leaning "borrowed colour." **The built direction chose restraint instead: strict black-and-white with warm-paper ink**, and lets the *photograph* carry all the colour on the page. The rationale is §1's own counterpoint — the site read flat for lack of type and rhythm, not lack of hue; fix those and monochrome chrome is enough. Colour still enters as an **event** at the image level (the Colour/Silver register toggle, 12.5-D), which is the duality thesis expressed once, quietly, and never captioned.

Behind the hero, colour does leak in — a heavily blurred, dimmed copy of the plate bleeds under the chrome (`bleedbright`/`bleedop` tokens). That is the only "borrowed colour" that survived, and it is felt, not seen. Note it is a blur of the **actual plate**, not a computed average — which is why it does not rescue `averageColor()` (§10 q3).

### 12.2 Theme model — both states are real

Light and dark are **both intended** (§1): neither is the "real" one. The **cloud mark is the toggle** — clicking it flips the theme and swaps the mark asset (`CloudLogoWhiteHalf.png` ⇄ `CloudLogoBlackHalf.png`). The whole palette is CSS custom properties set on `:root`; there is no system-colour dependency (the deliberate break from the legacy §2).

**Dark (default)**

| Token | Value |
|---|---|
| `--paper` | `#0b0b0b` |
| `--ink` | `#efeae0` |
| `--dim` | `rgba(239,234,224,.62)` |
| `--faint` | `rgba(239,234,224,.45)` |
| `--hair` | `rgba(239,234,224,.18)` |
| `--hairsoft` | `rgba(239,234,224,.1)` |
| `--btnbg` / `--btnink` | `#efeae0` / `#0b0b0b` |
| `--bleedbright` / `--bleedop` | `.72` / `.5` |
| `--shadow` | `rgba(0,0,0,.65)` |

**Light**

| Token | Value |
|---|---|
| `--paper` | `#f2efe8` (warm paper) |
| `--ink` | `#1c1a17` |
| `--dim` | `rgba(28,26,23,.66)` |
| `--faint` | `rgba(28,26,23,.42)` |
| `--hair` | `rgba(28,26,23,.18)` |
| `--hairsoft` | `rgba(28,26,23,.1)` |
| `--btnbg` / `--btnink` | `#1c1a17` / `#f2efe8` |
| `--bleedbright` / `--bleedop` | `1.02` / `.5` |
| `--shadow` | `rgba(255,255,255,.7)` |

The primary button always inverts against the paper (ink ground, paper text) in both themes.

**The mark is the toggle, and nothing is the home link — see §10 q1.** That is the one navigational hole in this spec.

### 12.3 Type roles

Four faces, fixed jobs (shared verbatim with the admin, §11.2):

- **Playfair Display** — work titles, collection names, prices as display, hero H1s, "Thank you." Big, high-contrast, the site's confident voice.
- **Newsreader** — all long-form prose: the hero pull-quote, the **Relics literature**, product descriptions, the confirmation note. Italic used for deks/asides. This is where the feeling lives (§1).
- **IBM Plex Mono** — the chrome: nav, kickers ("Featured work", "01 / 24"), metadata, size/price meta, order ids. Weights 400/500, letter-spacing `.14–.34em`, uppercase.
- **Hanken Grotesk** — neutral body/UI where neither serif fits.

Minimum: labels ~10–11px mono; body prose 15px+ Newsreader with a real reading measure (~640px for the essay).

### 12.4 Layout & rhythm

- **Full-bleed hero** — the "grander home" fix (§1). Answers the legacy site's ~440px boxed hero directly.

> **Corrected against the prototype.** The handoff said "the plate fills the viewport (1440×900 reference), uncropped." **Neither half is true**, and the difference decides the image pipeline. The hero is **two images**: a **bleed** (`1440×900`, `object-fit:cover`, `blur(90px) scale(1.12)`, `aria-hidden`) that does fill the viewport, and the **plate** itself (`820×900`, `position:absolute; top:0; right:0`, masked into the paper by `linear-gradient(90deg,transparent 0,#000 150px)`). So the plate is 820 wide, not 1440 — and `object-fit:cover` on an 820×900 box crops a 4:5 plate by roughly 12%, biased upward by `object-position:center 40%`. Grander, yes; uncropped, no.
>
> **Consequence: 820 CSS px is the largest a photograph is ever displayed on this site**, which sets the top of the derivative ladder at ~1640 (`product.md §3.2`) rather than the 3000+ that "full-bleed 1440" implies.
- **Catalog grids** — Shop is a 3-col 4:5 grid; collection "works" is a horizontal film-strip. Generous `36–44px` gaps.
- **Reading column** — the Relics essay is centered at ~640px with a Playfair drop-cap, an italic centered turn ("Oh. Right. Sentiment."), and a signature.
- **Chrome is quiet** — thin mono nav, hairline rules, price stated once and never shouted (§8: give the photograph the dominant share).

### 12.5 Surfaces

#### A · Home (desktop)
Full-height plate, **820×900, right-aligned**, `object-fit:cover` at `object-position:center 40%` (so it crops ~12% of a 4:5 plate — see the correction in 12.4), its left edge dissolved into the paper by a 150px gradient mask. Left rail: mono "Featured work · 01/24" over an **index list** of works (Playfair, active = ink, rest = dim, hover nudges right). Bottom-left: mono collection kicker → Newsreader pull-quote → primary "View this print →" + ghost "Enter the collection". Behind everything, the **blurred colour bleed** — the same plate at `1440×900`, `blur(90px)`, `scale(1.12)`, `aria-hidden`. The **cloud mark toggles light/dark**.

#### B · Prints (shop)
Header + Playfair "Prints" + mono count. A filter/sort rule (All / Landscape / Urban / Relics · Sort). 3-col grid of 4:5 plates; each: image (hover brightens), Playfair title + quiet price, mono index + size-range meta. **Title leads, price recedes** — this is the portfolio-that-sells decision (§1) made visible.

#### C · Collection — Relics
Centered masthead (mono "Collection No. 01 · Six photographs", Playfair 96px "Relics", Newsreader italic dek). Then the **literature** — the full essay at reading measure with drop-cap and signature (this is the emotional register, §1; `product.md §5.3` owns editing it). Then "The works" as a horizontal film-strip of 300px plates.

#### D · Product — a single print
Two columns. Left: 600×750 plate with **crop guides** — vertical rules + dimmed side panels showing exactly what the selected size cuts, captioned "Guides show the 8×10 crop." (Keep — genuinely novel, `product.md §4`.) Right: mono "No. 01 · Relics" → Playfair title → Newsreader line → **Size** chips (selected = ink ground) → **Register** toggle **Colour / Silver** (the duality at image level, §1) → price (Playfair) → "Add to cart" + "Save to collection".

> **Correction — the size chips are not "all 4:5."** The handoff described the chips as "all 4:5." They are the seven sizes in `ALL_SIZES`: `4x6, 5x7, 8x10, 11x14, 12x16, 16x20, 20x30`. **Only `8x10` and `16x20` are 4:5.** The other five are not — and that is exactly why the crop guide exists: it draws what a given size cuts from a 4:5 plate. If every size were 4:5 the guide would have nothing to draw, and the feature `product.md §4` calls "genuinely novel" would be dead chrome. Sizes and prices are unchanged (§11.7); the guide stays meaningful.

#### F · Cart — slide-in drawer
Dimmed, blurred page behind; 456px right drawer (`--paper`, left `--hair` border, one shadow). Header "Your selection · N works · Close ✕". Line items: 76px thumb, Playfair title + price, mono `size · register`, a bordered −/qty/+ stepper, "Remove". Footer: subtotal / shipping / Playfair total → primary "Review & checkout →" + "Tax calculated at payment."

#### G · Checkout — review & details
Two columns: left = Contact (email) + Ship-to form fields (rendered as filled cells in the mock); right = a bordered **order summary** (thumbs, sizes, subtotal/shipping/tax, Playfair total) → primary "Pay with Stripe →" + "Secure payment on Stripe's page · card never touches this site." Money path is `product.md §1.5` — **port pricing verbatim**; honour `product.md §1`: no claim of an email or a shipment the system has not performed.

#### H · Confirmation — the receipt
Centered: mono order id, Playfair 76px "Thank you.", Newsreader note (hand-made, ships 5–7 days, receipt from Stripe), "— Jon". Then a two-cell Shipping-to / works summary. **Only shows states that are true** (`product.md §1, §6`): no fake tracking, no "email sent" unless it was. The customer's only receipt is Stripe's (`CLAUDE.md` §Key constraints) — say that; do not imply otherwise.

#### E / I · Mobile
376×812 frames. **E**: Home (full-bleed plate, gradient, index dots, "View this print →") and Product (sticky header, 4:5 plate, size chips, price, Add to cart). **I**: cart, checkout, and confirmation — same catalog voice, one-thumb reach, Stripe handoff. Let people pinch-zoom the photograph (fixes the current `user-scalable=no`, §8). Hit targets ≥44px.

### 12.6 Shape, elevation, motion

- **Radius:** cards 5px; imagery and chips are square. Sharp, print-like.
- **Elevation:** one soft shadow per card/drawer; depth otherwise via hairlines + the blurred hero bleed. No shadow stacks.
- **Motion:** hovers `.18–.2s` (index-row slide, image brighten, nav ink); theme flip is instant (asset + tokens swap). Keep any auto-advancing carousel **pausable** and gate motion behind `prefers-reduced-motion` — the current site fails both (§8, §9).

### 12.7 Do / Don't (storefront)

Extends §8; does not replace it.

| Do | Don't |
|---|---|
| Give the photograph the dominant share of any view | Let title + price + buttons out-mass the image (the current `.product-card`) |
| Let the Relics essay carry the voice; keep chrome quiet | Engineer a mood at the door, or explain the duality |
| State price once, quietly, Playfair | Shout price or repeat it per element |
| Keep both light + dark first-class; toggle via the mark | Treat one theme as canonical and the other as a preference |
| Hand the viewer Colour **and** Silver, name neither correct | Caption the duality anywhere |
| Show only order/shipping states that are true | Fake tracking, or "email sent" the system didn't send |
| Let mobile pinch-zoom the print | `user-scalable=no` on an image-detail product |

### 12.8 Relationship to the admin (§11)

Same four faces, same warm-paper-on-black ink, same hairline discipline — the admin is this language **run denser and dark-only**. The storefront reads as a gallery; the admin reads as its darkroom. **A change to the shared type or colour tokens must move both.** The sharing is partial by design: the admin has no light theme (§11.1), so §12.2's light column has no admin counterpart.
