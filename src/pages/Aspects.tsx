import React from 'react'
import { measureAspects, isFourByFive, isTwoByThree } from '../utils/aspect'

export default function Aspects() {
  const [rows, setRows] = React.useState<{ id: string; name: string; ratio: number }[] | null>(null)
  React.useEffect(() => {
    let cancelled = false
    measureAspects().then(list => {
      if (cancelled) return
      const mapped = list.map(x => ({ id: x.id, name: x.name, ratio: x.ratio }))
      setRows(mapped)
    })
    return () => { cancelled = true }
  }, [])

  if (!rows) return <p>Measuring…</p>
  const fours = rows.filter(r => isFourByFive(r.ratio))
  const twothree = rows.filter(r => isTwoByThree(r.ratio))
  return (
    <div>
      <h2>Aspect Candidates</h2>
      <section>
        <h3>4x5</h3>
        <p>Matching {fours.length} of {rows.length} images (±4% tolerance).</p>
        <ul>
          {fours.map(r => (
            <li key={r.id}>{r.name} — {r.id}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3>2x3 / 3x2</h3>
        <p>Matching {twothree.length} of {rows.length} images (±4% tolerance).</p>
        <ul>
          {twothree.map(r => (
            <li key={r.id}>{r.name} — {r.id}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
