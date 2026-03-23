import { useState, useMemo, useRef } from 'react'
import TaskCommentPanel from './TaskCommentPanel'
import './TasksTab.css'

// ─── Constants ────────────────────────────────────────────────────────────────
const TASK_STAGES = [
  { value: 'buyer-broker',      label: 'Buyer-Broker'        },
  { value: 'pre-listing',       label: 'Pre-Listing'         },
  { value: 'active-listing',    label: 'Active Listing'      },
  { value: 'pending',           label: 'Pending'             },
  { value: 'closed',            label: 'Closed'              },
  { value: 'cancelled-expired', label: 'Cancelled / Expired' },
]

const STAGE_ORDER = {
  'pre-listing': 0, 'active-listing': 1, 'buyer-broker': 2,
  'pending': 3, 'closed': 4, 'cancelled-expired': 5,
}
const STATUS_ORDER = { open: 0, in_progress: 1, complete: 2 }

const DEFAULT_STAGE_CHECKS = new Set([
  'buyer-broker', 'pre-listing', 'active-listing', 'pending', 'closed',
])

const DUE_OPTIONS = ['Overdue', 'Due Today', 'Due This Week', 'Upcoming', 'Completed']
const DEFAULT_DUE_CHECKS = new Set(['Overdue', 'Due Today', 'Due This Week', 'Upcoming'])

const DEFAULT_FILTERS = {
  search:      '',
  stageChecks: DEFAULT_STAGE_CHECKS,
  typeFilter:  'All',
  tcFilter:    'All',
  dueChecks:   DEFAULT_DUE_CHECKS,
}

