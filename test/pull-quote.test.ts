import { describe, it, expect } from 'vitest'
import { pullQuote } from '@/lib/collections/pull-quote'

describe('pullQuote', () => {
  it('prefers the dek when present', () => {
    expect(pullQuote('A one-line dek.', 'A long essay that should be ignored.')).toBe('A one-line dek.')
  })
  it('returns empty string when there is neither dek nor literature', () => {
    expect(pullQuote(null, null)).toBe('')
    expect(pullQuote(null, '   ')).toBe('')
  })
  it('falls back to the first sentence of the literature', () => {
    expect(pullQuote(null, 'First sentence. Second sentence.')).toBe('First sentence.')
  })
  it('truncates when the first sentence is longer than 200 chars', () => {
    const long = 'x'.repeat(250)               // no sentence punctuation
    const out = pullQuote(null, long)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBe(158)               // 157 chars + ellipsis
  })
  it('returns short unpunctuated literature as-is', () => {
    expect(pullQuote(null, 'no punctuation here')).toBe('no punctuation here')
  })
})
