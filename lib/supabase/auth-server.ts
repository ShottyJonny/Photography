import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WebSocketLikeConstructor } from '@supabase/realtime-js'
import WebSocket from 'ws'
import { supabaseAuthEnv } from '@/lib/env'

// The admin session cookie is served from the same origin as the public
// storefront. Nothing here needs JS access to it — sign-in is a Server Action
// and createBrowserClient is never used — so it is httpOnly. Merged OVER the
// library's options so its maxAge/expires survive.
const SECURE_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
} as const

export async function createAuthServerClient(): Promise<SupabaseClient> {
  // cookies() is async in Next 16. Without the await, getAll() is called on a Promise.
  const cookieStore = await cookies()
  const { url, anonKey } = supabaseAuthEnv()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // Signature is (cookies, headers). The headers argument is unusable from
      // a Server Component (which can set neither cookies nor headers) and is
      // deliberately ignored; proxy.ts sets the equivalent on every response.
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            cookieStore.set(name, value, { ...options, ...SECURE_COOKIE })
          }
        } catch (err) {
          // EXPECTED during a Server Component render: cookies are read-only
          // there, and proxy.ts refreshes on every /admin request, so dropping
          // the write is safe. NOT expected inside a Server Action, where the
          // write IS the sign-in — so leave a trace rather than vanishing.
          console.warn('[admin-auth] cookie write dropped', err)
        }
      },
    },
    // See lib/supabase/admin.ts — Node 20 has no global WebSocket.
    realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
  })
}