const TC_NAMES         = ['Justina Morris', 'Victoria Lareau']
const ASSIGNEE_OPTIONS = ['Me', 'Justina Morris', 'Victoria Lareau']
const STATUS_OPTIONS   = [{ value: 'open', label: 'Open' }, { value: 'complete', label: 'Done' }]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatLocalDate(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function dueDateLabel(dateStr, isDone, completedAt) {
  if (isDone) return { text: completedAt ? formatLocalDate(completedAt) : '—', cls: 'done' }
  if (!dateStr) return { text: '—', cls: '' }
  const today = new Date(); today.setHours(0,0,0,0)
  const due   = new Date(dateStr + 'T00:00:00')
  const diff  = Math.ceil((due - today) / 86400000)
  const abs   = Math.abs(diff)
  if (diff < 0)   return { text: `${abs} day${abs !== 1 ? 's' : ''} overdue`, cls: 'overdue' }
  if (diff === 0) return { text: 'Due Today',  cls: 'today'    }
  if (diff <= 3)  return { text: `Due in ${diff}`, cls: 'soon' }
  return             { text: `Due in ${diff}`, cls: 'upcoming' }
}

function startOfWeek() {
  const d = new Date(); d.setHours(0,0,0,0)
  d.setDate(d.getDate() - d.getDay())
  return d
}
function endOfWeek() {
  const d = startOfWeek(); d.setDate(d.getDate() + 6)
  return d
}

// Classify a task into exactly one due-status bucket
function dueBucket(task, today, eow) {
  if (task.status === 'complete') return 'Completed'
  if (!task.due_date) return 'Upcoming'
  const diff = Math.ceil((new Date(task.due_date + 'T00:00:00') - today) / 86400000)
  if (diff < 0)  return 'Overdue'
  if (diff === 0) return 'Due Today'
  if (new Date(task.due_date + 'T00:00:00') <= eow) return 'Due This Week'
  return 'Upcoming'
}

function countFilters(f) {
  let n = 0
  // search is always visible — not counted in badge
  if (f.typeFilter !== 'All') n++
  if (f.tcFilter   !== 'All') n++
  if (f.stageChecks.size !== DEFAULT_STAGE_CHECKS.size ||
      [...DEFAULT_STAGE_CHECKS].some(s => !f.stageChecks.has(s))) n++
  const dueDiffers = f.dueChecks.size !== DEFAULT_DUE_CHECKS.size ||
    [...DEFAULT_DUE_CHECKS].some(s => !f.dueChecks.has(s)) ||
    [...f.dueChecks].some(s => !DEFAULT_DUE_CHECKS.has(s))
  if (dueDiffers) n++
  return n
}

function serializeFilters(f) {
  return { ...f, stageChecks: [...f.stageChecks], dueChecks: [...f.dueChecks] }
}
function deserializeFilters(raw) {
  return {
    ...DEFAULT_FILTERS,
    ...raw,
    stageChecks: new Set(raw.stageChecks ?? [...DEFAULT_STAGE_CHECKS]),
    dueChecks:   new Set(raw.dueChecks   ?? [...DEFAULT_DUE_CHECKS]),
  }
}

function loadSavedViews() {
  try { return JSON.parse(localStorage.getItem('taskSavedViews') || '[]') }
  catch { return [] }
}

// ─── Filters Panel ────────────────────────────────────────────────────────────
function FiltersPanel({ draft, setDraft, onApply, onClear, onClose, savedViews, onSaveView, onApplyView, onDeleteView, activeViewId }) {
  const set = (key, val) => setDraft(d => ({ ...d, [key]: val }))

  const toggleStage = (value) => {
    setDraft(d => {
      const next = new Set(d.stageChecks)
      next.has(value) ? next.delete(value) : next.add(value)
      return { ...d, stageChecks: next }
    })
  }

  const toggleDue = (value) => {
    setDraft(d => {
      const next = new Set(d.dueChecks)
      next.has(value) ? next.delete(value) : next.add(value)
      return { ...d, dueChecks: next }
    })
  }

  return (
    <>
      <div className="gtd-fp-overlay" onClick={onClose} />
      <div className="gtd-fp">

        <div className="gtd-fp-header">
          <span className="gtd-fp-title">Filters</span>
          <button className="gtd-fp-close" onClick={onClose}>✕</button>
        </div>

        <div className="gtd-fp-body">

          {/* STAGE */}
          <div className="gtd-fp-section">
            <div className="gtd-fp-section-title">Transaction Stage</div>
            <div className="gtd-fp-checks">
              {TASK_STAGES.map(s => (
                <label key={s.value} className="gtd-fp-check-item">
                  <input
                    type="checkbox"
                    className="gtd-fp-checkbox"
                    checked={draft.stageChecks.has(s.value)}
                    onChange={() => toggleStage(s.value)}
                  />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* TRANSACTION TYPE */}
          <div className="gtd-fp-section">
            <div className="gtd-fp-section-title">Transaction Type</div>
            <div className="gtd-fp-toggles">
              {['All', 'Buyer', 'Seller'].map(v => (
                <button
                  key={v}
                  className={`gtd-fp-toggle${draft.typeFilter === v ? ' active' : ''}`}
                  onClick={() => set('typeFilter', v)}
                >{v}</button>
              ))}
            </div>
          </div>

          {/* TC */}
          <div className="gtd-fp-section">
            <div className="gtd-fp-section-title">TC</div>
            <div className="gtd-fp-toggles">
              {['All', ...TC_NAMES].map(v => (
                <button
                  key={v}
                  className={`gtd-fp-toggle${draft.tcFilter === v ? ' active' : ''}`}
                  onClick={() => set('tcFilter', v)}
                >
                  {v === 'Justina Morris' ? 'Justina' : v === 'Victoria Lareau' ? 'Victoria' : v}
                </button>
              ))}
            </div>
          </div>

          {/* DUE STATUS — checkboxes */}
          <div className="gtd-fp-section">
            <div className="gtd-fp-section-title">Due Status</div>
            <div className="gtd-fp-checks">
              {DUE_OPTIONS.map(v => (
                <label key={v} className="gtd-fp-check-item">
                  <input
                    type="checkbox"
                    className="gtd-fp-checkbox"
                    checked={draft.dueChecks.has(v)}
                    onChange={() => toggleDue(v)}
                  />
                  <span>{v}</span>
                </label>
              ))}
            </div>
          </div>

          {/* SAVED VIEWS */}
          {savedViews.length > 0 && (
            <div className="gtd-fp-section">
              <div className="gtd-fp-section-title">Saved Views</div>
              <div className="gtd-fp-views">
                {savedViews.map(view => (
                  <div key={view.id} className={`gtd-fp-view-chip${activeViewId === view.id ? ' active' : ''}`}>
                    <button className="gtd-fp-view-name" onClick={() => onApplyView(view)}>{view.name}</button>
                    <button className="gtd-fp-view-del" onClick={() => onDeleteView(view.id)}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        <div className="gtd-fp-footer">
          <button className="gtd-fp-clear" onClick={onClear}>Clear All</button>
          <div className="gtd-fp-footer-right">
            <button className="gtd-fp-save" onClick={onSaveView}>Save View</button>
            <button className="gtd-fp-apply" onClick={onApply}>Apply Filters</button>
          </div>
        </div>

      </div>
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TasksTab({
  tasks, transactions, onTaskUpdate, onDeleteTask,
  taskComments = [], onAddTaskComment, onDeleteTaskComment,
  tcSettings = [], onCardClick,
}) {
  // Filter state
  const [filters,      setFilters]      = useState(DEFAULT_FILTERS)
  const [draft,        setDraft]        = useState(DEFAULT_FILTERS)
  const [panelOpen,    setPanelOpen]    = useState(false)
  const [savedViews,   setSavedViews]   = useState(loadSavedViews)
  const [activeViewId, setActiveViewId] = useState(null)

  // Sort state
  const [sortCol, setSortCol] = useState('due_date')
  const [sortDir, setSortDir] = useState('asc')

  // Bulk edit state
  const [bulkMode,     setBulkMode]     = useState(false)
  const [selectedIds,  setSelectedIds]  = useState(new Set())
  const [bulkAssignTo, setBulkAssignTo] = useState('')
  const [bulkStatus,   setBulkStatus]   = useState('')
  const [bulkApplying, setBulkApplying] = useState(false)

  // Comment panel
  const [commentTaskId, setCommentTaskId] = useState(null)

  const selectAllRef = useRef(null)

  const txMap = useMemo(() => {
    const m = {}
    transactions.forEach(t => { m[t.id] = t })
    return m
  }, [transactions])

  const stageLabel = v => TASK_STAGES.find(s => s.value === v)?.label || v || '—'

  // ── Filter + Sort ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0)
    const eow   = endOfWeek()

    const results = tasks.filter(task => {
      const tx = txMap[task.transaction_id]

      // Stage (based on transaction stage)
      const txStage = tx?.status
      if (txStage && !filters.stageChecks.has(txStage)) return false

      // Transaction Type
      if (filters.typeFilter !== 'All' && tx?.rep_type !== filters.typeFilter) return false

      // TC
      if (filters.tcFilter !== 'All' && tx?.assigned_tc !== filters.tcFilter) return false

      // Due Status checkboxes — hide task if its bucket is unchecked
      // Completed tasks hidden by default (Completed not in DEFAULT_DUE_CHECKS)
      if (!filters.dueChecks.has(dueBucket(task, today, eow))) return false

      // Search (live, always applied)
      if (filters.search.trim()) {
        const q = filters.search.toLowerCase()
        if (!(task.title || '').toLowerCase().includes(q) &&
            !(tx?.property_address || '').toLowerCase().includes(q)) return false
      }

      return true
    })

    // Sort
    return results.sort((a, b) => {
      const dir  = sortDir === 'asc' ? 1 : -1
      const txA  = txMap[a.transaction_id]
      const txB  = txMap[b.transaction_id]
      switch (sortCol) {
        case 'title':
          return dir * (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
        case 'stage':
          return dir * ((STAGE_ORDER[txA?.status] ?? 9) - (STAGE_ORDER[txB?.status] ?? 9))
        case 'transaction':
          return dir * (txA?.property_address || '').localeCompare(txB?.property_address || '', undefined, { sensitivity: 'base' })
        case 'assigned':
          return dir * (a.assigned_to || '').localeCompare(b.assigned_to || '', undefined, { sensitivity: 'base' })
        case 'due_date':
          return dir * ((a.due_date || 'zzzz').localeCompare(b.due_date || 'zzzz'))
        case 'status':
          return dir * ((STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0))
        default:
          return 0
      }
    })
  }, [tasks, txMap, filters, sortCol, sortDir])

  const openCount   = filtered.filter(t => t.status !== 'complete').length
  const doneCount   = filtered.filter(t => t.status === 'complete').length
  const filterCount = countFilters(filters)

  // ── Active filter chips ────────────────────────────────────────────────────
  const activeChips = useMemo(() => {
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
      const labels = TASK_STAGES.filter(s => filters.stageChecks.has(s.value)).map(s => s.label)
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
      onRemove: () => {
        setFilters(f => ({ ...f, typeFilter: 'All' }))
        setDraft(d => ({ ...d, typeFilter: 'All' }))
        setActiveViewId(null)
      }
    })

    if (filters.tcFilter !== 'All') {
      const short = filters.tcFilter === 'Justina Morris' ? 'Justina' : 'Victoria'
      chips.push({
        key: 'tc',
        label: `TC: ${short}`,
        onRemove: () => {
          setFilters(f => ({ ...f, tcFilter: 'All' }))
          setDraft(d => ({ ...d, tcFilter: 'All' }))
          setActiveViewId(null)
        }
      })
    }

    const dueDiffers = filters.dueChecks.size !== DEFAULT_DUE_CHECKS.size ||
      [...DEFAULT_DUE_CHECKS].some(s => !filters.dueChecks.has(s)) ||
      [...filters.dueChecks].some(s => !DEFAULT_DUE_CHECKS.has(s))
    if (dueDiffers) {
      const checked = [...filters.dueChecks]
      const label = checked.length === 1 ? `Due: ${checked[0]}` : `Due: ${checked.length} selected`
      chips.push({
        key: 'due',
        label,
        onRemove: () => {
          setFilters(f => ({ ...f, dueChecks: DEFAULT_DUE_CHECKS }))
          setDraft(d => ({ ...d, dueChecks: DEFAULT_DUE_CHECKS }))
          setActiveViewId(null)
        }
      })
    }

    return chips
  }, [filters, activeViewId, savedViews])

  // ── Filter panel handlers ──────────────────────────────────────────────────
  const openPanel  = () => { setDraft(filters); setPanelOpen(true) }
  const closePanel = () => setPanelOpen(false)

  const applyPanel = () => {
    setFilters(draft)
    setActiveViewId(null)
    setPanelOpen(false)
  }

  const clearAll = () => {
    setDraft(DEFAULT_FILTERS)
    setFilters(DEFAULT_FILTERS)
    setActiveViewId(null)
    setPanelOpen(false)
  }

  const saveView = () => {
    const name = window.prompt('Name this view:')
    if (!name?.trim()) return
    const newView = { id: Date.now().toString(), name: name.trim(), filters: serializeFilters(draft) }
    const next = [...savedViews, newView]
    setSavedViews(next)
    localStorage.setItem('taskSavedViews', JSON.stringify(next))
    setFilters(draft)
    setActiveViewId(newView.id)
    setPanelOpen(false)
  }

  const applyView = (view) => {
    const f = deserializeFilters(view.filters || {})
    setFilters(f)
    setDraft(f)
    setActiveViewId(view.id)
    setPanelOpen(false)
  }

  const deleteView = (id) => {
    const next = savedViews.filter(v => v.id !== id)
    setSavedViews(next)
    localStorage.setItem('taskSavedViews', JSON.stringify(next))
    if (activeViewId === id) setActiveViewId(null)
  }

  // ── Sort helpers ───────────────────────────────────────────────────────────
  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const arrow = (col) => {
    if (sortCol !== col) return <span className="gtd-th-arrow gtd-th-arrow--inactive">↕</span>
    return <span className="gtd-th-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  // ── Bulk helpers ───────────────────────────────────────────────────────────
  const enterBulkMode = () => { setBulkMode(true); setSelectedIds(new Set()); setBulkAssignTo(''); setBulkStatus('') }
  const exitBulkMode  = () => { setBulkMode(false); setSelectedIds(new Set()) }

  const toggleId = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const allSelected  = filtered.length > 0 && selectedIds.size === filtered.length
  const someSelected = selectedIds.size > 0 && !allSelected

  const setSelectAllRef = (el) => {
    selectAllRef.current = el
    if (el) el.indeterminate = someSelected
  }

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(t => t.id)))
  }

  const handleBulkApply = async () => {
    if (selectedIds.size === 0 || (!bulkAssignTo && !bulkStatus)) return
    setBulkApplying(true)
    try {
      const updates = {}
      if (bulkAssignTo) updates.assigned_to = bulkAssignTo
      if (bulkStatus)   updates.status       = bulkStatus
      await Promise.all([...selectedIds].map(id => onTaskUpdate(id, updates)))
      exitBulkMode()
    } finally { setBulkApplying(false) }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const n = selectedIds.size
    if (!window.confirm(`Delete ${n} task${n !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setBulkApplying(true)
    try {
      await Promise.all([...selectedIds].map(id => onDeleteTask(id)))
      exitBulkMode()
    } finally { setBulkApplying(false) }
  }

  const hasChanges = bulkAssignTo || bulkStatus

  // ── Search helpers ─────────────────────────────────────────────────────────
  const setSearch = (val) => {
    setFilters(f => ({ ...f, search: val }))
    setDraft(d => ({ ...d, search: val }))
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="tasks-tab">

      {/* ── Search bar ──────────────────────────────────────────────── */}
      <div className="gtd-searchbar">
        <span className="gtd-searchbar-icon">⌕</span>
        <input
          className="gtd-searchbar-input"
          type="text"
          placeholder="Search tasks or addresses…"
          value={filters.search}
          onChange={e => setSearch(e.target.value)}
        />
        {filters.search && (
          <button className="gtd-searchbar-clear" onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="gtd-toolbar">
        <span className="gtd-summary">
          {openCount} open{doneCount > 0 ? `, ${doneCount} done` : ''}
        </span>
        {bulkMode ? (
          <button className="gtd-bulk-toggle gtd-bulk-cancel" onClick={exitBulkMode}>Cancel</button>
        ) : (
          <button className="gtd-bulk-toggle" onClick={enterBulkMode}>Bulk Edit</button>
        )}
        {filterCount > 0 && (
          <button className="gtd-fp-clear-inline" onClick={clearAll}>Clear Filters</button>
        )}
        <button
          className={`gtd-filters-btn${filterCount > 0 ? ' has-filters' : ''}`}
          onClick={openPanel}
        >
          Filters{filterCount > 0 ? ` (${filterCount})` : ''}
        </button>
      </div>

      {/* ── Active filter chips ──────────────────────────────────────── */}
      {activeChips.length > 0 && (
        <div className="gtd-chips">
          {activeChips.map(chip => (
            <span key={chip.key} className="gtd-chip">
              {chip.label}
              <button className="gtd-chip-remove" onClick={chip.onRemove}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* ── Filter panel ────────────────────────────────────────────── */}
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
        />
      )}

      {/* ── Bulk action bar ─────────────────────────────────────────── */}
      {bulkMode && (
        <div className="gtd-bulk-bar">
          <label className="gtd-bulk-selectall">
            <input
              type="checkbox"
              className="gtd-bulk-checkbox"
              ref={setSelectAllRef}
              checked={allSelected}
              onChange={toggleAll}
            />
            <span>
              {selectedIds.size === 0 ? 'Select all' : `${selectedIds.size} of ${filtered.length} selected`}
            </span>
          </label>
          <div className="gtd-bulk-actions">
            <select className="gtd-bulk-select" value={bulkAssignTo} onChange={e => setBulkAssignTo(e.target.value)}>
              <option value="">Assigned To…</option>
              {ASSIGNEE_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="gtd-bulk-select" value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}>
              <option value="">Status…</option>
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button
              className="gtd-bulk-apply"
              onClick={handleBulkApply}
              disabled={bulkApplying || selectedIds.size === 0 || !hasChanges}
            >
              {bulkApplying ? 'Applying…' : 'Apply'}
            </button>
            <div className="gtd-bulk-divider" />
            <button
              className="gtd-bulk-delete"
              onClick={handleBulkDelete}
              disabled={bulkApplying || selectedIds.size === 0}
            >
              Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </button>
          </div>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────── */}
      <div className="gtd-scroll">
        <table className="gtd-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th className={`gtd-th${sortCol === 'title' ? ' gtd-th--sorted' : ''}`}
                  onClick={() => toggleSort('title')}>
                Task {arrow('title')}
              </th>
              <th className={`gtd-th${sortCol === 'transaction' ? ' gtd-th--sorted' : ''}`}
                  onClick={() => toggleSort('transaction')}>
                Transaction {arrow('transaction')}
              </th>
              <th className={`gtd-th${sortCol === 'stage' ? ' gtd-th--sorted' : ''}`}
                  onClick={() => toggleSort('stage')}>
                Stage {arrow('stage')}
              </th>
              <th className={`gtd-th${sortCol === 'assigned' ? ' gtd-th--sorted' : ''}`}
                  onClick={() => toggleSort('assigned')}>
                Assigned To {arrow('assigned')}
              </th>
              <th className={`gtd-th${sortCol === 'due_date' ? ' gtd-th--sorted' : ''}`}
                  onClick={() => toggleSort('due_date')}>
                Due Date {arrow('due_date')}
              </th>
              <th className={`gtd-th${sortCol === 'status' ? ' gtd-th--sorted' : ''}`}
                  onClick={() => toggleSort('status')}>
                Status {arrow('status')}
              </th>
              <th style={{ width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="gtd-empty">No tasks match these filters</td>
              </tr>
            )}
            {filtered.map(task => {
              const tx           = txMap[task.transaction_id]
              const done         = task.status === 'complete'
              const sel          = selectedIds.has(task.id)
              const ddl          = dueDateLabel(task.due_date, done, task.completed_at)
              const commentCount = taskComments.filter(c => c.task_id === task.id).length

              return (
                <tr
                  key={task.id}
                  className={[
                    'gtd-row',
                    done ? 'gtd-row-done' : '',
                    sel  ? 'gtd-row-selected' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => !bulkMode && tx && onCardClick(tx)}
                  title={bulkMode ? undefined : 'Click to open transaction'}
                >
                  <td onClick={e => { if (bulkMode) { e.stopPropagation(); toggleId(task.id) } }}>
                    {bulkMode ? (
                      <input
                        type="checkbox"
                        className="gtd-bulk-checkbox"
                        checked={sel}
                        onChange={() => toggleId(task.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <button
                        className={`gtd-check${done ? ' gtd-checked' : ''}`}
                        onClick={e => { e.stopPropagation(); onTaskUpdate(task.id, { status: done ? 'open' : 'complete' }) }}
                      >
                        {done ? '✓' : ''}
                      </button>
                    )}
                  </td>
                  <td className={`gtd-task-title${done ? ' gtd-done-text' : ''}`}>{task.title}</td>
                  <td className="gtd-addr">{tx?.property_address?.split(',')[0] || '—'}</td>
                  <td className="gtd-stage-cell">
                    {tx?.status
                      ? <span className={`gtd-stage-badge gtd-stage--${tx.status}`}>{stageLabel(tx.status)}</span>
                      : '—'}
                  </td>
                  <td className="gtd-assignee">{task.assigned_to}</td>
                  <td className={`gtd-due gtd-due--${ddl.cls || 'none'}`}>{ddl.text}</td>
                  <td>
                    <span className={`gtd-status-badge${done ? ' gtd-status-done' : ' gtd-status-open'}`}>
                      {done ? 'Done' : 'Open'}
                    </span>
                  </td>
                  <td className="gtd-cmt-td" onClick={e => e.stopPropagation()}>
                    <button
                      className={`gtd-cmt-btn${commentCount > 0 ? ' active' : ''}`}
                      onClick={e => { e.stopPropagation(); setCommentTaskId(task.id) }}
                      title={commentCount > 0 ? `${commentCount} comment${commentCount !== 1 ? 's' : ''}` : 'Add comment'}
                    >
                      💬{commentCount > 0 && <span className="gtd-cmt-count">{commentCount}</span>}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Comment panel ───────────────────────────────────────────── */}
      {commentTaskId && (() => {
        const ct = tasks.find(t => t.id === commentTaskId)
        const tx = ct ? txMap[ct.transaction_id] : null
        const comments = taskComments.filter(c => c.task_id === commentTaskId)
        return (
          <TaskCommentPanel
            taskTitle={ct?.title || ''}
            comments={comments}
            onAdd={(author, body) => onAddTaskComment?.(commentTaskId, author, body)}
            onDelete={onDeleteTaskComment}
            onClose={() => setCommentTaskId(null)}
            tcSettings={tcSettings}
            transactionAddr={tx?.property_address || ''}
          />
        )
      })()}
    </div>
  )
}
