import { z } from 'zod'

export const checkoutSchema = z.object({
  items: z.array(z.object({
    photoId: z.string().uuid(),
    size: z.string(),
    register: z.enum(['colour', 'silver']),
    qty: z.number().int().positive().max(100),
  })).min(1),
  customer: z.object({
    email: z.string().email(),
    name: z.string().min(1).max(200),
  }),
  shippingAddress: z.object({
    name: z.string().min(1).max(200),
    street: z.string().min(1),
    city: z.string().min(1),
    region: z.string(),          // required for US enforced by computeOrderAmounts
    postalCode: z.string().min(1),
    country: z.string().length(2), // ISO-2
  }),
})

export type CheckoutRequest = z.infer<typeof checkoutSchema>

// Persisted shape is snake_case to match the rest of the model (schema.sql:164-166:
// "snake_case, everywhere, no exceptions"). Shared so the admin fulfillment slice reads
// the same keys. postalCode -> postal_code is the one that differs.
export interface StoredShippingAddress {
  name: string
  street: string
  city: string
  region: string
  postal_code: string
  country: string
}
export function toStoredShippingAddress(a: CheckoutRequest['shippingAddress']): StoredShippingAddress {
  return { name: a.name, street: a.street, city: a.city, region: a.region, postal_code: a.postalCode, country: a.country }
}
