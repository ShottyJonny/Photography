'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
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
const FADE_MS = 600
const ADVANCE_MS = 6000

export function HomeHero({
  photos,
  initialIndex,
  collectionSlug,
  collectionName,
  quote,
}: HomeHeroProps) {
  const [active, setActive] = useState(initialIndex)
  const [outgoing, setOutgoing] = useState<number | null>(null)
  const [reduced, setReduced] = useState(false)
  const [playing, setPlaying] = useState(photos.length > 1)
  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  // Indices whose dwell finished in the current pass. Cleared on wrap, so a
  // filled bar always means "shown since this pass began" and never lies about
  // a photograph the visitor has not actually seen yet.
  const [completed, setCompleted] = useState<number[]>([])
  // Elapsed dwell, so a pause resumes rather than restarting the full interval.
  const elapsedRef = useRef(0)
  const startedAtRef = useRef<number | null>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const railRef = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  // The pause region is the carousel — the rail and the hero panel — NOT the
  // whole grid. The grid is ~90% of the viewport, so pausing on any hover
  // within it froze the carousel whenever the cursor was parked over the copy
  // or merely crossing the page, which reads as the carousel being stuck.
  const inCarousel = useCallback(
    (node: Node | null) =>
      !!node && (!!railRef.current?.contains(node) || !!panelRef.current?.contains(node)),
    [],
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => {
      setReduced(mq.matches)
      if (mq.matches) setPlaying(false)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const select = useCallback(
    (next: number) => {
      setPlaying(false)
      setCompleted([])
      if (next === active) return
      if (!reduced) setOutgoing(active)
      setActive(next)
    },
    [active, reduced],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const last = photos.length - 1
      let next: number
      if (e.key === 'ArrowDown') next = active === last ? 0 : active + 1
      else if (e.key === 'ArrowUp') next = active === 0 ? last : active - 1
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = last
      else return
      e.preventDefault()
      select(next)
      tabRefs.current[next]?.focus()
    },
    [active, photos.length, select],
  )

  useEffect(() => {
    if (outgoing === null) return
    const id = setTimeout(() => setOutgoing(null), FADE_MS)
    return () => clearTimeout(id)
  }, [outgoing])

  useEffect(() => {
    if (photos.length < 2) return
    if (typeof window === 'undefined' || typeof window.Image !== 'function') return
    const next = photos[(active + 1) % photos.length]
    const img = new window.Image()
    img.src = derivativeSrc(next.slug, 'colour', 1200, 'webp')
  }, [active, photos])

  // A fresh dwell begins whenever the active photograph changes. Declared
  // before the timer effect so the reset lands before the timer reads it.
  useEffect(() => {
    elapsedRef.current = 0
    startedAtRef.current = null
  }, [active])

  const paused = hovered || focusWithin

  useEffect(() => {
    if (!playing || reduced || photos.length < 2) return
    if (paused) {
      // Bank what has run so far, then stop. The CSS bar pauses in step via
      // animation-play-state, so the visible fill and the timer agree.
      if (startedAtRef.current !== null) {
        elapsedRef.current += Date.now() - startedAtRef.current
        startedAtRef.current = null
      }
      return
    }
    startedAtRef.current = Date.now()
    const remaining = Math.max(0, ADVANCE_MS - elapsedRef.current)
    const id = setTimeout(() => {
      const next = (active + 1) % photos.length
      // Revisiting a row means the pass is over, so the trail starts empty
      // again. The boundary is the pass's own starting photograph, not index 0
      // — the cover can be anywhere in the list, and a pass beginning at 05
      // legitimately runs 05, 06, 01, 02... through the numeric wrap.
      setCompleted((prev) => (prev.includes(next) ? [] : [...prev, active]))
      setOutgoing(active)
      setActive(next)
    }, remaining)
    return () => clearTimeout(id)
  }, [playing, reduced, paused, active, photos.length])

  // A bar implies a pending advance. When nothing is advancing — stopped by a
  // selection, or reduced motion — there is nothing to count down, so no bar is
  // drawn at all rather than one sitting frozen and implying otherwise.
  const showProgress = playing && !reduced && photos.length > 1

  const current = photos[active]

  return (
    <main className="home">
      {/* The stack owns var(--bleedop), not the layers. With the token on each
          layer, the outgoing one holds at 0.5 while the incoming fades 0 -> 0.5
          over it; 0.5 never occludes, so they composite and the backdrop swells
          to ~0.75 before snapping back on unmount. Inside the stack both run
          0 -> 1 like the hero, which is a true cross-dissolve, and the group is
          then dimmed once. */}
      <div className="home-bleed-stack" aria-hidden="true">
        {outgoing !== null ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="home-bleed home-bleed-layer"
            src={derivativeSrc(photos[outgoing].slug, 'colour', 160, 'webp')}
          />
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          className={`home-bleed home-bleed-layer${outgoing !== null ? ' is-fading-in' : ''}`}
          src={derivativeSrc(current.slug, 'colour', 160, 'webp')}
        />
      </div>

      <div
        className="home-grid"
        onMouseOver={(e) => {
          if (inCarousel(e.target as Node)) setHovered(true)
        }}
        onMouseOut={(e) => {
          if (!inCarousel(e.relatedTarget as Node | null)) setHovered(false)
        }}
        onFocus={(e) => {
          if (inCarousel(e.target as Node)) setFocusWithin(true)
        }}
        onBlur={(e) => {
          if (!inCarousel(e.relatedTarget as Node | null)) setFocusWithin(false)
        }}
      >
        <aside className="home-rail" ref={railRef}>
          <p className="home-rail-kicker">
            Featured work
            <span>
              {pad(active + 1)} / {pad(photos.length)}
            </span>
          </p>
          {/* At <=900px the titles are clipped out of the dot row, so the active
              work would lose its name. This restores it. aria-hidden because the
              tabs still carry every title -- exposing it would announce the
              active work twice. */}
          <p className="home-active-label" aria-hidden="true">
            <span className="home-active-num">{pad(active + 1)}</span>
            <span className="home-active-title">{current.title}</span>
          </p>
          <div
            role="tablist"
            aria-label="Featured works"
            aria-orientation="vertical"
            className="home-index"
            onKeyDown={onKeyDown}
          >
            {photos.map((photo, i) => {
              const isActive = i === active
              return (
                <button
                  key={photo.id}
                  ref={(el) => {
                    tabRefs.current[i] = el
                  }}
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
                  {showProgress && isActive ? (
                    <span
                      // Remounting on each advance restarts the fill from zero.
                      key={active}
                      className="home-index-progress is-running"
                      style={{
                        // One source of truth with the timer above.
                        animationDuration: `${ADVANCE_MS}ms`,
                        animationPlayState: paused ? 'paused' : 'running',
                      }}
                    />
                  ) : null}
                  {showProgress && completed.includes(i) ? (
                    <span className="home-index-progress is-complete" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </aside>

        <div
          className="home-hero-wrap"
          ref={panelRef}
          role="tabpanel"
          id="home-hero-panel"
          aria-labelledby={`home-hero-tab-${current.slug}`}
          aria-live={playing ? 'off' : 'polite'}
          tabIndex={0}
        >
          <div className="home-hero-plate">
            {outgoing !== null ? (
              <div className="home-hero-layer" aria-hidden="true">
                <Plate
                  photo={photos[outgoing]}
                  register="colour"
                  sizes="(max-width: 900px) 100vw, 820px"
                  className="home-hero-img"
                />
              </div>
            ) : null}
            <div className={`home-hero-layer${outgoing !== null ? ' is-fading-in' : ''}`}>
              <Plate
                photo={current}
                register="colour"
                sizes="(max-width: 900px) 100vw, 820px"
                priority={active === initialIndex}
                className="home-hero-img"
              />
            </div>
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

        /* The dimming lives here, once, for the whole group. */
        .home-bleed-stack {
          position: absolute;
          inset: 0;
          opacity: var(--bleedop, 0.5);
          pointer-events: none;
          z-index: 0;
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
          pointer-events: none;
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

        /* Desktop reads the full list, so the active work is already named. */
        .home-active-label {
          display: none;
          align-items: baseline;
          gap: 1rem;
          margin: 0 0 0.75rem;
        }

        .home-active-num {
          flex-shrink: 0;
          width: 1.625rem;
          font-family: var(--font-mono);
          font-size: 0.6875rem;
          color: var(--faint, var(--dim));
        }

        .home-active-title {
          font-family: var(--font-playfair);
          font-size: 1.375rem;
          line-height: 1.2;
          color: var(--ink);
        }

        .home-index-link {
          position: relative;
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

        /* The dwell bar rides the row's existing hairline — it replaces the
           divider's colour rather than adding a new element to the layout. */
        .home-index-progress {
          position: absolute;
          left: 0;
          bottom: -1px;
          height: 1px;
          width: 100%;
          background: var(--ink);
          transform: scaleX(0);
          transform-origin: left center;
          pointer-events: none;
        }

        .home-index-progress.is-running {
          animation-name: home-index-fill;
          animation-timing-function: linear;
          animation-fill-mode: forwards;
        }

        .home-index-progress.is-complete {
          transform: scaleX(1);
          opacity: 0.45;
        }

        @keyframes home-index-fill {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
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

          /* DESIGN.md §12.5-E. The six-title stack is 308px and pushes the
             photograph to y581 on a 375x812 phone -- 231px of a 487px image
             above the fold. Collapsed to a dot row the photograph clears the
             fold whole, and the label above keeps the work named. */
          .home-grid {
            gap: 1.5rem;
          }

          .home-rail-kicker {
            margin-bottom: 1rem;
          }

          .home-active-label {
            display: flex;
            margin-bottom: 0.625rem;
          }

          /* The negative margin buys back the touch target's padding without
             shrinking it: the row reads as 24px, each target stays 44px. That
             30px is what puts the photograph's last pixel above the fold. */
          .home-index {
            display: flex;
            align-items: center;
            gap: 0.25rem;
            margin: -0.625rem 0;
          }

          /* 7px is the mark; 44px is the target. Never let the two be the same
             number -- the desktop rows are 51px and this must not regress. */
          .home-index-link {
            min-width: 44px;
            min-height: 44px;
            width: auto;
            padding: 0;
            border-bottom: 0;
            justify-content: center;
          }

          .home-index-link:hover {
            padding-left: 0;
          }

          .home-index-link::before {
            content: '';
            width: 7px;
            height: 7px;
            border-radius: 999px;
            background: var(--faint, var(--dim));
            transition: width 0.3s ease;
          }

          /* The active mark widens into the track its dwell fills. */
          .home-index-link.is-active::before {
            width: 28px;
            background: var(--hair);
          }

          /* display:none would strip the tab's accessible name; the title has
             to leave the layout without leaving the accessibility tree. */
          .home-index-num,
          .home-index-title {
            position: absolute;
            width: 1px;
            height: 1px;
            overflow: hidden;
            clip-path: inset(50%);
            white-space: nowrap;
          }

          /* Rides the widened mark. transform stays free for the scaleX fill,
             so the offset is done with margins. */
          .home-index-progress {
            top: 50%;
            left: 50%;
            bottom: auto;
            width: 28px;
            height: 7px;
            margin: -3.5px 0 0 -14px;
            border-radius: 999px;
          }
        }

        .home-hero-layer {
          position: absolute;
          inset: 0;
        }

        /* Both stacks cross-dissolve the same way: the outgoing layer holds at
           opacity 1 and the incoming fades over it until it fully occludes.
           The bleed is dimmed by .home-bleed-stack, not per-layer, so it can
           share these keyframes. */
        .home-hero-layer.is-fading-in,
        .home-bleed-layer.is-fading-in {
          animation: home-hero-fade-in 600ms ease;
        }

        @keyframes home-hero-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .home-index-link {
            transition: none;
          }

          .home-hero-layer.is-fading-in,
          .home-bleed-layer.is-fading-in {
            animation: none;
          }
        }
      `}</style>
    </main>
  )
}
