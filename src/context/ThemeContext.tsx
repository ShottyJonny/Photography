import React from 'react'

export type Theme = 'light' | 'dark'

type ThemeContextValue = {
  theme: Theme
  setTheme: (t: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined)

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem('theme:v1') as Theme | null
    if (saved === 'light' || saved === 'dark') return saved
  } catch {}
  const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<Theme>(getInitialTheme)

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('theme:v1', theme) } catch {}
  }, [theme])

  const toggleTheme = React.useCallback(() => {
    setTheme(t => (t === 'light' ? 'dark' : 'light'))
  }, [])

  const value = React.useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, toggleTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
