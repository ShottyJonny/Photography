<!--
Thanks for the change. Fill in each section — blank sections slow review down
more than a messy answer. If a section genuinely doesn't apply, write "N/A"
with one line on why.
-->

## What changed

<!-- Short description of the change, from the site visitor's or customer's perspective where possible. -->

## Why it changed

<!-- The motivation. Link to any doc, decision, or prior conversation that drove it. -->

## How it was tested

<!--
Describe how you verified this works. Examples:
- "npm run build passes locally, verified route in npm run preview"
- "Manual test against Stripe test mode: full checkout, webhook fired, order flipped to completed in Supabase"
- "node --check on the changed function; no automated test exists for this path"
Untested changes need an explicit "Not tested because…" line.
-->

## Screenshots (UI changes)

<!-- Before / after screenshots or a short screen recording for any UI change. N/A for non-UI changes. -->

## Linked issue or ticket

<!-- e.g. Closes #123, or "No ticket — portfolio site, self-directed" -->

## Checklist before merge

- [ ] CI is green on this PR
- [ ] Targeting `develop` (not `main`), unless this is a release PR or an approved hotfix — `main` deploys straight to production with Stripe in LIVE mode
- [ ] If this touches `netlify/functions/**` or any price/tax/shipping logic: confirmed `netlify/functions/lib/pricing.js` still mirrors `src/context/PricingContext.tsx` and `src/utils/taxShipping.ts`. These are hand-synced with no test enforcing it — a divergence means the customer sees one total and Stripe charges another.
- [ ] If this touches `netlify/functions/**` or routing/URL behavior: got an adversarial read, not just a green gate. No lint or typecheck job reaches `netlify/functions/`, and the hash router means a query string placed after `#` silently corrupts the route.
- [ ] Screenshots attached above for any UI change
- [ ] No stray build artifacts in this diff (`tsconfig.tsbuildinfo`, `tsconfig.node.tsbuildinfo`, `vite.config.js`, `vite.config.d.ts` — `npm run build` leaves these untracked but they are not gitignored)
