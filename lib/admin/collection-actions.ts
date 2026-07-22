'use server'

import { revalidateTag } from 'next/cache'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import { deriveSlug } from '@/lib/ingest/slug'

export type Result = { ok: true } | { ok: false; message: string }

function blank(v: string | null): boolean { return v === null || v.trim() === '' }
function clean(v: string | null): string | null { return blank(v) ? null : v!.trim() }

function revalidateCollections(): void {
  revalidateTag('collections', 'max')
}

export async function createCollection(input: { name: string }): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  await requireAdmin()
  if (blank(input.name)) return { ok: false, message: 'A name is required.' }
  const slug = deriveSlug(input.name)
  if (!slug) return { ok: false, message: 'That name has no usable web address.' }

  const db = await createAuthServerClient()
  const { data: existing } = await db.from('collections').select('id').eq('slug', slug).maybeSingle()
  if (existing) return { ok: false, message: 'A collection already uses that web address.' }

  const { data: last } = await db.from('collections').select('position').order('position', { ascending: false }).limit(1).maybeSingle()
  const position = (((last as { position?: number } | null)?.position) ?? 0) + 1

  const { data: row, error } = await db
    .from('collections')
    .insert({ slug, name: input.name.trim(), position })
    .select()
    .single()
  if (error || !row) return { ok: false, message: 'Couldn’t create the collection.' }

  revalidateCollections()
  return { ok: true, id: (row as { id: string }).id }
}

export async function updateCollectionMeta(input: { id: string; name: string; slug: string; dek: string | null }): Promise<Result> {
  await requireAdmin()
  if (blank(input.name)) return { ok: false, message: 'A name is required.' }
  // Public POST guard (slice 4a §3.2): slug must be the canonical derivation of itself.
  if (!input.slug || deriveSlug(input.slug) !== input.slug) {
    return { ok: false, message: 'That web address isn’t usable. Use letters, numbers and hyphens.' }
  }

  const db = await createAuthServerClient()
  const { data: clash } = await db.from('collections').select('id').eq('slug', input.slug).maybeSingle()
  if (clash && (clash as { id: string }).id !== input.id) {
    return { ok: false, message: 'Another collection already uses that web address.' }
  }

  const { error } = await db.from('collections').update({ name: input.name.trim(), slug: input.slug, dek: clean(input.dek) }).eq('id', input.id)
  if (error) return { ok: false, message: 'Couldn’t save the collection.' }
  revalidateCollections()
  return { ok: true }
}

export async function updateLiterature(input: { id: string; literature: string | null }): Promise<Result> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { error } = await db.from('collections').update({ literature: clean(input.literature) }).eq('id', input.id)
  if (error) return { ok: false, message: 'Couldn’t save the literature.' }
  revalidateCollections()
  return { ok: true }
}

export async function deleteCollection(input: { id: string }): Promise<Result> {
  await requireAdmin()
  const db = await createAuthServerClient()
  // collection_photos cascade-deletes (schema). Photos are untouched.
  const { error } = await db.from('collections').delete().eq('id', input.id)
  if (error) return { ok: false, message: 'Couldn’t delete the collection.' }
  revalidateCollections()
  return { ok: true }
}

export async function addPhotos(input: { collectionId: string; photoIds: string[] }): Promise<Result> {
  await requireAdmin()
  if (input.photoIds.length === 0) return { ok: true }
  const db = await createAuthServerClient()
  const { data: last } = await db
    .from('collection_photos')
    .select('position')
    .eq('collection_id', input.collectionId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  let position = (((last as { position?: number } | null)?.position) ?? -1) + 1
  const rows = input.photoIds.map((photo_id) => ({ collection_id: input.collectionId, photo_id, position: position++ }))
  const { error } = await db.from('collection_photos').insert(rows)
  if (error) return { ok: false, message: 'Couldn’t add the works.' }
  revalidateCollections()
  return { ok: true }
}

export async function removePhoto(input: { collectionId: string; photoId: string }): Promise<Result> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { error } = await db.from('collection_photos').delete().eq('collection_id', input.collectionId).eq('photo_id', input.photoId)
  if (error) return { ok: false, message: 'Couldn’t remove the work.' }
  // If it was the cover, clear the cover.
  const { data: col } = await db.from('collections').select('cover_photo_id').eq('id', input.collectionId).maybeSingle()
  if ((col as { cover_photo_id?: string } | null)?.cover_photo_id === input.photoId) {
    await db.from('collections').update({ cover_photo_id: null }).eq('id', input.collectionId)
  }
  revalidateCollections()
  return { ok: true }
}

export async function reorderPhotos(input: { collectionId: string; orderedPhotoIds: string[] }): Promise<Result> {
  await requireAdmin()
  const db = await createAuthServerClient()
  // The ordered set must be EXACTLY the current membership — no adds/drops smuggled in.
  const { data: members } = await db.from('collection_photos').select('photo_id').eq('collection_id', input.collectionId)
  const current = new Set(((members as { photo_id: string }[]) ?? []).map((m) => m.photo_id))
  const given = new Set(input.orderedPhotoIds)
  // Array length too, not just Set membership — a payload like [a,b,a] has the
  // same Set as {a,b} but its duplicate would join two rows in the RPC's unnest.
  if (input.orderedPhotoIds.length !== current.size || current.size !== given.size || [...current].some((id) => !given.has(id))) {
    return { ok: false, message: 'The order doesn’t match the collection’s works.' }
  }
  const { error } = await db.rpc('reorder_collection_photos', { p_collection: input.collectionId, p_ordered: input.orderedPhotoIds })
  if (error) return { ok: false, message: 'Couldn’t save the order.' }
  revalidateCollections()
  return { ok: true }
}

export async function setCover(input: { collectionId: string; photoId: string | null }): Promise<Result> {
  await requireAdmin()
  const db = await createAuthServerClient()
  const { error } = await db.from('collections').update({ cover_photo_id: input.photoId }).eq('id', input.collectionId)
  if (error) return { ok: false, message: 'Couldn’t set the cover.' }
  revalidateCollections()
  return { ok: true }
}
