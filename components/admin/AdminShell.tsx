import Link from 'next/link'
import { AdminNav } from '@/components/admin/AdminNav'
import { SignOutButton } from '@/components/admin/SignOutButton'

function CloudMark() {
  return (
    <svg
      width="26" height="26" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M7 18h10a4 4 0 0 0 .5-7.98A5 5 0 0 0 7.5 8.5 4 4 0 0 0 7 18z" />
    </svg>
  )
}

/**
 * design.md §11.3 — 242px fixed sidebar + fluid main, inside one card.
 * Does no fetching: `email` is supplied by the caller, which has already
 * called requireAdmin().
 */
export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="admin-wrap">
      <div className="admin-card">
        <aside className="admin-sidebar">
          <div className="admin-lockup">
            <CloudMark />
            <div>
              <p className="admin-lockup-name">Jon Hoffman</p>
              <p className="admin-lockup-kicker">Studio Admin</p>
            </div>
          </div>

          <div className="admin-rule" />
          <AdminNav />

          <div className="admin-sidefoot">
            <Link
              href="/"
              className="admin-livesite"
              target="_blank"
              rel="noopener noreferrer"
            >
              View live site <span aria-hidden="true">↗</span>
            </Link>

            {/* D2 — §11.3 gives the chip and the live-site link but no way out. */}
            <SignOutButton />

            <div className="admin-chip">
              <div className="admin-chip-avatar" aria-hidden="true">JH</div>
              <div className="admin-chip-text">
                <div className="admin-chip-name">Jon Hoffman</div>
                {/* Visible, not an aria-label: aria-label is inconsistently
                    exposed and REPLACES the visible text where it is. */}
                <div className="admin-chip-email" title={email}>{email}</div>
              </div>
            </div>
          </div>
        </aside>

        <main className="admin-main">{children}</main>
      </div>
    </div>
  )
}
