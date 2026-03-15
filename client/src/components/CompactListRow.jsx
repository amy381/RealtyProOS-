import { useRef } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import './CompactListRow.css'

const LIST_FIELDS = {
  'buyer-broker': [
    { key: 'bba_contract',   label: 'BBA' },
    { key: 'bba_expiration', label: 'Exp' },
  ],
  'pre-listing': [
    { key: 'listing_contract',        label: 'Listed' },
    { key: 'listing_expiration_date', label: 'Exp' },
  ],
}

function fmtShort(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
}

export default function CompactListRow({ transaction, columnId, onCardClick }) {
  const hasDragged   = useRef(false)
  const pointerStart = useRef({ x: 0, y: 0 })

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: transaction.id })
  const { onPointerDown: dndPointerDown, ...restListeners } = listeners || {}

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
  }

  const fields = LIST_FIELDS[columnId] || []

  const initials = transaction.assigned_tc
    ? transaction.assigned_tc.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  const street = transaction.property_address || '(No address)'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="list-row"
      {...attributes}
      {...restListeners}
      onPointerDown={e => {
        hasDragged.current = false
        pointerStart.current = { x: e.clientX, y: e.clientY }
        dndPointerDown?.(e)
      }}
      onPointerMove={e => {
        const dx = e.clientX - pointerStart.current.x
        const dy = e.clientY - pointerStart.current.y
        if (Math.hypot(dx, dy) > 5) hasDragged.current = true
      }}
      onPointerUp={() => {
        if (!hasDragged.current) onCardClick?.(transaction)
      }}
    >
      <span className="list-row-addr">{street}</span>
      <span className="list-row-tc" title={transaction.assigned_tc}>{initials}</span>
      {fields.map(f => (
        <span key={f.key} className="list-row-date">{fmtShort(transaction[f.key])}</span>
      ))}
    </div>
  )
}
