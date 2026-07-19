import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { Plate } from '@/components/store/Plate'

const photoWithDims = {
  slug: 'test-photo',
  title: 'Display Title',
  alt_text: 'Descriptive alt text',
  width_px: 1200,
  height_px: 1500,
  aspect_ratio: 0.8,
}

const photoWithoutDims = {
  slug: 'test-photo',
  title: 'Display Title',
  alt_text: 'Descriptive alt text',
  width_px: null,
  height_px: null,
  aspect_ratio: 0.75,
}

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
})

describe('Plate', () => {
  it('uses alt_text for img alt, not title', () => {
    const { container } = render(
      <Plate photo={photoWithDims} sizes="(max-width: 768px) 100vw, 50vw" />,
    )
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img!.getAttribute('alt')).toBe('Descriptive alt text')
    expect(img!.getAttribute('alt')).not.toBe('Display Title')
  })

  it('renders AVIF and WebP sources with 1200w in srcSet', () => {
    const { container } = render(
      <Plate photo={photoWithDims} sizes="(max-width: 768px) 100vw, 50vw" />,
    )
    const avifSource = container.querySelector('source[type="image/avif"]')
    const webpSource = container.querySelector('source[type="image/webp"]')
    expect(avifSource).toBeTruthy()
    expect(webpSource).toBeTruthy()
    expect(avifSource!.getAttribute('srcSet')).toContain('1200w')
    expect(webpSource!.getAttribute('srcSet')).toContain('1200w')
  })

  it('defaults to lazy loading without fetchpriority', () => {
    const { container } = render(
      <Plate photo={photoWithDims} sizes="(max-width: 768px) 100vw, 50vw" />,
    )
    const img = container.querySelector('img')
    expect(img!.getAttribute('loading')).toBe('lazy')
    expect(img!.getAttribute('fetchpriority')).toBeNull()
  })

  it('uses eager loading and fetchpriority high when priority', () => {
    const { container } = render(
      <Plate photo={photoWithDims} sizes="(max-width: 768px) 100vw, 50vw" priority />,
    )
    const img = container.querySelector('img')
    expect(img!.getAttribute('loading')).toBe('eager')
    expect(img!.getAttribute('fetchpriority')).toBe('high')
  })

  it('omits width/height and uses aspect-ratio style when dims are null', () => {
    const { container } = render(
      <Plate photo={photoWithoutDims} sizes="(max-width: 768px) 100vw, 50vw" />,
    )
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('width')).toBeNull()
    expect(img.getAttribute('height')).toBeNull()
    expect(img.style.aspectRatio).toBeTruthy()
  })
})
