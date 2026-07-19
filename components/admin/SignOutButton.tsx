import { signOut } from '@/lib/admin/auth-actions'

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className="admin-linkbtn">
        Sign out
      </button>
    </form>
  )
}
