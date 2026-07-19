import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

/**
 * THE authorization boundary for the admin.
 *
 * Next.js layouts do NOT re-render on client-side navigation, so a check in a
 * layout stops running on route changes. Every admin read, write, and Server
 * Action calls this as its FIRST statement — including in slices 5-7.
 *
 * Exported uncached so it is testable; requireAdmin is the cached export
 * everything else imports.
 */
export async function loadAdmin(): Promise<User> {
  const supabase = await createAuthServerClient()
  // getUser(), never getSession(): getSession decodes the cookie and trusts it.
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) redirect('/admin/sign-in')
  return data.user
}

/** Deduped per request, so the layout and the page share one round-trip. */
export const requireAdmin = cache(loadAdmin)
