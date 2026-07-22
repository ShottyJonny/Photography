'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { derivativeSrc } from '@/lib/images/derivatives'
import { setFeaturedCollection } from '@/lib/admin/home-feature-actions'
import { HomeHeroPreview } from '@/components/admin/HomeHeroPreview'
import type { FeatureCandidate } from '@/lib/data/collections-admin'

const NONE = '__none__'

export function HomeFeaturePicker({ candidates }: { candidates: FeatureCandidate[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const current = candidates.find((c) => c.featured_on_home)?.id ?? NONE
  const [selected, setSelected] = useState<string>(current)
  const [notice, setNotice] = useState<string | null>(null)

  const selectedCandidate = selected === NONE ? null : candidates.find((c) => c.id === selected) ?? null
  const selectedEmpty = selectedCandidate !== null && selectedCandidate.publishedCount === 0
  const canSet = !pending && selected !== current && !selectedEmpty

  function save() {
    start(async () => {
      setNotice(null)
      const r = await setFeaturedCollection({ collectionId: selected === NONE ? null : selected })
      if (!r.ok) setNotice(r.message)
      else router.refresh()
    })
  }

  return (
    <div className="admin-hf-body">
      <div className="admin-hf-picker" role="radiogroup" aria-label="Home focal point">
        <div className="admin-hf-label">Choose a focal point</div>
        {notice ? <p className="admin-empty" role="alert">{notice}</p> : null}

        <button
          type="button" role="radio" aria-checked={selected === NONE}
          className={`admin-hf-opt${selected === NONE ? ' is-selected' : ''}`}
          onClick={() => setSelected(NONE)}
        >
          <span className="admin-hf-opt-thumb is-empty" aria-hidden="true" />
          <span className="admin-hf-opt-body">
            <span className="admin-hf-opt-name">No feature</span>
            <span className="admin-hf-opt-meta">Home shows “Coming soon.”</span>
          </span>
          <span className="admin-hf-radio" aria-hidden="true" />
        </button>

        {candidates.map((c) => {
          const disabled = c.publishedCount === 0
          const isSel = selected === c.id
          return (
            <button
              key={c.id} type="button" role="radio" aria-checked={isSel} aria-disabled={disabled}
              className={`admin-hf-opt${isSel ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
              onClick={() => { if (!disabled) setSelected(c.id) }}
            >
              {c.heroSlug ? (
                /* eslint-disable-next-line @next/next/no-img-element -- public derivative URL */
                <img className="admin-hf-opt-thumb" src={derivativeSrc(c.heroSlug, 'colour', 160)} alt="" />
              ) : (
                <span className="admin-hf-opt-thumb is-empty" aria-hidden="true" />
              )}
              <span className="admin-hf-opt-body">
                <span className="admin-hf-opt-name">{c.name}</span>
                <span className="admin-hf-opt-meta">
                  {disabled
                    ? 'No published works — can’t lead home'
                    : `${c.publishedCount} ${c.publishedCount === 1 ? 'work' : 'works'}`}
                </span>
              </span>
              <span className="admin-hf-radio" aria-hidden="true" />
            </button>
          )
        })}

        <button type="button" className="admin-btn admin-hf-set" disabled={!canSet} onClick={save}>
          Set as home focal point
        </button>
        <p className="admin-hf-note">Publishes on save — no redeploy. The change is live within a minute.</p>
      </div>

      <div className="admin-hf-previewwrap">
        <div className="admin-hf-label">Live preview — home hero</div>
        <HomeHeroPreview
          name={selectedCandidate?.name ?? ''}
          quote={selectedCandidate?.previewQuote ?? ''}
          heroSlug={selectedCandidate?.heroSlug ?? null}
          empty={selected === NONE || selectedEmpty}
        />
      </div>
    </div>
  )
}
