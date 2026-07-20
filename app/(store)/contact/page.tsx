export const metadata = { title: 'Contact — Jon Hoffman Photography' }

export default function ContactPage() {
  return (
    <main
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '3rem 1.5rem 4rem',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-playfair)',
          fontSize: '2rem',
          fontWeight: 400,
          margin: '0 0 2rem',
          color: 'var(--ink)',
        }}
      >
        Contact
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-newsreader)',
          fontSize: '1.125rem',
          lineHeight: 1.7,
          color: 'var(--dim)',
          margin: '0 0 2rem',
        }}
      >
        If you are interested in a print, a commission, or simply have a question about the work,
        I would be glad to hear from you. Write when you are ready — there is no rush, and every
        enquiry is read personally.
      </p>
      <p style={{ margin: 0 }}>
        <a
          href="mailto:jonhoffmanbusiness@gmail.com"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.875rem',
            letterSpacing: '0.02em',
            color: 'var(--ink)',
          }}
        >
          jonhoffmanbusiness@gmail.com
        </a>
      </p>
    </main>
  )
}
