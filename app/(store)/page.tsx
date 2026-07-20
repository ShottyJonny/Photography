import Link from 'next/link'
import { Plate } from '@/components/store/Plate'
import { getFeaturedCollection } from '@/lib/data/collections'
import { derivativeSrc } from '@/lib/images/derivatives'

export const dynamic = 'force-dynamic'

function pullQuote(dek: string | null, literature: string | null): string {
  if (dek) return dek
  if (!literature) return ''
  const trimmed = literature.trim()
  const sentence = trimmed.match(/^[^.!?]+[.!?]/)?.[0]
  if (sentence && sentence.length <= 200) return sentence
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed
}

function EmptyHome() {
  return (
    <main className="home-empty">
      <p>Coming soon.</p>
      <style>{`
        .home-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: calc(100vh - 5rem);
          padding: 3rem 1.5rem;
        }
        .home-empty p {
          margin: 0;
          font-family: var(--font-newsreader);
          font-size: 1.125rem;
          font-style: italic;
          color: var(--dim);
        }
      `}</style>
    </main>
  )
}

export default async function Home() {
  const featured = await getFeaturedCollection()
  if (!featured || featured.photos.length === 0) {
    return <EmptyHome />
  }

  const hero =
    featured.photos.find((p) => p.slug === featured.cover?.slug) ?? featured.photos[0]
  const quote = pullQuote(featured.dek, featured.literature)
  const productHref = `/prints/${hero.slug}?c=${featured.slug}`
  const collectionHref = `/collections/${featured.slug}`

  return (
    <main className="home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        aria-hidden="true"
        alt=""
        className="home-bleed"
        src={derivativeSrc(hero.slug, 'colour', 160, 'webp')}
      />

      <div className="home-grid">
        <aside className="home-rail">
          <p className="home-rail-kicker">
            Featured work
            <span>
              01 / {String(featured.photos.length).padStart(2, '0')}
            </span>
          </p>
          <nav aria-label="Featured works">
            <ul className="home-index">
              {featured.photos.map((photo, i) => {
                const isActive = photo.slug === hero.slug
                return (
                  <li key={photo.id}>
                    <Link
                      href={`/prints/${photo.slug}?c=${featured.slug}`}
                      className={`home-index-link${isActive ? ' is-active' : ''}`}
                    >
                      <span className="home-index-num">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="home-index-title">{photo.title}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        </aside>

        <div className="home-hero-wrap">
          <div className="home-hero-plate">
            <Plate
              photo={hero}
              register="colour"
              sizes="(max-width: 900px) 100vw, 820px"
              priority
              className="home-hero-img"
            />
          </div>
        </div>

        <div className="home-copy">
          <p className="home-collection-kicker">{featured.name}</p>
          {quote ? <p className="home-quote">{quote}</p> : null}
          <div className="home-ctas">
            <Link href={productHref} className="home-cta-primary">
              View this print →
            </Link>
            <Link href={collectionHref} className="home-cta-ghost">
              Enter the collection
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        .home {
          position: relative;
          overflow: hidden;
          min-height: calc(100vh - 5rem);
          background: var(--paper);
          color: var(--ink);
        }

        .home-bleed {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 40%;
          filter: blur(90px);
          transform: scale(1.12);
          opacity: var(--bleedop, 0.5);
          pointer-events: none;
          z-index: 0;
        }

        .home-grid {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 820px);
          grid-template-rows: 1fr auto;
          gap: 2rem;
          max-width: 1200px;
          min-height: calc(100vh - 5rem);
          margin: 0 auto;
          padding: 2.5rem 1.5rem 3rem;
        }

        .home-rail {
          grid-column: 1;
          grid-row: 1;
          align-self: start;
          max-width: 28rem;
        }

        .home-rail-kicker {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          margin: 0 0 1.25rem;
          padding-bottom: 0.875rem;
          border-bottom: 1px solid var(--hairsoft, var(--hair));
          font-family: var(--font-mono);
          font-size: 0.625rem;
          font-weight: 500;
          letter-spacing: 0.32em;
          text-transform: uppercase;
          color: var(--dim);
        }

        .home-index {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .home-index li {
          border-bottom: 1px solid var(--hairsoft, var(--hair));
        }

        .home-index-link {
          display: flex;
          align-items: baseline;
          gap: 1rem;
          padding: 0.75rem 0;
          text-decoration: none;
          transition: padding-left 0.2s ease;
        }

        .home-index-num {
          flex-shrink: 0;
          width: 1.625rem;
          font-family: var(--font-mono);
          font-size: 0.6875rem;
          color: var(--faint, var(--dim));
        }

        .home-index-title {
          font-family: var(--font-playfair);
          font-size: 1.375rem;
          line-height: 1.2;
          color: var(--dim);
        }

        .home-index-link.is-active .home-index-num,
        .home-index-link.is-active .home-index-title {
          color: var(--ink);
        }

        .home-index-link:hover {
          padding-left: 0.375rem;
        }

        .home-hero-wrap {
          grid-column: 2;
          grid-row: 1 / 3;
          display: flex;
          justify-content: flex-end;
          align-items: stretch;
          min-height: min(900px, calc(100vh - 8rem));
        }

        .home-hero-plate {
          width: 100%;
          max-width: 820px;
          align-self: stretch;
          overflow: hidden;
          -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 150px);
          mask-image: linear-gradient(90deg, transparent 0, #000 150px);
        }

        .home-hero-plate picture,
        .home-hero-plate img {
          display: block;
          width: 100%;
          height: 100%;
        }

        .home-hero-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 40%;
        }

        .home-copy {
          grid-column: 1;
          grid-row: 2;
          align-self: end;
          max-width: 28rem;
        }

        .home-collection-kicker {
          margin: 0 0 0.875rem;
          font-family: var(--font-mono);
          font-size: 0.625rem;
          font-weight: 500;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: var(--dim);
        }

        .home-quote {
          margin: 0 0 1.5rem;
          font-family: var(--font-newsreader);
          font-size: 1.1875rem;
          line-height: 1.55;
          color: var(--ink);
        }

        .home-ctas {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 1.25rem 1.5rem;
        }

        .home-cta-primary {
          display: inline-block;
          padding: 0.875rem 1.5rem;
          font-family: var(--font-mono);
          font-size: 0.6875rem;
          font-weight: 500;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          text-decoration: none;
          color: var(--btnink, var(--paper));
          background: var(--btnbg, var(--ink));
        }

        .home-cta-ghost {
          font-family: var(--font-mono);
          font-size: 0.6875rem;
          font-weight: 500;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          text-decoration: none;
          color: var(--ink);
        }

        @media (max-width: 900px) {
          .home-grid {
            grid-template-columns: 1fr;
            grid-template-rows: auto auto auto;
          }

          .home-rail {
            grid-column: 1;
            grid-row: 1;
            max-width: none;
          }

          .home-hero-wrap {
            grid-column: 1;
            grid-row: 2;
            min-height: 60vh;
          }

          .home-hero-plate {
            max-width: none;
            -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 80px);
            mask-image: linear-gradient(180deg, transparent 0, #000 80px);
          }

          .home-copy {
            grid-column: 1;
            grid-row: 3;
            max-width: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .home-index-link {
            transition: none;
          }
        }
      `}</style>
    </main>
  )
}
