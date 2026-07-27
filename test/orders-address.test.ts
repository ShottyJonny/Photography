import { describe, it, expect } from 'vitest'
import { addressLines, copyableAddress } from '@/lib/orders/address'

const FULL = {
  name: 'Jane Marsh',
  street: '1200 Vine Street',
  city: 'Cincinnati',
  region: 'OH',
  postal_code: '45202',
  country: 'US',
}

describe('addressLines', () => {
  it('renders a complete address, city line assembled', () => {
    expect(addressLines(FULL)).toEqual([
      'Jane Marsh',
      '1200 Vine Street',
      'Cincinnati, OH 45202',
      'US',
    ])
  })

  it('drops the region when absent, keeping the comma out', () => {
    expect(addressLines({ ...FULL, region: null })).toEqual([
      'Jane Marsh', '1200 Vine Street', 'Cincinnati 45202', 'US',
    ])
  })

  it('drops the postal code when absent', () => {
    expect(addressLines({ ...FULL, postal_code: null })).toEqual([
      'Jane Marsh', '1200 Vine Street', 'Cincinnati, OH', 'US',
    ])
  })

  it('omits the city line entirely when city, region and postal are all absent', () => {
    expect(addressLines({ name: 'Jane Marsh', street: '1200 Vine Street', country: 'US' })).toEqual([
      'Jane Marsh', '1200 Vine Street', 'US',
    ])
  })

  it('keeps a region+postal line when there is no city', () => {
    expect(addressLines({ region: 'OH', postal_code: '45202' })).toEqual(['OH 45202'])
  })

  it('handles a name-only address', () => {
    expect(addressLines({ name: 'Jane Marsh' })).toEqual(['Jane Marsh'])
  })

  // The column is jsonb. A partial or hand-made row must degrade, never print
  // the string "undefined" into a sheet a human pastes into a lab order form.
  it('never emits undefined, null or a blank line', () => {
    const lines = addressLines({ name: undefined, street: null, city: '', region: '   ', country: 'US' })
    expect(lines).toEqual(['US'])
    expect(lines.join('\n')).not.toMatch(/undefined|null/)
  })

  it('treats whitespace-only fields as absent and trims the rest', () => {
    expect(addressLines({ name: '  Jane Marsh  ', street: '   ', city: 'Cincinnati' }))
      .toEqual(['Jane Marsh', 'Cincinnati'])
  })

  it('returns [] for an empty object, null or undefined', () => {
    expect(addressLines({})).toEqual([])
    expect(addressLines(null)).toEqual([])
    expect(addressLines(undefined)).toEqual([])
  })
})

describe('copyableAddress', () => {
  it('joins the same lines with newlines', () => {
    expect(copyableAddress(FULL)).toBe('Jane Marsh\n1200 Vine Street\nCincinnati, OH 45202\nUS')
    expect(copyableAddress(FULL)).toBe(addressLines(FULL).join('\n'))
  })

  it('is an empty string when there is nothing to copy', () => {
    expect(copyableAddress(null)).toBe('')
  })
})
