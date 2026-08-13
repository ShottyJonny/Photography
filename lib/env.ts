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

/**
 * Narrow accessor for the site origin alone, trailing slash stripped.
 *
 * Deliberately NOT env(): robots.txt is a STATIC route, so Next prerenders it
 * at build time -- on a CI runner whose environment is empty. Reaching env()
 * there drags in the Supabase and Stripe validation and fails the build, which
 * CLAUDE.md's gate table promises "needs no secrets". That is not theoretical;
 * it broke the release build on 2026-08-12.
 */
export function siteOrigin(source: Source = process.env): string {
  return resolveSiteUrl(source).replace(/\/$/, '')
}

/**
 * Narrow accessor for the two values Supabase Auth needs.
 *
 * Deliberately NOT env(): that validates the Stripe keys too, and it runs on
 * every /admin request. A missing STRIPE_WEBHOOK_SECRET must not be able to
 * break admin sign-in.
 */
export function supabaseAuthEnv(source: Source = process.env): { url: string; anonKey: string } {
  const url = (source.SUPABASE_URL ?? source.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const anonKey = (source.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()

  const missing: string[] = []
  if (!url) missing.push('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)')
  if (!anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`)
  }

  return { url, anonKey }
}
