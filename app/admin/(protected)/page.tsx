import Link from 'next/link'
import { getDashboard } from '@/lib/admin/dashboard'
import { formatKicker, greetingFor } from '@/lib/admin/dates'
import { StatTile } from '@/components/admin/StatTile'
import { QueueRow } from '@/components/admin/QueueRow'
import { MarkedButton, MarkedLink } from '@/components/admin/MarkedControl'

function unlistedSub(n: number): string {
  if (n === 0) return 'none unlisted'
  return `${n} unlisted`
}

export default async function AdminDashboard() {
  // getDashboard() calls requireAdmin() as its first statement — the boundary
  // lives there, not in the layout.
  const result = await getDashboard()
  const now = new Date()

  return (
    <>
      <div className="admin-band">
        <div>
          <p className="admin-band-kicker">{formatKicker(now)}</p>
          <h1 className="admin-band-h1">{greetingFor(now)}</h1>
        </div>
        <MarkedButton label="＋ Post a photo" className="admin-btn admin-marked" />
      </div>

      {!result.ok ? (
        // D7 — four tiles reading 0 when the read failed is a confident lie
        // about an empty business. No numbers, and no empty-state copy either,
        // because that would also be a claim.
        <div className="admin-tiles">
          <p className="admin-empty">
            Couldn&rsquo;t read the studio data. The numbers aren&rsquo;t shown rather than guessed.
          </p>
        </div>
      ) : (
        <>
          <div className="admin-tiles">
            <StatTile label="In the queue" value={result.summary.queueCount} sub="paid · awaiting the lab" />
            <StatTile
              label="Needs attention"
              value={result.summary.attentionCount}
              sub="amount mismatch — quarantined"
              alert={result.summary.attentionCount > 0}
            />
            <StatTile
              label="Published works"
              value={result.summary.publishedCount}
              sub={unlistedSub(result.summary.unlistedCount)}
            />
            <StatTile
              label="Collections"
              value={result.summary.collectionCount}
              sub={
                result.summary.featuredCollectionName
                  ? `${result.summary.featuredCollectionName} is featured`
                  : 'no collection is featured'
              }
            />
          </div>

          <div className="admin-cols">
            <section>
              <h2 className="admin-sectionhead">
                Fulfillment queue · oldest first
                <MarkedLink label="All orders →" />
              </h2>
              <ul className="admin-queue">
                {result.queue.length === 0 ? (
                  <li className="admin-empty">Nothing awaiting the lab.</li>
                ) : (
                  result.queue.map((order) => <QueueRow key={order.id} order={order} />)
                )}
              </ul>

              {/* D15 — §11.4-A has no tabs, so an inline mismatch row would
                  contradict the tile count directly above it. */}
              {result.held.length > 0 ? (
                <>
                  <h2 className="admin-sectionhead">Held out of the queue</h2>
                  <ul className="admin-queue">
                    {result.held.map((order) => <QueueRow key={order.id} order={order} held />)}
                  </ul>
                </>
              ) : null}
            </section>

            <aside className="admin-rail">
              <div className="admin-railcard">
                <h2 className="admin-sectionhead">
                  Home focal point
                  <Link href="/admin/home-feature" className="admin-sectionhead-link">Change what leads home →</Link>
                </h2>
                {result.summary.featuredCollectionName ? (
                  // No plate: cover_photo_id is nullable and no derivative
                  // pipeline exists until slice 5.
                  <p className="admin-railcard-name">{result.summary.featuredCollectionName}</p>
                ) : (
                  <p className="admin-empty">No collection leads home yet.</p>
                )}
              </div>

              <div className="admin-railcard">
                <h2 className="admin-sectionhead">Recent uploads</h2>
                {result.summary.publishedCount + result.summary.unlistedCount === 0 ? (
                  <p className="admin-empty">No photographs yet.</p>
                ) : (
                  // Photographs exist but this surface cannot show them yet:
                  // getDashboard() does not select titles and there is no
                  // derivative pipeline until slice 5. Marked like every other
                  // unbuilt control rather than filled with roadmap jargon — a
                  // heading promising content it cannot deliver breaks
                  // product.md §1's "says less instead of guessing".
                  <MarkedLink label="Recent uploads" />
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </>
  )
}
