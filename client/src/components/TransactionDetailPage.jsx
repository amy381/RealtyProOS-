import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { syncDriveFolder, uploadToDrive, getDriveUrl, CONTRACT_DOCS } from '../lib/googleDrive'
import { TC_OPTIONS } from '../lib/columnFields'
import { toast } from 'react-hot-toast'
import { useKeyboardShortcuts } from '../lib/useKeyboardShortcuts'
import './TransactionDetailPage.css'

const SECTIONS = [
  { id: 'details',      label: 'Transaction Details' },
  { id: 'tasks',        label: 'Tasks'               },
  { id: 'docs-req',     label: 'Documents Required'  },
  { id: 'commission',   label: 'Commission'           },
  { id: 'google-drive', label: 'Google Drive'         },
  { id: 'history',      label: 'History'              },
]

const COLUMN_OPTIONS = [
  { value: 'pre-listing',       label: 'Pre-Listing' },
  { value: 'buyer-broker',      label: 'Buyer-Broker' },
  { value: 'active-listing',    label: 'Active Listing' },
  { value: 'pending',           label: 'Pending' },
  { value: 'closed',            label: 'Closed' },
  { value: 'cancelled-expired', label: 'Cancelled / Expired' },
]

const FIELD_LABELS = {
  property_address: 'Street Address', city: 'City', state: 'State', zip: 'ZIP',
  price: 'Price', rep_type: 'Transaction Type', status: 'Stage',
  assigned_tc: 'TC',
  property_type: 'Property Type',
  apn: 'APN', mls_number: 'MLS Number',
  vacant_or_occupied: 'Vacant or Occupied', occupancy: 'Occupancy',
  bedrooms: 'Bedrooms', square_ft: 'Square Ft', year_built: 'Year Built',
  new_construction: 'New Construction',
  access: 'Access',
  client_first_name: 'Client 1', client_last_name: 'Client 1',
  client2_first_name: 'Client 2', client2_last_name: 'Client 2',
  opposite_party_name: 'Opposite Party', opposite_party_agent: 'Opposite Party Agent',
  listing_contract: 'Listing Contract', listing_expiration_date: 'Listing Expiration',
  target_live_date: 'Target Live', contract_acceptance_date: 'Contract Acceptance',
  ipe_date: 'Inspection Period End', close_of_escrow: 'Close of Escrow',
  bba_contract: 'BBA Contract', bba_expiration: 'BBA Expiration',
  has_contingency: 'Contingency', contingency_fulfilled_date: 'Contingency Fulfilled',
  lender_name: 'Lender', title_company: 'Title Company',
  title_company_email: 'Title Company Email', title_company_phone: 'Title Company Phone',
  co_op_agent: 'Co-op Agent',
  home_inspector: 'Home Inspector', home_inspection_date: 'Home Inspection Date',
  has_septic: 'Septic', has_solar: 'Solar', has_well: 'Well', has_hoa: 'HOA', has_lbp: 'LBP',
  lockbox: 'Lockbox', has_sign: 'Sign',
  referring_agent: 'Referring Agent', referring_agent_email: 'Referring Agent Email',
  referring_agent_phone: 'Referring Agent Phone', referral_pct: 'Referral %',
  financing_type: 'Financing Type', additional_terms: 'Additional Terms & Conditions',
  additional_parcels: 'Additional Parcel(s)',
}

const FINANCING_TYPE_OPTIONS = [
  { value: '',               label: '—'             },
  { value: 'Conventional',   label: 'Conventional'  },
  { value: 'FHA',            label: 'FHA'           },
  { value: 'VA',             label: 'VA'            },
  { value: 'Cash',           label: 'Cash'          },
  { value: 'USDA',           label: 'USDA'          },
  { value: 'Owner Finance',  label: 'Owner Finance' },
  { value: 'Other',          label: 'Other'         },
]

const VACANT_OPTIONS = [
  { value: '',          label: '—'         },
  { value: 'Vacant',    label: 'Vacant'    },
  { value: 'Occupied',  label: 'Occupied'  },
  { value: 'Part-Time', label: 'Part-Time' },
]

const PROPERTY_TYPE_OPTIONS = [
  { value: '',             label: '—'            },
  { value: 'Residential',  label: 'Residential'  },
  { value: 'Vacant Land',  label: 'Vacant Land'  },
]

const BUYER_PENDING_STAGES = ['pending', 'closed', 'cancelled-expired']

const LOCKBOX_OPTIONS = [
  { value: '',         label: '— None —' },
  { value: '32401595', label: '32401595' },
  { value: '34253715', label: '34253715' },
  { value: '62054002', label: '62054002' },
  { value: '32400947', label: '32400947' },
  { value: '34254249', label: '34254249' },
  { value: '32401695', label: '32401695' },
  { value: '62042948', label: '62042948' },
  { value: '32401691', label: '32401691' },
  { value: '34253763', label: '34253763' },
  { value: '32408425', label: '32408425' },
  { value: '34253760', label: '34253760' },
  { value: 'CODED',    label: 'CODED' },
  { value: 'None',     label: 'None' },
]

const TASK_ASSIGNEES = ['Me', 'Justina Morris', 'Victoria Lareau']

// MENTION_PEOPLE is now built dynamically from tcSettings — see buildMentionPeople()

