'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePhoto } from '@/lib/admin/photo-actions'
import type { EditablePhoto } from '@/lib/data/photos-admin'

export function EditForm({ photo }: { photo: EditablePhoto }) {
  const router = useRouter()
  const [title, setTitle] = useState(photo.title)
  const [caption, setCaption] = useState(photo.caption ?? '')
  const [description, setDescription] = useState(photo.description ?? '')
  const [altText, setAltText] = useState(photo.alt_text ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Emptying alt on a published photo would violate the DB constraint; block Save.
  const altBlocksPublished = photo.published && altText.trim() === ''
  const canSave = title.trim() !== '' && !altBlocksPublished && !busy

  async function save() {
    setBusy(true)
    setMessage(null)
    const result = await updatePhoto({
      photoId: photo.id,
      title,
      caption: caption.trim() || null,
      description: description.trim() || null,
      altText: altText.trim() || null,
    })
    if (!result.ok) {
      setMessage(result.message)
      setBusy(false)
      return
    }
    router.push('/admin/photographs')
    router.refresh()
  }

  return (
    <div className="admin-form" style={{ maxWidth: 640, padding: '34px 40px 40px' }}>
      <div className="admin-formfield">
        <label htmlFor="edit-title">Title</label>
        <input id="edit-title" className="admin-input is-title" value={title} disabled={busy}
          onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="admin-formfield">
        <label htmlFor="edit-slug">Web address</label>
        <input id="edit-slug" className="admin-input is-slug" value={photo.slug} readOnly disabled />
        <p className="admin-slugnote">/prints/{photo.slug} — can’t be changed; the stored files are named after it.</p>
      </div>

      <div className="admin-formfield">
        <label htmlFor="edit-caption">
          Caption<span className="admin-formhint">short line on the card</span>
        </label>
        <input id="edit-caption" className="admin-input is-prose" value={caption} disabled={busy}
          onChange={(e) => setCaption(e.target.value)} />
      </div>

      <div className="admin-formfield">
        <label htmlFor="edit-description">
          Description<span className="admin-formhint">the print’s page</span>
        </label>
        <textarea id="edit-description" className="admin-input is-prose-long" value={description}
          disabled={busy} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="admin-formfield">
        <label htmlFor="edit-alt">
          Alt text<span className="admin-formhint is-a11y">describes the image — accessibility</span>
        </label>
        <textarea id="edit-alt" className="admin-input is-alt" value={altText} disabled={busy}
          onChange={(e) => setAltText(e.target.value)} />
      </div>

      {altBlocksPublished ? (
        <p className="admin-slugnote">Alt text is required while published. Unpublish to clear it.</p>
      ) : null}

      <div className="admin-actions">
        <button type="button" className="admin-btn is-wide" disabled={!canSave} onClick={save}>Save</button>
        <button type="button" className="admin-btn2" disabled={busy}
          onClick={() => router.push('/admin/photographs')}>Cancel</button>
      </div>

      {message ? <p className="admin-slugnote" role="alert">{message}</p> : null}
    </div>
  )
}
