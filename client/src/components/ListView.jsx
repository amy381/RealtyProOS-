import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { uploadToDrive, syncDriveFolder, CONTRACT_DOCS } from '../lib/googleDrive'
import toast from 'react-hot-toast'
import DateInput from './DateInput'
import './ListView.css'

// ─── Constants ────────────────────────────────────────────────────────────────
const STAGES = [
  { value: 'buyer-broker',      label: 'Buyer-Broker'        },
  { value: 'pre-listing',       label: 'Pre-Listing'         },
  { value: 'active-listing',    label: 'Active Listing'      },
  { value: 'pending',           label: 'Pending'             },
  { value: 'closed',            label: 'Closed'              },
  { value: 'cancelled-expired', label: 'Cancelled / Expired' },
]

const DEFAULT_STAGE_CHECKS = new Set([
  'buyer-broker', 'pre-listing', 'active-listing', 'pending', 'closed',
])

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

const TC_NAMES = ['Justina Morris', 'Victoria Lareau']

const DEFAULT_FILTERS = {
  search:         '',
  typeFilter:     'All',
  stageChecks:    DEFAULT_STAGE_CHECKS,
  tcFilter:       'All',
  propTypeFilter: 'All',
  coeFrom:        '',
  coeTo:          '',
  minPrice:       '',
  maxPrice:       '',
}

