import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ProductInteractive } from '@/components/product/ProductInteractive'
import { getCollectionBySlug } from '@/lib/data/collections'
import { getPhotoBySlug } from '@/lib/data/photos'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const photo = await getPhotoBySlug(slug)
  return {
    title: photo
      ? `${photo.title} — Jon Hoffman Photography`
      : 'Print — Jon Hoffman Photography',
  }
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const photo = await getPhotoBySlug(slug)
  if (!photo) notFound()

  const cRaw = sp.c
  const c = Array.isArray(cRaw) ? cRaw[0] : cRaw

  let kicker: string | null = null
  if (c) {
    const detail = await getCollectionBySlug(c)
    const idx = detail?.photos.findIndex((p) => p.slug === slug) ?? -1
    if (detail && idx >= 0) {
      kicker = `No. ${String(idx + 1).padStart(2, '0')} · ${detail.name}`
    }
  }

  return (
    <main className="product-page">
      <header className="product-header">
        {kicker ? <p className="product-kicker">{kicker}</p> : null}
        <h1 className="product-title">{photo.title}</h1>
        {photo.caption ? <p className="product-caption">{photo.caption}</p> : null}
        {photo.description ? (
          <p className="product-description">{photo.description}</p>
        ) : null}
      </header>

      <ProductInteractive photo={photo} />

      <style>{`
        .product-page {
          max-width: 720px;
          margin: 0 auto;
          padding: 2.5rem 1.5rem 3rem;
          color: var(--ink);
        }

        .product-header {
          margin-bottom: 2rem;
        }

        .product-kicker {
          margin: 0 0 0.75rem;
          font-family: var(--font-mono);
          font-size: 0.625rem;
          font-weight: 500;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: var(--dim);
        }

        .product-title {
          margin: 0 0 0.875rem;
          font-family: var(--font-playfair);
          font-size: clamp(2rem, 5vw, 2.75rem);
          font-weight: 400;
          line-height: 1.15;
        }

        .product-caption {
          margin: 0 0 1rem;
          font-family: var(--font-newsreader);
          font-size: 1.125rem;
          line-height: 1.5;
          color: var(--dim);
        }

        .product-description {
          margin: 0;
          font-family: var(--font-newsreader);
          font-size: 1.0625rem;
          line-height: 1.6;
          color: var(--ink);
        }
      `}</style>
    </main>
  )
}
