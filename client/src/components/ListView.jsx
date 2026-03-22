import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { TC_OPTIONS } from '../lib/columnFields'
import { uploadToDrive, syncDriveFolder, CONTRACT_DOCS } from '../lib/googleDrive'
import toast from 'react-hot-toast'
import './ListView.css'

// ─── Constants ────────────────────────────────────────────────────────────────
const STAGES = [
  { value: 'pre-listing',       label: 'Pre-Listing'         },
  { value: 'active-listing',    label: 'Active Listing'      },
  { value: 'buyer-broker',      label: 'Buyer-Broker'        },
  { value: 'pending',           label: 'Pending'             },
  { value: 'closed',            label: 'Closed'              },
  { value: 'cancelled-expired', label: 'Cancelled / Expired' },
]

const STAGE_ORDER = {
  'pre-listing': 0, 'active-listing': 1, 'buyer-broker': 2,
  'pending': 3, 'closed': 4, 'cancelled-expired': 5,
}

const SECTIONS = [
  { id: 'details',      label: 'Transaction Details' },
  { id: 'tasks',        label: 'Tasks'               },
  { id: 'docs-req',     label: 'Documents Required'  },
  { id: 'commission',   label: 'Commission'          },
  { id: 'google-drive', label: 'Google Drive'        },
]

