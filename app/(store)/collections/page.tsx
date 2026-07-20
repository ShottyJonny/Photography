import Link from 'next/link'
import type { Metadata } from 'next'
import { Plate } from '@/components/store/Plate'
import { getCollections } from '@/lib/data/collections'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Collections — Jon Hoffman Photography',
}

export default async function CollectionsPage() {
  const collections = await getCollections()

  return (
    <main className="collections">
      <header className="collections-head">
        <h1 className="collections-title">Collections</h1>
      </header>

      {collections.length === 0 ? (
        <p className="collections-empty">No collections yet.</p>
      ) : (
        <ul className="collections-grid">
          {collections.map((card) => (
            <li key={card.slug}>
              <Link href={`/collections/${card.slug}`} className="collections-card">
                <div className="collections-plate">
                  {card.coverSlug ? (
                    <Plate
                      photo={{
                        slug: card.coverSlug,
                        alt_text: card.coverAlt,
                        width_px: null,
                        height_px: null,
                        aspect_ratio: null,
                      }}
                      sizes="(max-width: 720px) 100vw, 33vw"
                      className="collections-img"
                    />
                  ) : (
                    <div className="collections-placeholder" aria-hidden="true" />
                  )}
                </div>
                <h2 className="collections-card-name">{card.name}</h2>
                <p className="collections-card-count">
                  {card.count} {card.count === 1 ? 'photograph' : 'photographs'}
                </p>
                {card.dek ? <p className="collections-card-dek">{card.dek}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <style>{`
        .collections {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2.5rem 1.5rem 3.5rem;
          color: var(--ink);
          background: var(--paper);
        }

        .collections-head {
          margin-bottom: 2.25rem;
          padding-bottom: 1.25rem;
          border-bottom: 1px solid var(--hair);
        }

        .collections-title {
          margin: 0;
          font-family: var(--font-playfair);
          font-size: clamp(2rem, 4vw, 2.75rem);
          font-weight: 400;
          line-height: 1.1;
        }

        .collections-empty {
          margin: 3rem 0 0;
          font-family: var(--font-newsreader);
          font-size: 1.125rem;
          font-style: italic;
          color: var(--dim);
        }

        .collections-grid {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 2.75rem 2.25rem;
        }

        .collections-card {
          display: block;
          text-decoration: none;
          color: inherit;
        }

        .collections-plate {
          aspect-ratio: 4 / 5;
          overflow: hidden;
          background: var(--hair);
        }

        .collections-plate picture,
        .collections-plate img {
          display: block;
          width: 100%;
          height: 100%;
        }

        .collections-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: filter 0.3s ease;
        }

        .collections-placeholder {
          width: 100%;
          height: 100%;
          background: var(--hair);
        }

        .collections-card:hover .collections-img {
          filter: brightness(1.08);
        }

        .collections-card-name {
          margin: 0.875rem 0 0.375rem;
          font-family: var(--font-playfair);
          font-size: 1.375rem;
          font-weight: 400;
          line-height: 1.25;
          color: var(--ink);
        }

        .collections-card-count {
          margin: 0 0 0.5rem;
          font-family: var(--font-mono);
          font-size: 0.625rem;
          font-weight: 500;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--dim);
        }

        .collections-card-dek {
          margin: 0;
          font-family: var(--font-newsreader);
          font-size: 1rem;
          line-height: 1.55;
          color: var(--dim);
        }

        @media (max-width: 900px) {
          .collections-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 2.25rem 1.75rem;
          }
        }

        @media (max-width: 540px) {
          .collections-grid {
            grid-template-columns: 1fr;
            gap: 2rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .collections-img {
            transition: none;
          }

          .collections-card:hover .collections-img {
            filter: none;
          }
        }
      `}</style>
    </main>
  )
}
