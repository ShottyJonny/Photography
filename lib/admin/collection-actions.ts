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
