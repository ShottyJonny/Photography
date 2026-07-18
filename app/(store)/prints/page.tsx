import { supabaseServer } from '@/lib/supabase/server'
import { AddToCart } from '@/components/cart/AddToCart'

// Slice 1: rendered per-request so the build needs no live Supabase/env. Proper ISR +
// tagged fetches + revalidate-on-publish land in the storefront slice (spec §7).
export const dynamic = 'force-dynamic'

export default async function Prints() {
  const { data: photos } = await supabaseServer()
    .from('photos').select('id, slug, title, has_bw_variant').eq('published', true)
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontFamily: 'var(--font-playfair)' }}>Prints</h1>
      <ul>
        {(photos ?? []).map((p) => (
          <li key={p.id}>{p.title} <AddToCart photoId={p.id} title={p.title} hasBw={p.has_bw_variant} /></li>
        ))}
      </ul>
    </main>
  )
}
