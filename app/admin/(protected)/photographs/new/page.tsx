import Link from 'next/link'
import { listCollections } from '@/lib/data/photos-admin'
import { IngestForm } from '@/components/admin/IngestForm'

export const dynamic = 'force-dynamic'

export default async function NewPhotographPage() {
  // listCollections calls requireAdmin() first — the boundary is the data
  // access layer, never the layout (slice 4a §3.1).
  const collections = await listCollections()

  return (
    <>
      <nav className="admin-crumb" aria-label="Breadcrumb">
        <Link href="/admin/photographs">← Photographs</Link>
        <span className="admin-crumb-sep" aria-hidden="true">/</span>
        <span className="admin-crumb-here">New photograph</span>
      </nav>
      <IngestForm collections={collections ?? []} />
    </>
  )
}
