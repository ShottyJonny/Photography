'use client'

import { useState } from 'react'

/**
 * A clipboard control that reports what actually happened.
 *
 * "Copied" when nothing reached the clipboard is product.md §1's founding
 * defect in miniature — a status that does not reflect reality — and it is a
 * real failure mode here: writeText rejects without a user gesture, in an
 * insecure context, and when permission is denied. On failure it says so, and
 * the text it would have copied stays selectable on the page.
 */
export function CopyButton({
  text,
  label,
  className = 'admin-ghost',
}: {
  text: string
  label: string
  className?: string
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
      return
    }
    window.setTimeout(() => setState('idle'), 2000)
  }

  return (
    <button type="button" className={className} onClick={copy}>
      <span>{label}</span>
      <span className="admin-copy-state" aria-live="polite">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : ''}
      </span>
    </button>
  )
}
