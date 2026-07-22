import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCollectionForEdit, listAddablePhotos } from '@/lib/data/collections-admin'
import { CollectionEditor } from '@/components/admin/CollectionEditor'

export const dynamic = 'force-dynamic'

export default async function CollectionEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getCollectionForEdit(id)
  if (!detail) notFound()
  const addable = (await listAddablePhotos(id)) ?? []
  return (
    <>
      <nav className="admin-crumb" aria-label="Breadcrumb">
        <Link href="/admin/collections">← Collections</Link>
        <span className="admin-crumb-sep" aria-hidden="true">/</span>
        <span className="admin-crumb-here">{detail.name}</span>
      </nav>
      <CollectionEditor detail={detail} addable={addable} />
    </>
  )
}
