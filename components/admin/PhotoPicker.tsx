'use client'

import { useState } from 'react'
import type { AddablePhoto } from '@/lib/data/collections-admin'

export function PhotoPicker({ options, onAdd, onClose }: { options: AddablePhoto[]; onAdd: (ids: string[]) => void; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  function toggle(id: string) {
    // if/else, not a ternary-for-side-effect: the ternary trips
    // @typescript-eslint/no-unused-expressions (a 0-warning gate failure).
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  return (
    <div className="admin-col-picker" role="dialog" aria-label="Add works">
      {options.length === 0 ? (
        <p className="admin-empty">Every photograph is already in this collection.</p>
      ) : (
        <ul className="admin-col-pickerlist">
          {options.map((p) => (
            <li key={p.id}>
              <label className="admin-col-pickeritem">
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                <span>{p.title}{!p.published ? <span className="admin-col-draft">DRAFT</span> : null}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="admin-actions">
        <button type="button" className="admin-btn" disabled={selected.size === 0} onClick={() => onAdd([...selected])}>Add</button>
        <button type="button" className="admin-btn2" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
