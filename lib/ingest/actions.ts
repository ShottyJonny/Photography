'use server'

import { revalidateTag } from 'next/cache'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import { deriveSlug } from '@/lib/ingest/slug'
import {
  DERIVATIVES_BUCKET,
  ORIGINALS_BUCKET,
  originalKey,
  type Register,
} from '@/lib/ingest/keys'
import { expectedObjects } from '@/lib/ingest/plan'
import { extensionFor, validateDimensions, validateUpload } from '@/lib/ingest/validate'
import { encodeLadder, measure } from '@/lib/ingest/process'
import type {
  BeginInput, BeginResult, DeleteResult, DraftInput, DraftResult, FinishResult,
  SignedTarget, StepResult,
} from '@/lib/ingest/types'

/**
 * Invalidate every cache the storefront reads a photo through (product.md §8 q5).
 *
 * The second argument is REQUIRED in Next 16.2 -- verified in
 * next/dist/server/web/spec-extension/revalidate.d.ts:
 *   revalidateTag(tag: string, profile: string | CacheLifeConfig): undefined
 * Calling it with one argument is a typecheck error, and at runtime Next warns
 * that the one-arg form is deprecated.
 */
function revalidatePhoto(slug: string): void {
  revalidateTag('photos', 'max')
  revalidateTag(`photo:${slug}`, 'max')
  revalidateTag('collections', 'max')
}

export async function beginIngest(input: BeginInput): Promise<BeginResult> {
  await requireAdmin()

  // The slug must be the canonical derivation of ITSELF. A Server Action is a
  // reachable public POST endpoint (slice 4a §3.2), so a hand-crafted request
  // could otherwise smuggle `../` or an uppercase segment into a storage path.
  if (!input.slug || deriveSlug(input.slug) !== input.slug) {
    return { ok: false, message: 'That web address isn’t usable. Use letters, numbers and hyphens.' }
  }

  const colour = validateUpload(input.colour)
  if (!colour.ok) return { ok: false, message: colour.message }
  if (input.silver) {
    const silver = validateUpload(input.silver)
    if (!silver.ok) return { ok: false, message: silver.message }
  }

  const db = await createAuthServerClient()

  const { data: existing } = await db.from('photos').select('id').eq('slug', input.slug).maybeSingle()
  if (existing) {
    return { ok: false, message: 'A photograph already uses that web address. Change the title or the address.' }
  }

  const declared: { register: Register; mime: string }[] = [
    { register: 'colour', mime: input.colour.mime },
    ...(input.silver ? [{ register: 'silver' as const, mime: input.silver.mime }] : []),
  ]

  const targets: SignedTarget[] = []
  for (const { register, mime } of declared) {
    const bucketPath = originalKey(input.slug, register, extensionFor(mime))
    const { data, error } = await db.storage.from(ORIGINALS_BUCKET).createSignedUploadUrl(bucketPath, { upsert: true })
    if (error || !data) {
      return { ok: false, message: 'Couldn’t start the upload. Nothing was saved.' }
    }
    targets.push({ register, bucketPath, token: data.token })
  }

  return { ok: true, targets }
}

