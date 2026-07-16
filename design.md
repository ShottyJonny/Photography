# design.md

> **STATUS: Groundwork.** [§1](#1-aesthetic-direction) records the site's **posture** — decided 2026-07-16. **Colour, typography, and the portfolio-vs-store question are still open** and are listed in §1 "Still open" and §10. Everything below §1 is an honest inventory of what `src/styles.css` contains *today*, recorded so a redesign starts from a known baseline instead of a blank page. **The current state is documented, not endorsed** — most of it is expected to be replaced.

Companion to `CLAUDE.md`. `design.md` = how it looks and moves. `CLAUDE.md` = how to work in the repo. Questions about *appearance* land here; questions about *commands, constraints, or the money path* land there.

Measured against `src/styles.css` (1,688 lines, single stylesheet) on 2026-07-16.

---

## 1. Aesthetic direction

Posture decided 2026-07-16. Colour, type, and IA still open — see "Still open" below.

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

### Home must be grander

The landing page is currently the weakest expression of the work on the site. `.hero` splits the 960px shell 1fr/1fr (`src/styles.css:848`, §4), so the photograph lands at roughly 440px — *narrower than the interior collection pages*, which were widened to 1200px. The most important "sell the work" moment is the smallest. This needs the most ambition of any surface.

### Still open

- **Colour.** The identity has always been black and white; the concern is that it leaves little room. **Not resolved.** Options raised, in rough order of preference:
  1. **Borrowed colour** — chrome stays achromatic; every surface takes its hue from the photograph on it. `src/utils/color.ts` `averageColor()` already does this and `Product.tsx` already computes an "aura." The site owns no palette; it wears the work's. Deferential rather than reverent, which is a direct answer to the museum problem, and it invents no arbitrary brand hue.
  2. **Temperature, not hue** — warm paper vs cold slate. Reads black-and-white, still carries duality.
  3. **Colour as an event** — achromatic at rest; colour exists only *during* transitions. The interesting part of a duality was never the poles.
  4. **A rust accent** from *If Gold Could Rust* — oxidation as something precious decaying is the Relics thesis in one word. Flagged: the Concierge project already owns gold; this risks self-repetition across the portfolio.

  **Counterpoint worth keeping:** black and white is probably not the real constraint. This site reads flat because it has no typography and no spacing rhythm (§3, §4), not because it lacks hue. Fix those first, then re-ask — otherwise the likely outcome is a coloured site that still feels flat.

- **Portfolio-that-sells vs store-that-showcases.** Unanswered. The code answers "store" (price + two buttons on every card); the writing answers "gallery." "Grander home" means different things depending on this.

- **Typography.** Nothing decided. See §3. Likely the highest-leverage open question, per the counterpoint above.

---

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

## 8. Do / Don't — seeded

Only rules with evidence behind them. Extend as §1 gets decided.

| Do | Don't |
|---|---|
| Give the photograph the dominant share of any card or view | Let title, description, price, and two buttons out-mass the image (current `.product-card`) |
| Let the writing carry the voice — it already does | Use emoji as section headers or in UI copy (current `Contact.tsx`) |
| Gate every animation behind `prefers-reduced-motion` | Ship an auto-advancing carousel with no pause control |
| Keep focus visible on every interactive element | `outline: none` without a `:focus-visible` replacement (current `:1224-1248`) |
| Let people zoom a photograph on mobile | `user-scalable=no` on a site whose product is image detail (current `index.html:5`) |
| Verify a surface against the code before assuming it's built | Trust this document's current-state inventory after §1 lands |

---

## 9. Implementation status

This document currently describes **no target**. Once §1 is decided, this section tracks the gap between the spec and `src/styles.css`, in the house convention: state the target as settled fact, annotate the divergence with a file:line.

Present divergences worth carrying forward regardless of direction:

- Viewport blocks pinch-zoom (`index.html:5`).
- `.shop-grid` has no rule (`CollectionDetail.tsx:82`).
- Home hero is boxed to the 960px shell while collection pages were widened to 1200px.
- No `prefers-reduced-motion` anywhere.
- Focus ring removed globally without replacement for `.icon-btn`, `.menu-toggle`, `.dropdown-option`, and `.nav-buttons button`.
- Thumbnails are byte-identical to the full prints (see `CLAUDE.md` §Known gaps) — this constrains any image-forward design until fixed.

---

## 10. Open questions

1. §1 aesthetic direction — blocks everything.
2. Portfolio-that-sells vs store-that-showcases.
3. Keep the system-color theme model, or replace it with a real palette?
4. One font or two, and does the type system serve the essay or the catalog?
5. Does the light/dark toggle survive the redesign?
6. Is there a `product.md` in this repo's future (the Ledger/Concierge convention splits *what it does* from *how it looks*), or does this project stay small enough that design.md carries both?
