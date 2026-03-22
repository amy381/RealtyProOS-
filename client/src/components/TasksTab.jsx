import { useState, useMemo, useRef } from 'react'
import './TasksTab.css'

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function dueCls(dateStr) {
  if (!dateStr) return ''
  const today = new Date(); today.setHours(0,0,0,0)
  const due   = new Date(dateStr + 'T00:00:00')
  const diff  = Math.ceil((due - today) / 86400000)
  if (diff < 0)   return 'gtd-overdue'
  if (diff === 0) return 'gtd-today'
  if (diff <= 3)  return 'gtd-soon'
  return ''
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

const ASSIGNEE_FILTERS = ['All', 'Me', 'Justina Morris', 'Victoria Lareau']
const DATE_FILTERS     = ['All', 'Due Today', 'This Week']
const ASSIGNEE_OPTIONS = ['Me', 'Justina Morris', 'Victoria Lareau']
const STATUS_OPTIONS   = [{ value: 'open', label: 'Open' }, { value: 'complete', label: 'Done' }]

export default function TasksTab({ tasks, transactions, onTaskUpdate, onDeleteTask, onCardClick }) {
  const [assigneeFilter, setAssigneeFilter] = useState('All')
  const [dateFilter,     setDateFilter]     = useState('All')

  // Bulk edit state
  const [bulkMode,      setBulkMode]      = useState(false)
  const [selectedIds,   setSelectedIds]   = useState(new Set())
  const [bulkAssignTo,  setBulkAssignTo]  = useState('')
  const [bulkStatus,    setBulkStatus]    = useState('')
  const [bulkApplying,  setBulkApplying]  = useState(false)

  const selectAllRef = useRef(null)

  const txMap = useMemo(() => {
    const m = {}
    transactions.forEach(t => { m[t.id] = t })
    return m
  }, [transactions])

  const filtered = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0)
    const eow   = endOfWeek()

    return tasks.filter(task => {
      if (assigneeFilter !== 'All' && task.assigned_to !== assigneeFilter) return false
      if (dateFilter === 'Due Today') {
        if (!task.due_date) return false
        if (new Date(task.due_date + 'T00:00:00').getTime() !== today.getTime()) return false
      }
      if (dateFilter === 'This Week') {
        if (!task.due_date) return false
        const d = new Date(task.due_date + 'T00:00:00')
        if (d < today || d > eow) return false
      }
      return true
    }).sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return 0
    })
  }, [tasks, assigneeFilter, dateFilter])

  const openCount = filtered.filter(t => t.status === 'open').length
  const doneCount = filtered.filter(t => t.status === 'complete').length

  // ── Bulk helpers ─────────────────────────────────────────────────────────
  const enterBulkMode = () => {
    setBulkMode(true)
    setSelectedIds(new Set())
    setBulkAssignTo('')
    setBulkStatus('')
  }

  const exitBulkMode = () => {
    setBulkMode(false)
    setSelectedIds(new Set())
  }

  const toggleId = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const allSelected  = filtered.length > 0 && selectedIds.size === filtered.length
  const someSelected = selectedIds.size > 0 && !allSelected

  // Keep indeterminate in sync
  const setSelectAllRef = (el) => {
    selectAllRef.current = el
    if (el) el.indeterminate = someSelected
  }

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(t => t.id)))
    }
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
    } finally {
      setBulkApplying(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const n = selectedIds.size
    if (!window.confirm(`Are you sure you want to delete ${n} task${n !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setBulkApplying(true)
    try {
      await Promise.all([...selectedIds].map(id => onDeleteTask(id)))
      exitBulkMode()
    } finally {
      setBulkApplying(false)
    }
  }

  const hasChanges = bulkAssignTo || bulkStatus

  return (
    <div className="tasks-tab">

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div className="gtd-filters">
        <div className="gtd-filter-group">
          {ASSIGNEE_FILTERS.map(f => (
            <button key={f}
              className={`gtd-filter-btn${assigneeFilter === f ? ' active' : ''}`}
              onClick={() => setAssigneeFilter(f)}>
              {f === 'Justina Morris' ? 'Justina' : f === 'Victoria Lareau' ? 'Victoria' : f}
            </button>
          ))}
        </div>
        <div className="gtd-filter-sep" />
        <div className="gtd-filter-group">
          {DATE_FILTERS.map(f => (
            <button key={f}
              className={`gtd-filter-btn${dateFilter === f ? ' active' : ''}`}
              onClick={() => setDateFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <span className="gtd-summary">
          {openCount} open{doneCount > 0 ? `, ${doneCount} done` : ''}
        </span>
        {bulkMode ? (
          <button className="gtd-bulk-toggle gtd-bulk-cancel" onClick={exitBulkMode}>
            Cancel
          </button>
        ) : (
          <button className="gtd-bulk-toggle" onClick={enterBulkMode}>
            Bulk Edit
          </button>
        )}
      </div>

      {/* ── Bulk action bar ────────────────────────────────────────── */}
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
              {selectedIds.size === 0
                ? 'Select all'
                : `${selectedIds.size} of ${filtered.length} selected`}
            </span>
          </label>

          <div className="gtd-bulk-actions">
            <select
              className="gtd-bulk-select"
              value={bulkAssignTo}
              onChange={e => setBulkAssignTo(e.target.value)}
            >
              <option value="">Assigned To…</option>
              {ASSIGNEE_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>

            <select
              className="gtd-bulk-select"
              value={bulkStatus}
              onChange={e => setBulkStatus(e.target.value)}
            >
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

      {/* ── Table ──────────────────────────────────────────────────── */}
      <div className="gtd-scroll">
        <table className="gtd-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th>Task</th>
              <th>Address</th>
              <th>Assigned To</th>
              <th>Due Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="gtd-empty">No tasks match these filters</td>
              </tr>
            )}
            {filtered.map(task => {
              const tx   = txMap[task.transaction_id]
              const dc   = dueCls(task.due_date)
              const done = task.status === 'complete'
              const sel  = selectedIds.has(task.id)

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
                  <td className="gtd-assignee">{task.assigned_to}</td>
                  <td className={`gtd-due ${dc}`}>{fmtDate(task.due_date)}</td>
                  <td>
                    <span className={`gtd-status-badge${done ? ' gtd-status-done' : ' gtd-status-open'}`}>
                      {done ? 'Done' : 'Open'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
