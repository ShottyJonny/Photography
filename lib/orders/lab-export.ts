import { addressLines, type StoredAddress } from '@/lib/orders/address'

/**
 * The Nations Photo Lab export block (design.md §11.4-E, product.md §6.2).
 *
 * Nations offers no integration, so this is not an API payload — it is plain
 * text a human copies into their order form. That makes every line a claim Jon
 * acts on, and three of the handoff's lines were not true:
 *
 *   - `ORDER JH-20260716-0042` — there is no order-number column. The uuid is
 *     what reconciles against Stripe, so the uuid is what prints (slice 4b D14).
 *   - `file: <slug>_orig.tif` — originals are stored at `<slug>/<register>.<ext>`
 *     and checkout snapshots the resolved key per line into
 *     order_items.original_key. That snapshot prints verbatim; a reconstructed
 *     filename that looks right and is wrong costs a reprint, on Jon.
 *   - `Match crop to 4:5 as delivered.` — deleted upstream in §11.4-E's own
 *     correction: only 2 of the 7 sizes are 4:5.
 *
 * No signed URLs live in here (spec decision 4): the block gets pasted and may
 * sit for hours, and an expired link inside a document Jon trusts is worse than
 * no link at all.
 */

/** Nations' stock. One constant so a correction is one edit. */
export const PAPER = 'Fuji Crystal Archive'

/** schema.sql: `lab_finish text default 'Lustre'`. Free text until Nations'
 *  vocabulary is confirmed (product.md §6.2) — no invented enum. */
export const DEFAULT_FINISH = 'Lustre'

export interface ExportItem {
  title: string
  size: string
  register: 'colour' | 'silver'
  qty: number
  original_key: string | null
}

export interface ExportOrder {
  id: string
  created_at: string
  email: string
  address: StoredAddress | null
  items: ExportItem[]
  finish: string | null
}

// Zone-explicit, like lib/admin/dates.ts: an implicit zone puts the wrong day
// on the sheet for every order placed after 8pm Eastern. en-CA formats as
// YYYY-MM-DD, which is what §11.4-E's DATE line shows.
const exportDate = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/New_York',
})

function registerLabel(register: 'colour' | 'silver'): string {
  return register === 'silver' ? 'Silver B&W' : 'Colour'
}

function pad(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - value.length))
}

export function buildLabExport(order: ExportOrder): string {
  const finish = (order.finish ?? '').trim() || DEFAULT_FINISH
  const date = exportDate.format(new Date(order.created_at))

  const rows = order.items.map((item) => ({
    qty: `${item.qty}x`,
    title: item.title,
    size: item.size,
    register: registerLabel(item.register),
    file: item.original_key ?? '(not recorded)',
  }))

  // Widths from THIS order, so a two-line block is not padded to a fictional
  // maximum and a long title is never truncated to fit one.
  const w = {
    qty: Math.max(0, ...rows.map((r) => r.qty.length)),
    title: Math.max(0, ...rows.map((r) => r.title.length)),
    size: Math.max(0, ...rows.map((r) => r.size.length)),
    register: Math.max(0, ...rows.map((r) => r.register.length)),
  }

  const printLines = rows.map((r) =>
    `  ${pad(r.qty, w.qty)}  ${pad(r.title, w.title)}  ${pad(r.size, w.size)}  ${pad(r.register, w.register)}   file: ${r.file}`,
  )

  const shipTo = addressLines(order.address).map((line) => `  ${line}`)

  return [
    `ORDER  ${order.id}`,
    `DATE   ${date}`,
    'LAB    Nations Photo Lab',
    '',
    'SHIP TO',
    ...shipTo,
    `  ${order.email}`,
    '',
    `PRINTS  (finish: ${finish} · paper: ${PAPER})`,
    ...printLines,
    '',
    'NOTES',
    '  Borderless. No auto-correct — files are print-ready.',
  ]
    // The padding above right-pads the last column of a row whose file path is
    // shorter than the widest; nothing may leave trailing space in a document
    // that gets pasted into a form.
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
}
