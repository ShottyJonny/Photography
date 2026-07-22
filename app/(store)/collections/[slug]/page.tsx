import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Plate } from '@/components/store/Plate'
import { getCollectionBySlug } from '@/lib/data/collections'

export function LiteratureBody({ text }: { text: string }) {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return (
    <>
      {paras.map((para, i) => (
        <p key={i} className={i === 0 ? 'collection-literature-body is-first' : 'collection-literature-body'}>
          {para}
        </p>
      ))}
    </>
  )
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const detail = await getCollectionBySlug(slug)
  return {
    title: detail
      ? `${detail.name} — Jon Hoffman Photography`
      : 'Collection — Jon Hoffman Photography',
  }
}

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const detail = await getCollectionBySlug(slug)
  if (!detail) notFound()

  const countLabel = `${detail.photos.length} ${
    detail.photos.length === 1 ? 'photograph' : 'photographs'
  }`

  return (
    <main className="collection">
      <header className="collection-masthead">
        <p className="collection-kicker">
          Collection
          <span>{countLabel}</span>
        </p>
        <h1 className="collection-title">{detail.name}</h1>
        {detail.dek ? <p className="collection-dek">{detail.dek}</p> : null}
      </header>

      {detail.literature ? (
        <section className="collection-literature" aria-labelledby="collection-literature-heading">
          <h2 id="collection-literature-heading" className="visually-hidden">
            Essay
          </h2>
          <LiteratureBody text={detail.literature} />
          <p className="collection-literature-signature">Jon Hoffman</p>
        </section>
      ) : null}

      <section className="collection-works" aria-labelledby="collection-works-heading">
        <h2 id="collection-works-heading" className="collection-works-label">
          The works
        </h2>
        <div className="collection-strip-wrap">
          <ul className="collection-strip">
            {detail.photos.map((photo) => (
              <li key={photo.id} className="collection-strip-item">
                <Link
                  href={`/prints/${photo.slug}?c=${encodeURIComponent(detail.slug)}`}
                  className="collection-strip-link"
                >
                  <Plate
                    photo={photo}
                    sizes="300px"
                    className="collection-strip-img"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <style>{`
        .collection {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2.5rem 1.5rem 3.5rem;
          color: var(--ink);
          background: var(--paper);
        }

        .visually-hidden {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        .collection-masthead {
          max-width: 720px;
          margin: 0 auto 3rem;
          text-align: center;
        }

        .collection-kicker {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          justify-content: center;
          gap: 0.5rem 1rem;
          margin: 0 0 1.25rem;
          font-family: var(--font-mono);
          font-size: 0.625rem;
          font-weight: 500;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: var(--dim);
        }

        .collection-title {
          margin: 0 0 1rem;
          font-family: var(--font-playfair);
          font-size: clamp(2rem, 5vw, 3rem);
          font-weight: 400;
          line-height: 1.15;
        }

        .collection-dek {
          margin: 0;
          font-family: var(--font-newsreader);
          font-size: 1.1875rem;
          font-style: italic;
          line-height: 1.55;
          color: var(--dim);
        }

        .collection-literature {
          max-width: 640px;
          margin: 0 auto 3.5rem;
        }

        .collection-literature-body {
          font-family: var(--font-newsreader);
          font-size: 1.125rem;
          line-height: 1.75;
          color: var(--ink);
          margin: 0 0 1.25rem;
        }
        .collection-literature-body.is-first::first-letter {
          float: left;
          margin: 0.05em 0.12em 0 0;
          font-family: var(--font-playfair);
          font-size: 3.75rem;
          line-height: 0.85;
          font-weight: 400;
        }

        .collection-literature-signature {
          margin: 2rem 0 0;
          font-family: var(--font-playfair);
          font-size: 1.125rem;
          font-weight: 400;
          color: var(--ink);
        }

        .collection-works-label {
          margin: 0 0 1.25rem;
          font-family: var(--font-mono);
          font-size: 0.625rem;
          font-weight: 500;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: var(--dim);
        }

        .collection-strip-wrap {
          margin: 0 -1.5rem;
          padding: 0 1.5rem;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
        }

        .collection-strip {
          display: flex;
          flex-direction: row;
          gap: 1.25rem;
          list-style: none;
          margin: 0;
          padding: 0 0 0.5rem;
          width: max-content;
          max-width: none;
        }

        .collection-strip-item {
          flex: 0 0 300px;
          width: 300px;
        }

        .collection-strip-link {
          display: block;
          text-decoration: none;
          color: inherit;
        }

        .collection-strip-link picture,
        .collection-strip-link img {
          display: block;
          width: 100%;
        }

        .collection-strip-img {
          width: 100%;
          height: auto;
          vertical-align: bottom;
          transition: filter 0.3s ease;
        }

        .collection-strip-link:hover .collection-strip-img {
          filter: brightness(1.06);
        }

        @media (prefers-reduced-motion: reduce) {
          .collection-strip-img {
            transition: none;
          }

          .collection-strip-link:hover .collection-strip-img {
            filter: none;
          }
        }
      `}</style>
    </main>
  )
}
