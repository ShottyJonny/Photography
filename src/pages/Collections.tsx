import React from 'react'
import { collections } from '../data/collections'
import { products } from '../data/products'

function RotatingThumbnail({ collectionProducts, collectionName }: { collectionProducts: any[], collectionName: string }) {
  const [currentIndex, setCurrentIndex] = React.useState(0)

  React.useEffect(() => {
    if (collectionProducts.length <= 1) return
    
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % collectionProducts.length)
    }, 2000) // Change image every 2 seconds

    return () => clearInterval(interval)
  }, [collectionProducts.length])

  const currentProduct = collectionProducts[currentIndex]
  if (!currentProduct) return null

  return (
    <img 
      src={currentProduct.thumbnail || currentProduct.image} 
      alt={collectionName}
      loading="lazy"
      style={{ transition: 'opacity 0.5s ease' }}
    />
  )
}

export default function Collections() {
  return (
    <div className="collections-page">
      <div className="page-hero">
        <h1>Collections</h1>
        <p className="subtitle">Explore curated themes from my photography</p>
      </div>

      <div className="collections-grid">
        {collections.map((collection) => {
          const collectionProducts = products.filter(p => 
            collection.productIds.includes(p.id)
          )
          const imageCount = collectionProducts.length

          return (
            <div 
              key={collection.id} 
              className="collection-card"
              onClick={() => window.location.hash = `#/collection/${collection.id}`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  window.location.hash = `#/collection/${collection.id}`
                }
              }}
            >
              <div className="collection-thumbnail">
                {collectionProducts.length > 0 ? (
                  <RotatingThumbnail collectionProducts={collectionProducts} collectionName={collection.name} />
                ) : (
                  <img 
                    src={collection.thumbnail} 
                    alt={collection.name}
                    loading="lazy"
                  />
                )}
                <div className="collection-overlay">
                  <span className="image-count">{imageCount} {imageCount === 1 ? 'image' : 'images'}</span>
                </div>
              </div>
              <div className="collection-info">
                <h2>{collection.name}</h2>
                <p>{collection.description}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
