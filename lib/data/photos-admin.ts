import 'server-only'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

export interface AdminPhoto {
  id: string
  slug: string
  title: string
  published: boolean
  derivatives_ready: boolean
  has_bw_variant: boolean
  created_at: string
}

export interface AdminCollection {
  id: string
  name: string
}

const PHOTO_COLS = 'id, slug, title, published, derivatives_ready, has_bw_variant, created_at'

/** null means the read FAILED. An empty array means there are no photographs. */
export async function listPhotos(): Promise<AdminPhoto[] | null> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { data, error } = await db
    .from('photos')
    .select(PHOTO_COLS)
    .order('created_at', { ascending: false })
  // Keyed on `error`, never on falsy data -- slice 4b §4.2. Distinguishing
  // "none" from "unreadable" is the whole point (4b D7).
  if (error) {
    console.error('[admin] listPhotos failed', error)
    return null
  }
  return (data ?? []) as AdminPhoto[]
}

export async function listCollections(): Promise<AdminCollection[] | null> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { data, error } = await db.from('collections').select('id, name').order('name')
  if (error) {
    console.error('[admin] listCollections failed', error)
    return null
  }
  return (data ?? []) as AdminCollection[]
}

export interface EditablePhoto {
  id: string
  slug: string
  title: string
  caption: string | null
  description: string | null
  alt_text: string | null
  published: boolean
}

const EDIT_COLS = 'id, slug, title, caption, description, alt_text, published'

/** null on a missing row OR a read error. The page treats both as not-editable. */
export async function getPhotoForEdit(id: string): Promise<EditablePhoto | null> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { data, error } = await db.from('photos').select(EDIT_COLS).eq('id', id).maybeSingle()
  if (error) {
    console.error('[admin] getPhotoForEdit failed', error)
    return null
  }
  return (data as EditablePhoto | null) ?? null
}
