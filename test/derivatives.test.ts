import { it, expect, beforeAll } from 'vitest'

beforeAll(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co' })

it('builds keyed srcset for both formats', async () => {
  const { derivativeSrcSet, derivativeSrc } = await import('@/lib/images/derivatives')
  expect(derivativeSrc('relic', 'silver', 600, 'webp')).toBe(
    'https://x.supabase.co/storage/v1/object/public/derivatives/relic/silver/600.webp',
  )
  const set = derivativeSrcSet('relic', 'colour', 'avif')
  expect(set).toContain('/relic/colour/160.avif 160w')
  expect(set).toContain('/relic/colour/1800.avif 1800w')
})
