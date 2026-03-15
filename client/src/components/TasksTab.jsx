import { useState, useMemo } from 'react'
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

export default function TasksTab({ tasks, transactions, onTaskUpdate, onCardClick }) {
  const [assigneeFilter, setAssigneeFilter] = useState('All')
  const [dateFilter, setDateFilter]         = useState('All')

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
        const d = new Date(task.due_date + 'T00:00:00')
        if (d.getTime() !== today.getTime()) return false
      }
      if (dateFilter === 'This Week') {
        if (!task.due_date) return false
        const d = new Date(task.due_date + 'T00:00:00')
        if (d < today || d > eow) return false
      }
      return true
    }).sort((a, b) => {
      // Open before done, then by due date (nulls last), then by transaction
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return 0
    })
  }, [tasks, assigneeFilter, dateFilter, txMap])

  const openCount = filtered.filter(t => t.status === 'open').length
  const doneCount = filtered.filter(t => t.status === 'complete').length

  return (
    <div className="tasks-tab">
      {/* Filters */}
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
      </div>

      {/* Table */}
      <div className="gtd-scroll">
        <table className="gtd-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}></th>
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
              const tx  = txMap[task.transaction_id]
              const dc  = dueCls(task.due_date)
              const done = task.status === 'complete'
              return (
                <tr
                  key={task.id}
                  className={`gtd-row${done ? ' gtd-row-done' : ''}`}
                  onClick={() => tx && onCardClick(tx)}
                  title="Click to open transaction"
                >
                  <td>
                    <button
                      className={`gtd-check${done ? ' gtd-checked' : ''}`}
                      onClick={e => { e.stopPropagation(); onTaskUpdate(task.id, { status: done ? 'open' : 'complete' }) }}
                    >
                      {done ? '✓' : ''}
                    </button>
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
