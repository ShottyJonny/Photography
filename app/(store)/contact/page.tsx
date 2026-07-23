import { Prose } from '@/components/store/Prose'

export const metadata = { title: 'Contact — Jon Hoffman Photography' }

export default function ContactPage() {
  return (
    <Prose title="Contact">
      <p>
        If you are interested in a print, a commission, or simply have a question about the work,
        I would be glad to hear from you. Write when you are ready — there is no rush, and every
        enquiry is read personally.
      </p>
      <p>
        <a className="email" href="mailto:jonhoffmanbusiness@gmail.com">
          jonhoffmanbusiness@gmail.com
        </a>
      </p>
    </Prose>
  )
}
