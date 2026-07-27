import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAdmin = vi.fn(async () => ({ id: 'admin' }))
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin: () => requireAdmin() }))

type Canned = { many?: unknown; one?: unknown; error?: unknown }
const state: Record<string, Canned> = {}
const calls: { table: string; select?: string; in?: [string, unknown]; limit?: number; order?: [string, boolean] }[] = []
const signed = { url: 'https://signed.example/original', error: null as unknown, throws: false }
const signCalls: string[] = []

function fake() {
  return {
    from(table: string) {
      const record: (typeof calls)[number] = { table }
      calls.push(record)
      const q = {
        select(cols: string) { record.select = cols; return q },
        in(col: string, values: unknown) { record.in = [col, values]; return q },
        eq() { return q },
        order(col: string, opts: { ascending: boolean }) { record.order = [col, opts.ascending]; return q },
        limit(n: number) { record.limit = n; return q },
        maybeSingle: async () => ({ data: state[table]?.one ?? null, error: state[table]?.error ?? null }),
        then: (res: (v: { data: unknown; error: unknown }) => void) =>
          res({ data: state[table]?.many ?? [], error: state[table]?.error ?? null }),
      }
      return q
    },
    storage: {
      from() {
        return {
          createSignedUrl: async (key: string) => {
            signCalls.push(key)
            if (signed.throws) throw new Error('storage down')
            return { data: signed.error ? null : { signedUrl: `${signed.url}/${key}` }, error: signed.error }
          },
        }
      },
    },
  }
}
vi.mock('@/lib/supabase/auth-server', () => ({ createAuthServerClient: async () => fake() }))

import { listOrders, getOrderForFulfillment, LIST_CAP } from '@/lib/data/orders-admin'

const order = (id: string, status = 'paid', extra: Record<string, unknown> = {}) => ({
  id, status, created_at: '2026-07-16T14:30:00.000Z',
  customer_name: 'Jane Marsh', customer_email: 'jane@example.com',
  shipping_address: { name: 'Jane Marsh', city: 'Cincinnati', region: 'OH' },
  total_cents: 6500, amount_paid_cents: null, tracking_number: null,
  subtotal_cents: 5000, shipping_cents: 1000, tax_cents: 500,
  stripe_payment_intent_id: 'pi_123', submitted_to_lab_at: null, shipped_at: null,
  lab_finish: 'Lustre', notes: null, ...extra,
})

const item = (id: string, orderId: string, photos: unknown = { slug: 'deterioration' }) => ({
  id, order_id: orderId, title: 'Deterioration', size: '8x10', register: 'colour',
  qty: 2, unit_cents: 3250, original_key: 'deterioration/colour.jpg', photos,
})

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  signCalls.length = 0
  signed.error = null
  signed.throws = false
  for (const k in state) delete state[k]
})

