import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
const flat = css.replace(/\s+/g, ' ')

function rule(selector: string): string {
  const i = css.indexOf(selector + ' {')
  if (i === -1) throw new Error(`missing rule: ${selector}`)
  return css.slice(i, css.indexOf('}', i))
}

describe('the admin component classes', () => {
  it('defines every class the shell and dashboard render', () => {
    for (const cls of [
      '.admin-card', '.admin-sidebar', '.admin-main', '.admin-navitem', '.admin-nb',
      '.admin-marked', '.admin-mark', '.admin-tile', '.admin-tile-label',
      '.admin-tile-number', '.admin-tile-sub', '.admin-queue-row', '.admin-paid',
      '.admin-mismatch', '.admin-ghost', '.admin-chip-avatar',
    ]) {
      expect(css, `${cls} missing`).toContain(cls)
    }
  })

  it('pins the sidebar to 242px (design.md §11.3)', () => {
    expect(rule('.admin-sidebar')).toMatch(/width:\s*242px/)
  })

  it('gives the card exactly one shadow and a 6px radius (§11.5)', () => {
    const card = rule('.admin-card')
    expect(card).toMatch(/border-radius:\s*6px/)
    expect(card.match(/box-shadow/g)?.length).toBe(1)
  })

  it('uses --hairform for control boundaries, not --hair (D11, SC 1.4.11)', () => {
    expect(rule('.admin-ghost')).toContain('--hairform')
  })

  // D12 — the prototype animates opacity .5<->1, which puts --alert text at
  // 1.99:1 at the trough. The pulse must move the GROUND, not the text.
  it('defines softpulse without animating text opacity', () => {
    const start = css.indexOf('@keyframes softpulse')
    expect(start, '@keyframes softpulse missing').toBeGreaterThan(-1)
    // The block's closing brace is the first one at column 0 after the start.
    const frames = css.slice(start, css.indexOf('\n}', start) + 2)
    expect(frames, 'softpulse must not animate opacity').not.toMatch(/opacity\s*:/)
    expect(frames).toMatch(/background/)
  })

  it('renders mismatch chip text in --ink, never in --alert (D12)', () => {
    expect(rule('.admin-mismatch')).toMatch(/color:\s*var\(--ink\)/)
  })

  // The marker carries the honest-function payload, so it has to be legible
  // on EVERY ground it renders on — not just --paper. It shipped at 1.00:1 on
  // the primary button, which is where the eye goes first.
  it('gives the marker a ground-appropriate ink on the primary button', () => {
    expect(css).toContain('.admin-btn .admin-mark')
    expect(rule('.admin-btn .admin-mark')).toMatch(/color:\s*rgba\(11,\s*11,\s*11/)
  })

  // Group opacity multiplies through to the marker AND the border, taking
  // --faint to 2.92:1 and --hairform to 2.10:1 — silently reverting D10/D11.
  it('never dims marked controls with group opacity', () => {
    expect(rule("button.admin-marked, .admin-btn[aria-disabled='true'], .admin-ghost[aria-disabled='true']"))
      .not.toMatch(/opacity\s*:/)
  })

  it('suppresses the press animation on inert controls', () => {
    expect(css).toMatch(/\[aria-disabled='true'\]:active[^{]*\{[^}]*transform:\s*none/)
  })

  it('keeps the marked-control marker in the text flow, not a tooltip', () => {
    expect(rule('.admin-mark')).not.toMatch(/content:/)
  })

  it('stacks the shell below 900px (D9)', () => {
    expect(flat).toMatch(/@media \(max-width: 900px\)/)
  })
})
