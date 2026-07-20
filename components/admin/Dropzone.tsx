'use client'

import { useId, useRef, useState, type ReactNode } from 'react'

/**
 * The prototype has NO <input type="file"> anywhere in its 729 lines, and no
 * empty state -- it renders the post-upload view only. Both are built here.
 *
 * The drop target is a <div>, NOT a <button>. It has to contain the preview,
 * and the preview contains the crop-size chips -- interactive elements nested
 * inside a button are invalid HTML and a keyboard trap. The file picker is an
 * explicit button instead, which is also the more legible affordance.
 */
export function Dropzone({
  label,
  hint,
  file,
  hasPreview,
  onFile,
  disabled = false,
  children,
}: {
  label: string
  hint: string
  file: File | null
  hasPreview: boolean
  onFile: (file: File | null) => void
  disabled?: boolean
  children?: ReactNode
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOver, setIsOver] = useState(false)

  function take(list: FileList | null) {
    const next = list?.[0] ?? null
    if (!next) {
      onFile(null)
      return
    }

    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/tiff', 'image/webp'])
    if (!allowedTypes.has(next.type)) {
      onFile(null)
      return
    }

    onFile(next)
  }

  return (
    <div
      className={`admin-drop${isOver ? ' is-over' : ''}`}
      onDragOver={(event) => {
        if (disabled) return
        event.preventDefault()
        setIsOver(true)
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        if (disabled) return
        event.preventDefault()
        setIsOver(false)
        take(event.dataTransfer.files)
      }}
    >
      <label className="admin-sr-only" htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        ref={inputRef}
        className="admin-drop-file"
        type="file"
        accept="image/jpeg,image/png,image/tiff,image/webp"
        disabled={disabled}
        onChange={(event) => take(event.target.files)}
      />

      {hasPreview ? (
        children
      ) : file ? (
        <div className="admin-drop-empty">
          <strong>{file.name}</strong>
          <span>{(file.size / 1_048_576).toFixed(1)} MB · no preview for this format</span>
        </div>
      ) : (
        <div className="admin-drop-empty">
          <strong>{label}</strong>
          <span>{hint}</span>
        </div>
      )}

      <button
        type="button"
        className="admin-drop-choose"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {file ? 'Replace ↺' : 'Choose a file'}
      </button>
    </div>
  )
}
