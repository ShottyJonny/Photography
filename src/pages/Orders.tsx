import React from 'react'
import LinkButton from '../components/LinkButton'

type SavedOrder = {
  id: string
  createdAt: string
  totals: { total: number }
  payment?: { status?: string }
}

export default function Orders() {
  const [orders, setOrders] = React.useState<SavedOrder[]>([])
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('orders:v1')
      const list = raw ? (JSON.parse(raw) as SavedOrder[]) : []
      setOrders([...list].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    } catch {
      setOrders([])
    }
  }, [])

  if (orders.length === 0) return (
    <div className="about">
      <section>
        <h2>My Orders</h2>
        <p>No orders found. Orders are stored locally in your browser and may not be available if you've cleared your browser data or are using a different device.</p>
        <p style={{fontSize: '.85rem', opacity: 0.7, marginTop: 12}}>
          For order inquiries, please contact us with your Order ID from your email confirmation.
        </p>
        <LinkButton className="button" to="/shop">Go to Shop</LinkButton>
      </section>
    </div>
  )

  return (
    <div className="about">
      <section>
        <h2>My Orders</h2>
        <ul className="summary-list">
          {orders.map(o => (
            <li key={o.id} className="summary-line">
              <div className="info">
                <div className="name">Order {o.id}</div>
                <div className="meta">{new Date(o.createdAt).toLocaleString()}</div>
              </div>
              <div className="price">{fmt(o.totals?.total || 0)}</div>
              <div>
                <LinkButton className="button" to={`/order/${o.id}`}>View</LinkButton>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function fmt(cents: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100)
}
