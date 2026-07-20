import Link from 'next/link'
import { listPhotos } from '@/lib/data/photos-admin'
import { PhotoList } from '@/components/admin/PhotoList'

export const dynamic = 'force-dynamic'

export default async function PhotographsPage() {
  const photos = await listPhotos()
  const count = photos?.length ?? 0

  return (
    <>
      {/*
        .admin-band is `display:flex; justify-content:space-between` (globals.css).
        It needs exactly TWO children or everything lays out in a row -- match
        app/admin/(protected)/page.tsx, which wraps its kicker and h1 in a div.
      */}
      <div className="admin-band">
        <div>
          <p className="admin-band-kicker">The library</p>
          <h1 className="admin-band-h1">Photographs</h1>
          <p className="admin-meta">
            {photos === null ? 'Count unavailable' : `${count} ${count === 1 ? 'work' : 'works'}`}
          </p>
        </div>
        <Link className="admin-btn" href="/admin/photographs/new">＋ Post a photo</Link>
      </div>
      <PhotoList photos={photos} />
    </>
  )
}
