import { listCollectionsAdmin } from '@/lib/data/collections-admin'
import { CollectionList } from '@/components/admin/CollectionList'

export const dynamic = 'force-dynamic'

export default async function CollectionsPage() {
  const collections = await listCollectionsAdmin()
  return (
    <>
      <div className="admin-band">
        <div>
          <p className="admin-band-kicker">The library</p>
          <h1 className="admin-band-h1">Collections</h1>
          <p className="admin-meta">{collections === null ? 'Count unavailable' : `${collections.length} ${collections.length === 1 ? 'collection' : 'collections'}`}</p>
        </div>
      </div>
      <CollectionList collections={collections} activeId={null} />
    </>
  )
}
