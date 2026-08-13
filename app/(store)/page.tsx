import { HomeHero } from '@/components/store/HomeHero'
import { pullQuote } from '@/lib/collections/pull-quote'
import { getFeaturedCollection } from '@/lib/data/collections'

export const dynamic = 'force-dynamic'

function EmptyHome() {
  return (
    <main className="home-empty">
      <p>Coming soon.</p>
      <style>{`
        .home-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: calc(100vh - 5rem);
          padding: 3rem 1.5rem;
        }
        .home-empty p {
          margin: 0;
          font-family: var(--font-newsreader);
          font-size: 1.125rem;
          font-style: italic;
          color: var(--dim);
        }
      `}</style>
    </main>
  )
}

export default async function Home() {
  const featured = await getFeaturedCollection()
  if (!featured || featured.photos.length === 0) {
    return <EmptyHome />
  }

  const coverIdx = featured.photos.findIndex((p) => p.slug === featured.cover?.slug)

  return (
    <HomeHero
      photos={featured.photos}
      initialIndex={coverIdx >= 0 ? coverIdx : 0}
      collectionSlug={featured.slug}
      collectionName={featured.name}
      quote={pullQuote(featured.dek, featured.literature)}
    />
  )
}
