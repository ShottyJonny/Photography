/**
 * design.md §11.4-A. Labels are written in sentence case and uppercased by CSS
 * text-transform, so tests query sentence case.
 *
 * `alert` is conditional (D3): the prototype's alert variant carries a border,
 * a wash, an alert label AND an alert sub. Around a 0 that is four alarm
 * signals for a healthy console — a status that does not reflect reality.
 */
export function StatTile({
  label, value, sub, alert = false,
}: {
  label: string
  value: number
  sub: string
  alert?: boolean
}) {
  return (
    <div className={alert ? 'admin-tile is-alert' : 'admin-tile'}>
      <p className="admin-tile-label">{label}</p>
      <p className="admin-tile-number">{value}</p>
      <p className="admin-tile-sub">{sub}</p>
    </div>
  )
}