describe('listOrders', () => {
  it('gates on requireAdmin', async () => {
    state.orders = { many: [] }
    await listOrders({ tab: 'queue', query: '' })
    expect(requireAdmin).toHaveBeenCalledOnce()
  })

  it('groups items onto their orders in one read, not N+1', async () => {
    state.orders = { many: [order('o1'), order('o2')] }
    state.order_items = { many: [item('i1', 'o1'), item('i2', 'o1'), item('i3', 'o2')] }

    const result = await listOrders({ tab: 'queue', query: '' })

    expect(result!.rows[0].items.map((i) => i.id)).toEqual(['i1', 'i2'])
    expect(result!.rows[1].items.map((i) => i.id)).toEqual(['i3'])
    expect(calls.filter((c) => c.table === 'order_items')).toHaveLength(1)
  })

  it('passes the tab statuses to the query and sorts oldest-first for the queue', async () => {
    state.orders = { many: [order('o1')] }
    await listOrders({ tab: 'queue', query: '' })
    const listCall = calls.filter((c) => c.table === 'orders').at(-1)!
    expect(listCall.in).toEqual(['status', ['paid']])
    expect(listCall.order).toEqual(['created_at', true])
  })

  it('applies no status filter on All, newest first', async () => {
    state.orders = { many: [order('o1')] }
    await listOrders({ tab: 'all', query: '' })
    const listCall = calls.filter((c) => c.table === 'orders').at(-1)!
    expect(listCall.in).toBeUndefined()
    expect(listCall.order).toEqual(['created_at', false])
  })

  it('counts every tab from the status read, not from the page', async () => {
    // The count read returns the whole table; the row read returns one tab.
    state.orders = { many: [order('o1', 'paid'), order('o2', 'amount_mismatch'), order('o3', 'shipped')] }
    const result = await listOrders({ tab: 'queue', query: '' })
    expect(result!.counts).toEqual({ queue: 1, lab: 0, attention: 1, shipped: 1, all: 3 })
  })

  it('reports a deleted photo as a null slug rather than dropping the item', async () => {
    state.orders = { many: [order('o1')] }
    state.order_items = { many: [item('i1', 'o1', null)] }
    const result = await listOrders({ tab: 'queue', query: '' })
    expect(result!.rows[0].items[0].photoSlug).toBeNull()
    expect(result!.rows[0].items[0].title).toBe('Deterioration')
  })

  it('reads an embedded relation whether PostgREST returns an object or an array', async () => {
    state.orders = { many: [order('o1')] }
    state.order_items = { many: [item('i1', 'o1', [{ slug: 'relic' }])] }
    const result = await listOrders({ tab: 'queue', query: '' })
    expect(result!.rows[0].items[0].photoSlug).toBe('relic')
  })

  it('flags truncation at the cap and asks for one row past it', async () => {
    state.orders = { many: Array.from({ length: LIST_CAP + 1 }, (_, i) => order(`o${i}`)) }
    const result = await listOrders({ tab: 'queue', query: '' })
    expect(result!.truncated).toBe(true)
    expect(result!.rows).toHaveLength(LIST_CAP)
    expect(calls.filter((c) => c.table === 'orders').at(-1)!.limit).toBe(LIST_CAP + 1)
  })

  it('does not flag truncation below the cap', async () => {
    state.orders = { many: [order('o1')] }
    expect((await listOrders({ tab: 'queue', query: '' }))!.truncated).toBe(false)
  })

  it('filters by the search query', async () => {
    state.orders = { many: [order('8f14e45f-aaaa'), order('1a2b3c4d-bbbb', 'paid', { customer_email: 'sam@elsewhere.org', customer_name: 'Sam' })] }
    const result = await listOrders({ tab: 'queue', query: 'sam@' })
    expect(result!.rows.map((r) => r.id)).toEqual(['1a2b3c4d-bbbb'])
  })

  // 4b D7: "no orders" and "couldn't read the orders" are different claims.
  it('returns null when the read fails', async () => {
    state.orders = { error: { message: 'boom' } }
    expect(await listOrders({ tab: 'queue', query: '' })).toBeNull()
  })

  it('returns null when the items read fails', async () => {
    state.orders = { many: [order('o1')] }
    state.order_items = { error: { message: 'boom' } }
    expect(await listOrders({ tab: 'queue', query: '' })).toBeNull()
  })
})

describe('getOrderForFulfillment', () => {
  it('gates on requireAdmin and returns the detail columns', async () => {
    state.orders = { one: order('o1') }
    state.order_items = { many: [item('i1', 'o1')] }
    const detail = await getOrderForFulfillment('o1')
    expect(requireAdmin).toHaveBeenCalledOnce()
    expect(detail!.stripe_payment_intent_id).toBe('pi_123')
    expect(detail!.lab_finish).toBe('Lustre')
    expect(detail!.subtotal_cents).toBe(5000)
    expect(detail!.items).toHaveLength(1)
  })

  it('signs each original and maps it by item id', async () => {
    state.orders = { one: order('o1') }
    state.order_items = { many: [item('i1', 'o1')] }
    const detail = await getOrderForFulfillment('o1')
    expect(signCalls).toEqual(['deterioration/colour.jpg'])
    expect(detail!.signedOriginals.i1).toBe('https://signed.example/original/deterioration/colour.jpg')
  })

  it('maps a null when the key was never snapshotted, and does not call storage', async () => {
    state.orders = { one: order('o1') }
    state.order_items = { many: [{ ...item('i1', 'o1'), original_key: null }] }
    const detail = await getOrderForFulfillment('o1')
    expect(detail!.signedOriginals.i1).toBeNull()
    expect(signCalls).toEqual([])
  })

  it('maps a null when signing errors, without failing the page', async () => {
    signed.error = { message: 'nope' }
    state.orders = { one: order('o1') }
    state.order_items = { many: [item('i1', 'o1')] }
    const detail = await getOrderForFulfillment('o1')
    expect(detail!.signedOriginals.i1).toBeNull()
    expect(detail!.items).toHaveLength(1)
  })

  it('survives storage throwing outright', async () => {
    signed.throws = true
    state.orders = { one: order('o1') }
    state.order_items = { many: [item('i1', 'o1')] }
    const detail = await getOrderForFulfillment('o1')
    expect(detail!.signedOriginals.i1).toBeNull()
  })

  it('returns null for an unknown id', async () => {
    state.orders = { one: null }
    expect(await getOrderForFulfillment('nope')).toBeNull()
  })

  it('returns null when the read fails', async () => {
    state.orders = { error: { message: 'boom' } }
    expect(await getOrderForFulfillment('o1')).toBeNull()
  })
})
