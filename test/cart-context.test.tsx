import { renderHook, act, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CartProvider, useCart, lineKey, type CartLine } from '@/components/cart/CartContext'

const line = (over: Partial<CartLine> = {}): CartLine => ({
  photoId: 'p1', slug: 'a-photo', title: 'A Photo', altText: 'A photo of something',
  size: '8x10', register: 'colour', qty: 1, ...over,
})

const wrapper = ({ children }: { children: React.ReactNode }) => <CartProvider>{children}</CartProvider>

afterEach(() => { cleanup(); localStorage.clear() })

describe('CartContext', () => {
  it('merges identical (photoId,size,register) lines and bumps qty', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => { result.current.add(line()) })
    act(() => { result.current.add(line()) })
    expect(result.current.lines).toHaveLength(1)
    expect(result.current.lines[0].qty).toBe(2)
  })

  it('keeps different size/register as separate lines', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => { result.current.add(line()) })
    act(() => { result.current.add(line({ size: '4x6' })) })
    act(() => { result.current.add(line({ register: 'silver' })) })
    expect(result.current.lines).toHaveLength(3)
  })

  it('count is the sum of quantities', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => { result.current.add(line()) })
    act(() => { result.current.add(line({ size: '4x6' })) })
    act(() => { result.current.setQty(lineKey(line()), 3) })
    expect(result.current.count).toBe(4)
  })

  it('setQty clamps to 1..100', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => { result.current.add(line()) })
    const k = lineKey(line())
    act(() => { result.current.setQty(k, 0) })
    expect(result.current.lines[0].qty).toBe(1)
    act(() => { result.current.setQty(k, 250) })
    expect(result.current.lines[0].qty).toBe(100)
  })

  it('add clamps a merged qty to 100', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => { result.current.add(line()) })
    act(() => { result.current.setQty(lineKey(line()), 99) })
    act(() => { result.current.add(line({ qty: 5 })) })
    expect(result.current.lines[0].qty).toBe(100)
  })

  it('remove drops the line', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => { result.current.add(line()) })
    act(() => { result.current.remove(lineKey(line())) })
    expect(result.current.lines).toHaveLength(0)
  })

  it('open/close toggles drawer state', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    expect(result.current.isOpen).toBe(false)
    act(() => { result.current.open() })
    expect(result.current.isOpen).toBe(true)
    act(() => { result.current.close() })
    expect(result.current.isOpen).toBe(false)
  })

  it('persists to localStorage and rehydrates', () => {
    const { result, unmount } = renderHook(() => useCart(), { wrapper })
    act(() => { result.current.add(line({ qty: 2 })) })
    unmount()
    const { result: r2 } = renderHook(() => useCart(), { wrapper })
    expect(r2.current.lines).toHaveLength(1)
    expect(r2.current.lines[0].qty).toBe(2)
  })

  it('tolerantly rehydrates a legacy line missing slug/altText', () => {
    localStorage.setItem('cart:v1', JSON.stringify([{ photoId: 'p1', title: 'Old', size: '8x10', register: 'colour', qty: 2 }]))
    const { result } = renderHook(() => useCart(), { wrapper })
    expect(result.current.lines).toHaveLength(1)
    expect(result.current.lines[0]).toMatchObject({ photoId: 'p1', slug: '', altText: '', qty: 2 })
  })

  it('drops corrupt storage without crashing', () => {
    localStorage.setItem('cart:v1', '{not json')
    const { result } = renderHook(() => useCart(), { wrapper })
    expect(result.current.lines).toEqual([])
  })
})
