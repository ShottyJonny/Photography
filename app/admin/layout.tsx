import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Studio Admin',
  // Covers rendered pages. proxy.ts also sets X-Robots-Tag, which covers
  // response shapes a meta tag cannot reach.
  robots: { index: false, follow: false },
}

/**
 * Wraps BOTH the public sign-in page and the protected tree, so sign-in is
 * dark without inheriting a shell whose nav means nothing to someone who is
 * not signed in yet.
 *
 * The data-admin attribute is what the entire §5 token scope hangs on.
 */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div data-admin>{children}</div>
}
