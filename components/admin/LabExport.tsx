'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CopyButton } from '@/components/admin/CopyButton'
import { setLabFinish } from '@/lib/admin/order-actions'

/**
 * design.md §11.4-E's export panel. The block itself is built server-side by
 * lib/orders/lab-export.ts and passed down whole, so what Jon reads on screen
 * and what lands on the clipboard are the same string by construction.
 *
 * The finish is a text field, not a select: Nations' surface/paper vocabulary
 * is unconfirmed (product.md §6.2), and a dropdown of invented options would
 * encode a guess into a sheet pasted into their real order form.
 */
export function LabExport({
  orderId,
  block,
  finish,
}: {
  orderId: string
  block: string
  finish: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [value, setValue] = useState(finish)
  const [notice, setNotice] = useState<string | null>(null)

  function save() {
    start(async () => {
      setNotice(null)
      const result = await setLabFinish({ id: orderId, finish: value })
      if (!result.ok) setNotice(result.message)
      else router.refresh()
    })
  }

  return (
    <section className="admin-ord-export" aria-labelledby="lab-export-head">
      <h2 className="admin-sectionhead" id="lab-export-head">
        Nations Photo Lab export
      </h2>

      <div className="admin-ord-finish">
        <label className="admin-ord-finish-label" htmlFor="lab-finish">Finish</label>
        <input
          id="lab-finish"
          className="admin-ord-finish-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
        />
        <button type="button" className="admin-ghost" onClick={save} disabled={pending || value === finish}>
          Save finish
        </button>
      </div>
      {notice ? <p className="admin-ord-error" role="alert">{notice}</p> : null}

      <pre className="admin-ord-block">{block}</pre>

      <div className="admin-ord-exportfoot">
        <CopyButton text={block} label="Copy block" className="admin-btn" />
        {/* The block carries storage KEYS, not signed URLs: it gets pasted and
            may sit for hours, and an expired link inside a document Jon trusts
            is worse than no link. The per-item download links are beside the
            line items, minted fresh on each render. */}
        <p className="admin-ord-note">
          Paste into Nations&rsquo; order form. Download links are on the line items, not in the block.
        </p>
      </div>
    </section>
  )
}
