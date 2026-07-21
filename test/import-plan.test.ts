import { describe, it, expect } from 'vitest'
import { planImports } from '@/lib/import/plan'

describe('planImports', () => {
  const files = [
    { basename: 'Grand Ring', colourPath: '/x/Grand Ring.jpg', silverPath: '/x/bw/Grand Ring.jpg' },
    { basename: 'Among Giants', colourPath: '/x/Among Giants.jpg', silverPath: null },
    { basename: 'Never Sleeps', colourPath: '/x/Never Sleeps.jpg', silverPath: null },
  ]

  it('creates files whose slug is not already in the DB', () => {
    const plan = planImports(files, new Set(['among-giants', 'deterioration']))
    const grand = plan.find((p) => p.slug === 'grand-ring')!
    expect(grand.action).toBe('create')
    expect(grand.hasSilver).toBe(true)
  })

  it('skips a file whose slug already exists', () => {
    const plan = planImports(files, new Set(['among-giants']))
    expect(plan.find((p) => p.slug === 'among-giants')!.action).toBe('skip')
  })

  it('derives the slug with the same function ingest uses', () => {
    const plan = planImports(files, new Set())
    expect(plan.map((p) => p.slug)).toEqual(['grand-ring', 'among-giants', 'never-sleeps'])
  })

  it('marks hasSilver only when a silver path is present', () => {
    const plan = planImports(files, new Set())
    expect(plan.find((p) => p.slug === 'grand-ring')!.hasSilver).toBe(true)
    expect(plan.find((p) => p.slug === 'never-sleeps')!.hasSilver).toBe(false)
  })
})
