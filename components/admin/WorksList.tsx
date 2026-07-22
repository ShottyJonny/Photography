'use client'

import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { applyReorder } from '@/lib/reorder'
import { derivativeSrc } from '@/lib/images/derivatives'
import type { AdminMember } from '@/lib/data/collections-admin'

function Row({ m, isCover, onSetCover, onRemove }: { m: AdminMember; isCover: boolean; onSetCover: (id: string) => void; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: m.id })
  return (
    <div ref={setNodeRef} className="admin-col-row" style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button type="button" className="admin-col-handle" aria-label={`Reorder ${m.title}`} {...attributes} {...listeners}>⠿</button>
      {/* eslint-disable-next-line @next/next/no-img-element -- public derivative URL; Plate.tsx sets the raw-<img> precedent */}
      <img className="admin-col-thumb" src={derivativeSrc(m.slug, 'colour', 160)} alt="" />
      <span className="admin-col-name">
        {m.title}
        {!m.published ? <span className="admin-col-draft">DRAFT</span> : null}
      </span>
      <button type="button" className="admin-col-star" aria-label={isCover ? 'Cover' : 'Set as cover'} aria-pressed={isCover} onClick={() => onSetCover(m.id)}>
        {isCover ? '★' : '☆'}
      </button>
      <button type="button" className="admin-col-remove" aria-label={`Remove ${m.title}`} onClick={() => onRemove(m.id)}>✕</button>
    </div>
  )
}

export function WorksList({
  members, coverId, onReorder, onSetCover, onRemove,
}: {
  members: AdminMember[]
  coverId: string | null
  onReorder: (orderedIds: string[]) => void
  onSetCover: (id: string) => void
  onRemove: (id: string) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const ids = members.map((m) => m.id)

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = ids.indexOf(active.id as string)
    const to = ids.indexOf(over.id as string)
    onReorder(applyReorder(ids, from, to))
  }

  return (
    <div>
      <div className="admin-col-worksheader"><span>Works — drag to order</span><span className="admin-col-coverlabel">cover ★</span></div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {members.map((m) => (
            <Row key={m.id} m={m} isCover={coverId === m.id} onSetCover={onSetCover} onRemove={onRemove} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}
