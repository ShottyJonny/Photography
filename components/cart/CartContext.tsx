'use client'
import { createContext, useContext, useEffect, useState } from 'react'

export type CartLine = {
  photoId: string
  slug: string
  title: string
  altText: string
  size: string
  register: 'colour' | 'silver'
  qty: number
}

const MAX_QTY = 100
const STORAGE_KEY = 'cart:v1'

export function lineKey(l: Pick<CartLine, 'photoId' | 'size' | 'register'>): string {
  return `${l.photoId}|${l.size}|${l.register}`
}

function clampQty(n: number): number {
  return Math.min(MAX_QTY, Math.max(1, Math.trunc(n)))
}

// Tolerant rehydrate: corrupt/non-array storage → empty; per-line coercion with defaults so a
// legacy slice-1 line (no slug/altText) degrades instead of crashing.
function parseStored(raw: string | null): CartLine[] {
  if (!raw) return []
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(parsed)) return []
  const out: CartLine[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.photoId !== 'string' || typeof o.size !== 'string') continue
    if (o.register !== 'colour' && o.register !== 'silver') continue
    if (typeof o.qty !== 'number' || !Number.isFinite(o.qty) || o.qty < 1) continue
    out.push({
      photoId: o.photoId,
      slug: typeof o.slug === 'string' ? o.slug : '',
      title: typeof o.title === 'string' ? o.title : '',
      altText: typeof o.altText === 'string' ? o.altText : '',
      size: o.size,
      register: o.register,
      qty: clampQty(o.qty),
    })
  }
  return out
}

type CartValue = {
  lines: CartLine[]
  count: number
  add: (l: CartLine) => void
  remove: (key: string) => void
  setQty: (key: string, n: number) => void
  clear: () => void
  isOpen: boolean
  open: () => void
  close: () => void
}

const Ctx = createContext<CartValue | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [isOpen, setIsOpen] = useState(false)

  // Read localStorage after mount so the first client render matches the SSR (empty) markup — no
  // hydration mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLines(parseStored(localStorage.getItem(STORAGE_KEY))) }, [])
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(lines)) }, [lines])

  function add(line: CartLine) {
    const key = lineKey(line)
    setLines((prev) => {
      const idx = prev.findIndex((l) => lineKey(l) === key)
      if (idx === -1) return [...prev, { ...line, qty: clampQty(line.qty) }]
      const next = [...prev]
      next[idx] = { ...next[idx], qty: Math.min(MAX_QTY, next[idx].qty + line.qty) }
      return next
    })
  }
  function remove(key: string) {
    setLines((prev) => prev.filter((l) => lineKey(l) !== key))
  }
  function setQty(key: string, n: number) {
    const q = clampQty(n)
    setLines((prev) => prev.map((l) => (lineKey(l) === key ? { ...l, qty: q } : l)))
  }
  function clear() { setLines([]) }

  const count = lines.reduce((sum, l) => sum + l.qty, 0)

  return (
    <Ctx.Provider
      value={{
        lines, count, add, remove, setQty, clear,
        isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false),
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useCart() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useCart outside provider')
  return c
}
