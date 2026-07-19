'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import type { SignInErrorKind, SignInState } from '@/lib/admin/auth-state'

const credentials = z.object({
  email: z.string().trim().min(1, 'Enter your email.').email('That doesn’t look like an email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

/**
 * Classify by the RETURNED error's code, name and HTTP status.
 *
 * supabase-js does not throw on a dead network: signInWithPassword catches
 * every AuthError and returns it, so a failed fetch arrives here as
 * AuthRetryableFetchError with status 0. Without that branch the transport
 * copy is unreachable and a Supabase outage renders as "Sign-in failed."
 *
 * Classifying by exception-vs-return would also report email_not_confirmed, a
 * 429 lockout, and user_banned — all from a perfectly reachable server — as
 * network failures, so the one message telling Jon he is rate-limited would
 * tell him to check his internet.
 */
function classify(error: {
  name?: string
  code?: string
  status?: number
  message?: string
}): SignInErrorKind {
  const message = error.message ?? ''
  if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return 'credentials'
  }
  if (error.code === 'over_request_rate_limit' || error.status === 429) return 'rate_limited'
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'transport'
  if (typeof error.status === 'number' && error.status >= 500) return 'transport'
  return 'unknown'
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors
    return { status: 'fieldErrors', email: fields.email?.[0], password: fields.password?.[0] }
  }

  let kind: SignInErrorKind | null = null
  try {
    const supabase = await createAuthServerClient()
    const { error } = await supabase.auth.signInWithPassword(parsed.data)
    if (error) kind = classify(error)
  } catch {
    // Only non-AuthError throws reach here — the network case is returned, above.
    kind = 'transport'
  }
  if (kind) return { status: 'error', kind }

  // OUTSIDE the try: redirect() signals by throwing NEXT_REDIRECT, so a
  // swallowing catch would turn every success into a silent failure.
  redirect('/admin')
}

export async function signOut(): Promise<void> {
  // Fail-closed and local-first. If the call to GoTrue rejects we still clear
  // the cookies — otherwise the admin is left signed in on a screen that says
  // they signed out, on a free-tier project subject to cold starts.
  try {
    const supabase = await createAuthServerClient()
    await supabase.auth.signOut()
  } catch {
    // deliberately swallowed; the local clear below is what matters
  }

  const store = await cookies()
  for (const cookie of store.getAll()) {
    if (cookie.name.startsWith('sb-')) store.delete(cookie.name)
  }

  // Purge the client Router Cache on an auth-state change.
  revalidatePath('/admin', 'layout')
  redirect('/admin/sign-in')
}
