import { requireAdmin } from '@/lib/admin/require-admin'
import { AdminShell } from '@/components/admin/AdminShell'

// cookies() forces these routes dynamic anyway, but the CI build job runs with
// NO secrets — without this, whether `next build` survives would depend on
// statement ordering inside the client factory.
export const dynamic = 'force-dynamic'

/**
 * Calls requireAdmin() so a direct page load is guarded, but it is NOT the
 * boundary — layouts do not re-render on client-side navigation. The boundary
 * is requireAdmin() in the data-access layer (getDashboard calls it first).
 */
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin()
  return <AdminShell email={user.email ?? ''}>{children}</AdminShell>
}
