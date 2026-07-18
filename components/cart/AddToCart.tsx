'use client'
import { useState } from 'react'
import { useCart } from './CartContext'

const SIZES = ['4x6', '5x7', '8x10', '11x14', '12x16', '16x20', '20x30']
export function AddToCart({ photoId, title, hasBw }: { photoId: string; title: string; hasBw: boolean }) {
  const { add } = useCart()
  const [size, setSize] = useState('8x10')
  const [register, setRegister] = useState<'colour' | 'silver'>('colour')
  return (
    <span>
      <select value={size} onChange={(e) => setSize(e.target.value)}>{SIZES.map((s) => <option key={s}>{s}</option>)}</select>
      <select value={register} onChange={(e) => setRegister(e.target.value as 'colour' | 'silver')} disabled={!hasBw}>
        <option value="colour">colour</option>{hasBw && <option value="silver">silver</option>}
      </select>
      <button onClick={() => add({ photoId, title, size, register, qty: 1 })}>Add</button>
    </span>
  )
}
