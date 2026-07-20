import { describe, it, expect } from 'vitest'
import { deriveSlug } from '@/lib/ingest/slug'

describe('deriveSlug', () => {
  it('lowercases and hyphenates a normal title', () => {
    expect(deriveSlug('If Gold Could Rust')).toBe('if-gold-could-rust')
  })

  it('strips diacritics rather than dropping the letter', () => {
    expect(deriveSlug('Café Solitude')).toBe('cafe-solitude')
    expect(deriveSlug('Æther Naïve')).toBe('aether-naive')
  })

  it('collapses runs of separators', () => {
    expect(deriveSlug('Evil   Lies')).toBe('evil-lies')
    expect(deriveSlug('Fly-by  —  Night')).toBe('fly-by-night')
  })

  it('drops punctuation entirely', () => {
    expect(deriveSlug("Don't Look Back!")).toBe('dont-look-back')
    expect(deriveSlug('20x30 (Portrait)')).toBe('20x30-portrait')
  })

  it('trims leading and trailing separators', () => {
    expect(deriveSlug('  --Gathering--  ')).toBe('gathering')
  })

  it('returns an empty string when nothing survives', () => {
    // The caller must treat '' as invalid; it must never become a storage path.
    expect(deriveSlug('!!!')).toBe('')
    expect(deriveSlug('   ')).toBe('')
    expect(deriveSlug('')).toBe('')
  })

  it('never emits a path separator, dot segment, or space', () => {
    // A slug becomes a storage path. These are the characters that would let a
    // title escape its own prefix.
    for (const evil of ['../../etc/passwd', 'a/b/c', 'a\\b', '...', 'a.b']) {
      const s = deriveSlug(evil)
      expect(s).not.toMatch(/[/\\.\s]/)
    }
  })

  it('is idempotent — slugifying a slug returns it unchanged', () => {
    expect(deriveSlug('if-gold-could-rust')).toBe('if-gold-could-rust')
  })
})