export async function createPhotoDraft(input: DraftInput): Promise<DraftResult> {
  await requireAdmin()
  const db = await createAuthServerClient()

  // Paths come from beginIngest verbatim -- see DraftInput's note. Re-deriving
  // them here from a filename is how a .jpeg upload 404s on read-back.
  const { colourPath, silverPath } = input

  // Download the colour original once, to measure it and to enforce MIN_WIDTH
  // before any row exists. Costs one extra download (generateRegister pulls it
  // again) and buys: an invalid file never becomes a row.
  const { data: blob, error: downloadError } = await db.storage.from(ORIGINALS_BUCKET).download(colourPath)
  if (downloadError || !blob) {
    return { ok: false, message: 'The uploaded file couldn’t be read back. Try the upload again.' }
  }

  let measured
  try {
    measured = await measure(Buffer.from(await blob.arrayBuffer()))
  } catch {
    return { ok: false, message: 'That file couldn’t be read as an image.' }
  }

  const dimensions = validateDimensions(measured.widthPx)
  if (!dimensions.ok) {
    // Leave nothing behind: no row, and no orphaned original.
    const orphans = silverPath ? [colourPath, silverPath] : [colourPath]
    await db.storage.from(ORIGINALS_BUCKET).remove(orphans)
    return { ok: false, message: dimensions.message }
  }

  const { data: row, error } = await db
    .from('photos')
    .insert({
      slug: input.slug,
      title: input.title,
      caption: input.caption,
      description: input.description,
      alt_text: input.altText,
      aspect_ratio: measured.aspectRatio,
      width_px: measured.widthPx,
      height_px: measured.heightPx,
      aura: measured.aura,
      published: false,
      derivatives_ready: false,
      has_bw_variant: silverPath !== null,
      original_key: colourPath,
      original_bw_key: silverPath,
    })
    .select()
    .single()

  if (error || !row) {
    return { ok: false, message: 'Couldn’t save the photograph. Nothing was published.' }
  }

  if (input.collectionId) {
    // Appended at the end. Editorial reordering is product.md §5.3's point and
    // belongs to slice 6; this only files the photo somewhere.
    const { data: last } = await db
      .from('collection_photos')
      .select('position')
      .eq('collection_id', input.collectionId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()
    const position = ((last as { position?: number } | null)?.position ?? 0) + 1
    await db.from('collection_photos').insert({
      collection_id: input.collectionId,
      photo_id: row.id,
      position,
    })
  }

  return {
    ok: true,
    photoId: row.id as string,
    widthPx: measured.widthPx,
    heightPx: measured.heightPx,
    aspectRatio: measured.aspectRatio,
  }
}

export async function generateRegister(input: {
  photoId: string
  register: Register
}): Promise<StepResult> {
  await requireAdmin()
  const db = await createAuthServerClient()

  const { data: photo } = await db
    .from('photos')
    .select('slug, original_key, original_bw_key')
    .eq('id', input.photoId)
    .maybeSingle()
  if (!photo) return { ok: false, message: 'That photograph no longer exists.' }

  const row = photo as { slug: string; original_key: string | null; original_bw_key: string | null }
  const path = input.register === 'colour' ? row.original_key : row.original_bw_key
  if (!path) return { ok: false, message: `There is no ${input.register} original to work from.` }

  const { data: blob, error: downloadError } = await db.storage.from(ORIGINALS_BUCKET).download(path)
  if (downloadError || !blob) {
    return { ok: false, message: 'Couldn’t read the original back from storage.' }
  }

  let objects
  try {
    objects = await encodeLadder(Buffer.from(await blob.arrayBuffer()), row.slug, input.register)
  } catch {
    return { ok: false, message: `Couldn’t generate the ${input.register} sizes.` }
  }

  for (const object of objects) {
    const { error } = await db.storage
      .from(DERIVATIVES_BUCKET)
      .upload(object.key, object.body, { contentType: object.contentType, upsert: true })
    if (error) {
      // Partial is fine and expected: the photo stays a draft and Retry diffs
      // the manifest, so only what is missing is redone.
      return { ok: false, message: `Couldn’t store the ${input.register} sizes.` }
    }
  }

  return { ok: true }
}

export async function finishIngest(input: {
  photoId: string
  publish: boolean
}): Promise<FinishResult> {
  await requireAdmin()
  const db = await createAuthServerClient()

  const { data: photo } = await db
    .from('photos')
    .select('slug, alt_text, has_bw_variant')
    .eq('id', input.photoId)
    .maybeSingle()
  if (!photo) return { ok: false, message: 'That photograph no longer exists.' }

  const row = photo as { slug: string; alt_text: string | null; has_bw_variant: boolean }

  // Verify against the bucket, never against "we think we uploaded them".
  const registers: Register[] = row.has_bw_variant ? ['colour', 'silver'] : ['colour']
  const present = new Set<string>()
  for (const register of registers) {
    const prefix = `${row.slug}/${register}`
    const { data: listed } = await db.storage.from(DERIVATIVES_BUCKET).list(prefix)
    for (const entry of listed ?? []) present.add(`${prefix}/${entry.name}`)
  }
  const missing = expectedObjects(row.slug, row.has_bw_variant).filter((key) => !present.has(key))
  if (missing.length > 0) {
    return {
      ok: false,
      message: `${missing.length} of the required sizes are missing. The photograph stays a draft.`,
      missing,
    }
  }

  const { error: readyError } = await db
    .from('photos')
    .update({ derivatives_ready: true })
    .eq('id', input.photoId)
  if (readyError) return { ok: false, message: 'Couldn’t record that the sizes are ready.' }

  if (!input.publish) {
    revalidatePhoto(row.slug)
    return { ok: true, published: false, slug: row.slug }
  }

  // The database enforces this too (alt_text_required_when_published). Checking
  // here buys a sentence that explains itself instead of a constraint violation.
  if (!row.alt_text || row.alt_text.trim() === '') {
    return {
      ok: false,
      message: 'Add alt text before publishing — it’s what describes the photograph to someone who can’t see it.',
    }
  }

  const { error: publishError } = await db
    .from('photos')
    .update({ published: true })
    .eq('id', input.photoId)
  if (publishError) return { ok: false, message: 'Couldn’t publish. The photograph is still a draft.' }

  revalidatePhoto(row.slug)
  return { ok: true, published: true, slug: row.slug }
}

/**
 * Unpublish, and re-publish.
 *
 * deletePhoto's refusal says "Unpublish it first." Without this action that
 * copy would instruct the user to perform something the system does not offer
 * -- product.md §1's rule broken by the error message enforcing it, and a
 * published photograph would be permanently undeletable.
 *
 * Publishing through this path is subject to the same two gates as
 * finishIngest, because the database applies them regardless.
 */
export async function setPublished(input: {
  photoId: string
  published: boolean
}): Promise<StepResult> {
  await requireAdmin()
  const db = await createAuthServerClient()

  const { data: photo } = await db
    .from('photos')
    .select('slug, alt_text, derivatives_ready')
    .eq('id', input.photoId)
    .maybeSingle()
  if (!photo) return { ok: false, message: 'That photograph no longer exists.' }

  const row = photo as { slug: string; alt_text: string | null; derivatives_ready: boolean }

  if (input.published) {
    if (!row.derivatives_ready) {
      return { ok: false, message: 'Its sizes aren’t all generated yet. Retry the derivatives first.' }
    }
    if (!row.alt_text || row.alt_text.trim() === '') {
      return { ok: false, message: 'Add alt text before publishing.' }
    }
  }

  const { error } = await db
    .from('photos')
    .update({ published: input.published })
    .eq('id', input.photoId)
  if (error) return { ok: false, message: 'Couldn’t change whether it’s published.' }

  revalidatePhoto(row.slug)
  return { ok: true }
}

/**
 * Restricted by design (spec §8).
 *
 * Deleting a photograph removes its ORIGINAL from storage, and product.md §6.2
 * requires the lab export to pull that original for fulfillment. order_items
 * .photo_id is `on delete set null`, so the receipt row would survive -- but
 * the file it needs would not. The failure would surface months later, when a
 * reprint is requested and the file is gone.
 *
 * So: unpublished, and never ordered. Both checks, in that order.
 */
export async function deletePhoto(input: { photoId: string }): Promise<DeleteResult> {
  await requireAdmin()
  const db = await createAuthServerClient()

  const { data: photo } = await db
    .from('photos')
    .select('slug, published, has_bw_variant, original_key, original_bw_key')
    .eq('id', input.photoId)
    .maybeSingle()
  if (!photo) return { ok: false, message: 'That photograph no longer exists.' }

  const row = photo as {
    slug: string
    published: boolean
    has_bw_variant: boolean
    original_key: string | null
    original_bw_key: string | null
  }

  if (row.published) {
    return { ok: false, message: 'Unpublish it first. A published photograph can’t be deleted outright.' }
  }

  const { count, error: countError } = await db
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('photo_id', input.photoId)
  // Fail CLOSED: an unknown count must never read as safe to delete.
  if (countError) {
    return { ok: false, message: 'Couldn’t check whether this photograph has been ordered. Nothing was deleted.' }
  }
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      message: 'This photograph has been ordered. Deleting it would remove the original the lab needs.',
    }
  }

  const derivatives = expectedObjects(row.slug, row.has_bw_variant)
  if (derivatives.length > 0) await db.storage.from(DERIVATIVES_BUCKET).remove(derivatives)

  const originals = [row.original_key, row.original_bw_key].filter((k): k is string => k !== null)
  if (originals.length > 0) await db.storage.from(ORIGINALS_BUCKET).remove(originals)

  const { error } = await db.from('photos').delete().eq('id', input.photoId)
  if (error) return { ok: false, message: 'Couldn’t delete the photograph.' }

  revalidatePhoto(row.slug)
  return { ok: true }
}
