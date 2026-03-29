import { useState, useEffect, useRef } from 'react'
import { BUYER_DATE_FIELDS, SELLER_DATE_FIELDS, TC_OPTIONS } from '../lib/columnFields'
import { mouseDownIsInside } from '../lib/dragGuard'
import TaskSection from './TaskSection'
import './TransactionPanel.css'

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtWhole(value) {
  if (!value) return '—'
  const n = Number(value)
  if (isNaN(n) || n === 0) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtCents(value) {
  if (!value && value !== 0) return '—'
  const n = Number(value)
  if (isNaN(n) || n === 0) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function gciFor(transaction, commission) {
  const price = Number(transaction.price) || 0
  const rateVal = (commission.commission_rate || '').toString().trim()
  if (!rateVal) return 0
  if (rateVal.startsWith('$')) return Number(rateVal.replace(/[$,]/g, '')) || 0
  return price * (Number(rateVal) || 0) / 100
}

// ── Inline-editable field ──────────────────────────────────────────────────
function EditableField({ label, value, displayValue, type, options, onSave, placeholder, fullWidth }) {
  const [editing, setEditing]   = useState(false)
  const [draft, setDraft]       = useState('')
  const inputRef                = useRef(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (type !== 'date' && type !== 'select' && inputRef.current.select) {
        inputRef.current.select()
      }
    }
  }, [editing, type])

  const startEdit = () => {
    setDraft(value ?? '')
    setEditing(true)
  }

  const commit = () => {
    if (mouseDownIsInside(inputRef.current)) return
    setEditing(false)
    const next = typeof draft === 'string' ? draft.trim() : draft
    const prev = typeof value === 'string' ? value.trim() : (value ?? '')
    if (next !== prev) onSave(next || null)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && type !== 'textarea') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  if (editing) {
    if (type === 'select') {
      return (
        <div className={`panel-field${fullWidth ? ' panel-field-block' : ''}`}>
          {label && <span className="panel-label">{label}</span>}
          <select
            ref={inputRef}
            className="panel-input"
            value={draft}
            onChange={e => { onSave(e.target.value || null); setEditing(false) }}
            onBlur={e => { if (!mouseDownIsInside(e.currentTarget)) setEditing(false) }}
          >
            {options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
          </select>
        </div>
      )
    }

    if (type === 'textarea') {
      return (
        <div className="panel-field panel-field-block">
          {label && <span className="panel-label">{label}</span>}
          <textarea
            ref={inputRef}
            className="panel-textarea"
            value={draft}
            rows={4}
            placeholder={placeholder}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
          />
        </div>
      )
    }

    return (
      <div className={`panel-field${fullWidth ? ' panel-field-block' : ''}`}>
        {label && <span className="panel-label">{label}</span>}
        <input
          ref={inputRef}
          type={type || 'text'}
          className="panel-input"
          value={draft}
          placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
      </div>
    )
  }

  const shown = displayValue !== undefined ? displayValue : (value || '—')

  return (
    <div
      className={`panel-field panel-field-editable${fullWidth ? ' panel-field-block' : ''}`}
      onClick={startEdit}
      title="Click to edit"
    >
      {label && <span className="panel-label">{label}</span>}
      <span className="panel-value">{shown || '—'}</span>
    </div>
  )
}

// Static read-only field (for computed values)
function Field({ label, value }) {
  return (
    <div className="panel-field">
      <span className="panel-label">{label}</span>
      <span className="panel-value">{value || '—'}</span>
    </div>
  )
}

// ── Panel ──────────────────────────────────────────────────────────────────
export default function TransactionPanel({ transaction, columns, commissions, tasks = [], onClose, onFieldSave, onCommissionChange, onDelete, onAddTask, onUpdateTask, onDeleteTask }) {
  const column     = columns.find(c => c.id === transaction.status)
  const commission = commissions?.[transaction.id] || {}
  const gci        = gciFor(transaction, commission)

  const dateFields = transaction.rep_type === 'Buyer'  ? BUYER_DATE_FIELDS
                   : transaction.rep_type === 'Seller' ? SELLER_DATE_FIELDS
                   : []

  const save   = (field) => (value) => onFieldSave(field, value)
  const saveCm = (field) => (value) => onCommissionChange(transaction.id, field, value)

  const handleDelete = () => {
    if (window.confirm('Delete this transaction? This cannot be undone.')) {
      onDelete(transaction.id)
      onClose()
    }
  }

  const fullAddress = [
    transaction.property_address,
    transaction.city,
    (transaction.state || transaction.zip)
      ? [transaction.state, transaction.zip].filter(Boolean).join(' ')
      : null,
  ].filter(Boolean).join(', ')

  return (
    <div className="panel-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="side-panel">

        <div className="panel-header">
          <div className="panel-header-info">
            <div className="panel-address">{fullAddress || '(No address)'}</div>
            {column && (
              <div className="panel-status-badge">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: column.color, display: 'inline-block', flexShrink: 0 }} />
                {column.label}
              </div>
            )}
          </div>
          <button className="panel-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="panel-body">

          {/* Property Info */}
          <div className="panel-section">
            <div className="panel-section-title">Property Info</div>
            <EditableField label="Street"  value={transaction.property_address || ''} type="text" onSave={save('property_address')} />
            <EditableField label="City"    value={transaction.city  || ''} type="text" onSave={save('city')} />
            <div className="panel-field-row">
              <EditableField label="State" value={transaction.state || ''} type="text" onSave={save('state')} />
              <EditableField label="ZIP"   value={transaction.zip   || ''} type="text" onSave={save('zip')} />
            </div>
            {column?.priceLabel && (
              <EditableField
                label={column.priceLabel}
                value={String(transaction.price || '')}
                displayValue={fmtWhole(transaction.price)}
                type="text"
                onSave={save('price')}
              />
            )}
            <EditableField label="Rep" value={transaction.rep_type || ''} type="select" options={['', 'Buyer', 'Seller']} onSave={save('rep_type')} />
            <div className="panel-field-row">
              <div
                className="panel-field panel-field-editable"
                onClick={() => save('has_septic')(!transaction.has_septic)}
                title="Click to toggle"
              >
                <span className="panel-label">Septic</span>
                <span className="panel-value">{transaction.has_septic ? '✓' : '—'}</span>
              </div>
              <div
                className="panel-field panel-field-editable"
                onClick={() => save('has_solar')(!transaction.has_solar)}
                title="Click to toggle"
              >
                <span className="panel-label">Solar</span>
                <span className="panel-value">{transaction.has_solar ? '✓' : '—'}</span>
              </div>
              <div
                className="panel-field panel-field-editable"
                onClick={() => save('has_well')(!transaction.has_well)}
                title="Click to toggle"
              >
                <span className="panel-label">Well</span>
                <span className="panel-value">{transaction.has_well ? '✓' : '—'}</span>
              </div>
            </div>
          </div>

          {/* Key Dates */}
          <div className="panel-section">
            <div className="panel-section-title">Key Dates</div>
            {dateFields.map(({ key, label }) => (
              <EditableField
                key={key}
                label={label}
                value={transaction[key] || ''}
                displayValue={formatDate(transaction[key])}
                type="date"
                onSave={save(key)}
              />
            ))}
            <div
              className="panel-field panel-field-editable"
              onClick={() => save('has_contingency')(!transaction.has_contingency)}
              title="Click to toggle"
            >
              <span className="panel-label">Contingency</span>
              <span className="panel-value">{transaction.has_contingency ? '✓ Yes' : 'No'}</span>
            </div>
            {transaction.has_contingency && (
              <EditableField
                label="Contingency Fulfilled"
                value={transaction.contingency_fulfilled_date || ''}
                displayValue={formatDate(transaction.contingency_fulfilled_date)}
                type="date"
                onSave={save('contingency_fulfilled_date')}
              />
            )}
          </div>

          {/* People */}
          <div className="panel-section">
            <div className="panel-section-title">People</div>
            <EditableField label="Client"      value={transaction.client_name  || ''} type="text"   onSave={save('client_name')} />
            <EditableField label="Assigned TC" value={transaction.assigned_tc  || ''} type="select" options={['', ...TC_OPTIONS]} onSave={save('assigned_tc')} />
            <EditableField label="Co-Op Agent" value={transaction.co_op_agent  || ''} type="text"   onSave={save('co_op_agent')} />
            <EditableField label="Lender"      value={transaction.lender_name  || ''} type="text"   onSave={save('lender_name')} />
            <EditableField label="Title Co."   value={transaction.title_company || ''} type="text"  onSave={save('title_company')} />
          </div>

          {/* Commission */}
          <div className="panel-section">
            <div className="panel-section-title">Commission</div>
            <EditableField label="Comp"    value={commission.commission_rate || ''}                                   type="text"   onSave={saveCm('commission_rate')} placeholder="3 or $1500" />
            <Field         label="GCI"     value={fmtCents(gci)} />
            <EditableField label="Ref %"   value={String(commission.ref_percent ?? '')}                               type="number" onSave={saveCm('ref_percent')} />
            <EditableField label="TC Fee"  value={String(commission.tc_fee ?? '')} displayValue={fmtCents(commission.tc_fee)} type="number" onSave={saveCm('tc_fee')} />
            <EditableField label="Status"  value={commission.commission_status || 'Pending'} type="select" options={['Pending', 'Closed']} onSave={saveCm('commission_status')} />
          </div>

          {/* Notes */}
          <div className="panel-section">
            <div className="panel-section-title">Notes</div>
            <EditableField
              label=""
              value={transaction.notes || ''}
              type="textarea"
              onSave={save('notes')}
              placeholder="Click to add notes…"
              fullWidth
            />
          </div>

          {/* Tasks */}
          <div className="panel-section">
            <TaskSection
              tasks={tasks}
              transactionId={transaction.id}
              onAdd={onAddTask}
              onUpdate={onUpdateTask}
              onDelete={onDeleteTask}
            />
          </div>

          {/* Delete */}
          <div className="panel-delete-section">
            <button className="panel-delete-btn" onClick={handleDelete}>
              Delete Transaction
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
