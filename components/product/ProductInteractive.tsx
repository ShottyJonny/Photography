'use client'

import { useEffect, useState } from 'react'
import { useCart } from '@/components/cart/CartContext'
import { Plate } from '@/components/store/Plate'
import { CropGuide } from '@/components/product/CropGuide'
import { cropGuide } from '@/lib/product/crop'
import { priceForSize } from '@/lib/format/price'
import { ALL_SIZES } from '@/lib/pricing'

type ProductPhoto = {
  id: string
  slug: string
  title: string
  caption: string | null
  description: string | null
  alt_text: string | null
  aspect_ratio: number | null
  width_px: number | null
  height_px: number | null
  has_bw_variant: boolean
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`
}

export function ProductInteractive({ photo }: { photo: ProductPhoto }) {
  const [size, setSize] = useState('8x10')
  const [register, setRegister] = useState<'colour' | 'silver'>('colour')
  const { add } = useCart()

  const [addedAt, setAddedAt] = useState(0)
  const added = addedAt > 0
  useEffect(() => {
    if (addedAt === 0) return
    const t = setTimeout(() => setAddedAt(0), 2500)
    return () => clearTimeout(t)
  }, [addedAt])

  const plateAspect =
    photo.aspect_ratio ??
    (photo.width_px && photo.height_px ? photo.width_px / photo.height_px : 0.8)
  const guide = cropGuide(plateAspect, size)
  const cents = priceForSize(size)

  return (
    <div className="product-interactive">
      <div className="plate-wrap">
        <Plate
          photo={photo}
          register={register}
          sizes="(max-width: 720px) 100vw, 600px"
        />
        <CropGuide insetPct={guide.insetPct} label={guide.label} />
      </div>

      <div className="size-picker" role="group" aria-label="Print size">
        {ALL_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            className={s === size ? 'chip chip-selected' : 'chip'}
            onClick={() => setSize(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="register-toggle" role="group" aria-label="Print register">
        <button
          type="button"
          className={register === 'colour' ? 'register register-selected' : 'register'}
          onClick={() => setRegister('colour')}
        >
          Colour
        </button>
        <button
          type="button"
          className={register === 'silver' ? 'register register-selected' : 'register'}
          disabled={!photo.has_bw_variant}
          onClick={() => setRegister('silver')}
        >
          Silver
        </button>
      </div>

      <p className="price">{formatPrice(cents)}</p>

      <button
        type="button"
        className="add-to-cart"
        onClick={() => {
          add({
            photoId: photo.id,
            slug: photo.slug,
            title: photo.title,
            altText: photo.alt_text ?? '',
            size,
            register,
            qty: 1,
          })
          setAddedAt((n) => n + 1)
        }}
      >
        Add to cart
      </button>

      <p className="added-confirm" role="status" aria-live="polite">
        {added ? 'Added to your selection.' : ''}
      </p>

      <style>{`
        .product-interactive {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .plate-wrap {
          position: relative;
        }
        .plate-wrap img {
          display: block;
          width: 100%;
          height: auto;
        }
        .size-picker,
        .register-toggle {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .chip,
        .register,
        .add-to-cart {
          font-family: var(--font-mono);
          font-size: 0.8125rem;
          padding: 0.375rem 0.75rem;
          border-radius: 2px;
          cursor: pointer;
          background: transparent;
          color: var(--ink);
          border: 1px solid var(--hair);
        }
        .chip-selected,
        .register-selected {
          background: var(--ink);
          color: var(--paper);
          border-color: var(--ink);
        }
        .chip:disabled,
        .register:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .price {
          font-family: var(--font-playfair);
          font-size: 1.5rem;
          margin: 0;
        }
        .add-to-cart {
          align-self: flex-start;
        }
        .added-confirm {
          min-height: 1.25rem;
          margin: 0;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--dim);
        }
        .chip:focus-visible,
        .register:focus-visible,
        .add-to-cart:focus-visible {
          outline: 1px solid var(--ink);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  )
}
