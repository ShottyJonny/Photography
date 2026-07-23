import { Prose } from '@/components/store/Prose'

export const metadata = { title: 'Privacy — Jon Hoffman Photography' }

export default function PrivacyPage() {
  return (
    <Prose title="Privacy">
      <p>This site collects only what it needs to send you a print.</p>

      <h2>What is collected</h2>
      <p>
        When you place an order, your name, email address, and shipping address are stored so the
        order can be fulfilled.
      </p>

      <h2>Payment</h2>
      <p>
        Payments are handled by Stripe. Card details are entered on Stripe’s checkout and are never
        seen or stored by this site.
      </p>

      <h2>Sharing</h2>
      <p>
        Your name and shipping address are shared with the print lab that fulfills your order,
        Nations Photo Lab, so it can be printed and shipped. Nothing else is shared, and nothing is
        ever sold.
      </p>

      <h2>Tracking</h2>
      <p>
        There is no analytics, no advertising, and no mailing list. Your cart and your light or dark
        preference are stored only in your own browser and are never sent to a server.
      </p>

      <h2>Questions</h2>
      <p>
        Write to{' '}
        <a className="email" href="mailto:jonhoffmanbusiness@gmail.com">
          jonhoffmanbusiness@gmail.com
        </a>
        .
      </p>
    </Prose>
  )
}
