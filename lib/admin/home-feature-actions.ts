'use server'

import { revalidateTag } from 'next/cache'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

export type Result = { ok: true } | { ok: false; message: string }

/**
 * Sets which collection leads the home page. collectionId null clears it (home
 * renders "Coming soon.").
 *
 * Clear-then-set, in THIS order: the collections_one_featured unique partial
 * index rejects two rows with featured_on_home = true, so we clear whatever
 * leads home now before setting the new one. At no instant are two rows true,
 * so no Postgres function / transaction is needed (spec §3.1).
 */
export async function setFeaturedCollection(input: { collectionId: string | null }): Promise<Result> {
  await requireAdmin()
  const db = await createAuthServerClient()

  const { error: clearErr } = await db
    .from('collections')
    .update({ featured_on_home: false })
    .eq('featured_on_home', true)
  if (clearErr) return { ok: false, message: 'Couldn’t update the home feature.' }

  if (input.collectionId) {
    const { error: setErr } = await db
      .from('collections')
      .update({ featured_on_home: true })
      .eq('id', input.collectionId)
    if (setErr) return { ok: false, message: 'Couldn’t set the home feature.' }
  }

  revalidateTag('collections', 'max')
  return { ok: true }
}
