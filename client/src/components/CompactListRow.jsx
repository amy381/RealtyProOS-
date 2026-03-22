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

  const isBuyerBroker = columnId === 'buyer-broker'
  const client1 = [transaction.client_first_name, transaction.client_last_name].filter(Boolean).join(' ') || transaction.client_name || ''
  const client2 = [transaction.client2_first_name, transaction.client2_last_name].filter(Boolean).join(' ') || ''
  const street  = transaction.property_address || ''

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
      {isBuyerBroker ? (
        <span className="list-row-primary">
          <span className="list-row-addr">{client1 || '(No name)'}</span>
          {client2 && <span className="list-row-client2">{client2}</span>}
          {street  && <span className="list-row-sub">{street}</span>}
        </span>
      ) : (
        <span className="list-row-addr">{street || '(No address)'}</span>
      )}
      {fields.map(f => (
        <span key={f.key} className="list-row-date">{fmtShort(transaction[f.key])}</span>
      ))}
    </div>
  )
}
