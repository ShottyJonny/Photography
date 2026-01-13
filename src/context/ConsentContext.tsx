import React from 'react'

export type ConsentState = {
  analytics: boolean
  marketing: boolean
  necessary: boolean
}

const defaultConsent: ConsentState = { analytics: false, marketing: false, necessary: true }

function load(): ConsentState | null {
  try {
    const raw = localStorage.getItem('consent:v1')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function save(state: ConsentState) {
  try { localStorage.setItem('consent:v1', JSON.stringify(state)) } catch {}
}

export const ConsentContext = React.createContext<{
  consent: ConsentState | null
  setConsent: (next: ConsentState) => void
  update: (patch: Partial<ConsentState>) => void
} | null>(null)

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsentState] = React.useState<ConsentState | null>(() => load())

  const setConsent = React.useCallback((next: ConsentState) => {
    setConsentState(next)
    save(next)
  }, [])

  const update = React.useCallback((patch: Partial<ConsentState>) => {
    setConsentState(prev => {
      const next = { ...(prev || defaultConsent), ...patch }
      save(next)
      return next
    })
  }, [])

  const value = React.useMemo(() => ({ consent, setConsent, update }), [consent, setConsent, update])
  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
}

export function useConsent() {
  const ctx = React.useContext(ConsentContext)
  if (!ctx) throw new Error('useConsent must be used within ConsentProvider')
  return ctx
}
