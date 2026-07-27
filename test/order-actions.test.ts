import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAdmin = vi.fn(async () => ({ id: 'admin' }))
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin: () => requireAdmin() }))

const db = {
  status: 'paid' as string | null,
  readError: null as unknown,
  updateError: null as unknown,
  updates: [] as Record<string, unknown>[],
}

function fake() {
  return {
    from() {
      const q = {
        select() { return q },
        eq() { return q },
        update(patch: Record<string, unknown>) {
          db.updates.push(patch)
          return { eq: async () => ({ error: db.updateError }) }
        },
        maybeSingle: async () => ({
          data: db.status === null ? null : { status: db.status },
          error: db.readError,
        }),
      }
      return q
    },
  }
}
vi.mock('@/lib/supabase/auth-server', () => ({ createAuthServerClient: async () => fake() }))

import {
  markSubmittedToLab, markShipped, acceptMismatch, markRefunded, markCancelled, setLabFinish,
} from '@/lib/admin/order-actions'

beforeEach(() => {
  vi.clearAllMocks()
  db.status = 'paid'
  db.readError = null
  db.updateError = null
  db.updates = []
})

describe('every action gates on requireAdmin', () => {
  it('calls it before touching the database', async () => {
    db.status = 'paid'
    await markSubmittedToLab({ id: 'o1' })
    expect(requireAdmin).toHaveBeenCalledOnce()

    for (const run of [
      () => markShipped({ id: 'o1', trackingNumber: '1Z999' }),
      () => acceptMismatch({ id: 'o1' }),
      () => markRefunded({ id: 'o1' }),
      () => markCancelled({ id: 'o1' }),
      () => setLabFinish({ id: 'o1', finish: 'Lustre' }),
    ]) {
      requireAdmin.mockClear()
      await run()
      expect(requireAdmin).toHaveBeenCalledOnce()
    }
  })
})

describe('markSubmittedToLab', () => {
  it('advances a paid order and stamps the time', async () => {
    db.status = 'paid'
    const result = await markSubmittedToLab({ id: 'o1' })
    expect(result).toEqual({ ok: true })
    expect(db.updates[0].status).toBe('submitted_to_lab')
    expect(typeof db.updates[0].submitted_to_lab_at).toBe('string')
  })

  it('refuses a quarantined order, and writes nothing', async () => {
    db.status = 'amount_mismatch'
    const result = await markSubmittedToLab({ id: 'o1' })
    expect(result.ok).toBe(false)
    expect(db.updates).toEqual([])
  })

  it('refuses an order already at the lab', async () => {
    db.status = 'submitted_to_lab'
    expect((await markSubmittedToLab({ id: 'o1' })).ok).toBe(false)
  })
})

describe('markShipped', () => {
  it('ships an order that is at the lab, with tracking', async () => {
    db.status = 'submitted_to_lab'
    const result = await markShipped({ id: 'o1', trackingNumber: ' 1Z999AA10123456784 ' })
    expect(result).toEqual({ ok: true })
    expect(db.updates[0]).toMatchObject({ status: 'shipped', tracking_number: '1Z999AA10123456784' })
    expect(typeof db.updates[0].shipped_at).toBe('string')
  })

  // §6.1: shipped is the only state that may display a tracking number, and it
  // is defined as "manually + tracking". A blank makes the state meaningless.
  it('refuses a blank tracking number without reading or writing anything', async () => {
    db.status = 'submitted_to_lab'
    expect((await markShipped({ id: 'o1', trackingNumber: '   ' })).ok).toBe(false)
    expect(db.updates).toEqual([])
  })

  it('refuses to skip the lab step', async () => {
    db.status = 'paid'
    const result = await markShipped({ id: 'o1', trackingNumber: '1Z999' })
    expect(result.ok).toBe(false)
    expect(db.updates).toEqual([])
  })
})

describe('acceptMismatch', () => {
  it('moves a quarantined order to paid', async () => {
    db.status = 'amount_mismatch'
    expect(await acceptMismatch({ id: 'o1' })).toEqual({ ok: true })
    expect(db.updates[0]).toEqual({ status: 'paid' })
  })

  it('refuses an order that is not quarantined', async () => {
    db.status = 'paid'
    expect((await acceptMismatch({ id: 'o1' })).ok).toBe(false)
    expect(db.updates).toEqual([])
  })
})

describe('markRefunded / markCancelled', () => {
  it('records a refund on a paid order', async () => {
    db.status = 'paid'
    expect(await markRefunded({ id: 'o1' })).toEqual({ ok: true })
    expect(db.updates[0]).toEqual({ status: 'refunded' })
  })

  it('records a refund on a shipped order', async () => {
    db.status = 'shipped'
    expect((await markRefunded({ id: 'o1' })).ok).toBe(true)
  })

  it('refuses to refund an unpaid order', async () => {
    db.status = 'pending'
    expect((await markRefunded({ id: 'o1' })).ok).toBe(false)
    expect(db.updates).toEqual([])
  })

  it('cancels a paid order', async () => {
    db.status = 'paid'
    expect(await markCancelled({ id: 'o1' })).toEqual({ ok: true })
    expect(db.updates[0]).toEqual({ status: 'cancelled' })
  })

  it('refuses to cancel a shipped order — the prints are gone; that is a refund', async () => {
    db.status = 'shipped'
    expect((await markCancelled({ id: 'o1' })).ok).toBe(false)
    expect(db.updates).toEqual([])
  })

  it('is idempotent-safe: refuses to re-cancel or re-refund', async () => {
    db.status = 'cancelled'
    expect((await markCancelled({ id: 'o1' })).ok).toBe(false)
    db.status = 'refunded'
    expect((await markRefunded({ id: 'o1' })).ok).toBe(false)
  })
})

describe('setLabFinish', () => {
  it('trims and saves', async () => {
    expect(await setLabFinish({ id: 'o1', finish: '  Glossy ' })).toEqual({ ok: true })
    expect(db.updates[0]).toEqual({ lab_finish: 'Glossy' })
  })

  it('falls back to Lustre when blanked', async () => {
    await setLabFinish({ id: 'o1', finish: '   ' })
    expect(db.updates[0]).toEqual({ lab_finish: 'Lustre' })
  })

  it('surfaces a write failure', async () => {
    db.updateError = { message: 'boom' }
    expect((await setLabFinish({ id: 'o1', finish: 'Lustre' })).ok).toBe(false)
  })
})

describe('failure modes', () => {
  it('reports a missing order rather than writing blind', async () => {
    db.status = null
    const result = await markSubmittedToLab({ id: 'gone' })
    expect(result).toEqual({ ok: false, message: 'That order no longer exists.' })
    expect(db.updates).toEqual([])
  })

  it('reports a read failure', async () => {
    db.readError = { message: 'boom' }
    expect((await markSubmittedToLab({ id: 'o1' })).ok).toBe(false)
  })

  it('reports a write failure', async () => {
    db.status = 'paid'
    db.updateError = { message: 'boom' }
    expect((await markSubmittedToLab({ id: 'o1' })).ok).toBe(false)
  })
})
