import React from 'react'
import { products } from '../data/products'
import { usePricing } from '../context/PricingContext'
import { ProductCard } from '../components/ProductCard'
import Dropdown from '../components/Dropdown'

type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc'

export default function Shop() {
  const { priced } = usePricing()
  const [sort, setSort] = React.useState<SortKey>('featured')
  const [rand, setRand] = React.useState(() => [...priced])

  // If global prices change, reset controls
  React.useEffect(() => {
    setRand([...priced])
    setSort('featured')
  }, [priced])

  const visible = React.useMemo(() => {
    let list = rand
    switch (sort) {
      case 'price-asc':
        list = [...list].sort((a, b) => a.price - b.price)
        break
      case 'price-desc':
        list = [...list].sort((a, b) => b.price - a.price)
        break
      case 'name-asc':
        list = [...list].sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'name-desc':
        list = [...list].sort((a, b) => b.name.localeCompare(a.name))
        break
      default:
  // featured: keep current default order
        break
    }
    return list
  }, [rand, sort])

  // reset control removed

  return (
    <div className="shop">
      <h2>Shop Prints</h2>
      <div className="shop-toolbar" role="region" aria-label="Filters and sorting">
        <div className="field">
          <label htmlFor="sort">Sort by</label>
          <Dropdown id="sort" value={sort} onChange={(v) => setSort(v as SortKey)} options={[
            { value: 'featured', label: 'Featured' },
            { value: 'price-asc', label: 'Price: Low to High' },
            { value: 'price-desc', label: 'Price: High to Low' },
            { value: 'name-asc', label: 'Name: A → Z' },
            { value: 'name-desc', label: 'Name: Z → A' },
          ]} />
        </div>
        {/* Max price slider removed */}
        <div className="spacer" />
        <div className="actions" />
      </div>
      <div className="grid">
        {visible.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  )
}

// no-op shuffle removed
