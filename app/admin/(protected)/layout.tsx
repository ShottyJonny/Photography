import { requireAdmin } from '@/lib/admin/require-admin'

// cookies() forces these routes dynamic anyway, but the CI build job runs with
// NO secrets — without this, whether `next build` survives would depend on
// statement ordering inside the client factory. Every store server page
// already carries the same declaration.
export const dynamic = 'force-dynamic'

/**
 * Calls requireAdmin() so a direct page load is guarded, but it is NOT the
 * boundary — layouts do not re-render on client-side navigation. The boundary
 * is requireAdmin() in the data-access layer, called by every read and action.
 *
 * Renders children bare in slice 4a; slice 4b wraps them in the §11.3 shell.
 */
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
