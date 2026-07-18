type Source = Record<string, string | undefined>

export interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  siteUrl: string
}

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
] as const

function resolveSiteUrl(s: Source): string {
  // NEVER process.env.URL (Netlify-only). SITE_URL is set per Vercel env.
  if (s.SITE_URL && s.SITE_URL.trim()) return s.SITE_URL.trim()
  if (s.VERCEL_URL && s.VERCEL_URL.trim()) return `https://${s.VERCEL_URL.trim()}`
  // In production, refuse to silently fall back to localhost (spec §3.1/§4.2): a
  // misconfigured deploy must fail at boot, not charge the card then redirect to localhost.
  if (s.NODE_ENV === 'production') {
    throw new Error('No site origin: set SITE_URL (or deploy on Vercel, where VERCEL_URL is set)')
  }
  return 'http://localhost:3000'
}

export function loadEnv(source: Source = process.env): Env {
  const missing = REQUIRED.filter((k) => !source[k] || !source[k]!.trim())
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`)
  }
  return {
    SUPABASE_URL: source.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: source.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    STRIPE_SECRET_KEY: source.STRIPE_SECRET_KEY!,
    STRIPE_WEBHOOK_SECRET: source.STRIPE_WEBHOOK_SECRET!,
    siteUrl: resolveSiteUrl(source),
  }
}

let cached: Env | null = null
export function env(): Env {
  return (cached ??= loadEnv())
}
