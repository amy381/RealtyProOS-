import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { COLUMN_FIELDS, BUYER_DATE_FIELDS, SELLER_DATE_FIELDS } from '../lib/columnFields'

// Card logic below mirrors components/TransactionCard.jsx (copied, not imported —
// the desktop file must stay untouched). Keep the two in step by hand.

const STORAGE_KEY = 'm-deal-status'

// Order, labels and priceLabel match the desktop COLUMNS in App.jsx.
const STATUSES = [
  { id: 'pending',        label: 'Pending',         empty: 'pending',        priceLabel: 'Purchase Price' },
  { id: 'active-listing', label: 'Active Listings', empty: 'active listing', priceLabel: 'List Price' },
  { id: 'pre-listing',    label: 'Pre-Listing',     empty: 'pre-listing',    priceLabel: 'List Price' },
  { id: 'buyer-broker',   label: 'Buyer-Broker',    empty: 'buyer-broker',   priceLabel: 'Purchase Price' },
  { id: 'closed',         label: 'Closed',          empty: 'closed',         priceLabel: 'Purchase Price' },
]

const SELECT_FIELDS = [
  'id', 'status', 'rep_type', 'property_address', 'created_at',
  'client_name', 'client_first_name', 'client_last_name', 'client2_first_name', 'client2_last_name',
  'price', 'contract_price',
  ...new Set([
    ...Object.values(COLUMN_FIELDS).flat().map(f => f.key),
    ...BUYER_DATE_FIELDS.map(f => f.key),
    ...SELLER_DATE_FIELDS.map(f => f.key),
  ]),
].join(', ')

function readStoredStatus() {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)
    return STATUSES.some(s => s.id === v) ? v : 'pending'
  } catch {
    return 'pending'
  }
}

