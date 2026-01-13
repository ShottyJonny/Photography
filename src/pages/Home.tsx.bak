import React from 'react'
import { products } from '../data/products'
import { usePricing } from '../context/PricingContext'
import { useCart } from '../context/CartContext'
import LinkButton from '../components/LinkButton'
import { ProductCard } from '../components/ProductCard'
import { averageColor } from '../utils/color'

export default function Home() {
  const AUTO_MS = 4000
  const { priced } = usePricing()
  const { add } = useCart()
  const featuredList = React.useMemo(() => {
    if (!priced.length) return [] as typeof products
    const shuffled = [...priced]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled.slice(0, Math.min(6, shuffled.length))
  }, [priced])
  const [active, setActive] = React.useState(0)
  React.useEffect(() => setActive(0), [featuredList])
  const [paused, setPaused] = React.useState(false)
  React.useEffect(() => {
    if (paused || featuredList.length <= 1) return
    const id = setInterval(() => {
      setActive(i => (i + 1) % featuredList.length)
    }, AUTO_MS)
    return () => clearInterval(id)
  }, [paused, featuredList, AUTO_MS])
  const current = featuredList[active]

  // Compute an average color for the current image to create a mood aura
  const [aura, setAura] = React.useState<{ r: number; g: number; b: number } | null>(null)
  React.useEffect(() => {
    if (!current) { setAura(null); return }
    const src = current.thumbnail || current.image
    let cancelled = false
    averageColor(src).then((rgb) => { if (!cancelled) setAura(rgb) }).catch(() => setAura(null))
    return () => { cancelled = true }
  }, [current?.id, current?.image, current?.thumbnail])

  const more = React.useMemo(() => {
    if (!priced.length) return [] as typeof products
    const exclude = new Set(featuredList.map(p => p.id))
    const pool = priced.filter(p => !exclude.has(p.id))
    const shuffled = [...pool]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }, [featuredList, priced])

  const [visibleCount, setVisibleCount] = React.useState(6)
  React.useEffect(() => setVisibleCount(6), [featuredList])
  const visible = React.useMemo(() => more.slice(0, Math.min(visibleCount, more.length)), [more, visibleCount])

  return (
    <div className="home">
      <section className="hero">
        {current && (
          <article className="featured only-image">
            <div className="carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
              {aura && (
        <div
                  className="carousel-aura"
                  style={{
          background: `radial-gradient( circle at 50% 50%, rgba(${aura.r},${aura.g},${aura.b},0.38) 0%, rgba(${aura.r},${aura.g},${aura.b},0.22) 45%, rgba(${aura.r},${aura.g},${aura.b},0.10) 70%, transparent 88%)`
                  }}
                  aria-hidden
                />
              )}
              <div className="carousel-viewport">
                {featuredList.map((p, i) => (
                  <img
                    key={p.id}
                    className={i === active ? 'slide active' : 'slide'}
                    src={p.thumbnail || p.image}
                    alt={p.name}
                    aria-hidden={i !== active}
                  />
                ))}
              </div>
              {featuredList.length > 1 && (
                <div className="carousel-controls">
                  <button aria-label="Previous" onClick={() => setActive((i) => (i - 1 + featuredList.length) % featuredList.length)}>‹</button>
                  <div className="story-progress" role="tablist" aria-label="Featured items">
                    {featuredList.map((p, i) => {
                      const state = i < active ? 'done' : i === active ? 'active' : 'upcoming'
                      return (
                        <button
                          key={p.id}
                          role="tab"
                          aria-selected={i === active}
                          className={`segment ${state}`}
                          onClick={() => setActive(i)}
                          title={p.name}
                        >
                          <span
                            className="fill"
                            style={{
                              animationDuration: `${AUTO_MS}ms`,
                              animationPlayState: paused ? 'paused' as const : 'running' as const,
                            }}
                          />
                        </button>
                      )
                    })}
                  </div>
                  <button aria-label="Next" onClick={() => setActive((i) => (i + 1) % featuredList.length)}>›</button>
                </div>
              )}
            </div>
          </article>
        )}
  <div className="hero-copy" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <h2>{current ? current.name : 'Fine Art Photography Prints'}</h2>
          <p>{current?.description || 'Limited-run prints, crafted with archival materials. Discover your next piece.'}</p>
          {current && (
            <p className="price">{formatPrice(current.price)}</p>
          )}
          {current && (
            <div className="actions">
              <LinkButton to={`/product/${current.id}`} className="button">View Details</LinkButton>
              <button className="button" onClick={() => add(current.id, 1)}>Add to Cart</button>
            </div>
          )}
        </div>
      </section>
      {visible.length > 0 && (
        <section className="more-options">
          <div className="more-header">
            <h3>More options</h3>
            <LinkButton to="/shop" className="button">View all</LinkButton>
          </div>
          <div className="grid">
            {visible.map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          {visible.length < more.length && (
            <div className="load-more">
              <button className="button" onClick={() => setVisibleCount(c => Math.min(c + 6, more.length))}>Load More</button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function formatPrice(cents: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100)
}

// using shared averageColor util
