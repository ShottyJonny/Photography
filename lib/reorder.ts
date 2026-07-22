/** Pure array move — remove from `from`, insert at `to`. Used by WorksList on drop. */
export function applyReorder<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
