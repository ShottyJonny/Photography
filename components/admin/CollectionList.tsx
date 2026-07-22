import Link from 'next/link'
import { derivativeSrc } from '@/lib/images/derivatives'
import type { AdminCollectionRow } from '@/lib/data/collections-admin'

export function CollectionList({ collections, activeId }: { collections: AdminCollectionRow[] | null; activeId: string | null }) {
  return (
    <div className="admin-col-list">
      <div className="admin-col-listhead">
        <span>Collections</span>
        <Link href="/admin/collections/new" aria-label="New collection" style={{ fontSize: 16 }}>＋</Link>
      </div>
      {collections === null ? (
        <p className="admin-empty">Couldn’t read the collections.</p>
      ) : collections.length === 0 ? (
        <p className="admin-empty">No collections yet.</p>
      ) : (
        collections.map((c) => (
          <Link key={c.id} href={`/admin/collections/${c.id}`} className={`admin-col-listrow${c.id === activeId ? ' is-active' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- public derivative URL */}
            {c.coverSlug ? <img className="admin-col-listthumb" src={derivativeSrc(c.coverSlug, 'colour', 160)} alt="" /> : <span className="admin-col-listthumb" style={{ background: 'var(--panel2)' }} />}
            <span>
              <span className="admin-col-listname">{c.name}</span>
              <span className={`admin-col-listmeta${c.featured_on_home ? ' is-featured' : ''}`} style={{ display: 'block' }}>
                {c.featured_on_home ? 'Featured · ' : ''}{c.count} {c.count === 1 ? 'work' : 'works'}
              </span>
            </span>
          </Link>
        ))
      )}
    </div>
  )
}
