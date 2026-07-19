import Link from 'next/link'
import type { Metadata } from 'next'
import { Plate } from '@/components/store/Plate'
import { getCollectionBySlug } from '@/lib/data/collections'
import { getPublishedPhotos } from '@/lib/data/photos'
import { priceForSize } from '@/lib/format/price'
import { ALL_SIZES } from '@/lib/pricing'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Prints — Jon Hoffman Photography',
}

function formatPrice(c: number): string {
  return `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`
}

function sizeRangeLabel(): string {
  const fmt = (s: string) => s.replace('x', '×')
  return `${fmt(ALL_SIZES[0])} – ${fmt(ALL_SIZES[ALL_SIZES.length - 1])}`
}

const FROM_PRICE = `from ${formatPrice(priceForSize(ALL_SIZES[0]))}`
const SIZE_RANGE = sizeRangeLabel()

type GridPhoto = {
  slug: string
  title: string
  alt_text: string | null
  aspect_ratio: number | null
  width_px: number | null
  height_px: number | null
}

function PrintsShell({
  count,
  children,
}: {
  count?: number
  children: React.ReactNode
}) {
  return (
    <main className="prints">
      <header className="prints-head">
        <h1 className="prints-title">Prints</h1>
        {count != null ? (
          <p className="prints-count">
            {String(count).padStart(2, '0')} photographs
          </p>
        ) : null}
      </header>
      {children}
      <style>{`
        .prints {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2.5rem 1.5rem 3.5rem;
          color: var(--ink);
          background: var(--paper);
        }

        .prints-head {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.75rem 1.5rem;
          margin-bottom: 2.25rem;
          padding-bottom: 1.25rem;
          border-bottom: 1px solid var(--hair);
        }

        .prints-title {
          margin: 0;
          font-family: var(--font-playfair);
          font-size: clamp(2rem, 4vw, 2.75rem);
          font-weight: 400;
          line-height: 1.1;
        }

        .prints-count {
          margin: 0;
          font-family: var(--font-mono);
          font-size: 0.625rem;
          font-weight: 500;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: var(--dim);
        }

        .prints-empty {
          margin: 3rem 0 0;
          font-family: var(--font-newsreader);
          font-size: 1.125rem;
          font-style: italic;
          color: var(--dim);
        }

        .prints-grid {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 2.75rem 2.25rem;
        }

        .prints-card {
          display: block;
          text-decoration: none;
          color: inherit;
        }

        .prints-plate {
          aspect-ratio: 4 / 5;
          overflow: hidden;
          background: var(--hair);
        }

        .prints-plate picture,
        .prints-plate img {
          display: block;
          width: 100%;
          height: 100%;
        }

        .prints-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: filter 0.3s ease;
        }

        .prints-card:hover .prints-img {
          filter: brightness(1.08);
        }

        .prints-card-title {
          margin: 0.875rem 0 0.25rem;
          font-family: var(--font-playfair);
          font-size: 1.25rem;
          line-height: 1.25;
          color: var(--ink);
        }

        .prints-card-price {
          margin: 0 0 0.375rem;
          font-family: var(--font-mono);
          font-size: 0.625rem;
          font-weight: 500;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--dim);
        }

        .prints-card-meta {
          margin: 0;
          font-family: var(--font-mono);
          font-size: 0.625rem;
          font-weight: 400;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--faint, var(--dim));
        }

        @media (max-width: 900px) {
          .prints-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 2.25rem 1.75rem;
          }
        }

        @media (max-width: 540px) {
          .prints-grid {
            grid-template-columns: 1fr;
            gap: 2rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .prints-img {
            transition: none;
          }

          .prints-card:hover .prints-img {
            filter: none;
          }
        }
      `}</style>
    </main>
  )
}

export default async function PrintsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const cRaw = sp.c
  const c = Array.isArray(cRaw) ? cRaw[0] : cRaw

  let photos: GridPhoto[] = []

  if (c) {
    const detail = await getCollectionBySlug(c)
    if (!detail) {
      return (
        <PrintsShell>
          <p className="prints-empty">No prints in this collection.</p>
        </PrintsShell>
      )
    }
    photos = detail.photos
  } else {
    photos = await getPublishedPhotos()
    if (photos.length === 0) {
      return (
        <PrintsShell>
          <p className="prints-empty">No prints published yet.</p>
        </PrintsShell>
      )
    }
  }

  return (
    <PrintsShell count={photos.length}>
      <ul className="prints-grid">
        {photos.map((photo, i) => {
          const href = c
            ? `/prints/${photo.slug}?c=${encodeURIComponent(c)}`
            : `/prints/${photo.slug}`
          return (
            <li key={photo.slug}>
              <Link href={href} className="prints-card">
                <div className="prints-plate">
                  <Plate
                    photo={photo}
                    sizes="(max-width: 720px) 100vw, 33vw"
                    className="prints-img"
                  />
                </div>
                <p className="prints-card-title">{photo.title}</p>
                <p className="prints-card-price">{FROM_PRICE}</p>
                <p className="prints-card-meta">
                  {String(i + 1).padStart(2, '0')} · {SIZE_RANGE}
                </p>
              </Link>
            </li>
          )
        })}
      </ul>
    </PrintsShell>
  )
}
