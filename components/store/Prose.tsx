export function Prose({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <main className="prose">
      <h1 className="prose-title">{title}</h1>
      <div className="prose-body">{children}</div>
      <style>{`
        .prose {
          max-width: 640px;
          margin: 0 auto;
          padding: 3rem 1.5rem 4rem;
        }
        .prose-title {
          font-family: var(--font-playfair);
          font-size: 2rem;
          font-weight: 400;
          margin: 0 0 2rem;
          color: var(--ink);
        }
        .prose-body {
          font-family: var(--font-newsreader);
          font-size: 1.125rem;
          line-height: 1.7;
          color: var(--dim);
        }
        .prose-body h2 {
          font-family: var(--font-playfair);
          font-size: 1.25rem;
          font-weight: 400;
          color: var(--ink);
          margin: 2.5rem 0 0.75rem;
        }
        .prose-body p {
          margin: 0 0 1.5rem;
        }
        .prose-body a {
          color: var(--ink);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .prose-body a.email {
          font-family: var(--font-mono);
          font-size: 0.875rem;
          letter-spacing: 0.02em;
          text-decoration: none;
        }
      `}</style>
    </main>
  )
}