function serializeFilters(f) {
  return { ...f, stageChecks: [...f.stageChecks] }
}
function deserializeFilters(raw) {
  return {
    ...DEFAULT_FILTERS,
    ...raw,
    stageChecks: new Set(raw.stageChecks ?? [...DEFAULT_STAGE_CHECKS]),
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcGCI(tx, commission) {
  if (!commission) return 0
  const price  = Number(tx.price) || 0
  const scFlat = commission.seller_concession_flat    != null ? Number(commission.seller_concession_flat)    : null
  const scPct  = Number(commission.seller_concession_percent)  || 0
  const bcFlat = commission.buyer_contribution_flat   != null ? Number(commission.buyer_contribution_flat)   : null
  const bcPct  = Number(commission.buyer_contribution_percent) || 0
  return (scFlat != null ? scFlat : scPct / 100 * price)
       + (bcFlat != null ? bcFlat : bcPct / 100 * price)
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

function countActiveFilters(f) {
  let n = 0
  // search is always visible — not counted in badge
  if (f.typeFilter !== 'All') n++
  if (f.tcFilter !== 'All') n++
  if (f.propTypeFilter !== 'All') n++
  if (f.coeFrom || f.coeTo) n++
  if (f.minPrice || f.maxPrice) n++
  const sc = f.stageChecks
  if (sc.size !== DEFAULT_STAGE_CHECKS.size || [...DEFAULT_STAGE_CHECKS].some(s => !sc.has(s))) n++
  return n
}

// ─── Filters Panel ────────────────────────────────────────────────────────────
function FiltersPanel({ draft, setDraft, onApply, onClear, onClose, savedViews, onSaveView, onApplyView, onDeleteView, activeViewId, saving }) {
  const set = (key, val) => setDraft(d => ({ ...d, [key]: val }))

  const toggleStage = (value) => {
    setDraft(d => {
      const next = new Set(d.stageChecks)
      next.has(value) ? next.delete(value) : next.add(value)
      return { ...d, stageChecks: next }
    })
  }

  return (
    <>
      <div className="lv-fpanel-overlay" onClick={onClose} />
      <div className="lv-fpanel">

        <div className="lv-fpanel-header">
          <span className="lv-fpanel-title">Filters</span>
          <button className="lv-fpanel-close" onClick={onClose}>✕</button>
        </div>

        <div className="lv-fpanel-body">

          {/* STAGE */}
          <div className="lv-fpanel-section">
            <div className="lv-fpanel-section-title">Stage</div>
            <div className="lv-fpanel-checks">
              {STAGES.map(s => (
                <label key={s.value} className="lv-fpanel-check-item">
                  <input
                    type="checkbox"
                    className="lv-fpanel-checkbox"
                    checked={draft.stageChecks.has(s.value)}
                    onChange={() => toggleStage(s.value)}
                  />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* TRANSACTION TYPE */}
          <div className="lv-fpanel-section">
            <div className="lv-fpanel-section-title">Transaction Type</div>
            <div className="lv-fpanel-toggles">
              {['All', 'Buyer', 'Seller'].map(v => (
                <button
                  key={v}
                  className={`lv-fpanel-toggle${draft.typeFilter === v ? ' active' : ''}`}
                  onClick={() => set('typeFilter', v)}
                >{v}</button>
              ))}
            </div>
          </div>

          {/* TC */}
          <div className="lv-fpanel-section">
            <div className="lv-fpanel-section-title">TC</div>
            <div className="lv-fpanel-toggles">
              {['All', ...TC_NAMES].map(v => (
                <button
                  key={v}
                  className={`lv-fpanel-toggle${draft.tcFilter === v ? ' active' : ''}`}
                  onClick={() => set('tcFilter', v)}
                >{v === 'Justina Morris' ? 'Justina' : v === 'Victoria Lareau' ? 'Victoria' : v}</button>
              ))}
            </div>
          </div>

          {/* PROPERTY TYPE */}
          <div className="lv-fpanel-section">
            <div className="lv-fpanel-section-title">Property Type</div>
            <div className="lv-fpanel-toggles">
              {['All', 'Residential', 'Vacant Land'].map(v => (
                <button
                  key={v}
                  className={`lv-fpanel-toggle${draft.propTypeFilter === v ? ' active' : ''}`}
                  onClick={() => set('propTypeFilter', v)}
                >{v}</button>
              ))}
            </div>
          </div>

          {/* DATE RANGE */}
          <div className="lv-fpanel-section">
            <div className="lv-fpanel-section-title">COE Date Range</div>
            <div className="lv-fpanel-row">
              <div className="lv-fpanel-field">
                <label className="lv-fpanel-field-label">From</label>
                <DateInput
                  className="lv-fpanel-input"
                  value={draft.coeFrom}
                  onChange={e => set('coeFrom', e.target.value)}
                />
              </div>
              <div className="lv-fpanel-field">
                <label className="lv-fpanel-field-label">To</label>
                <DateInput
                  className="lv-fpanel-input"
                  value={draft.coeTo}
                  onChange={e => set('coeTo', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* PRICE RANGE */}
          <div className="lv-fpanel-section">
            <div className="lv-fpanel-section-title">Price Range</div>
            <div className="lv-fpanel-row">
              <div className="lv-fpanel-field">
                <label className="lv-fpanel-field-label">Min Price</label>
                <input
                  type="number"
                  className="lv-fpanel-input"
                  placeholder="0"
                  value={draft.minPrice}
                  onChange={e => set('minPrice', e.target.value)}
                />
              </div>
              <div className="lv-fpanel-field">
                <label className="lv-fpanel-field-label">Max Price</label>
                <input
                  type="number"
                  className="lv-fpanel-input"
                  placeholder="Any"
                  value={draft.maxPrice}
                  onChange={e => set('maxPrice', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* SAVED VIEWS */}
          {savedViews.length > 0 && (
            <div className="lv-fpanel-section">
              <div className="lv-fpanel-section-title">Saved Views</div>
              <div className="lv-fpanel-views">
                {savedViews.map(view => (
                  <div
                    key={view.id}
                    className={`lv-fpanel-view-chip${activeViewId === view.id ? ' active' : ''}`}
                  >
                    <button className="lv-fpanel-view-name" onClick={() => onApplyView(view)}>
                      {view.name}
                    </button>
                    <button
                      className="lv-fpanel-view-del"
                      onClick={e => { e.stopPropagation(); onDeleteView(view.id, e) }}
                      title="Delete view"
                    >×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="lv-fpanel-footer">
          <button className="lv-fpanel-clear" onClick={onClear}>Clear All</button>
          <div className="lv-fpanel-footer-right">
            <button className="lv-fpanel-save" onClick={onSaveView} disabled={saving}>
              {saving ? 'Saving…' : 'Save View'}
            </button>
            <button className="lv-fpanel-apply" onClick={onApply}>Apply Filters</button>
          </div>
        </div>

      </div>
    </>
  )
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
      <td className="lv-td lv-td-actions" onClick={e => e.stopPropagation()}>
        <GoToDropdown tx={tx} onOpenSection={onOpenSection} />
        <UploadButton tx={tx} />
      </td>
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
    </tr>
  )
}

// ─── Main ListView ────────────────────────────────────────────────────────────
export default function ListView({ transactions, commissions, columns, onCardClick, onOpenSection }) {
  const [filters,      setFilters]      = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('listViewFilters') || 'null')
      return raw ? deserializeFilters(raw) : DEFAULT_FILTERS
    } catch { return DEFAULT_FILTERS }
  })
  const [draft,        setDraft]        = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('listViewFilters') || 'null')
      return raw ? deserializeFilters(raw) : DEFAULT_FILTERS
    } catch { return DEFAULT_FILTERS }
  })
  const [panelOpen,    setPanelOpen]    = useState(false)
  const [sortCol,      setSortCol]      = useState('status')
  const [sortDir,      setSortDir]      = useState('asc')
  const [savedViews,   setSavedViews]   = useState([])
  const [activeViewId, setActiveViewId] = useState(null)
  const [saving,       setSaving]       = useState(false)

  // Load saved views on mount
  useEffect(() => {
    supabase.from('saved_filters').select('*').order('created_at').then(({ data }) => {
      if (data) setSavedViews(data)
    })
  }, [])

  const openPanel = () => {
    setDraft(filters)
    setPanelOpen(true)
  }

  const closePanel = () => setPanelOpen(false)

  const applyPanel = () => {
    setFilters(draft)
    setActiveViewId(null)
    setPanelOpen(false)
    localStorage.setItem('listViewFilters', JSON.stringify(serializeFilters(draft)))
  }

  const clearAll = () => {
    setDraft(DEFAULT_FILTERS)
    setFilters(DEFAULT_FILTERS)
    setActiveViewId(null)
    setPanelOpen(false)
    localStorage.removeItem('listViewFilters')
  }

  const applyView = (view) => {
    const f = view.filters || {}
    const applied = {
      search:         f.search         ?? '',
      typeFilter:     f.typeFilter      ?? 'All',
      stageChecks:    new Set(f.stageChecks ?? [...DEFAULT_STAGE_CHECKS]),
      tcFilter:       f.tcFilter        ?? 'All',
      propTypeFilter: f.propTypeFilter  ?? 'All',
      coeFrom:        f.coeFrom         ?? '',
      coeTo:          f.coeTo           ?? '',
      minPrice:       f.minPrice        ?? '',
      maxPrice:       f.maxPrice        ?? '',
    }
    setFilters(applied)
    setDraft(applied)
    setActiveViewId(view.id)
    setPanelOpen(false)
  }

  const saveView = async () => {
    const name = window.prompt('Name this view:')
    if (!name?.trim()) return
    setSaving(true)
    const toSave = { ...draft, stageChecks: [...draft.stageChecks] }
    const { data, error } = await supabase
      .from('saved_filters')
      .insert({ name: name.trim(), filters: toSave })
      .select()
      .single()
    setSaving(false)
    if (error) { toast.error('Failed to save view'); return }
    setSavedViews(v => [...v, data])
    setActiveViewId(data.id)
    setFilters(draft)
    setPanelOpen(false)
    toast.success(`View "${data.name}" saved`)
  }

  const deleteView = async (id, e) => {
    e?.stopPropagation()
    const { error } = await supabase.from('saved_filters').delete().eq('id', id)
    if (error) { toast.error('Failed to delete view'); return }
    setSavedViews(v => v.filter(sv => sv.id !== id))
    if (activeViewId === id) setActiveViewId(null)
  }

  const filterCount = countActiveFilters(filters)

  const gciFor = tx => calcGCI(tx, commissions?.[tx.id])
  const closed     = transactions.filter(t => t.status === 'closed')
  const pending    = transactions.filter(t => t.status === 'pending')
  const closedGCI  = closed.reduce((s, t)  => s + gciFor(t), 0)
  const pendingGCI = pending.reduce((s, t) => s + gciFor(t), 0)

  // Apply filters
  let filtered = transactions

  // Stage: only show transactions whose stage is in stageChecks
  filtered = filtered.filter(t => filters.stageChecks.has(t.status))

  if (filters.search.trim()) {
    const q = filters.search.toLowerCase()
    filtered = filtered.filter(t =>
      (t.property_address || '').toLowerCase().includes(q) ||
      clientNames(t).toLowerCase().includes(q)
    )
  }
  if (filters.typeFilter     !== 'All') filtered = filtered.filter(t => t.rep_type      === filters.typeFilter)
  if (filters.tcFilter       !== 'All') filtered = filtered.filter(t => t.assigned_tc   === filters.tcFilter)
  if (filters.propTypeFilter !== 'All') filtered = filtered.filter(t => t.property_type === filters.propTypeFilter)
  if (filters.coeFrom) filtered = filtered.filter(t => t.close_of_escrow && t.close_of_escrow >= filters.coeFrom)
  if (filters.coeTo)   filtered = filtered.filter(t => t.close_of_escrow && t.close_of_escrow <= filters.coeTo)
  if (filters.minPrice) filtered = filtered.filter(t => getPrice(t) >= Number(filters.minPrice))
  if (filters.maxPrice) filtered = filtered.filter(t => getPrice(t) <= Number(filters.maxPrice))

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

  const setSearch = (val) => {
    setFilters(f => ({ ...f, search: val }))
    setDraft(d => ({ ...d, search: val }))
  }

  const activeChips = (() => {
    const chips = []

    if (activeViewId) {
      const view = savedViews.find(v => v.id === activeViewId)
      if (view) chips.push({
        key: 'view',
        label: `View: ${view.name}`,
        onRemove: () => { setFilters(DEFAULT_FILTERS); setDraft(DEFAULT_FILTERS); setActiveViewId(null) }
      })
    }

    const stageDiffers = DEFAULT_STAGE_CHECKS.size !== filters.stageChecks.size ||
      [...DEFAULT_STAGE_CHECKS].some(s => !filters.stageChecks.has(s))
    if (stageDiffers) {
      const labels = STAGES.filter(s => filters.stageChecks.has(s.value)).map(s => s.label)
      chips.push({
        key: 'stage',
        label: `Stage: ${labels.length <= 2 ? labels.join(', ') : `${labels.length} stages`}`,
        onRemove: () => {
          setFilters(f => ({ ...f, stageChecks: DEFAULT_STAGE_CHECKS }))
          setDraft(d => ({ ...d, stageChecks: DEFAULT_STAGE_CHECKS }))
          setActiveViewId(null)
        }
      })
    }

    if (filters.typeFilter !== 'All') chips.push({
      key: 'type',
      label: `Type: ${filters.typeFilter}`,
      onRemove: () => { setFilters(f => ({ ...f, typeFilter: 'All' })); setDraft(d => ({ ...d, typeFilter: 'All' })); setActiveViewId(null) }
    })

    if (filters.tcFilter !== 'All') {
      const short = filters.tcFilter === 'Justina Morris' ? 'Justina' : 'Victoria'
      chips.push({
        key: 'tc',
        label: `TC: ${short}`,
        onRemove: () => { setFilters(f => ({ ...f, tcFilter: 'All' })); setDraft(d => ({ ...d, tcFilter: 'All' })); setActiveViewId(null) }
      })
    }

    if (filters.propTypeFilter !== 'All') chips.push({
      key: 'propType',
      label: `Property: ${filters.propTypeFilter}`,
      onRemove: () => { setFilters(f => ({ ...f, propTypeFilter: 'All' })); setDraft(d => ({ ...d, propTypeFilter: 'All' })); setActiveViewId(null) }
    })

    if (filters.coeFrom || filters.coeTo) {
      const label = filters.coeFrom && filters.coeTo
        ? `COE: ${filters.coeFrom} – ${filters.coeTo}`
        : filters.coeFrom ? `COE from ${filters.coeFrom}` : `COE to ${filters.coeTo}`
      chips.push({
        key: 'coe',
        label,
        onRemove: () => { setFilters(f => ({ ...f, coeFrom: '', coeTo: '' })); setDraft(d => ({ ...d, coeFrom: '', coeTo: '' })); setActiveViewId(null) }
      })
    }

    if (filters.minPrice || filters.maxPrice) {
      const fmtP = v => v ? `$${Number(v).toLocaleString()}` : ''
      const label = filters.minPrice && filters.maxPrice
        ? `Price: ${fmtP(filters.minPrice)} – ${fmtP(filters.maxPrice)}`
        : filters.minPrice ? `Price ≥ ${fmtP(filters.minPrice)}` : `Price ≤ ${fmtP(filters.maxPrice)}`
      chips.push({
        key: 'price',
        label,
        onRemove: () => { setFilters(f => ({ ...f, minPrice: '', maxPrice: '' })); setDraft(d => ({ ...d, minPrice: '', maxPrice: '' })); setActiveViewId(null) }
      })
    }

    return chips
  })()

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

      {/* Search bar */}
      <div className="lv-searchbar">
        <span className="lv-searchbar-icon">⌕</span>
        <input
          className="lv-searchbar-input"
          type="text"
          placeholder="Search address or client name…"
          value={filters.search}
          onChange={e => setSearch(e.target.value)}
        />
        {filters.search && (
          <button className="lv-searchbar-clear" onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {/* Toolbar */}
      <div className="lv-toolbar">
        <span className="lv-result-count">{sorted.length} transaction{sorted.length !== 1 ? 's' : ''}</span>
        {filterCount > 0 && (
          <button className="lv-clear-btn" onClick={clearAll}>Clear All</button>
        )}
        <button
          className={`lv-filters-btn${filterCount > 0 ? ' has-filters' : ''}`}
          onClick={openPanel}
        >
          Filters{filterCount > 0 ? ` (${filterCount})` : ''}
        </button>
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div className="lv-chips">
          {activeChips.map(chip => (
            <span key={chip.key} className="lv-chip">
              {chip.label}
              <button className="lv-chip-remove" onClick={chip.onRemove}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* Filter panel */}
      {panelOpen && (
        <FiltersPanel
          draft={draft}
          setDraft={setDraft}
          onApply={applyPanel}
          onClear={() => setDraft(DEFAULT_FILTERS)}
          onClose={closePanel}
          savedViews={savedViews}
          onSaveView={saveView}
          onApplyView={applyView}
          onDeleteView={deleteView}
          activeViewId={activeViewId}
          saving={saving}
        />
      )}

      {/* Table */}
      <div className="lv-table-wrap">
        <table className="lv-table">
          <thead>
            <tr className="lv-thead-row">
              <th className="lv-th lv-th-actions">Actions</th>
              <th className="lv-th" onClick={() => toggleSort('address')}>Address {arrow('address')}</th>
              <th className="lv-th" onClick={() => toggleSort('client')}>Client {arrow('client')}</th>
              <th className="lv-th" onClick={() => toggleSort('rep_type')}>Type {arrow('rep_type')}</th>
              <th className="lv-th" onClick={() => toggleSort('prop_type')}>Property {arrow('prop_type')}</th>
              <th className="lv-th" onClick={() => toggleSort('status')}>Stage {arrow('status')}</th>
              <th className="lv-th" onClick={() => toggleSort('tc')}>TC {arrow('tc')}</th>
              <th className="lv-th" onClick={() => toggleSort('contract')}>Contract {arrow('contract')}</th>
              <th className="lv-th" onClick={() => toggleSort('coe')}>COE {arrow('coe')}</th>
              <th className="lv-th" onClick={() => toggleSort('price')}>Price {arrow('price')}</th>
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
