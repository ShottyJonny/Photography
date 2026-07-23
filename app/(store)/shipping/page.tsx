import { Prose } from '@/components/store/Prose'

export const metadata = { title: 'Shipping — Jon Hoffman Photography' }

export default function ShippingPage() {
  return (
    <Prose title="Shipping">
      <p>
        Every print is made to order and produced by a professional photographic lab, which ships
        it directly to you.
      </p>
      <p>
        Shipping is a flat $9.95 per order — the same whether you order one print or several. It is
        added at checkout.
      </p>
      <p>
        Most orders take about three to five business days to print, and two to five business days
        in transit.
      </p>
      <p>Prints ship within the United States only for now.</p>
    </Prose>
  )
}
