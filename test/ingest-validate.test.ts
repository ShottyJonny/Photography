import { describe, it, expect } from 'vitest'
import {
  validateUpload,
  validateDimensions,
  extensionFor,
  MIN_WIDTH_PX,
  MAX_UPLOAD_BYTES,
  ALLOWED_MIME,
} from '@/lib/ingest/validate'

describe('validateUpload', () => {
  it('accepts every allowed image type', () => {
    for (const mime of ALLOWED_MIME) {
      expect(validateUpload({ mime, bytes: 1_000_000 }).ok).toBe(true)
    }
  })

  it('rejects a type sharp cannot read, naming what is accepted', () => {
    const result = validateUpload({ mime: 'application/pdf', bytes: 1000 })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/JPEG, PNG, TIFF or WebP/)
  })

  it('rejects an empty file', () => {
    expect(validateUpload({ mime: 'image/jpeg', bytes: 0 }).ok).toBe(false)
  })

  it('rejects a file over the bucket limit BEFORE it is uploaded', () => {
    const result = validateUpload({ mime: 'image/jpeg', bytes: MAX_UPLOAD_BYTES + 1 })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/too large/i)
  })

  it('accepts a file exactly at the limit', () => {
    expect(validateUpload({ mime: 'image/jpeg', bytes: MAX_UPLOAD_BYTES }).ok).toBe(true)
  })
})

describe('validateDimensions', () => {
  it('rejects anything narrower than the top of the ladder', () => {
    // Below 1800 the top rung would be an UPSCALE and the srcset `w` descriptor
    // would lie about what it serves.
    const result = validateDimensions(MIN_WIDTH_PX - 1)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/1800/)
  })

  it('accepts exactly the minimum', () => {
    expect(validateDimensions(MIN_WIDTH_PX).ok).toBe(true)
  })

  it('accepts a real print original', () => {
    expect(validateDimensions(6048).ok).toBe(true)
  })
})

describe('extensionFor', () => {
  it('maps every allowed mime to the extension the original is stored under', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg')
    expect(extensionFor('image/png')).toBe('png')
    expect(extensionFor('image/tiff')).toBe('tif')
    expect(extensionFor('image/webp')).toBe('webp')
  })

  it('falls back to bin for an unknown type rather than emitting an empty extension', () => {
    expect(extensionFor('application/octet-stream')).toBe('bin')
  })
})
