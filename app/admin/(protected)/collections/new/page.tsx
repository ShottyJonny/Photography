'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createCollection } from '@/lib/admin/collection-actions'

export default function NewCollectionPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function create() {
    start(async () => {
      setError(null)
      const r = await createCollection({ name })
      if (!r.ok) return setError(r.message)
      router.push(`/admin/collections/${r.id}`)
    })
  }

  return (
    <>
      <nav className="admin-crumb" aria-label="Breadcrumb">
        <Link href="/admin/collections">← Collections</Link>
        <span className="admin-crumb-sep" aria-hidden="true">/</span>
        <span className="admin-crumb-here">New collection</span>
      </nav>
      <div className="admin-landing">
        <label className="admin-formfield" htmlFor="new-collection-name">
          <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 9 }}>Name</span>
        </label>
        <input id="new-collection-name" className="admin-input is-title" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 480 }} />
        {error ? <p className="admin-slugnote" role="alert">{error}</p> : null}
        <button type="button" className="admin-btn" disabled={pending || name.trim() === ''} onClick={create}>Create collection</button>
      </div>
    </>
  )
}
