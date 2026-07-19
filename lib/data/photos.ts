import 'server-only'
import { unstable_cache } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'

export interface Photo {
  id: string
  slug: string
  title: string
  caption: string | null
  description: string | null
  alt_text: string | null
  aspect_ratio: number | null
  width_px: number | null
  height_px: number | null
  has_bw_variant: boolean
}

const COLS = 'id, slug, title, caption, description, alt_text, aspect_ratio, width_px, height_px, has_bw_variant'

export const getPublishedPhotos = unstable_cache(
  async (): Promise<Photo[]> => {
    const { data } = await supabaseServer()
      .from('photos')
      .select(COLS)
      .eq('published', true)
      .order('created_at', { ascending: true })
    return (data ?? []) as Photo[]
  },
  ['published-photos'],
  { tags: ['photos'], revalidate: 3600 },
)

export function getPhotoBySlug(slug: string): Promise<Photo | null> {
  return unstable_cache(
    async (): Promise<Photo | null> => {
      const { data } = await supabaseServer()
        .from('photos')
        .select(COLS)
        .eq('slug', slug)
        .eq('published', true)
        .maybeSingle()
      return (data as Photo) ?? null
    },
    ['photo', slug],
    { tags: ['photos', `photo:${slug}`], revalidate: 3600 },
  )()
}
