import React from 'react'
import { useToast } from '../context/ToastContext'

export default function Toasts(){
  const { toasts, remove } = useToast()
  if (toasts.length === 0) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type ?? 'info'}`} onClick={() => remove(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
