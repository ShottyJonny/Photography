import React, { createContext, useContext } from 'react'

export type Toast = {
  id: string
  message: string
  type?: 'info' | 'success' | 'error'
  timeout?: number
}

const ToastCtx = createContext<{
  toasts: Toast[]
  show: (message: string, opts?: { type?: Toast['type']; timeout?: number }) => void
  remove: (id: string) => void
}>({ toasts: [], show: () => {}, remove: () => {} })

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const remove = (id: string) => setToasts((t) => t.filter((x) => x.id !== id))
  const show = (message: string, opts?: { type?: Toast['type']; timeout?: number }) => {
    const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    const toast: Toast = { id, message, type: opts?.type ?? 'success', timeout: opts?.timeout ?? 2400 }
    setToasts((t) => [...t, toast])
    window.setTimeout(() => remove(id), toast.timeout)
  }

  const value = React.useMemo(() => ({ toasts, show, remove }), [toasts])
  return <ToastCtx.Provider value={value}>{children}</ToastCtx.Provider>
}

export function useToast() { return useContext(ToastCtx) }
