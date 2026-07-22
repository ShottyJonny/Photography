'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { WorksList } from '@/components/admin/WorksList'
import { LiteratureEditor } from '@/components/admin/LiteratureEditor'
import { PhotoPicker } from '@/components/admin/PhotoPicker'
import {
  updateCollectionMeta, updateLiterature, addPhotos, removePhoto, reorderPhotos, setCover, deleteCollection,
} from '@/lib/admin/collection-actions'
import type { AdminCollectionDetail, AddablePhoto } from '@/lib/data/collections-admin'
import { deriveSlug } from '@/lib/ingest/slug'

export function CollectionEditor({ detail, addable }: { detail: AdminCollectionDetail; addable: AddablePhoto[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [name, setName] = useState(detail.name)
  const [slug, setSlug] = useState(detail.slug)
  const [dek, setDek] = useState(detail.dek ?? '')
  const [literature, setLiterature] = useState(detail.literature ?? '')
  const [notice, setNotice] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    start(async () => { setNotice(null); const r = await fn(); if (!r.ok) setNotice(r.message ?? 'Something went wrong.'); else router.refresh() })
  }

  function save() {
    run(async () => {
      const meta = await updateCollectionMeta({ id: detail.id, name, slug, dek: dek.trim() || null })
      if (!meta.ok) return meta
      return updateLiterature({ id: detail.id, literature: literature.trim() || null })
    })
  }

  return (
    <div className="admin-col-editor">
      {notice ? <p className="admin-empty" role="alert">{notice}</p> : null}
      <div className="admin-col-edithead">
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input className="admin-col-title" value={name} aria-label="Collection name" onChange={(e) => setName(e.target.value)} />
            {detail.featured_on_home ? <span className="admin-col-featured">Featured on home</span> : null}
          </div>
          <div className="admin-col-subhead">{detail.members.length} {detail.members.length === 1 ? 'photograph' : 'photographs'}</div>
          <input className="admin-col-slug" value={slug} aria-label="Web address"
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-'))}
            onBlur={(e) => setSlug(deriveSlug(e.target.value))} />
          <p className="admin-col-slugnote">/collections/{slug || '…'} — changing this changes the public address and breaks existing links.</p>
        </div>
        <button type="button" className="admin-btn" disabled={pending} onClick={save}>Save collection</button>
      </div>

      <div className="admin-col-body">
        <div>
          <WorksList
            members={detail.members} coverId={detail.cover_photo_id}
            onReorder={(ids) => run(() => reorderPhotos({ collectionId: detail.id, orderedPhotoIds: ids }))}
            onSetCover={(id) => run(() => setCover({ collectionId: detail.id, photoId: id === detail.cover_photo_id ? null : id }))}
            onRemove={(id) => run(() => removePhoto({ collectionId: detail.id, photoId: id }))}
          />
          {picking ? (
            <PhotoPicker options={addable}
              onAdd={(ids) => { setPicking(false); run(() => addPhotos({ collectionId: detail.id, photoIds: ids })) }}
              onClose={() => setPicking(false)} />
          ) : (
            <button type="button" className="admin-col-add" onClick={() => setPicking(true)}>＋ Add works</button>
          )}
        </div>
        <LiteratureEditor name={name} dek={dek} literature={literature} onDek={setDek} onLiterature={setLiterature} />
      </div>

      <div className="admin-actions" style={{ marginTop: 24 }}>
        <button type="button" className="admin-btn2" disabled={pending}
          onClick={() => { if (window.confirm(`Delete “${name}”? Its photographs are not deleted.`)) run(async () => { const r = await deleteCollection({ id: detail.id }); if (r.ok) router.push('/admin/collections'); return r }) }}>
          Delete collection
        </button>
      </div>
    </div>
  )
}
