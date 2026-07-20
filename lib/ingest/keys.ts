/**
 * Bucket-relative object paths.
 *
 * These deliberately do NOT include the bucket name. supabase.storage
 * .from('derivatives').upload(path) takes a bucket-relative path, and
 * lib/images/derivatives.ts already builds its public URL as
 * `.../object/public/derivatives` + `/${slug}/${register}/${width}.${ext}`.
 * product.md §3.2 writes them bucket-first as prose; the code splits them.
 * test/ingest-core.test.ts locks the two representations together.
 */
export const ORIGINALS_BUCKET = 'originals'
export const DERIVATIVES_BUCKET = 'derivatives'

export type Register = 'colour' | 'silver'
export type DerivativeFormat = 'avif' | 'webp'

export function originalKey(slug: string, register: Register, ext: string): string {
  const clean = ext.replace(/^\./, '').toLowerCase()
  return `${slug}/${register}.${clean}`
}

export function derivativeKey(
  slug: string,
  register: Register,
  width: number,
  format: DerivativeFormat,
): string {
  return `${slug}/${register}/${width}.${format}`
}
