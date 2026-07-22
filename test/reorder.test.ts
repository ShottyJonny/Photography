import { describe, it, expect } from 'vitest'
import { applyReorder } from '@/lib/reorder'

describe('applyReorder', () => {
  it('moves an item down', () => {
    expect(applyReorder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })
  it('moves an item up', () => {
    expect(applyReorder(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })
  it('is a no-op when from === to', () => {
    expect(applyReorder(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
  })
  it('handles the boundaries', () => {
    expect(applyReorder(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(applyReorder(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })
  it('does not mutate the input', () => {
    const input = ['a', 'b', 'c']
    applyReorder(input, 0, 2)
    expect(input).toEqual(['a', 'b', 'c'])
  })
})
