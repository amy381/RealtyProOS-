import { useRef } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { COLUMN_FIELDS, BUYER_DATE_FIELDS, SELLER_DATE_FIELDS } from '../lib/columnFields'
import './TransactionCard.css'

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getDaysUntilClose(dateStr) {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const close = new Date(dateStr + 'T00:00:00')
  return Math.ceil((close - today) / (1000 * 60 * 60 * 24))
}

function streetOnly(addr) {
  if (!addr) return ''
  return addr.split(',')[0].trim()
}

const REP_BADGE_STATUSES = new Set(['pending', 'closed', 'cancelled-expired'])

const COE_FIELD = { key: 'close_of_escrow', label: 'Close of Escrow', type: 'date', noOverdue: true }

// Returns fields to show on the card face.
function getCardFields(transaction) {
  const { status, rep_type } = transaction

  // Closed cards: only show COE (static, no overdue)
  if (status === 'closed') {
    return transaction.close_of_escrow ? [COE_FIELD] : []
  }

  let dateFields
  if (status === 'pending') {
    // Pending cards always use the pending-specific field set regardless of rep_type.
    // This ensures ipe_date and other pending dates show consistently across all Pending cards.
    dateFields = COLUMN_FIELDS['pending']
  } else if (rep_type === 'Buyer') {
    dateFields = BUYER_DATE_FIELDS
  } else if (rep_type === 'Seller') {
    dateFields = SELLER_DATE_FIELDS
  } else {
    dateFields = COLUMN_FIELDS[status] || []
  }

  // Only show date fields that have a value (keeps cards compact).
  // Target Live is suppressed on Active Listing cards (still visible in side panel).
  // Close of Escrow never shown on Active Listing cards.
  const visibleDateFields = dateFields.filter(f =>
    f.type === 'date' && transaction[f.key] &&
    !(f.key === 'target_live_date' && status === 'active-listing') &&
    !(f.key === 'close_of_escrow'  && status === 'active-listing')
  )

  // Always include text fields from COLUMN_FIELDS that have values (e.g. Lender, Title Co.)
  const textFields = (COLUMN_FIELDS[status] || [])
    .filter(f => f.type === 'text' && transaction[f.key])

  return [...visibleDateFields, ...textFields]
}

export default function TransactionCard({ transaction, onEdit, onDelete, isDragging, priceLabel, onCardClick, viewMode }) {
  const hasDragged = useRef(false)
  const pointerStart = useRef({ x: 0, y: 0 })

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging: isActiveDragging,
  } = useDraggable({ id: transaction.id })

  const { onPointerDown: dndPointerDown, ...restListeners } = listeners || {}

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isActiveDragging ? 0.4 : 1,
  }

  const fields = getCardFields(transaction)
  const isClosed      = transaction.status === 'closed'
  const isPending     = transaction.status === 'pending'
  const isPreListing  = transaction.status === 'pre-listing'
  const isActiveListing = transaction.status === 'active-listing'
  const showRepBadge = REP_BADGE_STATUSES.has(transaction.status) && transaction.rep_type

  return (
    <div
      ref={setNodeRef}
      style={isDragging ? undefined : style}
      className={`transaction-card card--${viewMode || 'wide'} ${isDragging || isActiveDragging ? 'is-overlay' : ''}`}
      {...attributes}
      {...restListeners}
      onPointerDown={(e) => {
        hasDragged.current = false
        pointerStart.current = { x: e.clientX, y: e.clientY }
        dndPointerDown?.(e)
      }}
      onPointerMove={(e) => {
        const dx = e.clientX - pointerStart.current.x
        const dy = e.clientY - pointerStart.current.y
        if (Math.hypot(dx, dy) > 5) hasDragged.current = true
      }}
      onPointerUp={() => {
        if (!hasDragged.current) onCardClick?.(transaction)
      }}
    >
      <div className="card-address">{streetOnly(transaction.property_address)}</div>

      <div className="card-row">
        <span className="card-icon">👤</span>
        <span className="card-client">
          <span>{[transaction.client_first_name, transaction.client_last_name].filter(Boolean).join(' ') || transaction.client_name || '—'}</span>
          {(transaction.client2_first_name || transaction.client2_last_name) && (
            <span>{[transaction.client2_first_name, transaction.client2_last_name].filter(Boolean).join(' ')}</span>
          )}
        </span>
      </div>

      {priceLabel !== null && transaction.price && (
        <div className="card-price">
          <span className="card-price-label">{priceLabel}: </span>
          {Number(transaction.price).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </div>
      )}

      {fields.map((field) => {
        const value = transaction[field.key]
        const suppressOverdue = isClosed || isPending || isPreListing || isActiveListing || field.noOverdue

        if (field.type === 'date') {
          const days = !suppressOverdue ? getDaysUntilClose(value) : null
          const isUrgent = days !== null && days <= 7 && days >= 0
          const isOverdue = days !== null && days < 0

          return (
            <div key={field.key} className="card-field-row">
              <span className="card-field-label">{field.label}:</span>
              <span className={`card-field-value ${isUrgent ? 'urgent-text' : ''} ${isOverdue ? 'overdue-text' : ''}`}>
                {formatDate(value)}
                {isUrgent && days === 0 && <span className="badge urgent-badge">Today</span>}
                {isUrgent && days > 0  && <span className="badge urgent-badge">{days}d</span>}
                {isOverdue             && <span className="badge overdue-badge">Overdue</span>}
              </span>
            </div>
          )
        }

        return (
          <div key={field.key} className="card-field-row">
            <span className="card-field-label">{field.label}:</span>
            <span className="card-field-value">{value || '—'}</span>
          </div>
        )
      })}

      <div className="card-footer">
        <div className="card-footer-right">
          {showRepBadge && (
            <span className={`card-rep-badge ${transaction.rep_type === 'Buyer' ? 'buyer' : 'seller'}`}>{transaction.rep_type}</span>
          )}
          <div className="card-actions">
            <button
              className="card-btn edit-btn"
              onClick={(e) => { e.stopPropagation(); onEdit && onEdit(transaction) }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Edit"
            >✏️</button>
          </div>
        </div>
      </div>
    </div>
  )
}
