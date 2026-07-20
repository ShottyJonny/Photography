import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { WebSocketLikeConstructor } from '@supabase/realtime-js'
import WebSocket from 'ws'
import { env } from '@/lib/env'

let client: SupabaseClient | null = null
export function supabaseAdmin(): SupabaseClient {
  if (client) return client
  const e = env()
  client = createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    // @supabase/realtime-js constructs a RealtimeClient (unused here) on every
    // createClient() call and throws if it can't find a native WebSocket, which
    // Node.js only exposes as a global since v22. We target Node 20 (.nvmrc), so
    // supply `ws` directly rather than requiring a runtime bump.
    realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
  })
  return client
}
