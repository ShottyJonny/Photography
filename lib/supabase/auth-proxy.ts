import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WebSocketLikeConstructor } from '@supabase/realtime-js'
import WebSocket from 'ws'
import { supabaseAuthEnv } from '@/lib/env'

const SECURE_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
} as const

/**
 * Separate from auth-server.ts for exactly one reason: the two bind cookies to
 * different objects (NextRequest/NextResponse vs next/headers).
 *
 * getResponse() is a thunk, not a value: `response` is REASSIGNED inside
 * setAll, and returning the object directly would hand back the stale one —
 * silently discarding every refreshed cookie.
 */
export function createProxyAuthClient(request: NextRequest): {
  supabase: SupabaseClient
  getResponse: () => NextResponse
} {
  let response = NextResponse.next({ request })
  const { url, anonKey } = supabaseAuthEnv()

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      // All three of spec §3.5's rules live here.
      setAll: (list, headers) => {
        // (2a) Mirror onto the request first, or this same request's later
        // getAll() reads stale values.
        for (const { name, value } of list) request.cookies.set(name, value)
        // (2b) Re-create the response so it carries the updated request.
        response = NextResponse.next({ request })
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, { ...options, ...SECURE_COOKIE })
        }
        // The library's no-store headers: a response that sets auth cookies
        // must not be cached by a CDN, "otherwise one user's session token can
        // be served to a different user."
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value)
        }
      },
    },
    realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
  })

  return { supabase, getResponse: () => response }
}
