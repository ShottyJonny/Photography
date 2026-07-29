'use client'

import { derivativeSrc } from '@/lib/images/derivatives'

export function HomeHeroPreview({
  name, quote, heroSlug, empty,
}: {
  name: string
  quote: string
  heroSlug: string | null
  empty: boolean
}) {
  if (empty || !heroSlug) {
    return (
      <div className="admin-hf-preview is-empty">
        <p className="admin-hf-preview-empty">Coming soon.</p>
      </div>
    )
  }
  return (
    <div className="admin-hf-preview">
      {/* eslint-disable-next-line @next/next/no-img-element -- public derivative URL; preview only */}
      <img className="admin-hf-preview-img" src={derivativeSrc(heroSlug, 'colour', 1200)} alt="" />
      <div className="admin-hf-preview-scrim" aria-hidden="true" />
      <div className="admin-hf-preview-copy">
        <p className="admin-hf-preview-kicker">From the {name} collection</p>
        {quote ? <p className="admin-hf-preview-quote">{quote}</p> : null}
        <span className="admin-hf-preview-cta">Enter the collection →</span>
      </div>
    </div>
  )
}
