'use client'
import { createContext, useContext, useEffect, useState } from 'react'

export type CartLine = { photoId: string; title: string; size: string; register: 'colour' | 'silver'; qty: number }
const Ctx = createContext<{ lines: CartLine[]; add: (l: CartLine) => void; clear: () => void } | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([])
  // Reads localStorage (unavailable during SSR) after mount, so the first client
  // render matches the server-rendered (empty) markup — no hydration mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const s = localStorage.getItem('cart:v1'); if (s) setLines(JSON.parse(s)) }, [])
  useEffect(() => { localStorage.setItem('cart:v1', JSON.stringify(lines)) }, [lines])
  return <Ctx.Provider value={{ lines, add: (l) => setLines((p) => [...p, l]), clear: () => setLines([]) }}>{children}</Ctx.Provider>
}
export function useCart() { const c = useContext(Ctx); if (!c) throw new Error('useCart outside provider'); return c }
