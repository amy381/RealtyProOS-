import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import './ShowingsTab.css'

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}/${dt.getFullYear()}`
}

const CLOSED_STATUSES = new Set(['closed', 'cancelled-expired'])

export default function ShowingsTab({ transactions }) {
  const [showings, setShowings]   = useState([])
  const [loading,  setLoading]    = useState(true)
  const [search,   setSearch]     = useState('')
  const [sortKey,  setSortKey]    = useState('showing_date')
  const [sortDir,  setSortDir]    = useState('desc')

  // Map transaction id → transaction object for quick lookup
  const txById = useMemo(() => {
    const map = {}
    for (const t of transactions) map[t.id] = t
    return map
  }, [transactions])

  // Only Seller transactions that are not closed/cancelled
  const activeSelllerIds = useMemo(() => new Set(
    transactions
      .filter(t => t.rep_type === 'Seller' && !CLOSED_STATUSES.has(t.status))
      .map(t => t.id)
  ), [transactions])

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('showings')
      .select('*')
      .order('showing_date', { ascending: false })
    setShowings(data || [])
    setLoading(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this showing?')) return
    const { error } = await supabase.from('showings').delete().eq('id', id)
    if (!error) setShowings(prev => prev.filter(s => s.id !== id))
  }

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return showings.filter(s => {
      if (!activeSelllerIds.has(s.transaction_id)) return false
      if (!q) return true
      const addr  = (txById[s.transaction_id]?.property_address || '').toLowerCase()
      const agent = (s.agent_name || '').toLowerCase()
      return addr.includes(q) || agent.includes(q)
    })
  }, [showings, activeSelllerIds, search, txById])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let av, bv
    if (sortKey === 'property') {
      av = txById[a.transaction_id]?.property_address || ''
      bv = txById[b.transaction_id]?.property_address || ''
    } else {
      av = a[sortKey] || ''
      bv = b[sortKey] || ''
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ?  1 : -1
    return 0
  }), [filtered, sortKey, sortDir, txById])

  const SortIcon = ({ k }) => (
    <span className={`sht-arrow${sortKey === k ? '' : ' sht-arrow--dim'}`}>
      {sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
    </span>
  )

  return (
    <div className="showings-tab">

      <div className="sht-topbar">
        <div className="sht-searchbar">
          <span className="sht-searchbar-icon">⌕</span>
          <input
            className="sht-searchbar-input"
            type="text"
            placeholder="Search by property or agent name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="sht-searchbar-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>
        <span className="sht-count">{filtered.length} showing{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="sht-loading">Loading showings…</div>
      ) : (
        <div className="sht-scroll">
          <table className="sht-table">
            <thead>
              <tr>
                <th
                  className={sortKey === 'property' ? 'sht-sorted' : ''}
                  onClick={() => handleSort('property')}
                >
                  Property <SortIcon k="property" />
                </th>
                <th>Agent Name</th>
                <th>Agent Email</th>
                <th
                  className={sortKey === 'showing_date' ? 'sht-sorted' : ''}
                  onClick={() => handleSort('showing_date')}
                >
                  Date <SortIcon k="showing_date" />
                </th>
                <th>Feedback</th>
                <th className="sht-th-del"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="sht-empty">
                    {search ? 'No showings match your search.' : 'No showings recorded for active Seller listings.'}
                  </td>
                </tr>
              ) : sorted.map(s => (
                <tr key={s.id}>
                  <td className="sht-addr">{txById[s.transaction_id]?.property_address || '—'}</td>
                  <td>{s.agent_name || '—'}</td>
                  <td className="sht-email">{s.agent_email || '—'}</td>
                  <td className="sht-date">{fmtDate(s.showing_date)}</td>
                  <td className="sht-feedback">{s.feedback || '—'}</td>
                  <td className="sht-del-cell">
                    <button
                      className="sht-del-btn"
                      onClick={() => handleDelete(s.id)}
                      title="Delete showing"
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
