'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MarkedLink } from '@/components/admin/MarkedControl'

/**
 * Order is the PROTOTYPE's sidebar order — design.md §11.3 specifies item
 * styling but does not enumerate the items, and §11 says the prototype wins
 * where the section is silent.
 *
 * next/link, not a raw <a>: an anchor forces a full document navigation, which
 * discards the client router and makes every section change in slices 5-7 a
 * page reload.
 */
const ITEMS: { label: string; href: string | null }[] = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Photographs', href: '/admin/photographs' },
  { label: 'Collections', href: null },   // slice 6
  { label: 'Orders', href: null },        // slice 7
  { label: 'Home feature', href: null },  // slice 6
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Studio Admin">
      <ul className="admin-nav">
        {ITEMS.map(({ label, href }) => (
          <li key={label}>
            {href ? (
              <Link
                href={href}
                className={`admin-navitem${pathname === href ? ' is-active' : ''}`}
                aria-current={pathname === href ? 'page' : undefined}
              >
                <span className="admin-nb" aria-hidden="true" />
                {label}
              </Link>
            ) : (
              <span className="admin-navitem">
                <span className="admin-nb" aria-hidden="true" />
                <MarkedLink label={label} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
