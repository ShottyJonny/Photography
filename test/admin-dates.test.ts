import { describe, it, expect } from 'vitest'
import { formatKicker, formatRowDate, greetingFor } from '@/lib/admin/dates'

// 2026-07-16T20:00:00Z === 16 Jul 2026, 4:00pm America/New_York (EDT)
const AFTERNOON = new Date('2026-07-16T20:00:00Z')
// 2026-07-17T01:30:00Z === 16 Jul 2026, 9:30pm America/New_York — but 17 Jul in UTC
const LATE_EVENING = new Date('2026-07-17T01:30:00Z')

describe('formatKicker', () => {
  it('renders the prototype format exactly', () => {
    expect(formatKicker(AFTERNOON)).toBe('Thursday · 16 July 2026')
  })

  // THE ONE THAT MATTERS. With a UTC default this renders "Friday · 17 July
  // 2026" — tomorrow's date, every evening after 8pm, and it looks fine.
  it('uses the project zone, not UTC, across the day boundary', () => {
    expect(formatKicker(LATE_EVENING)).toBe('Thursday · 16 July 2026')
  })
})

describe('formatRowDate', () => {
  it('renders the compact row format', () => {
    expect(formatRowDate(AFTERNOON)).toBe('16 Jul')
  })

  it('uses the project zone across the day boundary', () => {
    expect(formatRowDate(LATE_EVENING)).toBe('16 Jul')
  })
})

describe('greetingFor', () => {
  it('is computed, and covers all three branches at their boundaries', () => {
    // 11:59am, 12:00pm, 4:59pm, 5:00pm EDT
    expect(greetingFor(new Date('2026-07-16T15:59:00Z'))).toBe('Good morning, Jon.')
    expect(greetingFor(new Date('2026-07-16T16:00:00Z'))).toBe('Good afternoon, Jon.')
    expect(greetingFor(new Date('2026-07-16T20:59:00Z'))).toBe('Good afternoon, Jon.')
    expect(greetingFor(new Date('2026-07-16T21:00:00Z'))).toBe('Good evening, Jon.')
  })

  it('handles midnight, where hour12:false can report 24', () => {
    // 2026-07-16T04:30:00Z === 12:30am EDT
    expect(greetingFor(new Date('2026-07-16T04:30:00Z'))).toBe('Good morning, Jon.')
  })
})
