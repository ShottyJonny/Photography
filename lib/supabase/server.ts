import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { WebSocketLikeConstructor } from '@supabase/realtime-js'
import WebSocket from 'ws'
import { env } from '@/lib/env'

export function supabaseServer(): SupabaseClient {
  const e = env()
  return createClient(e.SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    // See lib/supabase/admin.ts — supplies the WebSocket transport realtime-js
    // requires on Node < 22.
    realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
  })
}
