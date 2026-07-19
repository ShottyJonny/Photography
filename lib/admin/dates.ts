/**
 * Every formatter here carries an EXPLICIT locale and timeZone.
 *
 * An implicit zone makes the rendered string depend on whichever machine
 * happened to render it, and a UTC default shows tomorrow's date to an Eastern
 * reader every evening after 8pm. That is the "Invalid Date" defect class in a
 * form that is harder to notice, because it looks correct.
 *
 * These must only ever be called server-side: a client `new Date()` would
 * hydrate-mismatch against the server's render.
 */
const ZONE = 'America/New_York'
const LOCALE = 'en-GB' // day-before-month, matching the prototype

const kickerParts = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONE,
})

/** "Thursday · 16 July 2026" — the separator is composed, not a locale pattern. */
export function formatKicker(date: Date): string {
  const part: Record<string, string> = {}
  for (const p of kickerParts.formatToParts(date)) {
    if (p.type !== 'literal') part[p.type] = p.value
  }
  return `${part.weekday} · ${part.day} ${part.month} ${part.year}`
}

const rowDate = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric', month: 'short', timeZone: ZONE,
})

/** "16 Jul" — the compact form used in a queue row. */
export function formatRowDate(date: Date): string {
  return rowDate.format(date)
}

const zonedHour = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric', hour12: false, timeZone: ZONE,
})

/**
 * §11.4-A's copy is "Good evening, Jon." — rendered as a fact about the time
 * rather than a fixed string, because product.md §1 has no size qualifier for
 * a status that does not reflect reality.
 */
export function greetingFor(date: Date): string {
  // hour12:false reports midnight as 24 in some implementations.
  const hour = Number(zonedHour.format(date)) % 24
  if (hour < 12) return 'Good morning, Jon.'
  if (hour < 17) return 'Good afternoon, Jon.'
  return 'Good evening, Jon.'
}
