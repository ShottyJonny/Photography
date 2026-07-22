import 'server-only'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

export interface AdminCollectionRow {
  id: string; slug: string; name: string
  count: number; featured_on_home: boolean; coverSlug: string | null
}
export interface AdminMember { id: string; slug: string; title: string; published: boolean; position: number }
export interface AdminCollectionDetail {
  id: string; slug: string; name: string; dek: string | null; literature: string | null
  cover_photo_id: string | null; featured_on_home: boolean; members: AdminMember[]
}
export interface AddablePhoto { id: string; slug: string; title: string; published: boolean }

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function listCollectionsAdmin(): Promise<AdminCollectionRow[] | null> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { data: cols, error } = await db
    .from('collections')
    .select('id, slug, name, featured_on_home, cover_photo_id, position')
    .order('position', { ascending: true })
  if (error) { console.error('[admin] listCollectionsAdmin', error); return null }

  const { data: joins } = await db.from('collection_photos').select('collection_id')
  const counts = new Map<string, number>()
  for (const j of (joins as any[]) ?? []) counts.set(j.collection_id, (counts.get(j.collection_id) ?? 0) + 1)

  // cover slug: resolve cover_photo_id -> photos.slug for the ones that have a cover
  const coverIds = (cols as any[]).map((c) => c.cover_photo_id).filter(Boolean)
  const coverSlug = new Map<string, string>()
  if (coverIds.length) {
    const { data: photos } = await db.from('photos').select('id, slug').in('id', coverIds)
    for (const p of (photos as any[]) ?? []) coverSlug.set(p.id, p.slug)
  }

  return (cols as any[]).map((c) => ({
    id: c.id, slug: c.slug, name: c.name,
    featured_on_home: c.featured_on_home,
    count: counts.get(c.id) ?? 0,
    coverSlug: c.cover_photo_id ? coverSlug.get(c.cover_photo_id) ?? null : null,
  }))
}

export async function getCollectionForEdit(id: string): Promise<AdminCollectionDetail | null> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { data: col, error } = await db
    .from('collections')
    .select('id, slug, name, dek, literature, cover_photo_id, featured_on_home')
    .eq('id', id)
    .maybeSingle()
  if (error) { console.error('[admin] getCollectionForEdit', error); return null }
  if (!col) return null

  const { data: rows } = await db
    .from('collection_photos')
    .select('position, photos!inner(id, slug, title, published)')
    .eq('collection_id', id)
    .order('position', { ascending: true })

  const members: AdminMember[] = ((rows as any[]) ?? []).map((r) => ({
    id: r.photos.id, slug: r.photos.slug, title: r.photos.title,
    published: r.photos.published, position: r.position,
  }))
  return { ...(col as any), members }
}

export async function listAddablePhotos(collectionId: string): Promise<AddablePhoto[] | null> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { data: members } = await db.from('collection_photos').select('photo_id').eq('collection_id', collectionId)
  const inSet = new Set(((members as any[]) ?? []).map((m) => m.photo_id))
  const { data: photos, error } = await db.from('photos').select('id, slug, title, published').order('created_at', { ascending: false })
  if (error) { console.error('[admin] listAddablePhotos', error); return null }
  return ((photos as any[]) ?? []).filter((p) => !inSet.has(p.id)).map((p) => ({ id: p.id, slug: p.slug, title: p.title, published: p.published }))
}