const STATUS_LABELS = { open: 'To Do', in_progress: 'In Progress', complete: 'Completed' }
const STATUS_NEXT    = { open: 'in_progress', in_progress: 'complete', complete: 'open' }
const STATUS_STYLE   = {
  open:        { bg: '#f0f0f0', color: '#555555' },
  in_progress: { bg: '#dbeafe', color: '#1d4ed8' },
  complete:    { bg: '#d1fae5', color: '#065f46' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatLocalDate(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtWhole(value) {
  if (!value) return ''
  const n = Number(value)
  if (isNaN(n) || n === 0) return ''
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtCents(value) {
  if (!value && value !== 0) return ''
  const n = Number(value)
  if (isNaN(n)) return ''
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Smart-parse a concession/contribution value:
//   "$5000" or "$5,000" → flat $5000
//   "3" or "3%" → 3% of price
function parseContrib(val, price) {
  if (!val) return 0
  const s = String(val).trim()
  if (s.startsWith('$')) return Number(s.replace(/[$,\s]/g, '')) || 0
  return (Number(s.replace(/[%\s]/g, '')) || 0) / 100 * price
}

// Extract all @handle tokens from a note string
function extractMentions(text) {
  const m = text.match(/@\w+/g) || []
  return [...new Set(m)]
}

// Render note text with @mentions highlighted
function renderNoteText(text) {
  if (!text) return null
  return text.split(/(@\w+)/g).map((part, i) =>
    /^@\w+$/.test(part)
      ? <span key={i} className="txp-mention">{part}</span>
      : part
  )
}

// Build the mention people list dynamically from tcSettings
function buildMentionPeople(tcSettings = []) {
  return tcSettings.map(tc => ({
    handle: '@' + tc.name.split(' ')[0],
    email:  tc.email || null,
    name:   tc.name,
  }))
}

// Send EmailJS notification to each mentioned person (uses live tcSettings)
async function sendMentionEmails(mentions, noteText, transactionAddr, tcSettings = [], transactionId = null) {
  const SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID
  const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
  const PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY
  console.log('[Mention] sendMentionEmails called — mentions:', mentions, '| tcSettings:', tcSettings)
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    console.warn('[Mention] EmailJS env vars missing — SERVICE_ID:', SERVICE_ID, 'TEMPLATE_ID:', TEMPLATE_ID, 'PUBLIC_KEY:', PUBLIC_KEY ? '(set)' : '(missing)')
    return
  }
  const mentionPeople = buildMentionPeople(tcSettings)
  try {
    const { default: emailjs } = await import('@emailjs/browser')
    for (const handle of mentions) {
      const person = mentionPeople.find(p => p.handle.toLowerCase() === handle.toLowerCase())
      console.log('[Mention] Looking up handle:', handle, '→ found:', person)
      if (!person?.email) {
        console.warn('[Mention] No email for handle:', handle, '— skipping')
        continue
      }
      console.log('[Mention] Sending to:', person.email, '(', person.name, ')')
      try {
        const app_url = `https://realty-pro-os.vercel.app/transaction/${transactionId}`
        const result = await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
          to_email:         person.email,
          to_name:          person.name,
          transaction_addr: transactionAddr || '(No address)',
          mention_notes:    noteText,
          task_title:       'You were mentioned in a note',
          app_url,
        }, PUBLIC_KEY)
        console.log('[Mention] EmailJS success for', person.email, ':', result)
      } catch (sendErr) {
        console.error('[Mention] EmailJS send failed for', person.email, ':', sendErr)
      }
    }
  } catch (err) {
    console.warn('[Mention] mention email setup failed:', err.message)
  }
}

function formatTimestamp(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// Fix 8: completed tasks always render gray — overdue styling only for open tasks
function getDueCls(dateStr, isDone) {
  if (isDone) return ''
  if (!dateStr) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due   = new Date(dateStr + 'T00:00:00')
  const diff  = Math.ceil((due - today) / 86400000)
  if (diff < 0) return ' overdue'
  if (diff === 0) return ' today'
  if (diff <= 3) return ' soon'
  return ''
}

// ─── FUB API ──────────────────────────────────────────────────────────────────
async function fetchFubContacts(query) {
  try {
    const resp = await fetch(`/api/fub/search?q=${encodeURIComponent(query)}`)
    if (!resp.ok) return []
    const data = await resp.json()
    return data.people || []
  } catch { return [] }
}

async function fetchFubPerson(personId) {
  try {
    const resp = await fetch(`/api/fub/person/${personId}`)
    if (!resp.ok) return null
    return resp.json()
  } catch { return null }
}

// ─── FUB Inline Search (matches intake form behavior) ─────────────────────────
function FubInlineSearch({ onSelect, onClose }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const timer   = useRef(null)
  const inputRef = useRef(null)
  const wrapRef  = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleChange = (val) => {
    setQuery(val)
    clearTimeout(timer.current)
    if (val.trim().length < 2) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      const people = await fetchFubContacts(val)
      setResults(people)
      setLoading(false)
    }, 350)
  }

  const handleSelect = async (person) => {
    if (person.id) {
      const full = await fetchFubPerson(person.id)
      if (full) { onSelect(full); return }
    }
    onSelect({ client1: person, related: [] })
  }

  return (
    <div className="txp-fub-inline" ref={wrapRef}>
      <input
        ref={inputRef}
        className="txp-fub-inline-input"
        placeholder="Search by name…"
        value={query}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      />
      {(loading || results.length > 0 || (query.length >= 2 && !loading)) && (
        <div className="txp-fub-results">
          {loading && <div className="txp-fub-loading">Searching…</div>}
          {results.map(p => (
            <button
              key={p.id || p.relationship_id || p.name}
              className="txp-fub-result"
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleSelect(p)}
            >
              <span className="txp-fub-name">{p.name}</span>
              {p.email && <span className="txp-fub-email">{p.email}</span>}
              {p._via && <span className="txp-fub-via">via {p._via.name}</span>}
            </button>
          ))}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="txp-fub-empty">No results found</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Client Row ────────────────────────────────────────────────────────────────
function ClientRow({ label, first, last, onFubSelect, tabIndex }) {
  const [searching, setSearching] = useState(false)
  const name = [first, last].filter(Boolean).join(' ')

  return (
    <div className="txp-client-row">
      <span className="txp-field-label">{label}</span>
      <div className="txp-client-row-right">
        {name && <span className="txp-client-linked-name">{name}</span>}
        {searching ? (
          <FubInlineSearch
            onSelect={(r) => { onFubSelect(r); setSearching(false) }}
            onClose={() => setSearching(false)}
          />
        ) : (
          <button className="txp-fub-btn" tabIndex={tabIndex} onClick={() => setSearching(true)}>
            {name ? 'Change' : 'Search FUB'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Inline Editable Field ─────────────────────────────────────────────────────
function TxField({ label, value, displayValue, type, options, onSave, placeholder, required, readOnly, tabIndex }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState('')
  const inputRef              = useRef(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (type === 'date') {
        // Fix 1: open the calendar popup immediately when clicking the date value
        try { inputRef.current.showPicker() } catch {}
      } else if (type !== 'select' && inputRef.current.select) {
        inputRef.current.select()
      }
    }
  }, [editing, type])

  const startEdit = () => {
    if (readOnly) return
    setDraft(value ?? '')
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    const next = typeof draft === 'string' ? draft.trim() : draft
    const prev = typeof value === 'string' ? value.trim() : (value ?? '')
    if (String(next) !== String(prev)) onSave(next || null)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  const shown = displayValue !== undefined ? displayValue : (value || '')

  return (
    <div className="txp-field">
      <span className={`txp-field-label${required ? ' required' : ''}`}>{label}</span>
      {readOnly ? (
        <span className="txp-field-readonly" tabIndex={tabIndex ?? -1}>{shown || '—'}</span>
      ) : editing ? (
        type === 'select' ? (
          <select
            ref={inputRef}
            className="txp-input"
            tabIndex={tabIndex}
            value={draft}
            onChange={e => { onSave(e.target.value || null); setEditing(false) }}
            onBlur={() => setEditing(false)}
          >
            {(options || []).map(o => (
              <option key={typeof o === 'object' ? o.value : o} value={typeof o === 'object' ? o.value : o}>
                {typeof o === 'object' ? o.label : (o || '—')}
              </option>
            ))}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            ref={inputRef}
            className="txp-textarea"
            tabIndex={tabIndex}
            value={draft}
            placeholder={placeholder}
            rows={4}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
          />
        ) : (
          <input
            ref={inputRef}
            type={type || 'text'}
            className="txp-input"
            tabIndex={tabIndex}
            value={draft}
            placeholder={placeholder}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
          />
        )
      ) : (
        <span
          className={`txp-field-value${type === 'textarea' ? ' txp-field-value--multiline' : ''}`}
          tabIndex={tabIndex}
          onClick={startEdit}
          onFocus={startEdit}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit() } }}
        >
          {shown || <span className="txp-placeholder">{placeholder || 'Click to edit'}</span>}
        </span>
      )}
    </div>
  )
}

// ─── Notes: single-line compose with @ mentions, fixed-height scroll list ──────
function NotesSection({ transactionId, transactionAddr, onNoteAdded, tcSettings }) {
  const [notes, setNotes]           = useState([])
  const [newText, setNewText]       = useState('')
  const [editingId, setEditing]     = useState(null)
  const [editDraft, setDraft]       = useState('')
  const [loaded, setLoaded]         = useState(false)
  const [mentionOpen, setMention]   = useState(false)
  const [mentionFilter, setFilter]  = useState('')
  const inputRef     = useRef(null)
  const composeRef   = useRef(null)

  useEffect(() => {
    if (!transactionId) { setLoaded(true); return }
    supabase
      .from('transaction_notes')
      .select('id, note_text, created_at')
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('[Notes] load error:', error.message)
        else setNotes(data || [])
        setLoaded(true)
      })
  }, [transactionId])

  // Close mention dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (composeRef.current && !composeRef.current.contains(e.target)) setMention(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleInputChange = (e) => {
    const val    = e.target.value
    const cursor = e.target.selectionStart
    setNewText(val)
    const atMatch = val.slice(0, cursor).match(/@(\w*)$/)
    if (atMatch) { setMention(true); setFilter(atMatch[1].toLowerCase()) }
    else setMention(false)
  }

  const insertMention = (handle) => {
    const cursor = inputRef.current?.selectionStart ?? newText.length
    const before = newText.slice(0, newText.slice(0, cursor).lastIndexOf('@'))
    const after  = newText.slice(cursor)
    const next   = before + handle + ' ' + after
    setNewText(next)
    setMention(false)
    setFilter('')
    requestAnimationFrame(() => {
      if (inputRef.current) {
        const pos = (before + handle + ' ').length
        inputRef.current.focus()
        inputRef.current.setSelectionRange(pos, pos)
      }
    })
  }

  const mentionPeople   = buildMentionPeople(tcSettings)
  const visibleMentions = mentionPeople.filter(p =>
    p.handle.slice(1).toLowerCase().startsWith(mentionFilter)
  )

  const handleAdd = () => {
    const text = newText.trim()
    if (!text) return
    const mentions = extractMentions(text)
    console.log('[Notes] handleAdd fired — text:', text, '| mentions:', mentions, '| tcSettings:', tcSettings)
    const now      = new Date().toISOString()
    const tempId   = `tmp-${Date.now()}`

    setNotes(prev => [{ id: tempId, note_text: text, created_at: now }, ...prev])
    setNewText('')
    setMention(false)
    inputRef.current?.focus()

    supabase
      .from('transaction_notes')
      .insert({ transaction_id: transactionId, note_text: text, created_at: now })
      .select('id, note_text, created_at')
      .single()
      .then(({ data: saved, error }) => {
        if (error) { console.error('[Notes] save error:', error.message); return }
        if (saved) setNotes(prev => prev.map(n => n.id === tempId ? saved : n))
      })

    onNoteAdded?.(text, mentions)
    if (mentions.length > 0) sendMentionEmails(mentions, text, transactionAddr, tcSettings, transactionId)
  }

  const handleSaveEdit = (id) => {
    const text = editDraft.trim()
    setEditing(null)
    if (!text) return
    setNotes(prev => prev.map(n => n.id === id ? { ...n, note_text: text } : n))
    supabase.from('transaction_notes').update({ note_text: text }).eq('id', id)
      .then(({ error }) => { if (error) console.error('[Notes] edit error:', error.message) })
  }

  const handleDelete = (id) => {
    setNotes(prev => prev.filter(n => n.id !== id))
    supabase.from('transaction_notes').delete().eq('id', id)
      .then(({ error }) => { if (error) console.error('[Notes] delete error:', error.message) })
  }

  return (
    <div className="txp-section">
      <div className="txp-section-title">Notes</div>

      <div className="txp-note-compose-row" ref={composeRef}>
        <input
          ref={inputRef}
          className="txp-note-compose-input"
          type="text"
          tabIndex={30}
          placeholder="Type a note and press Enter… use @ to mention"
          value={newText}
          onChange={handleInputChange}
          onKeyDown={e => {
            if (e.key === 'Enter')  { e.preventDefault(); e.stopPropagation(); handleAdd() }
            if (e.key === 'Escape') setMention(false)
          }}
        />
        {mentionOpen && visibleMentions.length > 0 && (
          <div className="txp-mention-dropdown">
            {visibleMentions.map(p => (
              <button
                key={p.handle}
                className="txp-mention-option"
                onMouseDown={e => { e.preventDefault(); insertMention(p.handle) }}
              >
                {p.handle}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fixed-height scroll area — never grows beyond 200px */}
      <div className="txp-notes-list">
        {loaded && notes.length === 0 && (
          <div className="txp-empty-state" style={{ padding: '8px 0' }}>No notes yet.</div>
        )}
        {notes.map(note => (
          <div key={note.id} className="txp-note-card">
            {editingId === note.id ? (
              <input
                className="txp-note-compose-input"
                type="text"
                value={editDraft}
                autoFocus
                onChange={e => setDraft(e.target.value)}
                onBlur={() => handleSaveEdit(note.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  { e.preventDefault(); handleSaveEdit(note.id) }
                  if (e.key === 'Escape') setEditing(null)
                }}
              />
            ) : (
              <div
                className="txp-note-text"
                onClick={() => { setEditing(note.id); setDraft(note.note_text) }}
              >
                {renderNoteText(note.note_text)}
              </div>
            )}
            <div className="txp-note-meta">
              <span className="txp-note-info">{formatTimestamp(note.created_at)}</span>
              <button className="txp-note-del" onClick={() => handleDelete(note.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tasks Spreadsheet ─────────────────────────────────────────────────────────
function TaskRow({ task, onUpdate, onDelete }) {
  const [editTitle, setEditTitle] = useState(false)
  const [titleDraft, setTitle]    = useState(task.title)
  const [editDate, setEditDate]   = useState(false)
  const [editAssign, setAssign]   = useState(false)

  const isDone     = task.status === 'complete'
  const statusKey  = task.status || 'open'
  const statusLabel = STATUS_LABELS[statusKey] || 'To Do'
  const statusStyle = STATUS_STYLE[statusKey] || STATUS_STYLE.open

  const saveTitle = () => {
    setEditTitle(false)
    if (titleDraft.trim() && titleDraft !== task.title) onUpdate(task.id, { title: titleDraft.trim() })
    else setTitle(task.title)
  }

  const toggleDone = () => {
    if (isDone) {
      onUpdate(task.id, { status: 'open', completed_at: null })
    } else {
      onUpdate(task.id, { status: 'complete', completed_at: new Date().toISOString() })
    }
  }

  const cycleStatus = () => {
    const next = STATUS_NEXT[statusKey] || 'open'
    const extra = next === 'complete'
      ? { completed_at: new Date().toISOString() }
      : statusKey === 'complete' ? { completed_at: null } : {}
    onUpdate(task.id, { status: next, ...extra })
  }

  return (
    <tr className={`txp-task-row${isDone ? ' txp-task-done' : ''}`}>
      <td className="txp-task-td txp-task-td-check">
        <button className={`txp-task-check${isDone ? ' checked' : ''}`} onClick={toggleDone}>
          {isDone && '✓'}
        </button>
      </td>
      <td className="txp-task-td txp-task-td-name">
        {editTitle ? (
          <input
            className="txp-task-inline-input"
            value={titleDraft}
            autoFocus
            onChange={e => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitle(task.title); setEditTitle(false) } }}
          />
        ) : (
          <span
            className={`txp-task-name-text${isDone ? ' done' : ''}`}
            onClick={() => !isDone && setEditTitle(true)}
          >
            {task.title}
          </span>
        )}
      </td>
      <td className="txp-task-td txp-task-td-date">
        {editDate ? (
          <input
            type="date"
            className="txp-task-inline-input"
            value={task.due_date || ''}
            autoFocus
            onChange={e => { onUpdate(task.id, { due_date: e.target.value }); setEditDate(false) }}
            onBlur={() => setEditDate(false)}
          />
        ) : (
          <span className={`txp-task-date${getDueCls(task.due_date, isDone)}`} onClick={() => setEditDate(true)}>
            {task.due_date ? formatDate(task.due_date) : <span className="txp-task-no-date">+ date</span>}
          </span>
        )}
      </td>
      <td className="txp-task-td txp-task-td-assign">
        {editAssign ? (
          <select
            className="txp-task-inline-input"
            value={task.assigned_to}
            autoFocus
            onChange={e => { onUpdate(task.id, { assigned_to: e.target.value }); setAssign(false) }}
            onBlur={() => setAssign(false)}
          >
            {TASK_ASSIGNEES.map(a => <option key={a}>{a}</option>)}
          </select>
        ) : (
          <span className="txp-task-assignee-text" onClick={() => setAssign(true)}>
            {task.assigned_to === 'Me' ? 'Me' : (task.assigned_to || '').split(' ')[0]}
          </span>
        )}
      </td>
      <td className="txp-task-td txp-task-td-status">
        <button
          className="txp-task-status-badge"
          style={{ background: statusStyle.bg, color: statusStyle.color }}
          onClick={cycleStatus}
          title="Click to advance status"
        >
          {statusLabel}
        </button>
        {isDone && task.completed_at && (
          <div className="txp-task-completed-at">
            {formatLocalDate(task.completed_at)}
          </div>
        )}
      </td>
      <td className="txp-task-td txp-task-td-del">
        <button className="txp-task-del-btn" onClick={() => onDelete(task.id)}>✕</button>
      </td>
    </tr>
  )
}

function TasksSpreadsheet({ tasks, transactionId, onAdd, onUpdate, onDelete }) {
  const [search, setSearch]         = useState('')
  const [filterAssign, setAssign]   = useState('All')
  const [filterStatus, setStatus]   = useState('All')
  const [sortAsc, setSortAsc]       = useState(true)
  const [adding, setAdding]         = useState(false)
  const [newTitle, setNewTitle]     = useState('')
  const newInputRef                 = useRef(null)

  useEffect(() => { if (adding) newInputRef.current?.focus() }, [adding])

  const handleAdd = () => {
    if (!newTitle.trim()) { setAdding(false); return }
    onAdd({ title: newTitle.trim(), transaction_id: transactionId, status: 'open', assigned_to: 'Me', notes: '', due_date: '' })
    setNewTitle('')
    setAdding(false)
  }

  let filtered = tasks
  if (search.trim())    filtered = filtered.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
  if (filterAssign !== 'All') filtered = filtered.filter(t => t.assigned_to === filterAssign)
  if (filterStatus !== 'All') {
    const dbKey = Object.entries(STATUS_LABELS).find(([, v]) => v === filterStatus)?.[0]
    if (dbKey) filtered = filtered.filter(t => (t.status || 'open') === dbKey)
  }
  filtered = [...filtered].sort((a, b) => {
    const aDone = (a.status || 'open') === 'complete'
    const bDone = (b.status || 'open') === 'complete'
    // Completed tasks always sink to the bottom
    if (aDone !== bDone) return aDone ? 1 : -1
    // Within each group, sort by due date
    if (!a.due_date && !b.due_date) return 0
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return sortAsc ? a.due_date.localeCompare(b.due_date) : b.due_date.localeCompare(a.due_date)
  })

  return (
    <div className="txp-tasks-block">
      <div className="txp-tasks-header">
        <span className="txp-tasks-title">Tasks</span>
        <div className="txp-tasks-toolbar">
          <input className="txp-task-search" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="txp-task-filter" value={filterAssign} onChange={e => setAssign(e.target.value)}>
            <option value="All">All assignees</option>
            {TASK_ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="txp-task-filter" value={filterStatus} onChange={e => setStatus(e.target.value)}>
            <option value="All">All statuses</option>
            <option>To Do</option>
            <option>In Progress</option>
            <option>Completed</option>
          </select>
          <button className="txp-task-sort-btn" onClick={() => setSortAsc(a => !a)}>
            Due {sortAsc ? '↑' : '↓'}
          </button>
          <button className="txp-task-add-btn" onClick={() => setAdding(true)}>+ Add Task</button>
        </div>
      </div>

      <table className="txp-task-table">
        <thead>
          <tr>
            <th className="txp-task-th txp-task-th-check"></th>
            <th className="txp-task-th">Task</th>
            <th className="txp-task-th">Due Date</th>
            <th className="txp-task-th">Assigned To</th>
            <th className="txp-task-th">Status</th>
            <th className="txp-task-th txp-task-th-del"></th>
          </tr>
        </thead>
        <tbody>
          {adding && (
            <tr className="txp-task-row">
              <td className="txp-task-td txp-task-td-check"><span className="txp-task-check"></span></td>
              <td className="txp-task-td txp-task-td-name" colSpan={4}>
                <input
                  ref={newInputRef}
                  className="txp-task-inline-input"
                  value={newTitle}
                  placeholder="Task name…"
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNewTitle('') } }}
                  onBlur={handleAdd}
                />
              </td>
              <td className="txp-task-td txp-task-td-del">
                <button className="txp-task-del-btn" onMouseDown={() => { setAdding(false); setNewTitle('') }}>✕</button>
              </td>
            </tr>
          )}
          {filtered.map(t => (
            <TaskRow key={t.id} task={t} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
          {filtered.length === 0 && !adding && (
            <tr>
              <td className="txp-task-empty" colSpan={6}>
                No tasks yet — click + Add Task to create one
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── Inline sub-field for City/ZIP (no label, used in CSZ row) ────────────────
function CszField({ value, onSave, placeholder, style, tabIndex }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState('')
  const ref                   = useRef(null)

  useEffect(() => {
    if (editing && ref.current) { ref.current.focus(); ref.current.select?.() }
  }, [editing])

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next !== (value ?? '').trim()) onSave(next || null)
  }

  return editing ? (
    <input
      ref={ref}
      className="txp-csz-input"
      style={style}
      tabIndex={tabIndex}
      value={draft}
      placeholder={placeholder}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
    />
  ) : (
    <span
      className="txp-csz-val"
      style={style}
      tabIndex={tabIndex}
      onClick={() => { setDraft(value ?? ''); setEditing(true) }}
      onFocus={() => { setDraft(value ?? ''); setEditing(true) }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDraft(value ?? ''); setEditing(true) } }}
    >
      {value || <span className="txp-placeholder">{placeholder}</span>}
    </span>
  )
}

// ─── Transaction Summary Builder ─────────────────────────────────────────────
function buildTransactionSummary(transaction, column, fullAddress) {
  const isBuyer = transaction.rep_type === 'Buyer'
  const lines   = []

  lines.push('TRANSACTION SUMMARY')
  lines.push('─'.repeat(44))
  lines.push(`Property:         ${fullAddress || '—'}`)
  lines.push(`Transaction Type: ${transaction.rep_type || '—'}`)
  lines.push(`Stage:            ${column?.label || transaction.status || '—'}`)
  if (transaction.assigned_tc) lines.push(`TC:               ${transaction.assigned_tc}`)
  if (transaction.price)       lines.push(`${isBuyer ? 'Purchase Price' : 'List Price'}:    ${fmtWhole(transaction.price)}`)

  const client1 = [transaction.client_first_name, transaction.client_last_name].filter(Boolean).join(' ')
  const client2 = [transaction.client2_first_name, transaction.client2_last_name].filter(Boolean).join(' ')
  if (client1 || client2) {
    lines.push(''); lines.push('CLIENT'); lines.push('─'.repeat(44))
    if (client1) lines.push(`Client 1: ${client1}`)
    if (client2) lines.push(`Client 2: ${client2}`)
  }

  const allDates = [
    { key: 'listing_contract',         label: 'Listing Contract'       },
    { key: 'listing_expiration_date',  label: 'Listing Expiration'     },
    { key: 'target_live_date',         label: 'Target Live'            },
    { key: 'bba_contract',             label: 'BBA Contract'           },
    { key: 'bba_expiration',           label: 'BBA Expiration'         },
    { key: 'contract_acceptance_date', label: 'Contract Acceptance'    },
    { key: 'ipe_date',                 label: 'Inspection Period End'  },
    { key: 'close_of_escrow',          label: 'Close of Escrow'        },
    { key: 'contingency_fulfilled_date', label: 'Contingency Fulfilled' },
  ]
  const datesToShow = allDates.filter(d => transaction[d.key])
  if (datesToShow.length || transaction.has_contingency) {
    lines.push(''); lines.push('KEY DATES'); lines.push('─'.repeat(44))
    datesToShow.forEach(d => lines.push(`${d.label}: ${formatDate(transaction[d.key])}`))
    if (transaction.has_contingency) lines.push('Contingency: Yes')
  }

  const txDetails = [
    { label: 'Lender',        value: transaction.lender_name   },
    { label: 'Title Company', value: transaction.title_company  },
    { label: 'Co-op Agent',   value: transaction.co_op_agent   },
  ].filter(d => d.value)
  if (txDetails.length) {
    lines.push(''); lines.push('TRANSACTION DETAILS'); lines.push('─'.repeat(44))
    txDetails.forEach(d => lines.push(`${d.label}: ${d.value}`))
  }

  if (!isBuyer) {
    const listingDetails = [
      { label: 'Lockbox', value: transaction.lockbox },
      { label: 'Sign',    value: transaction.has_sign ? 'Yes' : null },
    ].filter(d => d.value)
    if (listingDetails.length) {
      lines.push(''); lines.push('LISTING DETAILS'); lines.push('─'.repeat(44))
      listingDetails.forEach(d => lines.push(`${d.label}: ${d.value}`))
    }
  }

  const features = [
    transaction.has_septic && 'Septic',
    transaction.has_solar  && 'Solar',
    transaction.has_well   && 'Well',
    transaction.has_hoa    && 'HOA',
    transaction.has_lbp    && 'LBP',
  ].filter(Boolean)
  if (features.length) {
    lines.push(''); lines.push('PROPERTY FEATURES'); lines.push('─'.repeat(44))
    lines.push(features.join(', '))
  }

  return lines.join('\n')
}

// ─── Send Dropdown ────────────────────────────────────────────────────────────
function SendDropdown({ tcSettings, onSend, onClose }) {
  const sendable = (tcSettings || []).filter(tc => tc.name !== 'Me' && tc.email)
  const [selected, setSelected] = useState(() => sendable.map(tc => tc.name))
  const [sending, setSending]   = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const toggle = (name) =>
    setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])

  const handleSend = async () => {
    console.log('[Send] Send button clicked — selected:', selected, '| sendable:', sendable)
    if (!selected.length || sending) return
    setSending(true)
    await onSend(sendable.filter(tc => selected.includes(tc.name)))
    setSending(false)
    onClose()
  }

  return (
    <div className="txp-send-dropdown" ref={ref}>
      <div className="txp-send-dropdown-title">Send summary to</div>
      {sendable.length === 0 ? (
        <div className="txp-send-no-emails">No TC emails configured.<br />Add emails in Settings.</div>
      ) : (
        sendable.map(tc => (
          <label key={tc.name} className="txp-send-recipient">
            <input
              type="checkbox"
              checked={selected.includes(tc.name)}
              onChange={() => toggle(tc.name)}
            />
            <span>{tc.name}</span>
          </label>
        ))
      )}
      <div className="txp-send-dropdown-actions">
        <button className="txp-send-cancel-btn" onClick={onClose}>Cancel</button>
        <button
          className="txp-send-confirm-btn"
          disabled={!selected.length || sending || sendable.length === 0}
          onClick={handleSend}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}

// ─── Details Section (two-column layout + tasks full-width) ───────────────────
// ─── Collaborator add modal (used by CollaboratorSearch "Create New") ──────────
const COLLAB_CATS = {
  'lenders':          { label: 'Lender',         companyLabel: 'Company',   hasType: false },
  'title-escrow':     { label: 'Title / Escrow',  companyLabel: 'Company',   hasType: false },
  'coop-agents':      { label: 'Co-op Agent',     companyLabel: 'Brokerage', hasType: false },
  'home-inspectors':  { label: 'Home Inspector',  companyLabel: 'Company',   hasType: false },
  'other-vendors':    { label: 'Vendor',          companyLabel: 'Company',   hasType: true  },
}

function CollaboratorAddModal({ category, initialName = '', onSaved, onClose }) {
  const meta = COLLAB_CATS[category] || { label: 'Collaborator', companyLabel: 'Company', hasType: false }
  const nameParts = initialName.trim().split(/\s+/)
  const [form, setForm] = useState({
    first_name: nameParts[0] || '',
    last_name:  nameParts.slice(1).join(' ') || '',
    company: '', phone: '', email: '', type: '',
  })
  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }))

  const handleSave = async () => {
    const payload = { ...form, category }
    console.log('[CollaboratorAdd] inserting:', payload)
    const { data, error } = await supabase
      .from('collaborators').insert(payload).select().single()
    if (error) {
      console.error('[CollaboratorAdd] Supabase error:', error.code, error.message, error.details, error.hint)
      toast.error(`Failed to add: ${error.message}`)
      return
    }
    console.log('[CollaboratorAdd] success:', data)
    toast.success(`${meta.label} added`)
    onSaved(data)
  }

  return (
    <div className="collab-add-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="collab-add-modal">
        <div className="collab-add-header">
          <span>Add {meta.label}</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="collab-add-body">
          <div className="collab-add-row">
            <label>First Name<input value={form.first_name} onChange={set('first_name')} placeholder="First" /></label>
            <label>Last Name<input value={form.last_name}  onChange={set('last_name')}  placeholder="Last"  /></label>
          </div>
          <label>{meta.companyLabel}<input value={form.company} onChange={set('company')} placeholder={meta.companyLabel} /></label>
          {meta.hasType && <label>Type<input value={form.type} onChange={set('type')} placeholder="e.g. Photographer" /></label>}
          <div className="collab-add-row">
            <label>Phone<input value={form.phone} onChange={set('phone')} type="tel"   placeholder="(555) 000-0000" /></label>
            <label>Email<input value={form.email} onChange={set('email')} type="email" placeholder="email@example.com" /></label>
          </div>
        </div>
        <div className="collab-add-footer">
          <button className="collab-add-cancel" onClick={onClose}>Cancel</button>
          <button className="collab-add-save"   onClick={handleSave}>Add</button>
        </div>
      </div>
    </div>
  )
}

// ─── CollaboratorSearch — typeahead field backed by the collaborators table ────
function CollaboratorSearch({ label, value, category, onSave, onSelect, placeholder, tabIndex }) {
  const [text, setText]         = useState(value || '')
  const [results, setResults]   = useState([])
  const [open, setOpen]         = useState(false)
  const [addOpen, setAddOpen]   = useState(false)
  const inputRef                = useRef(null)

  // Sync if parent value changes (e.g. after a save)
  useEffect(() => { setText(value || '') }, [value])

  useEffect(() => {
    if (!text.trim()) { setResults([]); return }
    const t = text.trim()
    supabase.from('collaborators').select('*').eq('category', category)
      .or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%,company.ilike.%${t}%`)
      .limit(8)
      .then(({ data }) => setResults(data || []))
  }, [text, category])

  const displayName = c =>
    [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company || ''

  const handleSelect = c => {
    const name = displayName(c)
    setText(name)
    setOpen(false)
    onSave(name)
    onSelect?.(c)
  }

  const handleBlur = () => {
    setTimeout(() => setOpen(false), 180)
    onSave(text)
  }

  const handleSaved = c => {
    setResults([])
    setAddOpen(false)
    handleSelect(c)
  }

  return (
    <div className="txp-field collab-search-field">
      <span className="txp-field-label">{label}</span>
      <div className="collab-search-wrap">
        <input
          ref={inputRef}
          className="collab-search-input"
          value={text}
          placeholder={placeholder || label}
          tabIndex={tabIndex}
          onChange={e => { setText(e.target.value); setOpen(true) }}
          onFocus={() => text && setOpen(true)}
          onBlur={handleBlur}
        />
        {open && (results.length > 0 || text.trim()) && (
          <div className="collab-search-dropdown">
            {results.map(c => (
              <button key={c.id} className="collab-search-item" onMouseDown={() => handleSelect(c)}>
                <span className="collab-search-name">{displayName(c)}</span>
                {c.company && displayName(c) !== c.company && (
                  <span className="collab-search-company">{c.company}</span>
                )}
              </button>
            ))}
            <button className="collab-search-create" onMouseDown={() => { setOpen(false); setAddOpen(true) }}>
              + Create New
            </button>
          </div>
        )}
      </div>
      {addOpen && (
        <CollaboratorAddModal
          category={category}
          initialName={text}
          onSaved={handleSaved}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Details Section ───────────────────────────────────────────────────────────
function DetailsSection({ transaction, columns, onFieldSave, onStatusChange, onNoteAdded, transactionAddr, tcSettings }) {
  const save   = (field) => (value) => onFieldSave(field, value)
  const column = columns.find(c => c.id === transaction.status)

  const priceLabel = column?.priceLabel ||
    (transaction.rep_type === 'Buyer' ? 'Purchase Price' : 'List Price')

  const isBuyer           = transaction.rep_type === 'Buyer'
  const isPendingOrBeyond = BUYER_PENDING_STAGES.includes(transaction.status)
  const isVacantLand      = transaction.property_type === 'Vacant Land'

  const dateFields = isBuyer ? [
    { key: 'bba_contract',             label: 'BBA Contract',          required: true  },
    { key: 'bba_expiration',           label: 'BBA Expiration',        required: true  },
    { key: 'contract_acceptance_date', label: 'Contract Acceptance',   required: true  },
    { key: 'ipe_date',                 label: 'Inspection Period End', required: false },
    { key: 'close_of_escrow',          label: 'Close of Escrow',       required: true  },
  ] : [
    { key: 'listing_contract',         label: 'Listing Contract',      required: true  },
    { key: 'listing_expiration_date',  label: 'Listing Expiration',    required: true  },
    { key: 'target_live_date',         label: 'Target Live',           required: false },
    { key: 'contract_acceptance_date', label: 'Contract Acceptance',   required: true  },
    { key: 'ipe_date',                 label: 'Inspection Period End', required: false },
    { key: 'close_of_escrow',          label: 'Close of Escrow',       required: true  },
  ]

  return (
    <div className="txp-details-view">
      <div className="txp-details-columns">

        {/* LEFT COLUMN */}
        <div className="txp-col-left">

          {/* PROPERTY DETAILS */}
          <div className="txp-section">
            <div className="txp-section-title">Property Details</div>
            <TxField label="Street" value={transaction.property_address || ''} type="text" onSave={save('property_address')} placeholder="Street address" tabIndex={1} />
            <div className="txp-field">
              <span className="txp-field-label">City / ZIP</span>
              <div className="txp-csz-row">
                <CszField value={transaction.city || ''} onSave={save('city')} placeholder="City" style={{ flex: 1 }} tabIndex={2} />
                <span className="txp-csz-state">AZ</span>
                <CszField value={transaction.zip || ''} onSave={save('zip')} placeholder="ZIP" style={{ width: 68 }} tabIndex={3} />
              </div>
            </div>
            <TxField
              label="Property Type"
              value={transaction.property_type || ''}
              type="select"
              options={PROPERTY_TYPE_OPTIONS}
              onSave={save('property_type')}
              tabIndex={4}
            />

            {/* Seller: APN always visible */}
            {!isBuyer && (
              <TxField label="APN" value={transaction.apn || ''} type="text" onSave={save('apn')} placeholder="000-000-000" tabIndex={5} />
            )}

            {/* Buyer pending+ property fields */}
            {isBuyer && isPendingOrBeyond && (<>
              <TxField
                label="Purchase Price"
                value={String(transaction.price || '')}
                displayValue={fmtWhole(transaction.price)}
                type="text"
                onSave={save('price')}
                placeholder="$0"
                tabIndex={5}
              />
              <TxField label="APN"    value={transaction.apn    || ''} type="text" onSave={save('apn')}    placeholder="000-000-000" tabIndex={6} />
              <TxField label="Access" value={transaction.access || ''} type="text" onSave={save('access')} placeholder="e.g. lockbox code, call agent" tabIndex={7} />
            </>)}

            <TxField label="Transaction Type" value={transaction.rep_type || '—'} readOnly tabIndex={-1} />
            <TxField
              label="Stage"
              value={transaction.status || ''}
              displayValue={column?.label || transaction.status}
              type="select"
              options={COLUMN_OPTIONS}
              onSave={onStatusChange}
              tabIndex={12}
            />
            <TxField
              label="TC"
              value={transaction.assigned_tc || ''}
              type="select"
              options={[{ value: '', label: '—' }, ...TC_OPTIONS.map(o => ({ value: o, label: o }))]}
              onSave={save('assigned_tc')}
              tabIndex={13}
            />
          </div>

          {/* CLIENT */}
          <div className="txp-section">
            <div className="txp-section-title">Client</div>
            <ClientRow
              label="Client 1"
              first={transaction.client_first_name || ''}
              last={transaction.client_last_name   || ''}
              tabIndex={16}
              onFubSelect={(result) => {
                const p = result?.client1
                if (!p) return
                save('client_first_name')(p.first_name || '')
                save('client_last_name')(p.last_name   || '')
                save('client_phone')(p.phone            || '')
                save('client_email')(p.email            || '')
                if (result.related?.[0]) {
                  const r = result.related[0]
                  save('client2_first_name')(r.first_name || '')
                  save('client2_last_name')(r.last_name   || '')
                  save('client2_phone')(r.phone            || '')
                  save('client2_email')(r.email            || '')
                }
              }}
            />
            <ClientRow
              label="Client 2"
              first={transaction.client2_first_name || ''}
              last={transaction.client2_last_name   || ''}
              tabIndex={17}
              onFubSelect={(result) => {
                const p = result?.client1
                if (!p) return
                save('client2_first_name')(p.first_name || '')
                save('client2_last_name')(p.last_name   || '')
                save('client2_phone')(p.phone            || '')
                save('client2_email')(p.email            || '')
              }}
            />
          </div>

          {/* LISTING DETAILS — Seller only */}
          {!isBuyer && (
            <div className="txp-section">
              <div className="txp-section-title">Listing Details</div>
              <TxField
                label="List Price"
                value={String(transaction.price || '')}
                displayValue={fmtWhole(transaction.price)}
                type="text"
                onSave={save('price')}
                placeholder="$0"
                tabIndex={14}
              />
              <TxField label="MLS Number" value={transaction.mls_number || ''} type="text" onSave={save('mls_number')} placeholder="MLS #" tabIndex={15} />
              <TxField
                label="Vacant or Occupied"
                value={transaction.vacant_or_occupied || ''}
                type="select"
                options={VACANT_OPTIONS}
                onSave={save('vacant_or_occupied')}
                tabIndex={16}
              />
              <TxField
                label="Lockbox"
                value={transaction.lockbox || ''}
                type="select"
                options={LOCKBOX_OPTIONS}
                onSave={save('lockbox')}
                tabIndex={17}
              />
              <div className="txp-field">
                <span className="txp-field-label">Sign</span>
                <label className="txp-checkbox-item">
                  <input type="checkbox" tabIndex={18} checked={!!transaction.has_sign} onChange={e => save('has_sign')(e.target.checked)} />
                </label>
              </div>
            </div>
          )}

          {/* PROPERTY FEATURES — Seller: always; Buyer: Pending+ only */}
          {(!isBuyer || isPendingOrBeyond) && (
            <div className="txp-section">
              <div className="txp-section-title">Property Features</div>
              {/* Seller numeric fields */}
              {!isBuyer && !isVacantLand && (<>
                <TxField label="Bedrooms"   value={String(transaction.bedrooms   ?? '')} type="text" onSave={save('bedrooms')}   placeholder="e.g. 3"    tabIndex={19} />
                <TxField label="Square Ft"  value={String(transaction.square_ft  ?? '')} type="text" onSave={save('square_ft')}  placeholder="e.g. 1800" tabIndex={20} />
                <TxField label="Year Built" value={String(transaction.year_built  ?? '')} type="text" onSave={save('year_built')} placeholder="e.g. 1998" tabIndex={21} />
              </>)}
              <div className="txp-checks-row">
                <label className="txp-checkbox-item">
                  <input type="checkbox" tabIndex={22} checked={!!transaction.has_septic} onChange={e => save('has_septic')(e.target.checked)} />
                  <span>Septic</span>
                </label>
                <label className="txp-checkbox-item">
                  <input type="checkbox" tabIndex={23} checked={!!transaction.has_solar} onChange={e => save('has_solar')(e.target.checked)} />
                  <span>Solar</span>
                </label>
                <label className="txp-checkbox-item">
                  <input type="checkbox" tabIndex={24} checked={!!transaction.has_well} onChange={e => save('has_well')(e.target.checked)} />
                  <span>Well</span>
                </label>
                <label className="txp-checkbox-item">
                  <input type="checkbox" tabIndex={25} checked={!!transaction.has_hoa} onChange={e => save('has_hoa')(e.target.checked)} />
                  <span>HOA</span>
                </label>
                <label className="txp-checkbox-item">
                  <input type="checkbox" tabIndex={26} checked={!!transaction.has_lbp} onChange={e => save('has_lbp')(e.target.checked)} />
                  <span>LBP</span>
                </label>
                <label className="txp-checkbox-item">
                  <input type="checkbox" tabIndex={27} checked={!!transaction.new_construction} onChange={e => save('new_construction')(e.target.checked)} />
                  <span>New Construction</span>
                </label>
              </div>
            </div>
          )}

          {/* CONTRACT DETAILS — Pending, Closed, Cancelled/Expired only */}
          {isPendingOrBeyond && (
            <div className="txp-section">
              <div className="txp-section-title">Contract Details</div>
              <CollaboratorSearch
                label="Lender"
                value={transaction.lender_name || ''}
                category="lenders"
                onSave={save('lender_name')}
                placeholder="Lender name"
                tabIndex={32}
              />
              <CollaboratorSearch
                label="Title Company"
                value={transaction.title_company || ''}
                category="title-escrow"
                onSave={save('title_company')}
                onSelect={c => {
                  if (c.email) save('title_company_email')(c.email)
                  if (c.phone) save('title_company_phone')(c.phone)
                }}
                placeholder="Title company"
                tabIndex={33}
              />
              <TxField label="Title Email" value={transaction.title_company_email || ''} type="text" onSave={save('title_company_email')} placeholder="title@company.com" tabIndex={34} />
              <TxField label="Title Phone" value={transaction.title_company_phone || ''} type="text" onSave={save('title_company_phone')} placeholder="(555) 000-0000"    tabIndex={35} />
              <TxField
                label={isBuyer ? 'Seller Name' : 'Buyer Name'}
                value={transaction.opposite_party_name || ''}
                type="text"
                onSave={save('opposite_party_name')}
                placeholder={isBuyer ? 'Seller name' : 'Buyer name'}
                tabIndex={36}
              />
              <CollaboratorSearch
                label="Co-op Agent"
                value={transaction.co_op_agent || ''}
                category="coop-agents"
                onSave={save('co_op_agent')}
                placeholder="Agent name"
                tabIndex={37}
              />
              {!isVacantLand && (<>
                <CollaboratorSearch
                  label="Home Inspector"
                  value={transaction.home_inspector || ''}
                  category="home-inspectors"
                  onSave={save('home_inspector')}
                  placeholder="Inspector name"
                  tabIndex={38}
                />
                <TxField
                  label="Inspection Date"
                  value={transaction.home_inspection_date || ''}
                  displayValue={formatDate(transaction.home_inspection_date)}
                  type="date"
                  onSave={save('home_inspection_date')}
                  tabIndex={39}
                />
              </>)}
              <TxField
                label="Financing Type"
                value={transaction.financing_type || ''}
                type="select"
                options={FINANCING_TYPE_OPTIONS}
                onSave={save('financing_type')}
                tabIndex={40}
              />
              <div className="txp-field">
                <span className="txp-field-label">Additional Parcel(s)</span>
                <label className="txp-checkbox-item">
                  <input type="checkbox" tabIndex={41} checked={!!transaction.additional_parcels} onChange={e => save('additional_parcels')(e.target.checked)} />
                </label>
              </div>
              <TxField
                label="Additional Terms & Conditions"
                value={transaction.additional_terms || ''}
                type="textarea"
                onSave={save('additional_terms')}
                placeholder="Enter any additional terms or conditions…"
                tabIndex={42}
              />
            </div>
          )}

        </div>{/* end left */}

        {/* RIGHT COLUMN */}
        <div className="txp-col-right">

          {/* KEY DATES */}
          <div className="txp-section">
            <div className="txp-section-title">Key Dates</div>
            {dateFields.map(({ key, label, required }, i) => (
              <TxField
                key={key}
                label={label}
                value={transaction[key] || ''}
                displayValue={formatDate(transaction[key])}
                type="date"
                onSave={save(key)}
                required={required}
                tabIndex={40 + i}
              />
            ))}
            <div className="txp-field">
              <span className="txp-field-label">Contingency</span>
              <label className="txp-checkbox-item">
                <input
                  type="checkbox"
                  tabIndex={46}
                  checked={!!transaction.has_contingency}
                  onChange={e => save('has_contingency')(e.target.checked)}
                />
              </label>
            </div>
            {transaction.has_contingency && (
              <TxField
                label="Contingency Fulfilled"
                value={transaction.contingency_fulfilled_date || ''}
                displayValue={formatDate(transaction.contingency_fulfilled_date)}
                type="date"
                onSave={save('contingency_fulfilled_date')}
                tabIndex={47}
              />
            )}
          </div>

          {/* NOTES (right column, below Key Dates) */}
          <NotesSection
            transactionId={transaction.id}
            transactionAddr={transactionAddr}
            onNoteAdded={onNoteAdded}
            tcSettings={tcSettings}
          />

          {/* REFERRALS */}
          <div className="txp-section">
            <div className="txp-section-title">Referrals</div>
            <TxField label="Referring Agent"       value={transaction.referring_agent       || ''} type="text" onSave={save('referring_agent')}       placeholder="Agent name"        tabIndex={43} />
            <TxField label="Referring Agent Email" value={transaction.referring_agent_email || ''} type="text" onSave={save('referring_agent_email')} placeholder="email@example.com" tabIndex={44} />
            <TxField label="Referring Agent Phone" value={transaction.referring_agent_phone || ''} type="text" onSave={save('referring_agent_phone')} placeholder="(555) 000-0000"   tabIndex={45} />
            <TxField label="Referral %"            value={String(transaction.referral_pct   ?? '')} type="text" onSave={save('referral_pct')}         placeholder="e.g. 25"           tabIndex={46} />
          </div>

        </div>{/* end right */}
      </div>

    </div>
  )
}

// ─── Commission Section ────────────────────────────────────────────────────────
function CommissionSection({ transaction, commissions, onCommissionChange, onAddTask, tasks }) {
  const commission = commissions?.[transaction.id] || {}
  const saveCm = field => value => onCommissionChange(transaction.id, field, value)

  const price = Number(transaction.price) || 0
  const referralPct = Number(transaction.referral_pct) || 0

  const sellerAmt  = parseContrib(commission.seller_concession, price)
  const buyerAmt   = commission.buyer_contribution ? parseContrib(commission.buyer_contribution, price) : 0
  const gci        = sellerAmt + buyerAmt

  const referralAmt    = referralPct > 0 ? gci * referralPct / 100 : 0
  const capAmt         = commission.cap_deduction     ? gci * 0.30 : 0
  const royaltyAmt     = commission.royalty_deduction ? gci * 0.06 : 0
  const eoAmt          = 35
  const tcFeeAmt       = Number(commission.tc_fee_commission) || 0
  const concessionsAmt = Number(commission.concessions) || 0
  const net = gci - referralAmt - capAmt - royaltyAmt - eoAmt - tcFeeAmt - concessionsAmt

  const address = [transaction.property_address, transaction.city].filter(Boolean).join(', ')

  const handleBba = checked => {
    saveCm('buyer_broker_addendum')(checked)
    if (checked) {
      const already = (tasks || []).some(t => /buyer broker addendum/i.test(t.title || ''))
      if (!already) onAddTask?.({
        title: 'Complete Buyer Broker Addendum',
        transaction_id: transaction.id,
        status: 'open',
        assigned_to: 'Me',
        notes: '',
        due_date: '',
      })
    }
  }

  const Sub = ({ label }) => <div className="txp-cm-sub-header">{label}</div>

  const ReadRow = ({ label, value, minus, bold, color }) => (
    <div className="txp-field">
      <span className="txp-field-label">{label}</span>
      <span className="txp-field-readonly" style={{ fontWeight: bold ? 700 : undefined, color }}>
        {value > 0 ? `${minus ? '−' : ''}${fmtCents(value)}` : '—'}
      </span>
    </div>
  )

  return (
    <div className="txp-section" style={{ maxWidth: 520 }}>
      <div className="txp-section-title">Commission</div>

      {address && <div className="txp-cm-address">{address}</div>}

      {/* ── Commission Source ── */}
      <Sub label="Commission Source" />
      <TxField
        label="Seller Concession"
        value={commission.seller_concession || ''}
        type="text"
        onSave={saveCm('seller_concession')}
        placeholder="3  or  $5000"
      />
      <TxField
        label="Buyer Contribution"
        value={commission.buyer_contribution || ''}
        type="text"
        onSave={saveCm('buyer_contribution')}
        placeholder="2.5  or  $3000"
      />
      <div className="txp-field">
        <span className="txp-field-label">GCI</span>
        <span className="txp-field-readonly" style={{ fontWeight: 600 }}>{fmtCents(gci) || '—'}</span>
      </div>

      {/* ── Deductions ── */}
      <Sub label="Deductions" />
      <div className="txp-field">
        <span className="txp-field-label">Referral %</span>
        <span className="txp-field-readonly">
          {referralPct > 0 ? `${referralPct}%` : <span className="txp-placeholder">Set in Referrals section</span>}
        </span>
      </div>
      <ReadRow label="Referral $" value={referralAmt} minus />
      <div className="txp-field">
        <span className="txp-field-label">Deduct Cap</span>
        <label className="txp-checkbox-item">
          <input type="checkbox" checked={!!commission.cap_deduction} onChange={e => saveCm('cap_deduction')(e.target.checked)} />
          <span className="txp-cm-check-hint">30% of GCI{commission.cap_deduction && capAmt > 0 ? ` — ${fmtCents(capAmt)}` : ''}</span>
        </label>
      </div>
      <div className="txp-field">
        <span className="txp-field-label">Deduct Royalty</span>
        <label className="txp-checkbox-item">
          <input type="checkbox" checked={!!commission.royalty_deduction} onChange={e => saveCm('royalty_deduction')(e.target.checked)} />
          <span className="txp-cm-check-hint">6% of GCI{commission.royalty_deduction && royaltyAmt > 0 ? ` — ${fmtCents(royaltyAmt)}` : ''}</span>
        </label>
      </div>
      <div className="txp-field">
        <span className="txp-field-label">E&amp;O</span>
        <span className="txp-field-readonly">$35.00</span>
      </div>
      <TxField
        label="TC Fee"
        value={String(commission.tc_fee_commission ?? '')}
        displayValue={commission.tc_fee_commission ? fmtCents(commission.tc_fee_commission) : ''}
        type="text"
        onSave={saveCm('tc_fee_commission')}
        placeholder="$0"
      />
      <TxField
        label="Concessions"
        value={String(commission.concessions ?? '')}
        displayValue={commission.concessions ? fmtCents(commission.concessions) : ''}
        type="text"
        onSave={saveCm('concessions')}
        placeholder="$0"
      />

      {/* ── Net ── */}
      <div className="txp-field txp-cm-net-row">
        <span className="txp-field-label txp-cm-net-label">Net</span>
        <span className="txp-cm-net-value">{fmtCents(net) || '—'}</span>
      </div>

      {/* ── Buyer Broker Addendum ── */}
      <Sub label="Buyer Broker Addendum" />
      <div className="txp-field">
        <span className="txp-field-label">BBA Required</span>
        <label className="txp-checkbox-item">
          <input type="checkbox" checked={!!commission.buyer_broker_addendum} onChange={e => handleBba(e.target.checked)} />
          {commission.buyer_broker_addendum && <span className="txp-cm-check-hint">Task + doc added</span>}
        </label>
      </div>
    </div>
  )
}

// ─── Documents Required (with Google Drive upload) ────────────────────────────
function DocsRequiredSection({ transaction, commissions }) {
  const [docStatuses, setDocStatuses] = useState({})   // { docName: { checked, filename, drive_id, drive_link } }
  const [uploading,   setUploading]   = useState({})
  const [customDocs,  setCustomDocs]  = useState({ buyer: [], listing: [], pending: [] })
  const [customInput, setCustomInput] = useState({ buyer: '', listing: '', pending: '' })
  const [folderIds,   setFolderIds]   = useState({
    drive_folder_id:         transaction.drive_folder_id         || null,
    drive_under_contract_id: transaction.drive_under_contract_id || null,
  })
  const fileRefs = useRef({})

  // Keep folderIds in sync
  useEffect(() => {
    setFolderIds({
      drive_folder_id:         transaction.drive_folder_id         || null,
      drive_under_contract_id: transaction.drive_under_contract_id || null,
    })
  }, [transaction.drive_folder_id, transaction.drive_under_contract_id])

  // Load doc statuses from Supabase
  useEffect(() => {
    supabase.from('document_uploads')
      .select('*')
      .eq('transaction_id', transaction.id)
      .then(({ data }) => {
        if (!data) return
        const map = {}
        const customs = { buyer: [], listing: [], pending: [] }
        data.forEach(r => {
          map[r.doc_name] = r
          if (r.is_custom && r.section && customs[r.section]) {
            customs[r.section].push(r.doc_name)
          }
        })
        setDocStatuses(map)
        setCustomDocs(customs)
      })
  }, [transaction.id])

  // ── Derived flags ──────────────────────────────────────────────────────────
  const isBuyer       = transaction.rep_type === 'Buyer'
  const isSeller      = transaction.rep_type === 'Seller'
  const isResidential = transaction.property_type === 'Residential'
  const isVacantLand  = transaction.property_type === 'Vacant Land'
  const stage         = transaction.status || ''
  const isListingStage = ['pre-listing', 'active-listing'].includes(stage)
  const isPendingStage = ['pending', 'closed', 'cancelled-expired'].includes(stage)

  const hasWell        = !!transaction.has_well
  const hasSolar       = !!transaction.has_solar
  const hasHoa         = !!transaction.has_hoa
  const hasLbp         = !!transaction.has_lbp
  const hasSeptic      = !!transaction.has_septic
  const hasContingency = !!transaction.has_contingency
  const yearBuilt      = Number(transaction.year_built) || 0
  const financingType  = transaction.financing_type || ''
  const referralPct    = Number(transaction.referral_pct) || 0
  const hasBba         = !!(commissions?.[transaction.id]?.buyer_broker_addendum)

  const showBuyerSection   = isBuyer
  const showListingSection = isSeller && isListingStage
  const showPendingSection = isPendingStage

  // ── Doc lists ──────────────────────────────────────────────────────────────
  const BUYER_DOCS = [
    'Buyer Broker Agreement (BBA)',
    'Real Estate Agency Disclosure and Election (READE)',
    'Wire Fraud Disclosure (WFD)',
    'Buyer Advisory Disclosure (BAD)',
    'Market Conditions Advisory (MCA)',
    'Affiliated Business Agreement (ABA)',
    'Pre-Qualification Letter',
  ]

  const LISTING_DOCS = [
    ...(isResidential ? ['Exclusive Right to Sell — Residential (ER RES)'] : []),
    ...(isVacantLand  ? ['Exclusive Right to Sell — Vacant Land (ER VL)']  : []),
    'Real Estate Agency Disclosure and Election (READE)',
    "Owner's Delay Limited Marketing Election (ODLM)",
    'Non-Dissemination Authorization (NDA)',
    'Wire Fraud Disclosure (WFD)',
    'Affiliated Business Agreement (ABA)',
    ...(hasWell  ? ['Domestic Well Water Seller Property Disclosure Statement (DWW SPDS)'] : []),
    'Market Conditions Advisory (MCA)',
    ...(isVacantLand  ? ['Vacant Land SPDS (VL SPDS)']                  : []),
    ...(isResidential ? ['Seller Property Disclosure Statement (SPDS)'] : []),
    ...(isResidential ? ['Insurance History Report (IHR)']              : []),
    ...(hasSolar ? ['Solar Addendum']                    : []),
    ...(hasSolar ? ['Solar Documents']                   : []),
    ...(hasHoa   ? ['HOA Documents']                     : []),
    ...(hasLbp   ? ['Lead Based Paint Disclosure (LBP)'] : []),
    ...(hasBba   ? ['Buyer Broker Addendum']              : []),
  ]

  const PENDING_DOCS = [
    ...(isResidential ? ['Residential Real Estate Purchase Contract (RRPC)'] : []),
    ...(isVacantLand  ? ['Vacant Land Purchase Contract (VLPC)']             : []),
    ...(hasSeptic ? ['Onsite Wastewater Treatment Facility Addendum (OSWW)'] : []),
    ...(hasHoa    ? ['HOA Documents']    : []),
    ...(hasSolar  ? ['Solar Addendum']   : []),
    ...(hasSolar  ? ['Solar Documents']  : []),
    'Seller Compensation Addendum (SCA)',
    ...(hasWell ? ['Domestic Well Water Addendum (DWWA)'] : []),
    ...((hasLbp || (yearBuilt > 0 && yearBuilt < 1978)) ? ['Lead Based Paint Disclosure (LBP)'] : []),
    'Affiliated Business Agreement (ABA)',
    'Counter Offer 1',
    'Pre-Qualification Letter',
    ...(hasContingency ? ['Buyer Contingency Addendum (BCA)'] : []),
    ...(hasContingency ? ["Buyer's Accepted Contract"]         : []),
    'Additional Clause Addendum (ACA)',
    ...(financingType === 'Owner Finance' ? ['Seller Financing Addendum (SFA)'] : []),
    ...(financingType === 'Cash'          ? ['Proof of Funds']                  : []),
    ...(referralPct > 0 ? ['Referring Brokerage W-9'] : []),
    ...(referralPct > 0 ? ['Referral Form']            : []),
  ]

  // ── Checkbox toggle ────────────────────────────────────────────────────────
  const toggleCheck = async (docName) => {
    const cur        = docStatuses[docName] || {}
    const newChecked = !cur.checked
    setDocStatuses(prev => ({ ...prev, [docName]: { ...cur, checked: newChecked } }))
    await supabase.from('document_uploads').upsert(
      { transaction_id: transaction.id, doc_name: docName, checked: newChecked,
        filename: cur.filename || null, drive_id: cur.drive_id || null, drive_link: cur.drive_link || null },
      { onConflict: 'transaction_id,doc_name' }
    )
  }

  // ── File upload ────────────────────────────────────────────────────────────
  const handleFileSelect = async (docName, e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(prev => ({ ...prev, [docName]: true }))
    try {
      let ids = folderIds
      if (!ids.drive_folder_id) {
        const addr = transaction.property_address || ''
        const last = transaction.client_last_name  || ''
        if (addr || last) {
          const created = await syncDriveFolder({
            transactionId:        transaction.id,
            newStatus:            transaction.status,
            driveFolderId:        null,
            driveUnderContractId: null,
            repType:              transaction.rep_type,
            propertyAddress:      addr,
            clientLastName:       last,
          })
          ids = { drive_folder_id: created.drive_folder_id, drive_under_contract_id: created.drive_under_contract_id }
          setFolderIds(ids)
        }
      }
      const isContractDoc  = CONTRACT_DOCS.has(docName)
      const targetFolderId = isContractDoc && ids.drive_under_contract_id
        ? ids.drive_under_contract_id : ids.drive_folder_id

      let driveId = null, driveLink = null
      if (targetFolderId) {
        const driveFile = await uploadToDrive(file, targetFolderId)
        driveId   = driveFile.id
        driveLink = driveFile.webViewLink
        const dest = isContractDoc && ids.drive_under_contract_id ? 'Under Contract' : 'Drive'
        toast.success(`${docName} uploaded to ${dest}`)
      } else {
        toast.success('Saved locally (connect Drive to sync)')
      }
      const record = {
        transaction_id: transaction.id, doc_name: docName,
        checked: true, filename: file.name, drive_id: driveId, drive_link: driveLink,
      }
      await supabase.from('document_uploads').upsert(record, { onConflict: 'transaction_id,doc_name' })
      setDocStatuses(prev => ({ ...prev, [docName]: { checked: true, filename: file.name, drive_id: driveId, drive_link: driveLink } }))
    } catch (err) {
      toast.error(`Upload failed: ${err.message}`)
    } finally {
      setUploading(prev => ({ ...prev, [docName]: false }))
    }
  }

  // ── Add custom doc ─────────────────────────────────────────────────────────
  const addCustomDoc = async (section) => {
    const name = customInput[section]?.trim()
    if (!name) return
    const record = {
      transaction_id: transaction.id, doc_name: name,
      section, is_custom: true, checked: false,
    }
    const { error } = await supabase.from('document_uploads')
      .upsert(record, { onConflict: 'transaction_id,doc_name' })
    if (error) { toast.error('Could not add document'); return }
    setCustomDocs(prev => ({ ...prev, [section]: [...prev[section], name] }))
    setCustomInput(prev => ({ ...prev, [section]: '' }))
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const DocRow = ({ doc }) => {
    const s        = docStatuses[doc] || {}
    const uploaded = !!s.filename
    const isBusy   = !!uploading[doc]
    return (
      <tr className="txp-doc-row">
        <td className="txp-doc-td-check">
          <button className="txp-doc-check-btn" onClick={() => toggleCheck(doc)} title="Mark complete">
            <span className={`txp-doc-check${s.checked ? ' txp-doc-check--done' : ''}`}>
              {s.checked ? '✓' : '○'}
            </span>
          </button>
        </td>
        <td className="txp-doc-td-name">
          {s.drive_link
            ? <a href={s.drive_link} target="_blank" rel="noopener noreferrer"
                 className="txp-doc-link">{doc}</a>
            : doc}
          {s.filename && <span className="txp-doc-filename">{s.filename}</span>}
        </td>
        <td className="txp-doc-td-status">
          {uploaded
            ? <span className="txp-doc-badge txp-doc-badge--uploaded" title={s.filename}>
                {s.drive_id ? 'In Drive' : 'Uploaded'}
              </span>
            : <span className="txp-doc-badge txp-doc-badge--pending">Pending</span>
          }
        </td>
        <td className="txp-doc-td-action">
          <input type="file" style={{ display: 'none' }}
            ref={el => { fileRefs.current[doc] = el }}
            onChange={e => handleFileSelect(doc, e)}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          />
          <button
            className={`txp-doc-upload-btn${uploaded ? ' txp-doc-upload-btn--done' : ''}`}
            onClick={() => fileRefs.current[doc]?.click()}
            disabled={isBusy}
          >
            {isBusy ? 'Uploading…' : uploaded ? 'Replace' : 'Upload'}
          </button>
        </td>
      </tr>
    )
  }

  const DocSection = ({ title, docs, customList, sectionKey }) => (
    <div className="txp-docs-section">
      <div className="txp-docs-section-header">{title}</div>
      <table className="txp-docs-table">
        <tbody>
          {docs.map(doc => <DocRow key={doc} doc={doc} />)}
          {customList.map(doc => <DocRow key={doc} doc={doc} />)}
          <tr className="txp-doc-row txp-doc-add-row">
            <td className="txp-doc-td-check"></td>
            <td className="txp-doc-td-name">
              <input
                className="txp-doc-custom-input"
                placeholder="Additional document name…"
                value={customInput[sectionKey]}
                onChange={e => setCustomInput(prev => ({ ...prev, [sectionKey]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') addCustomDoc(sectionKey) }}
              />
            </td>
            <td className="txp-doc-td-status"></td>
            <td className="txp-doc-td-action">
              <button
                className="txp-doc-upload-btn"
                disabled={!customInput[sectionKey]?.trim()}
                onClick={() => addCustomDoc(sectionKey)}
              >
                Add
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="txp-section">
      <div className="txp-section-title">Documents Required</div>
      {!showBuyerSection && !showListingSection && !showPendingSection && (
        <div className="txp-docs-empty">No document sections apply to this transaction&rsquo;s type and stage.</div>
      )}
      {showBuyerSection && (
        <DocSection title="Buyer Documents" docs={BUYER_DOCS}
          customList={customDocs.buyer} sectionKey="buyer" />
      )}
      {showListingSection && (
        <DocSection title="Listing Documents" docs={LISTING_DOCS}
          customList={customDocs.listing} sectionKey="listing" />
      )}
      {showPendingSection && (
        <DocSection title="Pending Documents" docs={PENDING_DOCS}
          customList={customDocs.pending} sectionKey="pending" />
      )}
    </div>
  )
}

// ─── Google Drive Section ─────────────────────────────────────────────────────
function GoogleDriveSection({ transaction, onFoldersCreated }) {
  const [connected, setConnected] = useState(null)  // null = loading
  const [creating,  setCreating]  = useState(false)

  useEffect(() => {
    fetch('/api/google/status').then(r => r.json())
      .then(d => setConnected(d.connected === true))
      .catch(() => setConnected(false))
  }, [])

  const hasFolders       = !!transaction.drive_folder_id
  const hasUnderContract = !!transaction.drive_under_contract_id

  const handleCreateFolder = async () => {
    const addr = transaction.property_address || ''
    const last = transaction.client_last_name  || ''
    if (!addr && !last) {
      toast.error('Add a property address or client name before creating the Drive folder.')
      return
    }
    setCreating(true)
    try {
      const result = await syncDriveFolder({
        transactionId:        transaction.id,
        newStatus:            transaction.status,
        driveFolderId:        null,
        driveUnderContractId: null,
        repType:              transaction.rep_type,
        propertyAddress:      addr,
        clientLastName:       last,
      })
      onFoldersCreated(transaction.id, result)
      toast.success('Drive folder created!')
    } catch (err) {
      toast.error('Could not create folder: ' + err.message)
    } finally {
      setCreating(false)
    }
  }

  if (connected === null) {
    return (
      <div className="txp-section">
        <div className="txp-section-title">Google Drive</div>
        <p className="txp-drive-status">Checking connection…</p>
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="txp-section">
        <div className="txp-section-title">Google Drive</div>
        <p className="txp-drive-status">Not connected. Sign in once to sync folders and documents.</p>
        <a href="/api/google/auth" className="txp-drive-connect-btn">Connect Google Drive</a>
      </div>
    )
  }

  return (
    <div className="txp-section">
      <div className="txp-section-title">Google Drive</div>
      {hasFolders ? (
        <div className="txp-drive-links">
          <a
            href={getDriveUrl(transaction.drive_folder_id)}
            target="_blank"
            rel="noopener noreferrer"
            className="txp-drive-folder-btn"
          >
            Open Folder in Drive
          </a>
          {hasUnderContract && (
            <a
              href={getDriveUrl(transaction.drive_under_contract_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="txp-drive-folder-btn txp-drive-folder-btn--secondary"
            >
              Open Under Contract Folder
            </a>
          )}
        </div>
      ) : (
        <div className="txp-drive-links">
          <p className="txp-drive-status">No Drive folder yet for this transaction.</p>
          <button
            className="txp-drive-connect-btn"
            onClick={handleCreateFolder}
            disabled={creating}
          >
            {creating ? 'Creating…' : 'Create Drive Folder'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── History Section with filter ───────────────────────────────────────────────
function getEntryType(entry) {
  if (entry.type) return entry.type         // session entries carry explicit type
  const d = entry.description || ''
  if (d.startsWith('🔔')) return 'mention'
  if (d.startsWith('📝')) return 'note'
  return 'change'
}

function HistorySection({ transactionId, sessionEntries = [] }) {
  const [dbEntries, setDbEntries]   = useState([])
  const [loaded, setLoaded]         = useState(false)
  const [filterType, setFilterType] = useState('all')

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('transaction_history').select('*')
        .eq('transaction_id', transactionId).order('created_at', { ascending: false })
      if (!error) setDbEntries(data || [])
      else console.warn('transaction_history not available:', error.message)
      setLoaded(true)
    }
    load()
  }, [transactionId])

  const sessionDbIds = new Set(sessionEntries.map(e => e.dbId).filter(Boolean))
  let all = [
    ...sessionEntries,
    ...dbEntries.filter(e => !sessionDbIds.has(e.id)),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  if (filterType === 'notes')    all = all.filter(e => getEntryType(e) === 'note')
  if (filterType === 'mentions') all = all.filter(e => getEntryType(e) === 'mention')

  return (
    <div className="txp-section" style={{ maxWidth: 720 }}>
      <div className="txp-section-title txp-history-header">
        <span>History</span>
        <select
          className="txp-history-filter"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="all">All</option>
          <option value="notes">Notes Only</option>
          <option value="mentions">@ Mentions Only</option>
        </select>
      </div>
      {loaded && all.length === 0 && (
        <div className="txp-empty-state">No history yet.</div>
      )}
      {all.map((entry, i) => {
        const type = getEntryType(entry)
        return (
          <div key={entry.id || i} className={`txp-history-entry${type !== 'change' ? ` txp-history-${type}` : ''}`}>
            {type === 'mention' && <span className="txp-history-badge txp-history-badge--mention">@ mention</span>}
            {type === 'note'    && <span className="txp-history-badge txp-history-badge--note">note</span>}
            <div className="txp-history-desc">{entry.description}</div>
            <div className="txp-history-time">{formatTimestamp(entry.created_at)}</div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function TransactionDetailPage({
  transaction,
  columns,
  commissions,
  tasks,
  tcSettings,
  onBack,
  onFieldSave,
  onCommissionChange,
  onDelete,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onStatusChange,
  onTransactionUpdate,
  initialSection = 'details',
}) {
  const [activeSection, setActiveSection]   = useState(initialSection)
  const [sessionHistory, setSessionHistory] = useState([])
  const [sendOpen, setSendOpen]             = useState(false)

  useKeyboardShortcuts({ Escape: onBack })

  const column = columns.find(c => c.id === transaction.status)

  const fullAddress = [
    transaction.property_address,
    transaction.city,
    [transaction.state, transaction.zip].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ')

  const handleFieldSave = useCallback(async (field, value) => {
    const oldValue = transaction[field]
    await onFieldSave(field, value)

    const oldStr = String(oldValue ?? '')
    const newStr = String(value ?? '')
    if (oldStr === newStr) return

    const label       = FIELD_LABELS[field] || field
    const description = `${label} changed from "${oldStr || '(empty)'}" to "${newStr || '(empty)'}"`
    const entry       = { id: `s-${Date.now()}`, description, created_at: new Date().toISOString() }

    setSessionHistory(prev => [entry, ...prev])
    supabase.from('transaction_history')
      .insert({ transaction_id: transaction.id, description, changed_by: 'Me' })
      .select().single()
      .then(({ data, error }) => {
        if (!error && data) setSessionHistory(prev => prev.map(e => e.id === entry.id ? { ...e, dbId: data.id } : e))
      })
  }, [transaction, onFieldSave])

  const handleNoteAdded = useCallback((text, mentions) => {
    const now  = new Date().toISOString()
    const type = mentions.length > 0 ? 'mention' : 'note'
    const description = mentions.length > 0
      ? `🔔 Mentioned ${mentions.join(', ')}: "${text}"`
      : `📝 Note: "${text}"`
    const entry = { id: `s-${Date.now()}`, description, created_at: now, type }
    setSessionHistory(prev => [entry, ...prev])
    supabase.from('transaction_history')
      .insert({ transaction_id: transaction.id, description, changed_by: 'Me' })
      .then(({ error }) => { if (error) console.warn('[Notes] history save:', error.message) })
  }, [transaction.id])

  const handleStatusChange = useCallback(async (newStatus) => {
    const oldLabel = columns.find(c => c.id === transaction.status)?.label || transaction.status
    const newLabel = columns.find(c => c.id === newStatus)?.label || newStatus
    await onStatusChange(transaction.id, newStatus)
    const description = `Stage changed from "${oldLabel}" to "${newLabel}"`
    const entry       = { id: `s-${Date.now()}`, description, created_at: new Date().toISOString() }
    setSessionHistory(prev => [entry, ...prev])
    supabase.from('transaction_history').insert({ transaction_id: transaction.id, description, changed_by: 'Me' })
      .then(({ error }) => { if (error) console.warn('history save:', error.message) })
  }, [transaction, columns, onStatusChange])

  // Send: show recipient picker, then email formatted summary via EmailJS
  const handleSendConfirm = async (recipients) => {
    const summary = buildTransactionSummary(transaction, column, fullAddress)
    const subject = `Transaction Summary — ${fullAddress || 'Transaction'}`

    const SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID
    const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
    const PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

    console.log('[Send] handleSendConfirm fired')
    console.log('[Send] recipients:', recipients.map(r => ({ name: r.name, email: r.email })))
    console.log('[Send] SERVICE_ID:', SERVICE_ID, '| TEMPLATE_ID:', TEMPLATE_ID, '| PUBLIC_KEY:', PUBLIC_KEY ? '(set)' : '(missing)')

    if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
      console.warn('[Send] EmailJS env vars missing — falling back to clipboard copy')
      try { await navigator.clipboard.writeText(summary); toast.success('Summary copied to clipboard!') }
      catch { toast.error('Configure EmailJS to send directly') }
      return
    }

    try {
      const { default: emailjs } = await import('@emailjs/browser')
      for (const tc of recipients) {
        const payload = {
          to_email:         tc.email,
          to_name:          tc.name,
          subject,
          body:             summary,
          task_title:       subject,
          mention_notes:    summary,
          transaction_addr: fullAddress || '(No address)',
        }
        console.log('[Send] Calling emailjs.send with payload:', payload)
        const result = await emailjs.send(SERVICE_ID, TEMPLATE_ID, payload, PUBLIC_KEY)
        console.log('[Send] EmailJS result for', tc.email, ':', result)
      }
      toast.success(`Sent to ${recipients.map(r => r.name).join(' & ')}`)
    } catch (err) {
      console.error('[Send] email error:', err)
      toast.error('Failed to send — check EmailJS settings')
    }
  }

  const handleDelete = () => {
    if (window.confirm('Delete this transaction? This cannot be undone.')) {
      onDelete(transaction.id)
      onBack()
    }
  }

  return (
    <div className="txp-page">
      {/* Top Bar */}
      <div className="txp-topbar">
        <button className="txp-back-btn" onClick={onBack} title="Back to The Board (Esc)">←</button>
        <div className="txp-topbar-right">
          <div className="txp-send-wrap">
            <button className="txp-share-btn" onClick={() => setSendOpen(o => !o)}>Send</button>
            {sendOpen && (
              <SendDropdown
                tcSettings={tcSettings}
                onSend={handleSendConfirm}
                onClose={() => setSendOpen(false)}
              />
            )}
          </div>
          <button className="txp-topbar-delete-btn" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      {/* Body */}
      <div className="txp-body">
        <aside className="txp-sidebar">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className={`txp-nav-item${activeSection === s.id ? ' active' : ''}`}
              onClick={() => setActiveSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </aside>

        <main className="txp-content">
          {activeSection === 'details' && (
            <DetailsSection
              transaction={transaction}
              columns={columns}
              onFieldSave={handleFieldSave}
              onStatusChange={handleStatusChange}
              onNoteAdded={handleNoteAdded}
              transactionAddr={fullAddress}
              tcSettings={tcSettings}
            />
          )}

          {activeSection === 'tasks' && (
            <TasksSpreadsheet
              tasks={tasks || []}
              transactionId={transaction.id}
              onAdd={onAddTask}
              onUpdate={onUpdateTask}
              onDelete={onDeleteTask}
            />
          )}

          {activeSection === 'docs-req' && (
            <DocsRequiredSection
              transaction={transaction}
              commissions={commissions}
            />
          )}

          {activeSection === 'commission' && (
            <CommissionSection
              transaction={transaction}
              commissions={commissions}
              onCommissionChange={onCommissionChange}
              onAddTask={onAddTask}
              tasks={tasks}
            />
          )}

          {activeSection === 'google-drive' && (
            <GoogleDriveSection
              transaction={transaction}
              onFoldersCreated={onTransactionUpdate}
            />
          )}

          {activeSection === 'history' && (
            <HistorySection
              transactionId={transaction.id}
              sessionEntries={sessionHistory}
            />
          )}
        </main>
      </div>
    </div>
  )
}
