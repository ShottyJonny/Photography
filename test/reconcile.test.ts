import { describe, it, expect } from 'vitest'
import { reconcile } from '@/lib/orders/reconcile'

describe('reconcile', () => {
  it('marks paid when amounts match', () => {
    expect(reconcile(4243, { total_cents: 4243 })).toEqual({ status: 'paid', amountPaidCents: 4243 })
  })
  it('marks amount_mismatch and records the amount actually paid when they differ', () => {
    expect(reconcile(550, { total_cents: 6500 })).toEqual({ status: 'amount_mismatch', amountPaidCents: 550 })
  })
})
