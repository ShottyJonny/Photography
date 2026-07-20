'use client'
import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'
const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark') // dark is the default (design.md §12.2)
  // Reads localStorage (unavailable during SSR) after mount, so the first client
  // render matches the server-rendered ('dark') markup — no hydration mismatch.
  // Known theme-flash tracked in CLAUDE.md roadmap (pre-hydration script, slice 2).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTheme((localStorage.getItem('theme:v1') as Theme | null) ?? 'dark') }, [])
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('theme:v1', theme) }, [theme])
  return (
    <Ctx.Provider value={{ theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }}>
      {children}
    </Ctx.Provider>
  )
}
export function useTheme() { return useContext(Ctx) }
