import React, { createContext, useContext, useMemo, useReducer } from 'react'
import { getRecommendedSize } from '../utils/recommendedSize'

type CartItem = { uid: string; id: string; qty: number; size?: string }

type State = { items: CartItem[] }

type Action =
  | { type: 'add'; id: string; size?: string }
  | { type: 'remove'; uid: string }
  | { type: 'update'; uid: string; qty?: number; size?: string }
  | { type: 'clear' }

const CartCtx = createContext<{
  items: CartItem[]
  add: (id: string, qty?: number, size?: string) => void
  remove: (uid: string) => void
  update: (uid: string, qty?: number, size?: string) => void
  clear: () => void
}>({ items: [], add: () => {}, remove: () => {}, update: () => {}, clear: () => {} })

type Persisted = { items: CartItem[] }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'add': {
      const uid = genId()
      // Use recommended size based on aspect ratio if no size specified
      const size = action.size || getRecommendedSize(action.id)
      return { items: [...state.items, { uid, id: action.id, qty: 1, size }] }
    }
    case 'remove': {
      return { items: state.items.filter((i) => i.uid !== action.uid) }
    }
    case 'update': {
      return { items: state.items.map(i => i.uid === action.uid ? { ...i, qty: action.qty ?? i.qty, size: action.size ?? i.size } : i) }
    }
    case 'clear':
      return { items: [] }
    default:
      return state
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    try {
      const raw = localStorage.getItem('cart:v1')
      if (raw) {
        const parsed = JSON.parse(raw) as Persisted
        if (Array.isArray(parsed.items)) {
          // migrate items without uid
          const items = parsed.items.map((i: any) => ({
            uid: i.uid || genId(),
            id: i.id,
            qty: i.qty ?? 1,
            size: i.size,
            // frame & mat removed in new model; legacy data ignored
          }))
          return { items }
        }
      }
    } catch {}
    return { items: [] }
  })
  // persist
  React.useEffect(() => {
    const data: Persisted = { items: state.items }
    try {
      localStorage.setItem('cart:v1', JSON.stringify(data))
    } catch {}
  }, [state.items])
  const value = useMemo(
    () => ({
      items: state.items,
      add: (id: string, qty: number = 1, size?: string) => {
        // Use recommended size if none provided
        const finalSize = size || getRecommendedSize(id)
        for (let i = 0; i < Math.max(1, qty); i++) dispatch({ type: 'add', id, size: finalSize })
      },
      remove: (uid: string) => dispatch({ type: 'remove', uid }),
      update: (uid: string, qty?: number, size?: string) => dispatch({ type: 'update', uid, qty, size }),
      clear: () => dispatch({ type: 'clear' }),
    }),
    [state.items]
  )
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>
}

export function useCart() {
  return useContext(CartCtx)
}

function genId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try { return (crypto as any).randomUUID() } catch {}
  }
  return `l_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
