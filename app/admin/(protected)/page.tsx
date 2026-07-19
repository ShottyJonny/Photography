import { requireAdmin } from '@/lib/admin/require-admin'
import { SignOutButton } from '@/components/admin/SignOutButton'

/**
 * Slice 4a's placeholder — deliberately plain, and NOT a design surface.
 * It exists to make the milestone verifiable and is replaced wholesale by
 * slice 4b's §11.4-A dashboard. It claims nothing, so there is nothing for it
 * to claim falsely (product.md §1).
 *
 * requireAdmin() is called here and not only in the layout, because the layout
 * is not the boundary. React cache() dedupes the two into one round-trip.
 */
export default async function AdminLanding() {
  const user = await requireAdmin()

  return (
    <main className="admin-landing">
      <h1 className="admin-h1">Studio Admin</h1>
      <p className="admin-meta">Signed in as {user.email}</p>
      <SignOutButton />
    </main>
  )
}
