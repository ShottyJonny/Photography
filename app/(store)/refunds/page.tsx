import { Prose } from '@/components/store/Prose'

export const metadata = { title: 'Refunds — Jon Hoffman Photography' }

export default function RefundsPage() {
  return (
    <Prose title="Refunds">
      <p>
        Because each print is made to order, an order cannot be returned or refunded for a change
        of mind.
      </p>
      <p>
        If a print arrives damaged or defective, it will be replaced. Email{' '}
        <a className="email" href="mailto:jonhoffmanbusiness@gmail.com">
          jonhoffmanbusiness@gmail.com
        </a>{' '}
        within two weeks of delivery with a photo of the damage. Keep the packaging — a photo of it
        may be needed too.
      </p>
    </Prose>
  )
}
