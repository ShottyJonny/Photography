import { derivativeSrc, derivativeSrcSet } from '@/lib/images/derivatives'

export function Plate({
  photo,
  register = 'colour',
  sizes,
  priority = false,
  className,
}: {
  photo: {
    slug: string
    alt_text: string | null
    width_px: number | null
    height_px: number | null
    aspect_ratio: number | null
  }
  register?: 'colour' | 'silver'
  sizes: string
  priority?: boolean
  className?: string
}) {
  const hasDims = photo.width_px != null && photo.height_px != null
  const ar = photo.aspect_ratio ?? (hasDims ? photo.width_px! / photo.height_px! : 0.8)

  return (
    <picture>
      <source type="image/avif" srcSet={derivativeSrcSet(photo.slug, register, 'avif')} sizes={sizes} />
      <source type="image/webp" srcSet={derivativeSrcSet(photo.slug, register, 'webp')} sizes={sizes} />
      <img
        src={derivativeSrc(photo.slug, register, 1200, 'webp')}
        alt={photo.alt_text ?? ''}
        className={className}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        {...(priority ? { fetchPriority: 'high' as const } : {})}
        {...(hasDims
          ? { width: photo.width_px!, height: photo.height_px! }
          : { style: { aspectRatio: String(ar), width: '100%' } })}
      />
    </picture>
  )
}