const ALL_DOCS = [
  'Listing Agreement', 'Seller Disclosure Statement', 'Property Condition Report',
  'HOA Documents', 'Transfer Disclosure Statement', 'Natural Hazard Disclosure',
  'Preliminary Title Report', 'Pest Inspection Report', 'Home Inspection Report',
  'Solar / Septic / Well Documentation', 'Buyer Broker Agreement',
  'Pre-Approval Letter', 'Purchase & Sale Agreement', 'Contingency Removal',
  'Appraisal Report', 'Loan Commitment Letter',
  'Final Walkthrough Verification', 'Closing Disclosure',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseContrib(val, price) {
  if (!val) return 0
  const s = String(val).trim()
  if (s.startsWith('$')) return Number(s.replace(/[$,\s]/g, '')) || 0
  return (Number(s.replace(/[%\s]/g, '')) || 0) / 100 * price
}

function calcGCI(tx, commission) {
  if (!commission) return 0
  const price = Number(tx.price) || 0
  const s = parseContrib(commission.seller_concession, price)
  const b = commission.buyer_contribution ? parseContrib(commission.buyer_contribution, price) : 0
  return s + b
}

function fmtMoney(n) {
  if (!n && n !== 0) return '—'
  const num = Number(n)
  if (isNaN(num) || num === 0) return '—'
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function clientNames(tx) {
  const c1 = [tx.client_first_name, tx.client_last_name].filter(Boolean).join(' ') || tx.client_name || ''
  const c2 = [tx.client2_first_name, tx.client2_last_name].filter(Boolean).join(' ') || ''
  return [c1, c2].filter(Boolean).join(' & ')
}

function getPrice(tx) { return Number(tx.price) || 0 }

function getContractDate(tx) {
  return tx.rep_type === 'Buyer' ? tx.bba_contract : tx.listing_contract
}

// ─── GoTo Dropdown ────────────────────────────────────────────────────────────
function GoToDropdown({ tx, onOpenSection }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div className="lv-goto-wrap" ref={ref}>
      <button
        className="lv-action-btn lv-goto-btn"
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
      >
        Go To ▾
      </button>
      {open && (
        <div className="lv-goto-menu">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className="lv-goto-item"
              onClick={e => { e.stopPropagation(); setOpen(false); onOpenSection(tx, s.id) }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Upload Button ────────────────────────────────────────────────────────────
function UploadButton({ tx }) {
  const [open, setOpen]           = useState(false)
  const [docType, setDocType]     = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  const ref     = useRef(null)

  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!docType) { toast.error('Select a document type first'); return }
    setUploading(true)
    try {
      let folderId = tx.drive_folder_id
      if (!folderId) {
        const created = await syncDriveFolder({
          transactionId:        tx.id,
          newStatus:            tx.status,
          driveFolderId:        null,
          driveUnderContractId: null,
          repType:              tx.rep_type,
          propertyAddress:      tx.property_address || '',
          clientLastName:       tx.client_last_name  || '',
        })
        folderId = created.drive_folder_id
      }
      const isContract = CONTRACT_DOCS.has(docType)
      const targetId   = isContract && tx.drive_under_contract_id ? tx.drive_under_contract_id : folderId
      if (!targetId) { toast.error('No Drive folder connected'); setUploading(false); return }
      await uploadToDrive(file, targetId)
      toast.success(`${docType} uploaded`)
      setOpen(false); setDocType('')
    } catch (err) {
      toast.error(`Upload failed: ${err.message}`)
    }
    setUploading(false)
  }

  return (
    <div className="lv-upload-wrap" ref={ref}>
      <button
        className="lv-action-btn lv-upload-btn"
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        disabled={uploading}
        title="Upload document"
      >
        {uploading ? '…' : '↑'}
      </button>
      {open && (
        <div className="lv-upload-menu">
          <select
            className="lv-upload-sel"
            value={docType}
            onChange={e => setDocType(e.target.value)}
          >
            <option value="">Select document type…</option>
            {ALL_DOCS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button
            className="lv-upload-go"
            disabled={!docType}
            onClick={() => fileRef.current?.click()}
          >
            Choose File
          </button>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleUpload} />
        </div>
      )}
    </div>
  )
}

// ─── List Row ─────────────────────────────────────────────────────────────────
function ListRow({ tx, stageLabel, onCardClick, onOpenSection }) {
  const c1 = [tx.client_first_name, tx.client_last_name].filter(Boolean).join(' ') || tx.client_name || '—'
  const c2 = [tx.client2_first_name, tx.client2_last_name].filter(Boolean).join(' ')
  const price        = getPrice(tx)
  const contractDate = getContractDate(tx)

  return (
    <tr className="lv-row" onClick={() => onCardClick(tx)}>
      <td className="lv-td lv-td-addr">{tx.property_address || '—'}</td>
      <td className="lv-td lv-td-client">
        <span className="lv-client1">{c1}</span>
        {c2 && <span className="lv-client2">{c2}</span>}
      </td>
      <td className="lv-td">{tx.rep_type || '—'}</td>
      <td className="lv-td">{tx.property_type || '—'}</td>
      <td className="lv-td">
        <span className={`lv-stage lv-stage--${tx.status}`}>{stageLabel(tx.status)}</span>
      </td>
      <td className="lv-td lv-td-tc">{tx.assigned_tc || '—'}</td>
      <td className="lv-td lv-td-date">{fmtDate(contractDate)}</td>
      <td className="lv-td lv-td-date">{fmtDate(tx.close_of_escrow)}</td>
      <td className="lv-td lv-td-price">{price ? fmtMoney(price) : '—'}</td>
      <td className="lv-td lv-td-actions" onClick={e => e.stopPropagation()}>
        <GoToDropdown tx={tx} onOpenSection={onOpenSection} />
        <UploadButton tx={tx} />
      </td>
    </tr>
  )
}

// ─── Main ListView ────────────────────────────────────────────────────────────
export default function ListView({ transactions, commissions, columns, onCardClick, onOpenSection }) {
  const [search,      setSearch]      = useState('')
  const [typeFilter,  setTypeFilter]  = useState('All')
  const [stageFilter, setStageFilter] = useState('All')
  const [tcFilter,    setTcFilter]    = useState('All')
  const [coeFrom,     setCoeFrom]     = useState('')
  const [coeTo,       setCoeTo]       = useState('')
  const [sortCol,     setSortCol]     = useState('status')
  const [sortDir,     setSortDir]     = useState('asc')

  const [savedViews,  setSavedViews]  = useState([])
  const [activeViewId, setActiveViewId] = useState(null)
  const [saving,      setSaving]      = useState(false)

  // Load saved views on mount
  useEffect(() => {
    supabase.from('saved_filters').select('*').order('created_at').then(({ data }) => {
      if (data) setSavedViews(data)
    })
  }, [])

  // Wrappers that clear active view when user manually changes a filter
  const changeSearch      = v => { setSearch(v);      setActiveViewId(null) }
  const changeTypeFilter  = v => { setTypeFilter(v);  setActiveViewId(null) }
  const changeStageFilter = v => { setStageFilter(v); setActiveViewId(null) }
  const changeTcFilter    = v => { setTcFilter(v);    setActiveViewId(null) }
  const changeCoeFrom     = v => { setCoeFrom(v);     setActiveViewId(null) }
  const changeCoeTo       = v => { setCoeTo(v);       setActiveViewId(null) }

  const clearAll = () => {
    setSearch(''); setTypeFilter('All'); setStageFilter('All')
    setTcFilter('All'); setCoeFrom(''); setCoeTo('')
    setActiveViewId(null)
  }

  const applyView = (view) => {
    const f = view.filters || {}
    setSearch(f.search       ?? '')
    setTypeFilter(f.typeFilter  ?? 'All')
    setStageFilter(f.stageFilter ?? 'All')
    setTcFilter(f.tcFilter    ?? 'All')
    setCoeFrom(f.coeFrom      ?? '')
    setCoeTo(f.coeTo        ?? '')
    setActiveViewId(view.id)
  }

  const saveView = async () => {
    const name = window.prompt('Name this view:')
    if (!name?.trim()) return
    setSaving(true)
    const filters = { search, typeFilter, stageFilter, tcFilter, coeFrom, coeTo }
    const { data, error } = await supabase
      .from('saved_filters')
      .insert({ name: name.trim(), filters })
      .select()
      .single()
    setSaving(false)
    if (error) { toast.error('Failed to save view'); return }
    setSavedViews(v => [...v, data])
    setActiveViewId(data.id)
    toast.success(`View "${data.name}" saved`)
  }

  const deleteView = async (id, e) => {
    e.stopPropagation()
    const { error } = await supabase.from('saved_filters').delete().eq('id', id)
    if (error) { toast.error('Failed to delete view'); return }
    setSavedViews(v => v.filter(sv => sv.id !== id))
    if (activeViewId === id) setActiveViewId(null)
  }

  const hasFilters = search || typeFilter !== 'All' || stageFilter !== 'All'
    || tcFilter !== 'All' || coeFrom || coeTo

  const gciFor = tx => calcGCI(tx, commissions?.[tx.id])

  const closed     = transactions.filter(t => t.status === 'closed')
  const pending    = transactions.filter(t => t.status === 'pending')
  const closedGCI  = closed.reduce((s, t)  => s + gciFor(t), 0)
  const pendingGCI = pending.reduce((s, t) => s + gciFor(t), 0)

  // Filter
  let filtered = transactions
  if (search.trim()) {
    const q = search.toLowerCase()
    filtered = filtered.filter(t =>
      (t.property_address || '').toLowerCase().includes(q) ||
      clientNames(t).toLowerCase().includes(q)
    )
  }
  if (typeFilter  !== 'All') filtered = filtered.filter(t => t.rep_type     === typeFilter)
  if (stageFilter !== 'All') filtered = filtered.filter(t => t.status       === stageFilter)
  if (tcFilter    !== 'All') filtered = filtered.filter(t => t.assigned_tc  === tcFilter)
  if (coeFrom) filtered = filtered.filter(t => t.close_of_escrow && t.close_of_escrow >= coeFrom)
  if (coeTo)   filtered = filtered.filter(t => t.close_of_escrow && t.close_of_escrow <= coeTo)

  // Sort
  const toggleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    switch (sortCol) {
      case 'address':   return dir * (a.property_address || '').localeCompare(b.property_address || '', undefined, { sensitivity: 'base' })
      case 'client':    return dir * clientNames(a).localeCompare(clientNames(b), undefined, { sensitivity: 'base' })
      case 'rep_type':  return dir * (a.rep_type || '').localeCompare(b.rep_type || '', undefined, { sensitivity: 'base' })
      case 'prop_type': return dir * (a.property_type || '').localeCompare(b.property_type || '', undefined, { sensitivity: 'base' })
      case 'status':    return dir * ((STAGE_ORDER[a.status] ?? 9) - (STAGE_ORDER[b.status] ?? 9))
      case 'tc':        return dir * (a.assigned_tc || '').localeCompare(b.assigned_tc || '', undefined, { sensitivity: 'base' })
      case 'contract':  return dir * (getContractDate(a) || '').localeCompare(getContractDate(b) || '')
      case 'coe':       return dir * (a.close_of_escrow || '').localeCompare(b.close_of_escrow || '')
      case 'price':     return dir * (getPrice(a) - getPrice(b))
      default:          return 0
    }
  })

  const arrow = col => {
    if (sortCol !== col) return <span className="lv-th-arrow lv-th-arrow--inactive">↕</span>
    return <span className="lv-th-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const stageLabel = status => columns.find(c => c.id === status)?.label || status

  return (
    <div className="lv-wrap">

      {/* Summary boxes */}
      <div className="lv-summary">
        <div className="lv-summary-box">
          <span className="lv-summary-val">{closed.length}</span>
          <span className="lv-summary-label">Closed</span>
        </div>
        <div className="lv-summary-box">
          <span className="lv-summary-val">{pending.length}</span>
          <span className="lv-summary-label">Pending</span>
        </div>
        <div className="lv-summary-box">
          <span className="lv-summary-val">{closedGCI > 0 ? fmtMoney(closedGCI) : '—'}</span>
          <span className="lv-summary-label">Closed GCI</span>
        </div>
        <div className="lv-summary-box">
          <span className="lv-summary-val">{pendingGCI > 0 ? fmtMoney(pendingGCI) : '—'}</span>
          <span className="lv-summary-label">Pending GCI</span>
        </div>
      </div>

      {/* Saved views strip — only shown when views exist */}
      {savedViews.length > 0 && (
        <div className="lv-saved-views">
          <span className="lv-saved-views-label">Views</span>
          <div className="lv-saved-views-chips">
            {savedViews.map(view => (
              <div
                key={view.id}
                className={`lv-view-chip${activeViewId === view.id ? ' active' : ''}`}
              >
                <button
                  className="lv-view-chip-name"
                  onClick={() => applyView(view)}
                >
                  {view.name}
                </button>
                <button
                  className="lv-view-chip-del"
                  onClick={e => deleteView(view.id, e)}
                  title="Remove view"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="lv-filters">
        <input
          className="lv-search"
          placeholder="Search address or client…"
          value={search}
          onChange={e => changeSearch(e.target.value)}
        />
        <select className="lv-filter-sel" value={typeFilter} onChange={e => changeTypeFilter(e.target.value)}>
          <option value="All">All Types</option>
          <option value="Buyer">Buyer</option>
          <option value="Seller">Seller</option>
        </select>
        <select className="lv-filter-sel" value={stageFilter} onChange={e => changeStageFilter(e.target.value)}>
          <option value="All">All Stages</option>
          {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="lv-filter-sel" value={tcFilter} onChange={e => changeTcFilter(e.target.value)}>
          <option value="All">All TCs</option>
          {TC_OPTIONS.map(tc => <option key={tc} value={tc}>{tc}</option>)}
        </select>
        <div className="lv-date-range">
          <span className="lv-date-label">COE</span>
          <input className="lv-date-input" type="date" value={coeFrom} onChange={e => changeCoeFrom(e.target.value)} />
          <span className="lv-date-sep">–</span>
          <input className="lv-date-input" type="date" value={coeTo} onChange={e => changeCoeTo(e.target.value)} />
        </div>
        {hasFilters && (
          <button className="lv-clear-btn" onClick={clearAll}>Clear All</button>
        )}
        <button
          className="lv-save-view-btn"
          onClick={saveView}
          disabled={saving}
          title="Save current filters as a view"
        >
          {saving ? 'Saving…' : 'Save View'}
        </button>
      </div>

      {/* Table */}
      <div className="lv-table-wrap">
        <table className="lv-table">
          <thead>
            <tr className="lv-thead-row">
              <th className="lv-th" onClick={() => toggleSort('address')}>Address {arrow('address')}</th>
              <th className="lv-th" onClick={() => toggleSort('client')}>Client {arrow('client')}</th>
              <th className="lv-th" onClick={() => toggleSort('rep_type')}>Type {arrow('rep_type')}</th>
              <th className="lv-th" onClick={() => toggleSort('prop_type')}>Property {arrow('prop_type')}</th>
              <th className="lv-th" onClick={() => toggleSort('status')}>Stage {arrow('status')}</th>
              <th className="lv-th" onClick={() => toggleSort('tc')}>TC {arrow('tc')}</th>
              <th className="lv-th" onClick={() => toggleSort('contract')}>Contract {arrow('contract')}</th>
              <th className="lv-th" onClick={() => toggleSort('coe')}>COE {arrow('coe')}</th>
              <th className="lv-th" onClick={() => toggleSort('price')}>Price {arrow('price')}</th>
              <th className="lv-th lv-th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={10} className="lv-empty">No transactions match the current filters.</td>
              </tr>
            ) : (
              sorted.map(tx => (
                <ListRow
                  key={tx.id}
                  tx={tx}
                  stageLabel={stageLabel}
                  onCardClick={onCardClick}
                  onOpenSection={onOpenSection}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  )
}
