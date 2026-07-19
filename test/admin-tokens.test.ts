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
