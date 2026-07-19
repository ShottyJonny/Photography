import { SignInForm } from '@/components/admin/SignInForm'

export default function SignInPage() {
  return (
    <main className="admin-signin">
      <div className="admin-signin-lockup">
        <svg
          width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <path d="M7 18h10a4 4 0 0 0 .5-7.98A5 5 0 0 0 7.5 8.5 4 4 0 0 0 7 18z" />
        </svg>
        <div>
          <p className="admin-signin-name">Jon Hoffman</p>
          <p className="admin-signin-kicker">Studio Admin</p>
        </div>
      </div>
      <SignInForm />
    </main>
  )
}
