export function reconcile(
  amountTotalCents: number,
  order: { total_cents: number },
): { status: 'paid' | 'amount_mismatch'; amountPaidCents: number } {
  const status = amountTotalCents === order.total_cents ? 'paid' : 'amount_mismatch'
  return { status, amountPaidCents: amountTotalCents }
}
