import 'server-only'
import { unstable_cache } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'

export interface CollectionCard {
  slug: string
  name: string
  dek: string | null
  coverSlug: string | null
  coverAlt: string | null
  count: number
}
export interface PhotoInCollection {
  id: string
  slug: string
  title: string
  alt_text: string | null
  aspect_ratio: number | null
  width_px: number | null
  height_px: number | null
  has_bw_variant: boolean
  position: number
}
export interface CollectionDetail {
  slug: string
  name: string
  dek: string | null
  literature: string | null
  cover: { slug: string; alt: string | null } | null
  photos: PhotoInCollection[]
}

async function loadDetail(slug: string): Promise<CollectionDetail | null> {
  const db = supabaseServer()
  const { data: col } = await db
    .from('collections')
    .select('slug, name, dek, literature, id, cover_photo_id')
    .eq('slug', slug)
    .maybeSingle()
  if (!col) return null
  const { data: rows } = await db
    .from('collection_photos')
    .select('position, photos!inner(id, slug, title, alt_text, aspect_ratio, width_px, height_px, has_bw_variant, published)')
    .eq('collection_id', col.id)
    .order('position', { ascending: true })
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const photos = (rows ?? [])
    .map((r: any) => ({ ...r.photos, position: r.position }))
    .filter((p: any) => p.published)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- omit published from API shape
    .map(({ published, ...p }: any) => p) as PhotoInCollection[]
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const coverPhoto = col.cover_photo_id ? photos.find((p) => p.id === col.cover_photo_id) : undefined
  const cover = coverPhoto ?? photos[0]
  return {
    slug: col.slug,
    name: col.name,
    dek: col.dek,
    literature: col.literature,
    cover: cover ? { slug: cover.slug, alt: cover.alt_text } : null,
    photos,
  }
}

export const getCollections = unstable_cache(
  async (): Promise<CollectionCard[]> => {
    const { data: cols } = await supabaseServer()
      .from('collections')
      .select('slug, name, dek, cover_photo_id, position')
      .order('position', { ascending: true })
    const cards: CollectionCard[] = []
    for (const c of cols ?? []) {
      const detail = await loadDetail(c.slug)
      if (!detail || detail.photos.length === 0) continue
      cards.push({
        slug: detail.slug,
        name: detail.name,
        dek: detail.dek,
        coverSlug: detail.cover?.slug ?? null,
        coverAlt: detail.cover?.alt ?? null,
        count: detail.photos.length,
      })
    }
    return cards
  },
  ['collections'],
  { tags: ['collections'], revalidate: 3600 },
)

export async function getCollectionBySlug(slug: string): Promise<CollectionDetail | null> {
  const d = await loadDetail(slug)
  return d && d.photos.length > 0 ? d : null
}

export async function getFeaturedCollection(): Promise<CollectionDetail | null> {
  const { data: col } = await supabaseServer()
    .from('collections')
    .select('slug')
    .eq('featured_on_home', true)
    .maybeSingle()
  if (!col) return null
  return getCollectionBySlug(col.slug)
}
