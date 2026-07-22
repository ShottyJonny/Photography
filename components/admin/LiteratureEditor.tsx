'use client'

export function LiteratureEditor({
  name, dek, literature, onDek, onLiterature,
}: {
  name: string
  dek: string
  literature: string
  onDek: (v: string) => void
  onLiterature: (v: string) => void
}) {
  const words = literature.trim() ? literature.trim().split(/\s+/).length : 0
  return (
    <div>
      <div className="admin-col-litheader">The literature</div>
      <div className="admin-col-litcard">
        <div className="admin-col-litname">{name}</div>
        <textarea
          className="admin-col-litdek" value={dek} rows={2}
          placeholder="A one-line definition or subtitle" aria-label="Dek"
          onChange={(e) => onDek(e.target.value)}
        />
        <textarea
          className="admin-col-litbody" value={literature} rows={12}
          placeholder="The essay. A blank line starts a new paragraph." aria-label="Literature"
          onChange={(e) => onLiterature(e.target.value)}
        />
        <div className="admin-col-litfoot">Newsreader · {words} {words === 1 ? 'word' : 'words'}</div>
      </div>
      <p className="admin-col-litnote">
        This is where the site’s voice lives. If it stops sounding like this essay, the site is wrong.
      </p>
    </div>
  )
}
