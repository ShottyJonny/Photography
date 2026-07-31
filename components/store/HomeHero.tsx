'use client'

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { Plate } from '@/components/store/Plate'
import { derivativeSrc } from '@/lib/images/derivatives'
import type { PhotoInCollection } from '@/lib/data/collections'

export interface HomeHeroProps {
  photos: PhotoInCollection[]
  initialIndex: number
  collectionSlug: string
  collectionName: string
  quote: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')

export function HomeHero({
  photos,
  initialIndex,
  collectionSlug,
  collectionName,
  quote,
}: HomeHeroProps) {
  const [active, setActive] = useState(initialIndex)

  const select = useCallback((next: number) => {
    setActive(next)
  }, [])

  const current = photos[active]

  return (
    <main className="home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        aria-hidden="true"
        alt=""
        className="home-bleed"
        src={derivativeSrc(current.slug, 'colour', 160, 'webp')}
      />

      <div className="home-grid">
        <aside className="home-rail">
          <p className="home-rail-kicker">
            Featured work
            <span>
              {pad(active + 1)} / {pad(photos.length)}
            </span>
          </p>
          <div
            role="tablist"
            aria-label="Featured works"
            aria-orientation="vertical"
            className="home-index"
          >
            {photos.map((photo, i) => {
              const isActive = i === active
              return (
                <button
                  key={photo.id}
                  type="button"
                  role="tab"
                  id={`home-hero-tab-${photo.slug}`}
                  aria-selected={isActive}
                  aria-controls="home-hero-panel"
                  tabIndex={isActive ? 0 : -1}
                  className={`home-index-link${isActive ? ' is-active' : ''}`}
                  onClick={() => select(i)}
                >
                  <span className="home-index-num">{pad(i + 1)}</span>
                  <span className="home-index-title">{photo.title}</span>
                </button>
              )
            })}
          </div>
        </aside>

        <div
          className="home-hero-wrap"
          role="tabpanel"
          id="home-hero-panel"
          aria-labelledby={`home-hero-tab-${current.slug}`}
          tabIndex={0}
        >
          <div className="home-hero-plate">
            <Plate
              photo={current}
              register="colour"
              sizes="(max-width: 900px) 100vw, 820px"
              priority={active === initialIndex}
              className="home-hero-img"
            />
          </div>
        </div>

        <div className="home-copy">
          <p className="home-collection-kicker">{collectionName}</p>
          {quote ? <p className="home-quote">{quote}</p> : null}
          <div className="home-ctas">
            <Link
              href={`/prints/${current.slug}?c=${collectionSlug}`}
              className="home-cta-primary"
            >
              View this print →
            </Link>
            <Link href={`/collections/${collectionSlug}`} className="home-cta-ghost">
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
          margin: 0;
          padding: 0;
        }

        .home-index-link {
          display: flex;
          align-items: baseline;
          gap: 1rem;
          width: 100%;
          padding: 0.75rem 0;
          border: 0;
          border-bottom: 1px solid var(--hairsoft, var(--hair));
          background: none;
          font: inherit;
          text-align: left;
          text-decoration: none;
          cursor: pointer;
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
          position: relative;
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
