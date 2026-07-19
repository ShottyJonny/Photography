export const DERIVATIVE_WIDTHS = [160, 400, 600, 960, 1200, 1800] as const

function base(): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/derivatives`
}

export function derivativeSrc(
  slug: string,
  register: 'colour' | 'silver',
  width: number,
  ext: 'avif' | 'webp' = 'avif',
): string {
  return `${base()}/${slug}/${register}/${width}.${ext}`
}

export function derivativeSrcSet(slug: string, register: 'colour' | 'silver', ext: 'avif' | 'webp'): string {
  return DERIVATIVE_WIDTHS.map((w) => `${derivativeSrc(slug, register, w, ext)} ${w}w`).join(', ')
}
