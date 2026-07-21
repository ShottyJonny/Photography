'use server'

import { revalidateTag } from 'next/cache'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

export interface UpdatePhotoInput {
  photoId: string
  title: string
  caption: string | null
  description: string | null
  altText: string | null
}
export type UpdateResult = { ok: true } | { ok: false; message: string }

function blank(v: string | null): boolean {
  return v === null || v.trim() === ''
}

export async function updatePhoto(input: UpdatePhotoInput): Promise<UpdateResult> {
  await requireAdmin()

  if (blank(input.title)) {
    return { ok: false, message: 'A title is required.' }
  }

  const db = await createAuthServerClient()

  const { data: current, error: readErr } = await db
    .from('photos')
    .select('slug, published')
    .eq('id', input.photoId)
    .maybeSingle()
  if (readErr || !current) {
    return { ok: false, message: 'That photograph no longer exists.' }
  }
  const row = current as { slug: string; published: boolean }

  // The DB enforces this too (alt_text_required_when_published). Checking here
  // gives a plain message instead of a raw constraint error.
  if (row.published && blank(input.altText)) {
    return { ok: false, message: 'A published photograph needs alt text. Unpublish it first to clear it.' }
  }

  // Trim every field, and normalise blank optionals to null. updatePhoto is a
  // public POST endpoint, so a raw caller can send untrimmed values the form
  // would have cleaned.
  const clean = (v: string | null): string | null => (blank(v) ? null : v!.trim())

  const { error } = await db
    .from('photos')
    .update({
      title: input.title.trim(),
      caption: clean(input.caption),
      description: clean(input.description),
      alt_text: clean(input.altText),
    })
    .eq('id', input.photoId)
  if (error) {
    return { ok: false, message: 'Couldn’t save the changes.' }
  }

  revalidateTag('photos', 'max')
  revalidateTag(`photo:${row.slug}`, 'max')
  revalidateTag('collections', 'max')
  return { ok: true }
}
