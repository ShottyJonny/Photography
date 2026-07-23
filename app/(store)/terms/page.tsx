import { Prose } from '@/components/store/Prose'

export const metadata = { title: 'Terms — Jon Hoffman Photography' }

export default function TermsPage() {
  return (
    <Prose title="Terms">
      <p>
        Prices are shown in US dollars. A flat $9.95 shipping charge is added at checkout; the total
        shown there is the amount you pay.
      </p>
      <p>Prints are made to order and ship within the United States only.</p>
      <p>
        All photographs and their copyright remain the property of Jon Hoffman. Buying a print does
        not grant any right to reproduce the image.
      </p>
    </Prose>
  )
}
