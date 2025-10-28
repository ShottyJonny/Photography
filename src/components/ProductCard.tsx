import { Product } from '../data/products'
import { useCart } from '../context/CartContext'
import LinkButton, { navigate } from './LinkButton'
import React from 'react'
import { averageColor } from '../utils/color'
import { displaySize } from '../utils/sizeDisplay'

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart()
  const [aura, setAura] = React.useState<{ r:number; g:number; b:number } | null>(null)
  React.useEffect(() => {
    let cancelled = false
    averageColor(product.thumbnail || product.image).then(c => { if (!cancelled) setAura(c) }).catch(() => setAura(null))
    return () => { cancelled = true }
  }, [product.id, product.image, product.thumbnail])
  return (
    <article className="product-card">
      <div className="card-grid">
        <button type="button" className="card-link" onClick={() => navigate(`/product/${product.id}`)} style={{position:'relative'}}>
          {aura && (
            <span className="thumb-aura" aria-hidden style={{
              background: `radial-gradient( circle at 50% 50%, rgba(${aura.r},${aura.g},${aura.b},0.34) 0%, rgba(${aura.r},${aura.g},${aura.b},0.18) 45%, rgba(${aura.r},${aura.g},${aura.b},0.08) 70%, transparent 90%)`
            }} />
          )}
          <img src={product.thumbnail || product.image} alt={product.name} loading="lazy" />
        </button>
        <div className="card-body">
          <h3>
            <button type="button" className="title-link" onClick={() => navigate(`/product/${product.id}`)}>
              {product.name}
            </button>
          </h3>
          {product.description && (
            <p className="desc">{product.description}</p>
          )}
          <p className="price">{formatPrice(product.price)}</p>
          <div className="actions">
            <LinkButton to={`/product/${product.id}`} className="button">View Details</LinkButton>
            <button className="button" onClick={() => add(product.id, 1)}>Add to cart</button>
          </div>
        </div>
      </div>
    </article>
  )
}

function formatPrice(cents: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100)
}
