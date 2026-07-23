import { Prose } from '@/components/store/Prose'

export const metadata = { title: 'About — Jon Hoffman Photography' }

export default function AboutPage() {
  return (
    <Prose title="About">
      {/* DRAFT copy — Jon to replace with his own words. Portrait added later. */}
      <p>
        I photograph the quiet places that light passes through. Each print is made to order and
        sent from a professional lab — if a piece speaks to you, it can hang on your wall.
      </p>
    </Prose>
  )
}
