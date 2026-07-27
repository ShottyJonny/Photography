/**
 * The shipping address, as it is actually stored.
 *
 * `orders.shipping_address` is jsonb, written by `toStoredShippingAddress`
 * (lib/checkout/schema.ts) at the /api/checkout boundary — snake_case, six
 * fields. Every field is optional HERE, not because checkout writes partials,
 * but because this module also renders rows nothing in this codebase wrote:
 * hand-made test rows, and whatever a future import brings. A missing field
 * must degrade to a shorter address, never to the string "undefined" on a
 * sheet a human pastes into a real lab order form.
 */
export interface StoredAddress {
  name?: string | null
  street?: string | null
  city?: string | null
  region?: string | null
  postal_code?: string | null
  country?: string | null
}

function present(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * The address as display lines, in postal order. Only lines with content are
 * returned, so `.join('\n')` is safe and `.map()` over it never renders a gap.
 */
export function addressLines(address: StoredAddress | null | undefined): string[] {
  if (!address) return []

  const name = present(address.name)
  const street = present(address.street)
  const city = present(address.city)
  const region = present(address.region)
  const postal = present(address.postal_code)
  const country = present(address.country)

  // "Cincinnati, OH 45202" — the comma belongs to the city, so it disappears
  // with the city rather than stranding ", OH 45202".
  const locality = [city, region].filter(Boolean).join(', ')
  const cityLine = [locality, postal].filter(Boolean).join(' ')

  return [name, street, cityLine === '' ? null : cityLine, country].filter(
    (line): line is string => line !== null,
  )
}

/** The clipboard form: the same lines, newline-joined. */
export function copyableAddress(address: StoredAddress | null | undefined): string {
  return addressLines(address).join('\n')
}
