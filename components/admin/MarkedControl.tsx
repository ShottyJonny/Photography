/**
 * Controls whose action lands in a later slice.
 *
 * product.md §1: "a control's label must match what it does." These say they
 * do nothing, and they do nothing — the marker is real text content, never a
 * title, tooltip, or colour (design.md §11.1: status is never carried by
 * colour alone).
 *
 * NOT BUILT rather than SOON: "soon" claims a timeline nothing guarantees.
 */
const MARK = 'NOT BUILT'

/** For anything that would have been an <a>. Not a control at all. */
export function MarkedLink({ label, className }: { label: string; className?: string }) {
  return (
    <span className={className ? `admin-marked ${className}` : 'admin-marked'}>
      <span>{label}</span>
      <span className="admin-mark">{MARK}</span>
    </span>
  )
}

/**
 * For anything that would have been a <button>. aria-disabled rather than the
 * native attribute: `disabled` removes it from the tab order, so a keyboard
 * user never reaches it and never hears the marker — and the marker is the
 * whole point. A type="button" with no handler is inert regardless.
 */
export function MarkedButton({ label, className }: { label: string; className?: string }) {
  return (
    <button type="button" aria-disabled="true" className={className ?? 'admin-ghost'}>
      <span>{label}</span>
      <span className="admin-mark">{MARK}</span>
    </button>
  )
}