function formatDate(dateStr, compact = false) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  if (compact) {
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    return `${mm}/${dd}/${yy}`
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getDaysUntil(dateStr) {
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

function getCardFields(tx) {
  const { status, rep_type } = tx

  if (status === 'closed') return tx.close_of_escrow ? [COE_FIELD] : []

  let dateFields
  if (status === 'pending') dateFields = COLUMN_FIELDS['pending']
  else if (rep_type === 'Buyer') dateFields = BUYER_DATE_FIELDS
  else if (rep_type === 'Seller') dateFields = SELLER_DATE_FIELDS
  else dateFields = COLUMN_FIELDS[status] || []

  const visibleDateFields = dateFields.filter(f =>
    f.type === 'date' && tx[f.key] &&
    !(f.key === 'target_live_date' && status === 'active-listing') &&
    !(f.key === 'close_of_escrow'  && status === 'active-listing')
  )
  const textFields = (COLUMN_FIELDS[status] || []).filter(f => f.type === 'text' && tx[f.key])

  return [...visibleDateFields, ...textFields]
}

function priceFor(tx, priceLabel) {
  const isPending = tx.status === 'pending'
  if (!(isPending ? tx.contract_price : (tx.contract_price || tx.price))) return null

  const label = isPending
    ? 'Purchase Price'
    : tx.rep_type === 'Seller' && tx.contract_price ? 'Contract Price' : priceLabel
  const raw = isPending
    ? tx.contract_price
    : tx.rep_type === 'Seller' && tx.contract_price ? tx.contract_price : (tx.contract_price ?? tx.price)

  return {
    label,
    text: Number(raw).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  }
}

function sortDeals(status, list) {
  // Other statuses keep query order (created_at desc), same as the desktop columns.
  if (status === 'pending') {
    return [...list].sort((a, b) => {
      const da = (a.close_of_escrow || '').slice(0, 10)
      const db = (b.close_of_escrow || '').slice(0, 10)
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return da.localeCompare(db)
    })
  }
  if (status === 'closed') {
    return [...list].sort((a, b) => {
      const da = (a.close_of_escrow || '').slice(0, 10)
      const db = (b.close_of_escrow || '').slice(0, 10)
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return db.localeCompare(da)
    })
  }
  return list
}

function DealCard({ tx, priceLabel }) {
  const fields = getCardFields(tx)
  const isClosed        = tx.status === 'closed'
  const isPending       = tx.status === 'pending'
  const isPreListing    = tx.status === 'pre-listing'
  const isActiveListing = tx.status === 'active-listing'
  const isBuyerBroker   = tx.status === 'buyer-broker'
  const showRepBadge = REP_BADGE_STATUSES.has(tx.status) && tx.rep_type
  const price = priceFor(tx, priceLabel)

  const client1 = [tx.client_first_name, tx.client_last_name].filter(Boolean).join(' ') || tx.client_name || '—'
  const client2 = [tx.client2_first_name, tx.client2_last_name].filter(Boolean).join(' ')

  return (
    <li className="m-deal">
      <div className="m-deal-address-row">
        <span className="m-deal-address">{streetOnly(tx.property_address) || 'No address'}</span>
        {showRepBadge && (
          <span className={`m-deal-rep ${tx.rep_type === 'Buyer' ? 'm-deal-rep--buyer' : 'm-deal-rep--seller'}`}>{tx.rep_type}</span>
        )}
      </div>

      <div className="m-deal-client">
        <div>{client1}</div>
        {client2 && <div>{client2}</div>}
      </div>

      {price && (
        <div className="m-deal-price">
          <span className="m-deal-label">{price.label}: </span>{price.text}
        </div>
      )}

      {fields.map((field) => {
        const value = tx[field.key]
        if (field.type === 'date') {
          const suppress = isClosed || isPending || isPreListing || isActiveListing || field.noOverdue
          const days = !suppress ? getDaysUntil(value) : null
          const isUrgent  = days !== null && days <= 7 && days >= 0
          const isOverdue = days !== null && days < 0
          return (
            <div key={field.key} className="m-deal-field">
              <span className="m-deal-label">{field.label}:</span>
              <span className={`m-deal-value${isUrgent || isOverdue ? ' m-deal-value--flag' : ''}`}>
                {formatDate(value, isBuyerBroker)}
                {isUrgent && days === 0 && <span className="m-deal-badge m-deal-badge--urgent">Today</span>}
                {isUrgent && days > 0 && <span className="m-deal-badge m-deal-badge--urgent">{days}d</span>}
                {isOverdue && <span className="m-deal-badge m-deal-badge--overdue">Overdue</span>}
              </span>
            </div>
          )
        }
        return (
          <div key={field.key} className="m-deal-field">
            <span className="m-deal-label">{field.label}:</span>
            <span className="m-deal-value">{value || '—'}</span>
          </div>
        )
      })}
    </li>
  )
}

export default function MobileDeals() {
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [deals, setDeals]     = useState([])
  const [status, setStatus]   = useState(readStoredStatus)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('transactions')
      .select(SELECT_FIELDS)
      .order('created_at', { ascending: false })
    if (err) {
      console.error('[mobile] deals load failed', err)
      setError(err.message || 'Could not load deals')
    } else {
      setDeals(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const onChange = (e) => {
    const next = e.target.value
    setStatus(next)
    try { sessionStorage.setItem(STORAGE_KEY, next) } catch { /* storage unavailable */ }
  }

  if (loading) return <div className="m-status">Loading…</div>

  if (error) {
    return (
      <div className="m-error" role="alert">
        <div>Couldn’t load deals: {error}</div>
        <button className="m-btn m-btn--primary" onClick={load}>Try again</button>
      </div>
    )
  }

  const counts = {}
  for (const d of deals) counts[d.status] = (counts[d.status] || 0) + 1

  const current = STATUSES.find(s => s.id === status) || STATUSES[0]
  const visible = sortDeals(current.id, deals.filter(d => d.status === current.id))

  return (
    <section className="m-section">
      <select
        className="m-select"
        aria-label="Filter deals by status"
        value={current.id}
        onChange={onChange}
      >
        {STATUSES.map(s => (
          <option key={s.id} value={s.id}>{s.label} ({counts[s.id] || 0})</option>
        ))}
      </select>

      {visible.length === 0 ? (
        <div className="m-empty">No {current.empty} deals</div>
      ) : (
        <ul className="m-list">
          {visible.map(tx => <DealCard key={tx.id} tx={tx} priceLabel={current.priceLabel} />)}
        </ul>
      )}
    </section>
  )
}
