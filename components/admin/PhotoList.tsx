'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { generateRegister, finishIngest, setPublished, deletePhoto } from '@/lib/ingest/actions'
import type { AdminPhoto } from '@/lib/data/photos-admin'

/**
 * Slice 5a's landing. Deliberately plain and explicitly NOT design.md §11.4-B
 * -- slice 5b replaces it wholesale with the work-card grid, filter chips and
 * counts, exactly as 4b replaced 4a's placeholder.
 *
 * `photos === null` means the READ FAILED. Rendering "No photographs yet" then
 * would be a confident lie about an empty library (slice 4b D7).
 */
export function PhotoList({ photos }: { photos: AdminPhoto[] | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<string | null>(null)

  if (photos === null) {
    return (
      <p className="admin-empty">
        Couldn’t read the photographs. Nothing is shown rather than guessed.
      </p>
    )
  }

  if (photos.length === 0) {
    return <p className="admin-empty">No photographs yet.</p>
  }

  function publish(photo: AdminPhoto, next: boolean) {
    startTransition(async () => {
      setNotice(null)
      const result = await setPublished({ photoId: photo.id, published: next })
      if (!result.ok) setNotice(result.message)
      else router.refresh()
    })
  }

  function remove(photo: AdminPhoto) {
    // Deleting destroys the original the lab export pulls (product.md §6.2), so
    // it is confirmed, and the server refuses independently of this dialog.
    if (!window.confirm(`Delete “${photo.title}” and its stored files? This can’t be undone.`)) return
    startTransition(async () => {
      setNotice(null)
      const result = await deletePhoto({ photoId: photo.id })
      if (!result.ok) setNotice(result.message)
      else router.refresh()
    })
  }

  /**
   * MANIFEST-DRIVEN, not blind (spec §8). finishIngest already returns the
   * `missing` key list, so ask it first and regenerate only the registers that
   * actually have gaps. Re-running both unconditionally costs a needless ~15s
   * colour re-encode when only silver failed.
   */
  function retry(photo: AdminPhoto) {
    startTransition(async () => {
      setNotice(null)

      const probe = await finishIngest({ photoId: photo.id, publish: false })
      if (probe.ok) {
        setNotice('Every size was already present. It’s still a draft.')
        return router.refresh()
      }

      const missing = probe.missing ?? []
      if (missing.length === 0) return setNotice(probe.message)

      const registers = (['colour', 'silver'] as const).filter((r) =>
        missing.some((key) => key.includes(`/${r}/`)),
      )
      for (const register of registers) {
        const step = await generateRegister({ photoId: photo.id, register })
        if (!step.ok) return setNotice(step.message)
      }

      const done = await finishIngest({ photoId: photo.id, publish: false })
      if (!done.ok) return setNotice(done.message)
      setNotice('Every size is present now. It’s still a draft.')
      router.refresh()
    })
  }

  return (
    <>
      {notice ? <p className="admin-empty" role="status">{notice}</p> : null}
      <ul className="admin-photolist">
        {photos.map((photo) => (
          <li key={photo.id} className="admin-photorow">
            <div>
              <div className="admin-photorow-title">{photo.title}</div>
              <div className="admin-photorow-sub">
                /prints/{photo.slug}
                {photo.has_bw_variant ? ' · colour + silver' : ' · colour'}
              </div>
            </div>
            <Link className="admin-btn2" href={`/admin/photographs/${photo.id}/edit`}>Edit</Link>
            {photo.derivatives_ready ? (
              <span className={`admin-status ${photo.published ? 'is-live' : 'is-draft'}`}>
                {photo.published ? 'Published' : 'Draft'}
              </span>
            ) : (
              <span className="admin-status is-incomplete">Derivatives incomplete</span>
            )}
            {photo.derivatives_ready ? (
              <span />
            ) : (
              <button type="button" className="admin-btn2" disabled={pending} onClick={() => retry(photo)}>
                Retry
              </button>
            )}
            <span className="admin-photorow-actions">
              {photo.published ? (
                // Unpublish exists BECAUSE deletePhoto's refusal says "Unpublish
                // it first" -- error copy may not name an action the system does
                // not offer (product.md §1).
                <button type="button" className="admin-btn2" disabled={pending} onClick={() => publish(photo, false)}>
                  Unpublish
                </button>
              ) : (
                <>
                  {/* Publish only when the ladder is complete -- a control that would
                      only ever refuse should not appear (product.md §1). The alt-text
                      requirement is enforced by setPublished, surfaced as a notice. */}
                  {photo.derivatives_ready ? (
                    <button type="button" className="admin-btn" disabled={pending} onClick={() => publish(photo, true)}>
                      Publish
                    </button>
                  ) : null}
                  <button type="button" className="admin-btn2" disabled={pending} onClick={() => remove(photo)}>
                    Delete
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
