import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getVisibleCriticalDates } from '../lib/criticalDates'

const WINDOW_DAYS = 14
const SOON_DAYS   = 3
const DAY_MS      = 86400000

// All date math is on 'YYYY-MM-DD' strings in UTC, anchored on the same
// todayStr the desktop critical-date rule uses, so the two views agree.
const toUtcMs = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const daysBetween = (fromStr, toStr) => Math.round((toUtcMs(toStr) - toUtcMs(fromStr)) / DAY_MS)
const addDays = (s, n) => new Date(toUtcMs(s) + n * DAY_MS).toISOString().slice(0, 10)

function fmtDay(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function fmtIn(n) {
  if (n === 0) return 'Today'
  return n === 1 ? 'in 1 day' : `in ${n} days`
}

function UpcomingCard({ title, address, dateStr, days }) {
  const soon = days <= SOON_DAYS
  return (
    <li className={`m-card${soon ? ' m-card--soon' : ''}`}>
      <div className="m-card-main">
        <div className="m-card-title">{title}</div>
        {address && <div className="m-card-sub">{address}</div>}
      </div>
      <div className="m-card-when">
        <div className="m-card-date">{fmtDay(dateStr)}</div>
        <div className={`m-card-in${soon ? ' m-card-in--soon' : ''}`}>{fmtIn(days)}</div>
      </div>
    </li>
  )
}

export default function MobileUpcoming() {
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [transactions, setTx]   = useState([])
  const [tasks, setTasks]       = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [txRes, taskRes] = await Promise.all([
      supabase.from('transactions')
        .select('id, property_address, status, close_of_escrow, rep_type'),
      // Critical Date rows + any task that resolves one — nothing else is needed,
      // and it keeps the result well under PostgREST's default row cap.
      supabase.from('tasks')
        .select('id, transaction_id, title, task_type, status, due_date, resolves_critical_date')
        .or('task_type.eq."Critical Date",resolves_critical_date.not.is.null'),
    ])
    const err = txRes.error || taskRes.error
    if (err) {
      console.error('[mobile] load failed', err)
      setError(err.message || 'Could not load data')
    } else {
      setTx(txRes.data || [])
      setTasks(taskRes.data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="m-status">Loading…</div>

  if (error) {
    return (
      <div className="m-error" role="alert">
        <div>Couldn’t load upcoming items: {error}</div>
        <button className="m-btn m-btn--primary" onClick={load}>Try again</button>
      </div>
    )
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const endStr   = addDays(todayStr, WINDOW_DAYS)
  const inWindow = (d) => !!d && d >= todayStr && d <= endStr

  const txById = new Map(transactions.map(t => [t.id, t]))

  const closings = transactions
    .map(t => ({ t, d: (t.close_of_escrow || '').slice(0, 10) }))
    .filter(({ t, d }) => t.status !== 'closed' && t.status !== 'cancelled-expired' && inWindow(d))
    .sort((a, b) => a.d.localeCompare(b.d))

  const criticalDates = getVisibleCriticalDates(tasks, todayStr)
    .filter(t => inWindow(t.due_date))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))

  return (
    <>
      <section className="m-section">
        <h2 className="m-section-title">Closings · next {WINDOW_DAYS} days</h2>
        {closings.length === 0 ? (
          <div className="m-empty">No closings in the next 14 days</div>
        ) : (
          <ul className="m-list">
            {closings.map(({ t, d }) => (
              <UpcomingCard
                key={t.id}
                title={t.property_address || 'No address'}
                address={t.rep_type}
                dateStr={d}
                days={daysBetween(todayStr, d)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="m-section">
        <h2 className="m-section-title">Critical dates · next {WINDOW_DAYS} days</h2>
        {criticalDates.length === 0 ? (
          <div className="m-empty">No critical dates in the next 14 days</div>
        ) : (
          <ul className="m-list">
            {criticalDates.map(task => (
              <UpcomingCard
                key={task.id}
                title={task.title || 'Untitled'}
                address={txById.get(task.transaction_id)?.property_address}
                dateStr={task.due_date}
                days={daysBetween(todayStr, task.due_date)}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
