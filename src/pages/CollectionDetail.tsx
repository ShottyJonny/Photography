import React from 'react'
import { collections } from '../data/collections'
import { ProductCard } from '../components/ProductCard'
import { usePricing } from '../context/PricingContext'

interface CollectionDetailProps {
  collectionId: string
}

export default function CollectionDetail({ collectionId }: CollectionDetailProps) {
  const collection = collections.find(c => c.id === collectionId)
  const { priced } = usePricing()

  if (!collection) {
    return (
      <div className="page-hero">
        <h1>Collection Not Found</h1>
        <p>The collection you're looking for doesn't exist.</p>
        <button 
          className="btn btn-primary" 
          onClick={() => window.location.hash = '/collections'}
          style={{ marginTop: 24 }}
        >
          Back to Collections
        </button>
      </div>
    )
  }

  const collectionProducts = priced.filter(p => 
    collection.productIds.includes(p.id)
  )

  return (
    <div className="collection-detail-page">
      <div className="page-hero">
        <button 
          className="back-link"
          onClick={() => window.location.hash = '/collections'}
        >
          ← Back to Collections
        </button>
        <h1>{collection.name}</h1>
        <p className="subtitle">{collection.description}</p>
        <p className="image-count-large">{collectionProducts.length} {collectionProducts.length === 1 ? 'photograph' : 'photographs'}</p>
      </div>

      {collection.literature && (
        <div className="collection-literature-section">
          <div className="literature-content">
            {collection.literature.split('\n\n').map((paragraph, idx) => (
              <p key={idx}>{paragraph}</p>
            ))}
          </div>
          <div className="film-roll">
            <div className="film-perforation top"></div>
            <div className="film-frames">
              {collectionProducts.map((product, idx) => (
                <div 
                  key={idx} 
                  className="film-frame"
                  onClick={() => window.location.hash = `#/product/${product.id}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      window.location.hash = `#/product/${product.id}`
                    }
                  }}
                  title={product.name}
                >
                  <img src={product.thumbnail || product.image} alt={product.name} />
                </div>
              ))}
            </div>
            <div className="film-perforation bottom"></div>
          </div>
        </div>
      )}

      <div className="shop-grid">
        {collectionProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {collectionProducts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', opacity: 0.6 }}>
          <p>No products in this collection yet.</p>
        </div>
      )}
    </div>
  )
}
