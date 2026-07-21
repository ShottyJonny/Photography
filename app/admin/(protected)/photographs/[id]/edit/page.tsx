import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPhotoForEdit } from '@/lib/data/photos-admin'
import { EditForm } from '@/components/admin/EditForm'

export const dynamic = 'force-dynamic'

export default async function EditPhotographPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // getPhotoForEdit calls requireAdmin() first — the boundary is the DAL (4a §3.1).
  const photo = await getPhotoForEdit(id)
  if (!photo) notFound()

  return (
    <>
      <nav className="admin-crumb" aria-label="Breadcrumb">
        <Link href="/admin/photographs">← Photographs</Link>
        <span className="admin-crumb-sep" aria-hidden="true">/</span>
        <span className="admin-crumb-here">Edit</span>
      </nav>
      <EditForm photo={photo} />
    </>
  )
}
