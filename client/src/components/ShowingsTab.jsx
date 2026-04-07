import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { wrapEmailBody } from '../lib/emailWrapper'
import { toast } from 'react-hot-toast'
import { useSyncSupraShowings } from '../hooks/useSyncSupraShowings'
import './ShowingsTab.css'

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}/${dt.getFullYear()}`
}

function fmtRequestDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const CLOSED_STATUSES = new Set(['closed', 'cancelled-expired'])

const EMPTY_SHOWING = { transaction_id: '', agent_name: '', agent_email: '', showing_date: '', feedback: '' }

export default function ShowingsTab({ transactions }) {
  const [showings,       setShowings]       = useState([])
  const [loading,        setLoading]        = useState(true)
  const [search,         setSearch]         = useState('')
  const [sortKey,        setSortKey]        = useState('showing_date')
  const [sortDir,        setSortDir]        = useState('desc')
  const [addOpen,        setAddOpen]        = useState(false)
  const [addForm,        setAddForm]        = useState(EMPTY_SHOWING)
  const [adding,         setAdding]         = useState(false)
  const [editingShowing, setEditingShowing] = useState(null) // null = add mode, showing obj = edit mode
  const [emailingId,     setEmailingId]     = useState(null)
  const [emailTemplates, setEmailTemplates] = useState([])

  const { sync, syncing } = useSyncSupraShowings(transactions)

  useEffect(() => {
    supabase.from('email_templates').select('*')
      .then(({ data }) => setEmailTemplates(data || []))
  }, [])

  const txById = useMemo(() => {
    const map = {}
    for (const t of transactions) map[t.id] = t
    return map
  }, [transactions])

  const activeSelllerIds = useMemo(() => new Set(
    transactions
      .filter(t => t.rep_type === 'Seller' && !CLOSED_STATUSES.has(t.status))
      .map(t => t.id)
  ), [transactions])

  useEffect(() => { load() }, [])

  // Silently sync Supra emails on mount
  useEffect(() => {
    sync()
      .then(({ inserted, unmatched }) => {
        if (inserted > 0) {
          toast.success(`${inserted} new showing${inserted !== 1 ? 's' : ''} synced from Supra`)
          load()
        }
        if (unmatched.length > 0) {
          toast(`⚠ Unmatched addresses:\n${unmatched.join('\n')}`, { duration: 7000 })
        }
      })
      .catch(() => {
        // Silent — don't block UI if Gmail not connected
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('showings')
      .select('*')
      .order('showing_date', { ascending: false })
    setShowings(data || [])
    setLoading(false)
  }

  const handleSync = async () => {
    try {
      const { inserted, unmatched } = await sync()
      if (inserted > 0) {
        toast.success(`${inserted} new showing${inserted !== 1 ? 's' : ''} synced from Supra`)
        load()
      } else {
        toast.success('No new showings to sync')
      }
      if (unmatched.length > 0) {
        toast(`⚠ Unmatched addresses:\n${unmatched.join('\n')}`, { duration: 7000 })
      }
    } catch (err) {
      toast.error('Sync failed: ' + (err.message || 'Unknown error'))
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this showing?')) return
    const { error } = await supabase.from('showings').delete().eq('id', id)
    if (!error) setShowings(prev => prev.filter(s => s.id !== id))
  }

  const openAdd = () => {
    setEditingShowing(null)
    setAddForm(EMPTY_SHOWING)
    setAddOpen(true)
  }

  const openEdit = (s) => {
    setEditingShowing(s)
    setAddForm({
      transaction_id: s.transaction_id,
      agent_name:     s.agent_name  || '',
      agent_email:    s.agent_email || '',
      showing_date:   s.showing_date || '',
      feedback:       s.feedback    || '',
    })
    setAddOpen(true)
  }

  const closeModal = () => {
    setAddOpen(false)
    setEditingShowing(null)
    setAddForm(EMPTY_SHOWING)
  }

  const handleModalSubmit = async (e) => {
    e.preventDefault()
    setAdding(true)

    if (editingShowing) {
      // Edit mode — UPDATE feedback only
      const { error } = await supabase
        .from('showings')
        .update({ feedback: addForm.feedback || '' })
        .eq('id', editingShowing.id)
      setAdding(false)
      if (error) { toast.error('Could not update showing.'); return }
      setShowings(prev => prev.map(s =>
        s.id === editingShowing.id ? { ...s, feedback: addForm.feedback || '' } : s
      ))
      toast.success('Showing updated')
      closeModal()
    } else {
      // Add mode — INSERT
      if (!addForm.transaction_id) { setAdding(false); return }
      const { data, error } = await supabase.from('showings').insert({
        transaction_id: addForm.transaction_id,
        agent_name:     addForm.agent_name  || null,
        agent_email:    addForm.agent_email || null,
        showing_date:   addForm.showing_date || null,
        feedback:       addForm.feedback    || '',
      }).select().single()
      setAdding(false)
      if (error) { toast.error('Could not save showing.'); return }
      setShowings(prev => [data, ...prev])
      closeModal()
    }
  }

  const htmlToText = (html) => {
    if (!html) return ''
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  const handleRequestFeedback = async (s) => {
    const toEmail = s.agent_email
    if (!toEmail) { toast.error('No agent email for this showing'); return }
    const tx          = txById[s.transaction_id]
    const addr        = tx?.property_address || 'our listing'
    const agentName   = s.agent_name || 'Agent'
    const showingDate = fmtDate(s.showing_date)

    const template = emailTemplates.find(t => t.name === 'Showing Feedback')
    const resolve  = (text) => (text || '')
      .replace(/\{\{agent_name\}\}/g,       agentName)
      .replace(/\{\{property_address\}\}/g, addr)
      .replace(/\{\{showing_date\}\}/g,     showingDate)

    const subject = template?.subject
      ? resolve(template.subject)
      : `Thank you for showing ${addr}`
    const rawBody = template
      ? htmlToText(resolve(template.body))
      : `Thank you for showing ${addr} on ${showingDate}. We'd love to hear your client's feedback about the property.\n\nPlease reply with any thoughts — it's greatly appreciated!\n\nThank you,\nLegacy Real Estate`
    const bodyNoGreeting = rawBody.replace(/^Hi\s+[^,\n]*,?\s*\n+/i, '')
    const body = `Hi ${agentName},\n\n${bodyNoGreeting}`

    const htmlBody = body.replace(/\n/g, '<br>')
    setEmailingId(`${s.id}_agent`)
    let sent = false
    try {
      const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''
      const gmailRes = await fetch(`${API_BASE}/api/google/gmail-send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: toEmail, subject, body: wrapEmailBody(htmlBody), transactionId: s.transaction_id }),
      })
      const result = await gmailRes.json()
      if (!gmailRes.ok) {
        toast.error('Email failed: ' + (result.error || 'Unknown error'))
      } else {
        toast.success('Email sent')
        sent = true
      }
    } catch (err) {
      toast.error('Email failed: ' + (err.message || 'Unknown error'))
    } finally {
      setEmailingId(null)
    }
    if (sent) {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('showings')
        .update({ feedback_requested: true, feedback_requested_at: now })
        .eq('id', s.id)
      if (error) { toast.error('Could not save feedback request status'); return }
      setShowings(prev => prev.map(sh =>
        sh.id === s.id ? { ...sh, feedback_requested: true, feedback_requested_at: now } : sh
      ))
    }
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

  const isEdit = !!editingShowing

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
        <button
          className="sht-sync-btn"
          onClick={handleSync}
          disabled={syncing}
          title="Sync showings from Supra emails"
        >
          {syncing ? 'Syncing…' : 'Sync Supra'}
        </button>
        <button className="sht-add-btn" onClick={openAdd}>+ Add Showing</button>
      </div>

      {addOpen && (
        <div className="sht-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="sht-modal">
            <div className="sht-modal-header">
              <span>{isEdit ? 'Edit Showing' : 'Add Showing'}</span>
              <button className="sht-modal-close" onClick={closeModal}>✕</button>
            </div>
            <form className="sht-modal-body" onSubmit={handleModalSubmit}>
              <label className="sht-modal-label">Property</label>
              {isEdit ? (
                <div className="sht-modal-readonly">
                  {txById[editingShowing.transaction_id]?.property_address || '—'}
                </div>
              ) : (
                <select
                  className="sht-modal-select"
                  value={addForm.transaction_id}
                  onChange={e => setAddForm(p => ({ ...p, transaction_id: e.target.value }))}
                  required
                >
                  <option value="">— Select property —</option>
                  {transactions
                    .filter(t => t.rep_type === 'Seller' && !CLOSED_STATUSES.has(t.status))
                    .sort((a, b) => (a.property_address || '').localeCompare(b.property_address || ''))
                    .map(t => (
                      <option key={t.id} value={t.id}>{t.property_address || t.id}</option>
                    ))}
                </select>
              )}

              <label className="sht-modal-label">Showing Date</label>
              <input
                type="date"
                className="sht-modal-input"
                value={addForm.showing_date}
                onChange={e => setAddForm(p => ({ ...p, showing_date: e.target.value }))}
                readOnly={isEdit}
              />

              <label className="sht-modal-label">Agent Name</label>
              <input
                type="text"
                className="sht-modal-input"
                placeholder="Buyer's agent name"
                value={addForm.agent_name}
                onChange={e => setAddForm(p => ({ ...p, agent_name: e.target.value }))}
                readOnly={isEdit}
              />

              <label className="sht-modal-label">Agent Email</label>
              <input
                type="email"
                className="sht-modal-input"
                placeholder="agent@email.com"
                value={addForm.agent_email}
                onChange={e => setAddForm(p => ({ ...p, agent_email: e.target.value }))}
                readOnly={isEdit}
              />

              <label className="sht-modal-label">Feedback</label>
              <textarea
                className="sht-modal-textarea"
                placeholder="Buyer feedback…"
                value={addForm.feedback}
                onChange={e => setAddForm(p => ({ ...p, feedback: e.target.value }))}
                rows={3}
                autoFocus={isEdit}
              />

              <div className="sht-modal-actions">
                <button type="button" className="sht-modal-cancel" onClick={closeModal}>Cancel</button>
                <button
                  type="submit"
                  className="sht-modal-save"
                  disabled={adding || (!isEdit && !addForm.transaction_id)}
                >
                  {adding ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Showing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                <th className="sht-th-actions"></th>
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
                  <td className="sht-actions-cell">
                    <div className="sht-req-wrap">
                      <button
                        className="sht-req-btn"
                        onClick={() => handleRequestFeedback(s)}
                        disabled={!!emailingId}
                        title="Request feedback from showing agent"
                      >
                        {emailingId === `${s.id}_agent` ? '…' : 'Req. Feedback'}
                      </button>
                      {(s.feedback_requested || s.feedback_requested_at) && (
                        <span className="sht-feedback-badge">
                          ✓ Requested {fmtRequestDate(s.feedback_requested_at)}
                        </span>
                      )}
                    </div>
                    <button
                      className="sht-edit-btn"
                      onClick={() => openEdit(s)}
                      title="Edit showing"
                    >✏</button>
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
