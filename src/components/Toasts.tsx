import React from 'react'
import { createPortal } from 'react-dom'
import { useToast } from '../context/ToastContext'

export default function Toasts(){
  const { toasts, remove } = useToast()
  const [closingIds, setClosingIds] = React.useState<Set<string>>(new Set())
  
  const handleDismiss = (id: string) => {
    setClosingIds(prev => new Set(prev).add(id))
    // Allow animation to complete before removing
    setTimeout(() => {
      remove(id)
      setClosingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 300)
  }
  
  if (toasts.length === 0) return null
  
  const content = (
    <div className="toasts-container" role="status" aria-live="polite">
      {toasts.map(t => (
        <div 
          key={t.id} 
          className={`toast ${t.type ?? 'info'} ${closingIds.has(t.id) ? 'closing' : ''}`}
          onClick={() => handleDismiss(t.id)}
        >
          <span className="toast-message">{t.message}</span>
          <button 
            type="button" 
            className="toast-dismiss"
            onClick={(e) => {
              e.stopPropagation()
              handleDismiss(t.id)
            }}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
  
  // Render toasts directly to document.body using portal
  // This bypasses the #root transform issue
  return createPortal(content, document.body)
}
