import React from 'react'
import { products } from '../data/products'
import { useCart } from '../context/CartContext'
import { PrintSize, ALL_SIZES, priceForSize, usePricing } from '../context/PricingContext'
import Dropdown from '../components/Dropdown'
import { landscapeOptionsIfNeeded, isLandscapeProduct } from '../utils/sizeDisplay'
import { averageColor } from '../utils/color'

export default function Product({ id }: { id: string }) {
  const { priced } = usePricing()
  const item = (priced.find((p) => p.id === id) || products.find(p => p.id === id))
  const { add } = useCart()
  // unified size list
  const [sizes] = React.useState<readonly string[]>(ALL_SIZES)
  const [size, setSize] = React.useState<PrintSize>('4x6')
  const [blackAndWhite, setBlackAndWhite] = React.useState(false)

  // Force-inject 10x8 test size for Omniprominence (formerly Golden Tides) regardless of detected family (so we can always pick it to test crop guides)
  // Remove previous force-inject effect (logic now handled inline above)
  // Aura color sampling
  const [aura, setAura] = React.useState<{ r:number; g:number; b:number } | null>(null)
  React.useEffect(() => {
    let cancelled = false
    if (item?.image) {
      averageColor(item.image)
        .then(c => { if (!cancelled) setAura(c) })
        .catch(() => setAura(null))
    }
    return () => { cancelled = true }
  }, [item?.image])
  if (!item) return <p>Product not found.</p>
  const priceCents = priceForSize(size)
  // Track natural image dimensions for crop guide calculations
  const [imgDims, setImgDims] = React.useState<{w:number; h:number} | null>(null)

  function parseSizeAspect(s: string): number | null {
    const m = s.toLowerCase().split('x')
    if (m.length !== 2) return null
    const w = Number(m[0])
    const h = Number(m[1])
    if (!w || !h) return null
    return w / h
  }

  const rawAspect = parseSizeAspect(size)
  const targetAspect = (isLandscapeProduct(item.id) && rawAspect && rawAspect < 1) ? 1 / rawAspect : rawAspect
  const originalAspect = imgDims ? (imgDims.w / imgDims.h) : null
  let cropGuides: { type: 'horizontal' | 'vertical'; inset1Pct: number; inset2Pct: number } | null = null
  if (targetAspect && originalAspect && Math.abs(targetAspect - originalAspect) > 0.01) {
    if (targetAspect > originalAspect) {
      // Wider target -> crop vertically (top/bottom)
      // keep width same; new height = width / targetAspect
      const keptH = imgDims!.w / targetAspect
      const cropTotal = imgDims!.h - keptH
      const inset = (cropTotal / 2) / imgDims!.h * 100
      cropGuides = { type: 'horizontal', inset1Pct: inset, inset2Pct: 100 - inset }
    } else {
      // Taller/narrower target -> crop horizontally (left/right)
      const keptW = imgDims!.h * targetAspect
      const cropTotal = imgDims!.w - keptW
      const inset = (cropTotal / 2) / imgDims!.w * 100
      cropGuides = { type: 'vertical', inset1Pct: inset, inset2Pct: 100 - inset }
    }
  }
  return (
    <article className="product-layout">
      <div className="product-hero">
        {aura && (
          <span className="product-aura" aria-hidden style={{
            background: `radial-gradient(circle at 50% 50%, rgba(${aura.r},${aura.g},${aura.b},0.35) 0%, rgba(${aura.r},${aura.g},${aura.b},0.18) 45%, rgba(${aura.r},${aura.g},${aura.b},0.08) 70%, transparent 90%)`
          }} />
        )}
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <img 
            src={item.image} 
            alt={item.name} 
            style={{ 
              position: 'relative',
              width: '100%',
              opacity: blackAndWhite && item.imageBW ? 0 : 1,
              transition: 'opacity 0.5s ease'
            }} 
            onLoad={e => {
              const el = e.currentTarget
              if (el.naturalWidth && el.naturalHeight) setImgDims({ w: el.naturalWidth, h: el.naturalHeight })
            }} 
          />
          {item.imageBW && (
            <img 
              src={item.imageBW} 
              alt={`${item.name} (Black & White)`}
              style={{ 
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                opacity: blackAndWhite ? 1 : 0,
                transition: 'opacity 0.5s ease',
                pointerEvents: 'none'
              }}
            />
          )}
        </div>
        {cropGuides && (
          <div className="crop-guides" aria-hidden>
            {cropGuides.type === 'horizontal' ? (
              <>
                <span className="crop-line horizontal" style={{ top: `${cropGuides.inset1Pct}%` }} />
                <span className="crop-line horizontal" style={{ top: `${cropGuides.inset2Pct}%` }} />
                <div className="crop-shade top" style={{ height: `${cropGuides.inset1Pct}%` }} />
                <div className="crop-shade bottom" style={{ top: `${cropGuides.inset2Pct}%`, height: `${100 - cropGuides.inset2Pct}%` }} />
              </>
            ) : (
              <>
                <span className="crop-line vertical" style={{ left: `${cropGuides.inset1Pct}%` }} />
                <span className="crop-line vertical" style={{ left: `${cropGuides.inset2Pct}%` }} />
                <div className="crop-shade left" style={{ width: `${cropGuides.inset1Pct}%` }} />
                <div className="crop-shade right" style={{ left: `${cropGuides.inset2Pct}%`, width: `${100 - cropGuides.inset2Pct}%` }} />
              </>
            )}
          </div>
        )}
      </div>
      <div>
        <h2>{item.name}</h2>
        {item.imageBW && (
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
              <input
                type="checkbox"
                checked={blackAndWhite}
                onChange={(e) => setBlackAndWhite(e.target.checked)}
                style={{ cursor:'pointer' }}
              />
              <span>Black & White</span>
            </label>
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span>Size</span>
          <Dropdown
            value={size}
            onChange={(v) => setSize(v as PrintSize)}
            options={landscapeOptionsIfNeeded(item.id, sizes as readonly string[])}
          />
        </div>
        <p>{new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(priceCents / 100)}</p>
  {item.description && <p style={{ opacity: .9 }}>{item.description}</p>}
        <button className="button" onClick={() => {
          add(item.id, 1, size, blackAndWhite)
        }}>Add to cart</button>
      </div>
    </article>
  )
}
