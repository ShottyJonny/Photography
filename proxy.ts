import { NextResponse, type NextRequest } from 'next/server'
import { createProxyAuthClient } from '@/lib/supabase/auth-proxy'

// Matches /admin itself as well as everything beneath it. Nothing outside
// /admin is intercepted, so no _next/static exclusion is needed.
export const config = { matcher: ['/admin/:path*'] }

const SIGN_IN = '/admin/sign-in'

function harden(res: NextResponse): NextResponse {
  // no-store is what actually stops bfcache restoring a post-sign-out page.
  res.headers.set('Cache-Control', 'no-store, private')
  // Covers response shapes a <meta robots> tag cannot reach.
  res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return res
}

function redirectTo(request: NextRequest, from: NextResponse, pathname: string): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''
  const res = NextResponse.redirect(url)
  // THE TRAP: without this, refreshed auth cookies are discarded and the admin
  // gets an intermittent logout loop.
  for (const cookie of from.cookies.getAll()) res.cookies.set(cookie)
  return res
}

/**
 * Session refresh + UX redirect. NOT the security boundary — that is
 * requireAdmin() in the data-access layer (lib/admin/require-admin.ts).
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { supabase, getResponse } = createProxyAuthClient(request)

  // Must be called immediately after construction, or the refresh races the
  // response object.
  let signedIn = false
  try {
    const { data, error } = await supabase.auth.getUser()
    // supabase-js RETURNS auth errors rather than throwing; the !error conjunct
    // is what keeps a Supabase outage from failing open.
    signedIn = !error && Boolean(data?.user)
  } catch {
    signedIn = false // never fail open
  }

  const onSignIn = request.nextUrl.pathname === SIGN_IN
  const response = getResponse()

  if (!signedIn && !onSignIn) return harden(redirectTo(request, response, SIGN_IN))
  if (signedIn && onSignIn) return harden(redirectTo(request, response, '/admin'))
  return harden(response)
}
