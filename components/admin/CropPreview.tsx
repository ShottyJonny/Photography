'use client'

import { useState } from 'react'
import { cropGuide, SIZE_ASPECT } from '@/lib/product/crop'

const SIZES = Object.keys(SIZE_ASPECT)

function toSafePreviewSrc(src: string): string | null {
  try {
    if (src.startsWith('blob:')) {
      const parsed = new URL(src)
      return parsed.protocol === 'blob:' ? src : null
    }

    if (src.startsWith('data:')) {
      const match = /^data:(image\/[a-z0-9.+-]+)(;[^,]*)?,/i.exec(src)
      return match ? src : null
    }
  } catch {
    return null
  }

  return null
}

/**
 * The SAME cropGuide() the product page uses (components/product/ProductInteractive.tsx),
 * so what Jon sees at ingest and what the customer is promised cannot drift.
 *
 * The prototype's plate is a hardcoded aspect-ratio:4/5 with object-fit:cover,
 * which silently misrepresents any photograph that is not 4:5. This renders the
 * NATIVE aspect and draws the crop on top -- the same correction slice 2's
 * review already forced on the storefront.
 *
 * The crop is CENTRED. Nations permits any crop; centre-cropping there is what
 * keeps the promise the storefront already made.
 */
export function CropPreview({ src, aspectRatio }: { src: string; aspectRatio: number | null }) {
  const [size, setSize] = useState<string>('8x10')
  const safeSrc = toSafePreviewSrc(src)

  if (aspectRatio === null) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element -- see below */}
        {safeSrc ? <img src={safeSrc} alt="" style={{ width: '100%', display: 'block' }} /> : null}
        <p className="admin-crop-caption">Crop guides appear once the dimensions are measured.</p>
      </>
    )
  }

  const { insetPct, label } = cropGuide(aspectRatio, size)
  const { top, bottom, left, right } = insetPct

  return (
    <>
      <div className="admin-crop">
        {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL from a
            local File. next/image cannot optimise it, and spec §1 keeps
            remotePatterns empty; components/store/Plate.tsx sets the raw-<img>
            precedent for this repo. */}
        {safeSrc ? <img src={safeSrc} alt="" style={{ width: '100%', display: 'block', aspectRatio: String(aspectRatio) }} /> : null}
        {top > 0 && <span className="admin-crop-shade" style={{ top: 0, left: 0, right: 0, height: `${top}%` }} />}
        {bottom > 0 && <span className="admin-crop-shade" style={{ bottom: 0, left: 0, right: 0, height: `${bottom}%` }} />}
        {left > 0 && <span className="admin-crop-shade" style={{ top: `${top}%`, bottom: `${bottom}%`, left: 0, width: `${left}%` }} />}
        {right > 0 && <span className="admin-crop-shade" style={{ top: `${top}%`, bottom: `${bottom}%`, right: 0, width: `${right}%` }} />}
        {top > 0 && <span className="admin-crop-rule" style={{ top: `${top}%`, left: 0, right: 0, height: 1 }} />}
        {bottom > 0 && <span className="admin-crop-rule" style={{ bottom: `${bottom}%`, left: 0, right: 0, height: 1 }} />}
        {left > 0 && <span className="admin-crop-rule" style={{ top: `${top}%`, bottom: `${bottom}%`, left: `${left}%`, width: 1 }} />}
        {right > 0 && <span className="admin-crop-rule" style={{ top: `${top}%`, bottom: `${bottom}%`, right: `${right}%`, width: 1 }} />}
      </div>
      <div className="admin-crop-sizes" role="group" aria-label="Preview the crop for a size">
        {SIZES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={`admin-crop-size${candidate === size ? ' is-active' : ''}`}
            aria-pressed={candidate === size}
            onClick={() => setSize(candidate)}
          >
            {candidate.replace('x', '×')}
          </button>
        ))}
      </div>
      <p className="admin-crop-caption">
        Guides show the {label} crop, centred — the same crop the print’s page shows a customer.
      </p>
    </>
  )
}
