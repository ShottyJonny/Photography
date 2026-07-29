import { listCollectionsForFeature } from '@/lib/data/collections-admin'
import { HomeFeaturePicker } from '@/components/admin/HomeFeaturePicker'

export const dynamic = 'force-dynamic'

export default async function HomeFeaturePage() {
  const candidates = await listCollectionsForFeature()
  return (
    <>
      <div className="admin-band">
        <div>
          <p className="admin-band-kicker">What the home page opens on</p>
          <h1 className="admin-band-h1">Home feature</h1>
        </div>
      </div>
      {candidates === null ? (
        // D7-style honest failure: no picker rather than an empty radio list that
        // would read as "no collections exist".
        <p className="admin-empty">Couldn’t read the collections. Nothing is shown rather than guessed.</p>
      ) : (
        <HomeFeaturePicker candidates={candidates} />
      )}
    </>
  )
}
