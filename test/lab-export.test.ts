import { describe, it, expect } from 'vitest'
import { buildLabExport, PAPER, type ExportOrder } from '@/lib/orders/lab-export'

const ORDER: ExportOrder = {
  id: '8f14e45f-ceea-467a-9b3a-2c4f7a5d1e02',
  created_at: '2026-07-16T14:30:00.000Z',
  email: 'jane@example.com',
  finish: 'Lustre',
  address: {
    name: 'Jane Marsh',
    street: '1200 Vine Street',
    city: 'Cincinnati',
    region: 'OH',
    postal_code: '45202',
    country: 'US',
  },
  items: [
    { title: 'Deterioration', size: '8x10', register: 'colour', qty: 2, original_key: 'deterioration/colour.jpg' },
    { title: 'Omniprominence', size: '16x20', register: 'silver', qty: 1, original_key: 'omniprominence/silver.jpg' },
  ],
}

function lines(order: ExportOrder = ORDER): string[] {
  return buildLabExport(order).split('\n')
}

describe('buildLabExport — the header', () => {
  it('prints the full uuid, not a fabricated order number', () => {
    const block = buildLabExport(ORDER)
    expect(block).toContain('ORDER  8f14e45f-ceea-467a-9b3a-2c4f7a5d1e02')
    // design.md §11.4-E's JH-20260716-0042 is a design fiction (slice 4b D14).
    expect(block).not.toMatch(/JH-\d/)
  })

  it('names the lab', () => {
    expect(buildLabExport(ORDER)).toContain('LAB    Nations Photo Lab')
  })

  it('dates the order in New York, not the machine zone or UTC', () => {
    // 03:00Z on the 16th is 23:00 on the 15th in New York. A UTC or local
    // render would put the wrong day on a sheet used to place a real order.
    const late: ExportOrder = { ...ORDER, created_at: '2026-07-16T03:00:00.000Z' }
    expect(buildLabExport(late)).toContain('DATE   2026-07-15')
    expect(buildLabExport(ORDER)).toContain('DATE   2026-07-16')
  })
})

describe('buildLabExport — SHIP TO', () => {
  it('indents the address and appends the email', () => {
    const block = buildLabExport(ORDER)
    expect(block).toContain(
      'SHIP TO\n  Jane Marsh\n  1200 Vine Street\n  Cincinnati, OH 45202\n  US\n  jane@example.com',
    )
  })

  it('degrades on a partial address without printing undefined or a blank line', () => {
    const partial: ExportOrder = { ...ORDER, address: { name: 'Jane Marsh', country: 'US' } }
    const block = buildLabExport(partial)
    expect(block).toContain('SHIP TO\n  Jane Marsh\n  US\n  jane@example.com')
    expect(block).not.toMatch(/undefined|null/)
    expect(block).not.toMatch(/\n\s+\n/)
  })
})

describe('buildLabExport — PRINTS', () => {
  it('substitutes the finish and the paper into the header', () => {
    expect(buildLabExport(ORDER)).toContain(`PRINTS  (finish: Lustre · paper: ${PAPER})`)
    expect(buildLabExport({ ...ORDER, finish: 'Glossy' })).toContain('(finish: Glossy · paper:')
  })

  it('falls back to Lustre for a null or blank finish', () => {
    expect(buildLabExport({ ...ORDER, finish: null })).toContain('(finish: Lustre ·')
    expect(buildLabExport({ ...ORDER, finish: '   ' })).toContain('(finish: Lustre ·')
  })

  it('writes one line per item, with qty and the register vocabulary', () => {
    const printed = lines().filter((l) => l.includes('file:'))
    expect(printed).toHaveLength(2)
    expect(printed[0]).toMatch(/^ {2}2x {2}Deterioration/)
    expect(printed[0]).toContain('Colour')
    expect(printed[1]).toMatch(/^ {2}1x {2}Omniprominence/)
    expect(printed[1]).toContain('Silver B&W')
  })

  it('prints the snapshotted original_key verbatim, never a reconstructed filename', () => {
    const block = buildLabExport(ORDER)
    expect(block).toContain('file: deterioration/colour.jpg')
    expect(block).toContain('file: omniprominence/silver.jpg')
    // §11.4-E's `<slug>_orig.tif` names an object that does not exist.
    expect(block).not.toContain('_orig.tif')
  })

  it('says (not recorded) when the key was never snapshotted', () => {
    const order: ExportOrder = {
      ...ORDER,
      items: [{ title: 'Deterioration', size: '8x10', register: 'colour', qty: 1, original_key: null }],
    }
    expect(buildLabExport(order)).toContain('file: (not recorded)')
  })

  it('pads the columns so the file paths line up', () => {
    const printed = lines().filter((l) => l.includes('file:'))
    expect(printed[0].indexOf('file:')).toBe(printed[1].indexOf('file:'))
    expect(printed[0].indexOf('8x10')).toBe(printed[1].indexOf('16x20'))
  })

  it('keeps the header when an order somehow has no items', () => {
    const block = buildLabExport({ ...ORDER, items: [] })
    expect(block).toContain('PRINTS  (finish: Lustre')
    expect(block).not.toContain('file:')
    expect(block).toContain('NOTES')
  })
})

describe('buildLabExport — NOTES', () => {
  it('is exactly the two true lines', () => {
    expect(buildLabExport(ORDER)).toContain(
      'NOTES\n  Borderless. No auto-correct — files are print-ready.',
    )
  })

  // §11.4-E's correction: only 2 of the 7 sizes are 4:5, so instructing the lab
  // to match a 4:5 crop mis-prints five of them, at Jon's cost.
  it('carries no crop instruction', () => {
    expect(buildLabExport(ORDER)).not.toMatch(/crop|4:5/i)
  })
})

describe('buildLabExport — the block as a document', () => {
  it('has no trailing whitespace on any line', () => {
    for (const line of lines()) expect(line).toBe(line.replace(/\s+$/, ''))
  })

  it('ends without a trailing newline', () => {
    expect(buildLabExport(ORDER).endsWith('\n')).toBe(false)
  })

  it('carries no signed URL — the block outlives the signature', () => {
    expect(buildLabExport(ORDER)).not.toMatch(/https?:\/\//)
  })

  it('is plain text in the specified section order', () => {
    const block = buildLabExport(ORDER)
    expect(block.indexOf('ORDER')).toBeLessThan(block.indexOf('SHIP TO'))
    expect(block.indexOf('SHIP TO')).toBeLessThan(block.indexOf('PRINTS'))
    expect(block.indexOf('PRINTS')).toBeLessThan(block.indexOf('NOTES'))
  })
})
