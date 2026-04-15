import { useState, useEffect, useRef, useCallback } from 'react'
import { Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { wrapEmailBody } from '../lib/emailWrapper'
import { formatPhone, formatApn } from '../lib/formatters'
import { mouseDownIsInside } from '../lib/dragGuard'
import TaskCommentPanel from './TaskCommentPanel'
import { syncDriveFolder, uploadToDrive, getDriveUrl, CONTRACT_DOCS } from '../lib/googleDrive'
import { TC_OPTIONS } from '../lib/columnFields'
import { toast } from 'react-hot-toast'
import { useKeyboardShortcuts } from '../lib/useKeyboardShortcuts'
import { useGmailStatus } from '../lib/useGmailStatus'
import DateInput from './DateInput'
import './TransactionDetailPage.css'

const SECTIONS = [
  { id: 'details',      label: 'Transaction Details' },
  { id: 'docs-req',     label: 'Tasks & Documents'   },
  { id: 'commission',   label: 'Commission'           },
  { id: 'showings',     label: 'Showings',  sellerOnly: true },
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
  bedrooms: 'Bedrooms', bathrooms: 'Bathrooms', square_ft: 'Square Ft', year_built: 'Year Built',
  new_construction: 'New Construction',
  access: 'Access',
  client_first_name: 'Client 1', client_last_name: 'Client 1',
  client2_first_name: 'Client 2', client2_last_name: 'Client 2',
  opposite_party_name: 'Opposite Party', opposite_party_agent: 'Opposite Party Agent',
  listing_contract: 'Listing Contract', listing_expiration_date: 'Listing Expiration',
  target_live_date: 'Target Live', contract_acceptance_date: 'Contract Acceptance',
  ipe_date: 'Inspection Period End', binsr_submitted_date: 'BINSR Submitted', close_of_escrow: 'Close of Escrow',
  bba_contract: 'BBA Contract', bba_expiration: 'BBA Expiration',
  has_contingency: 'Contingency', contingency_fulfilled_date: 'Contingency Fulfilled',
  lender_name: 'Lender', title_company: 'Title Company',
  title_company_email: 'Title Company Email', title_company_phone: 'Title Company Phone',
  co_op_agent: 'Co-op Agent',
  home_inspector: 'Home Inspector', home_inspection_date: 'Home Inspection Date',
  appraisal_date: 'Appraisal Date',
  has_septic: 'Septic', has_solar: 'Solar', has_well: 'Well', has_hoa: 'HOA', has_lbp: 'LBP',
  lockbox: 'Lockbox', has_sign: 'Sign',
  referring_agent: 'Referring Agent', referring_agent_email: 'Referring Agent Email',
  referring_agent_phone: 'Referring Agent Phone', referral_pct: 'Referral %',
  financing_type: 'Financing Type', additional_terms: 'Additional Terms & Conditions',
  additional_parcels: 'Additional Parcel(s)',
}

const DIFF_FIELDS = {
  property_address:          'Street Address',
  city:                      'City',
  state:                     'State',
  zip:                       'ZIP',
  price:                     'Price',
  rep_type:                  'Transaction Type',
  status:                    'Stage',
  property_type:             'Property Type',
  apn:                       'APN',
  mls_number:                'MLS Number',
  vacant_or_occupied:        'Vacant or Occupied',
  occupancy:                 'Occupancy',
  bedrooms:                  'Bedrooms',
  square_ft:                 'Square Ft',
  year_built:                'Year Built',
  new_construction:          'New Construction',
  client_first_name:         'Client 1 First Name',
  client_last_name:          'Client 1 Last Name',
  client2_first_name:        'Client 2 First Name',
  client2_last_name:         'Client 2 Last Name',
  opposite_party_agent:      'Opposite Party Agent',
  listing_contract:          'Listing Contract',
  listing_expiration_date:   'Listing Expiration',
  target_live_date:          'Target Live',
  contract_acceptance_date:  'Contract Acceptance',
  ipe_date:                  'Inspection Period End',
  binsr_submitted_date:      'BINSR Submitted',
  close_of_escrow:           'Close of Escrow',
  bba_contract:              'BBA Contract',
  bba_expiration:            'BBA Expiration',
  has_contingency:           'Contingency',
  contingency_fulfilled_date:'Contingency Fulfilled',
  lender_name:               'Lender',
  title_company:             'Title Company',
  bathrooms:                 'Bathrooms',
  escrow_number:             'Escrow Number',
  title_company_email:       'Title Co. Email',
  title_company_phone:       'Title Co. Phone',
  co_op_agent:               'Co-op Agent',
  home_inspector:            'Home Inspector',
  home_inspection_date:      'Home Inspection Date',
  appraisal_date:            'Appraisal Date',
  has_septic:                'Septic',
  has_solar:                 'Solar',
  has_well:                  'Well',
  has_hoa:                   'HOA',
  has_lbp:                   'LBP',
  lockbox:                   'Lockbox',
  referring_agent:           'Referring Agent',
  referring_agent_email:     'Referring Agent Email',
  referring_agent_phone:     'Referring Agent Phone',
  referral_pct:              'Referral %',
  financing_type:            'Financing Type',
  additional_terms:          'Additional Terms',
  additional_parcels:        'Additional Parcel(s)',
}

// Fields that are boolean flags — show only the label in the Notify modal, no value
const DIFF_BOOLEAN_FIELDS = new Set([
  'new_construction',
  'has_contingency',
  'has_septic',
  'has_solar',
  'has_well',
  'has_hoa',
  'has_lbp',
])

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
  return tcSettings.map(tc => {
    const name = tc.name === 'Me' ? 'Amy Casanova' : tc.name
    return {
      handle: '@' + name.split(' ')[0],
      email:  tc.email || null,
      name,
    }
  })
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
        const app_url = transactionId
          ? `https://realty-pro-os.vercel.app/?tab=board&tx=${transactionId}`
          : 'https://realty-pro-os.vercel.app/?tab=board'
        const result = await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
          to_email:         person.email,
          to_name:          person.name,
          subject:          `You were mentioned in a note — ${transactionAddr || '(No address)'}`,
          transaction_addr: transactionAddr || '(No address)',
          mention_notes:    noteText,
          mentioner_name:   'Amy Casanova',
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

function formatNoteDate(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${mm}/${dd}/${yy}`
}

// Due date countdown label for open tasks; completion date for done tasks
function dueDateLabel(dateStr, isDone, completedAt) {
  if (isDone) {
    return { text: completedAt ? formatLocalDate(completedAt) : '—', cls: 'done' }
  }
  if (!dateStr) return { text: null, cls: '' }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due   = new Date(dateStr + 'T00:00:00')
  const diff  = Math.ceil((due - today) / 86400000)
  const abs   = Math.abs(diff)
  if (diff < 0)   return { text: `${abs} day${abs !== 1 ? 's' : ''} overdue`, cls: 'overdue' }
  if (diff === 0) return { text: 'Due Today', cls: 'today' }
  if (diff <= 3)  return { text: `Due in ${diff}`, cls: 'soon' }
  return { text: `Due in ${diff}`, cls: 'upcoming' }
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
function FubInlineSearch({ onSelect, onClose, onRelatedParty }) {
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
  }, [])

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

  const handleSelect = (person) => {
    if (person._via) {
      onSelect({ _isRelationship: true, client2: { first_name: person.first_name, last_name: person.last_name, email: person.email, phone: person.phone } })
      return
    }
    // Save client 1 immediately from search result data
    onSelect({ client1: person, related: [] })
    // Then async-fetch related parties for client 2 auto-fill (fire and forget)
    if (person.id && onRelatedParty) {
      fetchFubPerson(person.id).then(full => {
        if (full?.related?.length > 0) onRelatedParty(full.related)
      })
    }
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
              onMouseDown={e => { e.preventDefault(); handleSelect(p) }}
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
function ClientRow({ label, first, last, email, phone, onFubSelect, onUnlink, onRelatedParty, tabIndex }) {
  const [searching, setSearching] = useState(false)
  const name = [first, last].filter(Boolean).join(' ')

  return (
    <div className="txp-client-row">
      <span className="txp-field-label">{label}</span>
      <div className="txp-client-row-right">
        <div className="txp-client-row-info">
          {name && <span className="txp-client-linked-name">{name}</span>}
          {(email || phone) && (
            <span className="txp-client-contact">
              {email && <span className="txp-client-contact-item">{email}</span>}
              {phone && <span className="txp-client-contact-item">{phone}</span>}
            </span>
          )}
        </div>
        {searching ? (
          <FubInlineSearch
            onSelect={(r) => { onFubSelect(r); setSearching(false) }}
            onClose={() => setSearching(false)}
            onRelatedParty={onRelatedParty}
          />
        ) : (
          <>
            <button className="txp-fub-btn" tabIndex={tabIndex} onClick={() => setSearching(true)}>
              {name ? 'Change' : 'Search FUB'}
            </button>
            {name && (
              <button
                className="txp-client-unlink-btn"
                title="Remove client"
                onClick={onUnlink}
              >{'×'}</button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Access Field (dropdown + free-text inline) ───────────────────────────────
function AccessField({ transaction, isSeller, onFieldSave, onMultiFieldSave, tabIndex }) {
  const parseAccess = (val) => {
    if (!val) return { type: 'Vacant', detail: '' }
    if (val.startsWith('Occupied')) {
      const rest = val.replace(/^Occupied\s*[–\-]\s*/, '')
      return { type: 'Occupied', detail: rest === 'Occupied' ? '' : rest }
    }
    const rest = val.replace(/^Vacant\s*[–\-]\s*/, '')
    return { type: 'Vacant', detail: rest === 'Vacant' ? '' : rest }
  }

  const parsed              = parseAccess(transaction.access)
  const [type, setType]     = useState(parsed.type)
  const [detail, setDetail] = useState(parsed.detail)

  const commit = () => {
    const combined = detail.trim() ? `${type} \u2013 ${detail.trim()}` : type
    if (isSeller) {
      onMultiFieldSave({ access: combined || null, vacant_or_occupied: type })
    } else {
      onFieldSave('access', combined || null)
    }
  }

  return (
    <div className="txp-field">
      <span className="txp-field-label">Access</span>
      <div className="txp-access-inputs">
        <select
          className="txp-input txp-access-type"
          value={type}
          onChange={e => { setType(e.target.value) }}
          onBlur={commit}
          tabIndex={tabIndex}
        >
          <option value="Vacant">Vacant</option>
          <option value="Occupied">Occupied</option>
        </select>
        <input
          type="text"
          className="txp-input txp-access-detail"
          value={detail}
          placeholder="e.g. Supra, Coded, Call Agent..."
          onChange={e => setDetail(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
          tabIndex={tabIndex != null ? tabIndex + 1 : undefined}
        />
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
      if (type !== 'select' && type !== 'date' && inputRef.current.select) {
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
    if (mouseDownIsInside(inputRef.current)) return
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
      ) : type === 'date' ? (
        <DateInput
          className="txp-input"
          value={value || ''}
          onChange={e => {
            const v = e.target.value || null
            if (String(v ?? '') !== String(value ?? '')) onSave(v)
          }}
          placeholder={placeholder}
          tabIndex={tabIndex}
        />
      ) : editing ? (
        type === 'select' ? (
          <select
            ref={inputRef}
            className="txp-input"
            tabIndex={tabIndex}
            value={draft}
            onChange={e => { onSave(e.target.value || null); setEditing(false) }}
            onBlur={e => { if (!mouseDownIsInside(e.currentTarget)) setEditing(false) }}
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
              <span className="txp-note-info">{formatNoteDate(note.created_at)}</span>
              <button className="txp-note-del" onClick={() => handleDelete(note.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tasks Spreadsheet ─────────────────────────────────────────────────────────
function TaskRow({ task, onUpdate, onDelete, commentCount = 0, onOpenComments }) {
  const [editTitle, setEditTitle] = useState(false)
  const [titleDraft, setTitle]    = useState(task.title)
  const [editDate, setEditDate]   = useState(false)
  const [editAssign, setAssign]   = useState(false)

  const isDone     = task.status === 'complete'
  const statusKey  = task.status || 'open'
  const statusLabel = STATUS_LABELS[statusKey] || 'To Do'
  const statusStyle = STATUS_STYLE[statusKey] || STATUS_STYLE.open

  const saveTitle = (e) => {
    if (e?.type === 'blur' && mouseDownIsInside(e.currentTarget)) return
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
          <DateInput
            className="txp-task-inline-input"
            value={task.due_date || ''}
            autoFocus
            onChange={e => onUpdate(task.id, { due_date: e.target.value || null })}
            onBlur={() => setEditDate(false)}
          />
        ) : (() => {
          const ddl = dueDateLabel(task.due_date, isDone, task.completed_at)
          return (
            <span className={`txp-task-date txp-task-date--${ddl.cls || 'none'}`} onClick={() => !isDone && setEditDate(true)}>
              {ddl.text ?? <span className="txp-task-no-date">+ date</span>}
            </span>
          )
        })()}
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
      </td>
      <td className="txp-task-td txp-task-td-cmt" onClick={e => e.stopPropagation()}>
        <button
          className={`txp-cmt-btn${commentCount > 0 ? ' active' : ''}`}
          onClick={onOpenComments}
          title={commentCount > 0 ? `${commentCount} comment${commentCount !== 1 ? 's' : ''}` : 'Add comment'}
        >
          💬{commentCount > 0 && <span className="txp-cmt-count">{commentCount}</span>}
        </button>
      </td>
      <td className="txp-task-td txp-task-td-del">
        <button className="txp-task-del-btn" onClick={() => onDelete(task.id)}>✕</button>
      </td>
    </tr>
  )
}

const TIMING_OPTS = {
  stage_pre_listing:           { label: 'When moved to Pre-Listing',                      hasDays: false },
  stage_active_listing:        { label: 'When moved to Active Listing',                   hasDays: false },
  stage_buyer_broker:          { label: 'When moved to Buyer-Broker',                     hasDays: false },
  stage_pending:               { label: 'When moved to Pending',                          hasDays: false },
  stage_closed:                { label: 'When moved to Closed',                           hasDays: false },
  stage_cancelled_expired:     { label: 'When moved to Cancelled/Expired',                hasDays: false },
  days_after_contract:         { label: 'days after Contract Acceptance',                 hasDays: true  },
  days_before_coe:             { label: 'days before Close of Escrow',                    hasDays: true  },
  days_after_coe:              { label: 'days after Close of Escrow',                     hasDays: true  },
  days_after_listing_contract: { label: 'days after Listing Contract',                    hasDays: true  },
  days_after_bba:              { label: 'days after BBA Contract',                        hasDays: true  },
  days_before_ipe:             { label: 'days before Inspection Period End / BINSR Due',  hasDays: true  },
  days_after_ipe:              { label: 'days after Inspection Period End / BINSR Due',   hasDays: true  },
  days_after_binsr:            { label: 'days after BINSR Submitted',                     hasDays: true  },
  days_after_home_inspection:  { label: 'When Home Inspection is Scheduled',              hasDays: false },
}

function fmtTemplateTiming(timingType, timingDays) {
  if (timingType === 'specific_date')   return 'Specific date'
  if (timingType === 'at_stage_change') return 'At stage change'
  const opt = TIMING_OPTS[timingType]
  if (!opt) return timingType
  if (!opt.hasDays) return opt.label
  const d = Number(timingDays) || 0
  if (timingType === 'days_before_ipe' && d === 0) return 'At Inspection Period End'
  return `${d} ${opt.label}`
}

function TasksSpreadsheet({ tasks, transactionId, transaction, onAdd, onUpdate, onDelete, dbTemplates, dbTemplateTasks, onApplyTemplate, taskComments = [], onAddTaskComment, onDeleteTaskComment, tcSettings = [], transactionAddr = '' }) {
  const [search, setSearch]         = useState('')
  const [filterAssign, setAssign]   = useState('All')
  const [filterStatus, setStatus]   = useState('All')
  const [sortAsc, setSortAsc]       = useState(true)
  const [adding, setAdding]         = useState(false)
  const [newTitle, setNewTitle]     = useState('')
  const newInputRef                 = useRef(null)
  const [tplDropOpen,    setTplDropOpen]    = useState(false)
  const [tplMenuPos,     setTplMenuPos]     = useState({ top: 0, right: 0 })
  const [previewTpl,     setPreviewTpl]     = useState(null)
  const [excludedTplIds, setExcludedTplIds] = useState(new Set())
  const [applying,       setApplying]       = useState(false)
  const [commentTaskId,  setCommentTaskId]  = useState(null)
  const tplDropRef = useRef(null)
  const tplBtnRef  = useRef(null)

  useEffect(() => {
    if (!tplDropOpen) return
    const handler = (e) => { if (!tplDropRef.current?.contains(e.target)) setTplDropOpen(false) }
    const scrollClose = () => setTplDropOpen(false)
    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', scrollClose, true)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('scroll', scrollClose, true)
    }
  }, [tplDropOpen])

  const previewTasks = previewTpl
    ? (dbTemplateTasks || []).filter(t => t.template_id === previewTpl.id && !excludedTplIds.has(t.id))
        .sort((a, b) => a.sort_order - b.sort_order)
    : []

  const handleConfirmApply = async () => {
    if (!previewTpl || !onApplyTemplate) return
    setApplying(true)
    try {
      await onApplyTemplate(transactionId, previewTpl.id, transaction, excludedTplIds)
      setPreviewTpl(null)
      setExcludedTplIds(new Set())
    } finally {
      setApplying(false)
    }
  }

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
          {dbTemplates?.length > 0 && (
            <div className="txp-tpl-wrap" ref={tplDropRef}>
              <button
                ref={tplBtnRef}
                className="txp-tpl-btn"
                onClick={() => {
                  if (!tplDropOpen && tplBtnRef.current) {
                    const r = tplBtnRef.current.getBoundingClientRect()
                    setTplMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
                  }
                  setTplDropOpen(o => !o)
                }}
              >
                Apply Template ▾
              </button>
              {tplDropOpen && (
                <div
                  className="txp-tpl-menu"
                  style={{ position: 'fixed', top: tplMenuPos.top, right: tplMenuPos.right, left: 'auto' }}
                >
                  {dbTemplates.map(tpl => (
                    <button
                      key={tpl.id}
                      className="txp-tpl-item"
                      onClick={() => { setPreviewTpl(tpl); setExcludedTplIds(new Set()); setTplDropOpen(false) }}
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
            <th className="txp-task-th txp-task-th-cmt"></th>
            <th className="txp-task-th txp-task-th-del"></th>
          </tr>
        </thead>
        <tbody>
          {adding && (
            <tr className="txp-task-row">
              <td className="txp-task-td txp-task-td-check"><span className="txp-task-check"></span></td>
              <td className="txp-task-td txp-task-td-name" colSpan={5}>
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
          {filtered.map(t => {
            const cCount = taskComments.filter(c => c.task_id === t.id).length
            return (
              <TaskRow
                key={t.id}
                task={t}
                onUpdate={onUpdate}
                onDelete={onDelete}
                commentCount={cCount}
                onOpenComments={() => setCommentTaskId(t.id)}
              />
            )
          })}
          {filtered.length === 0 && !adding && (
            <tr>
              <td className="txp-task-empty" colSpan={7}>
                No tasks yet — click + Add Task to create one
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Task comment panel */}
      {commentTaskId && (() => {
        const ct = tasks.find(t => t.id === commentTaskId)
        const comments = taskComments.filter(c => c.task_id === commentTaskId)
        return (
          <TaskCommentPanel
            taskTitle={ct?.title || ''}
            comments={comments}
            onAdd={(author, body) => onAddTaskComment?.(commentTaskId, author, body)}
            onDelete={onDeleteTaskComment}
            onClose={() => setCommentTaskId(null)}
            tcSettings={tcSettings}
            transactionAddr={transactionAddr}
          />
        )
      })()}

      {/* Apply Template preview modal */}
      {previewTpl && (
        <div className="txp-tpl-overlay" onMouseDown={e => { if (e.target === e.currentTarget) { setPreviewTpl(null); setExcludedTplIds(new Set()) } }}>
          <div className="txp-tpl-modal">
            <div className="txp-tpl-modal-header">
              <div>
                <div className="txp-tpl-modal-title">Apply Template</div>
                <div className="txp-tpl-modal-sub">{previewTpl.name} — {previewTasks.length} tasks</div>
              </div>
              <button className="txp-tpl-modal-close" onClick={() => { setPreviewTpl(null); setExcludedTplIds(new Set()) }}>✕</button>
            </div>
            <div className="txp-tpl-modal-body">
              <table className="txp-tpl-preview-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Task Name</th>
                    <th>Type</th>
                    <th>Timing</th>
                    <th>Assign To</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {previewTasks.map((t, i) => {
                    const isCritical = t.task_type === 'Critical Date'
                    return (
                      <tr key={t.id} className={isCritical ? 'txp-tpl-preview-critical' : ''}>
                        <td className="txp-tpl-preview-num">{i + 1}</td>
                        <td>{t.title}</td>
                        <td className="txp-tpl-preview-type">
                          {isCritical
                            ? <span className="txp-tpl-critical-badge">Critical Date</span>
                            : <span className="txp-tpl-type-label">{t.task_type || 'Task'}</span>}
                        </td>
                        <td className="txp-tpl-preview-timing">{fmtTemplateTiming(t.timing_type, t.timing_days)}</td>
                        <td className="txp-tpl-preview-assign">{t.auto_assign_to}</td>
                        <td className="txp-tpl-preview-remove">
                          <button
                            className="txp-tpl-preview-remove-btn"
                            title="Remove from this apply"
                            onClick={() => setExcludedTplIds(prev => new Set([...prev, t.id]))}
                          >✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="txp-tpl-modal-actions">
              <button className="txp-tpl-cancel" onClick={() => { setPreviewTpl(null); setExcludedTplIds(new Set()) }}>Cancel</button>
              <button
                className="txp-tpl-confirm"
                onClick={handleConfirmApply}
                disabled={applying || previewTasks.length === 0}
              >
                {applying ? 'Adding…' : `Add ${previewTasks.length} Tasks`}
              </button>
            </div>
          </div>
        </div>
      )}
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
    if (mouseDownIsInside(ref.current)) return
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

// ─── Notify Modal ─────────────────────────────────────────────────────────────
function NotifyModal({ transaction, tcSettings, column, fullAddress, onClose }) {
  const isBuyer  = transaction.rep_type === 'Buyer'
  const justina  = { ...((tcSettings || []).find(t => t.name === 'Justina Morris') || { email: '' }), name: 'Justina' }
  const victoria = { ...((tcSettings || []).find(t => t.name === 'Victoria Lareau') || { email: '' }), name: 'Victoria' }
  const amy      = { name: 'Amy', email: 'amy@desert-legacy.com' }

  const [checked,     setChecked]     = useState({ justina: false, victoria: false, amy: false })
  const [subject,     setSubject]     = useState(`${transaction.property_address || 'Property'} — Update`)
  const [note,        setNote]        = useState('')
  const [changes,     setChanges]     = useState([])
  const [loadingDiff, setLoadingDiff] = useState(true)
  const [sending,     setSending]     = useState(false)
  const [sendError,   setSendError]   = useState(null)
  const gmailStatus = useGmailStatus()

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase
        .from('notify_snapshots')
        .select('snapshot')
        .eq('transaction_id', transaction.id)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!active) return
      const baseline = data?.snapshot || {}
      const diffs = Object.entries(DIFF_FIELDS)
        .filter(([field]) => String(baseline[field] ?? '') !== String(transaction[field] ?? ''))
        .map(([field, label]) => ({
          key:       field,
          label,
          oldVal:    String(baseline[field] ?? ''),
          newVal:    String(transaction[field] ?? ''),
          checked:   false,
          isBoolean: DIFF_BOOLEAN_FIELDS.has(field),
        }))
      setChanges(diffs)
      setLoadingDiff(false)
    })()
    return () => { active = false }
  }, [transaction.id])

  const toggleChange = (key) =>
    setChanges(prev => prev.map(c => c.key === key ? { ...c, checked: !c.checked } : c))

  const handleSend = async () => {
    const recipients = [
      checked.justina  && justina,
      checked.victoria && victoria,
      checked.amy      && amy,
    ].filter(r => r && r.email)
    if (!recipients.length) { toast.error('No recipients with a configured email'); return }

    setSending(true)
    setSendError(null)

    const checkedChanges = changes.filter(c => c.checked)

    let changeBlock = ''
    if (checkedChanges.length) {
      changeBlock = 'CHANGES\n' + '─'.repeat(44) + '\n'
        + checkedChanges.map(c =>
            c.isBoolean
              ? c.label
              : c.oldVal ? `${c.label}: "${c.oldVal}" → "${c.newVal}"` : `${c.label}: "${c.newVal}"`
          ).join('\n')
        + '\n\n'
    }

    let noteBlock = ''
    if (note.trim()) noteBlock = 'NOTE\n' + '─'.repeat(44) + '\n' + note.trim() + '\n\n'

    const plainBody = `${changeBlock}${noteBlock}`.trimEnd()
    const htmlBody  = `<pre style="font-family:monospace;font-size:13px;white-space:pre-wrap;line-height:1.5;">${plainBody.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`

    const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''
    try {
      const gmailRes = await fetch(`${API_BASE}/api/google/gmail-send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:            recipients.map(r => r.email),
          subject,
          body:          wrapEmailBody(htmlBody),
          transactionId: transaction.id,
        }),
      })

      const result = await gmailRes.json()
      if (!gmailRes.ok) {
        setSendError(result.error || 'Failed to send email')
        setSending(false)
        return
      }

      await supabase.from('notify_snapshots').insert({
        transaction_id: transaction.id,
        sent_at:        new Date().toISOString(),
        snapshot:       { ...transaction },
      })
      toast.success(`Notified ${recipients.map(r => r.name).join(' & ')}`)
      onClose()
    } catch (err) {
      console.error('[Notify] Gmail send error:', err)
      setSendError(err.message || 'Failed to send email')
      setSending(false)
    }

    // ── EMAILJS LEGACY — unreachable, kept for reference until migration is verified ──
    // const SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID
    // const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
    // const PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY
    // const { default: emailjs } = await import('@emailjs/browser')
    // for (const r of recipients) {
    //   await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
    //     to_email:         r.email,
    //     to_name:          r.name,
    //     subject,
    //     mention_notes:    plainBody,
    //     transaction_addr: fullAddress || '',
    //   }, PUBLIC_KEY)
    // }
  }

  const anyChecked = checked.justina || checked.victoria || checked.amy

  // Live preview — mirrors exactly what handleSend will put in the email
  const checkedChanges = changes.filter(c => c.checked)
  const previewLines = []
  if (checkedChanges.length) {
    previewLines.push('CHANGES')
    previewLines.push('─'.repeat(44))
    checkedChanges.forEach(c => {
      if (c.isBoolean) { previewLines.push(c.label) }
      else if (c.oldVal) { previewLines.push(`${c.label}: "${c.oldVal}" → "${c.newVal}"`) }
      else { previewLines.push(`${c.label}: "${c.newVal}"`) }
    })
    previewLines.push('')
  }
  if (note.trim()) {
    previewLines.push('NOTE')
    previewLines.push('─'.repeat(44))
    previewLines.push(note.trim())
  }
  const previewText = previewLines.join('\n')

  return (
    <div className="notify-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="notify-modal">
        <div className="notify-header">
          <h2 className="notify-title">Notify</h2>
          <button className="notify-close" onClick={onClose}>✕</button>
        </div>

        <div className="notify-body">
          {/* RECIPIENTS */}
          <section className="notify-section">
            <div className="notify-section-label">RECIPIENTS</div>
            {[
              { key: 'justina',  person: justina  },
              { key: 'victoria', person: victoria },
              { key: 'amy',      person: amy      },
            ].map(({ key, person }) => (
              <label key={key} className="notify-recipient">
                <input
                  type="checkbox"
                  checked={checked[key]}
                  onChange={() => setChecked(p => ({ ...p, [key]: !p[key] }))}
                />
                <span className="notify-recipient-name">{person.name}</span>
                {!person.email && <span className="notify-no-email">(no email configured)</span>}
              </label>
            ))}
          </section>

          {/* SUBJECT */}
          <section className="notify-section">
            <div className="notify-section-label">SUBJECT</div>
            <input
              className="notify-input"
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </section>

          {/* NOTE */}
          <section className="notify-section">
            <div className="notify-section-label">
              NOTE <span className="notify-optional">(optional)</span>
            </div>
            <textarea
              className="notify-textarea"
              placeholder="Add a personal message…"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
            />
          </section>

          {/* CHANGES */}
          <section className="notify-section">
            <div className="notify-section-label-row">
              <span className="notify-section-label">CHANGES</span>
              {!loadingDiff && changes.length > 0 && (
                <div className="notify-check-all-btns">
                  <button className="notify-check-all-btn" onClick={() => setChanges(p => p.map(c => ({ ...c, checked: true })))}>Check All</button>
                  <button className="notify-check-all-btn" onClick={() => setChanges(p => p.map(c => ({ ...c, checked: false })))}>Uncheck All</button>
                </div>
              )}
            </div>
            {loadingDiff ? (
              <div className="notify-dim">Detecting changes…</div>
            ) : changes.length === 0 ? (
              <div className="notify-dim">No changes detected since last notification.</div>
            ) : (
              <div className="notify-changes-list">
                {changes.map(c => (
                  <label key={c.key} className="notify-change-item">
                    <input
                      type="checkbox"
                      checked={c.checked}
                      onChange={() => toggleChange(c.key)}
                    />
                    {c.isBoolean ? (
                      <span className="notify-change-field">{c.label}</span>
                    ) : (
                      <>
                        <span className="notify-change-field">{c.label}:</span>
                        <span className="notify-change-val">
                          {c.oldVal ? <><s className="notify-change-old">{c.oldVal}</s>{' → '}</> : ''}
                          <strong>{c.newVal || '(empty)'}</strong>
                        </span>
                      </>
                    )}
                  </label>
                ))}
              </div>
            )}
          </section>

          {/* EMAIL PREVIEW */}
          <section className="notify-section">
            <div className="notify-section-label">EMAIL PREVIEW</div>
            {previewText
              ? <pre className="notify-summary">{previewText}</pre>
              : <div className="notify-dim">Nothing selected — check items above to include them in the email.</div>
            }
          </section>
        </div>

        <div className="notify-footer">
          {sendError && (
            <div className="notify-send-error">{sendError}</div>
          )}
          {!gmailStatus.loading && (!gmailStatus.connected || !gmailStatus.hasGmailScope) ? (
            <div className="notify-reconnect">
              <span className="notify-reconnect-text">Gmail not connected —</span>
              <a href="/api/google/auth" className="notify-reconnect-link">Reconnect Google</a>
            </div>
          ) : (
            <button
              className="notify-send-btn"
              onClick={handleSend}
              disabled={sending || !anyChecked || gmailStatus.loading}
            >
              {gmailStatus.loading ? 'Checking…' : sending ? 'Sending…' : 'Send'}
            </button>
          )}
        </div>
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
    <div className="collab-add-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
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
            <label>Phone<input value={form.phone} onChange={set('phone')} onBlur={() => setForm(p => ({ ...p, phone: formatPhone(p.phone) }))} type="tel" placeholder="(555) 000-0000" /></label>
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
function DetailsSection({ transaction, columns, onFieldSave, onMultiFieldSave, onStatusChange, onNoteAdded, transactionAddr, tcSettings }) {
  const save   = (field) => (value) => onFieldSave(field, value)

  // Saves all 4 property-feature fields in one atomic Supabase update to avoid race conditions.
  const savePropFeature = (changedField) => (value) => {
    const clean = (f, v) => f === 'square_ft' ? (String(v || '').replace(/,/g, '') || null) : (v || null)
    onMultiFieldSave({
      bedrooms:   clean('bedrooms',   changedField === 'bedrooms'   ? value : transaction.bedrooms),
      bathrooms:  clean('bathrooms',  changedField === 'bathrooms'  ? value : transaction.bathrooms),
      square_ft:  clean('square_ft',  changedField === 'square_ft'  ? value : transaction.square_ft),
      year_built: clean('year_built', changedField === 'year_built' ? value : transaction.year_built),
    })
  }

  const column = columns.find(c => c.id === transaction.status)
  const [parcelsChecked, setParcelsChecked] = useState(!!transaction.additional_parcels)
  const [parcelsText,    setParcelsText]    = useState(
    typeof transaction.additional_parcels === 'string' ? transaction.additional_parcels : ''
  )

  useEffect(() => {
    setParcelsChecked(!!transaction.additional_parcels)
    if (typeof transaction.additional_parcels === 'string') {
      setParcelsText(transaction.additional_parcels)
    }
  }, [transaction.additional_parcels])

  const [titleCollab, setTitleCollab] = useState(null)

  useEffect(() => {
    if (!transaction.title_collaborator_id) { setTitleCollab(null); return }
    supabase.from('collaborators').select('*').eq('id', transaction.title_collaborator_id).single()
      .then(({ data }) => setTitleCollab(data || null))
  }, [transaction.title_collaborator_id])

  const priceLabel = column?.priceLabel ||
    (transaction.rep_type === 'Buyer' ? 'Purchase Price' : 'List Price')

  const isBuyer           = transaction.rep_type === 'Buyer'
  const isPendingOrBeyond = BUYER_PENDING_STAGES.includes(transaction.status)
  const isVacantLand      = transaction.property_type === 'Vacant Land'

  const isPending = transaction.status === 'pending'

  const dateFields = isBuyer ? [
    { key: 'bba_contract',             label: 'BBA Contract',          required: true  },
    { key: 'bba_expiration',           label: 'BBA Expiration',        required: true  },
  ] : [
    { key: 'listing_contract',         label: 'Listing Contract',      required: true  },
    { key: 'listing_expiration_date',  label: 'Listing Expiration',    required: true  },
    { key: 'target_live_date',         label: 'Target Live',           required: false },
  ]

  const pendingContractFields = [
    { key: 'contract_acceptance_date', label: 'Contract Acceptance'   },
    { key: 'home_inspection_date',     label: 'Inspection Date'        },
    { key: 'ipe_date',                 label: 'Inspection Period End'  },
    { key: 'close_of_escrow',          label: 'Close of Escrow'        },
  ]

  return (
    <div className="txp-details-view">
      <div className="txp-details-columns">

        {/* LEFT COLUMN */}
        <div className="txp-col-left">

          {/* PROPERTY DETAILS */}
          <div className="txp-section">
            <div className="txp-section-title">Property Details</div>

            {/* Address row: Street / City / AZ / ZIP on one line */}
            <div className="txp-addr-row">
              <span className="txp-field-label">Street</span>
              <CszField value={transaction.property_address || ''} onSave={save('property_address')} placeholder="Street address" style={{ flex: 5 }} tabIndex={1} />
              <CszField value={transaction.city || ''} onSave={save('city')} placeholder="City" style={{ flex: 2.5 }} tabIndex={2} />
              <span className="txp-csz-state">AZ</span>
              <CszField value={transaction.zip || ''} onSave={save('zip')} placeholder="ZIP" style={{ flex: 2 }} tabIndex={3} />
            </div>

            <TxField
              label="Property Type"
              value={transaction.property_type || ''}
              type="select"
              options={PROPERTY_TYPE_OPTIONS}
              onSave={save('property_type')}
              tabIndex={4}
            />

            {/* Seller: APN + Access always visible */}
            {!isBuyer && (<>
              <TxField label="APN" value={transaction.apn || ''} type="text" onSave={v => save('apn')(formatApn(v))} placeholder="000-000-000" tabIndex={5} />
              <AccessField transaction={transaction} isSeller={true} onFieldSave={onFieldSave} onMultiFieldSave={onMultiFieldSave} tabIndex={8} />
            </>)}

            {/* Buyer pending+: APN, Access */}
            {isBuyer && isPendingOrBeyond && (<>
              <TxField label="APN" value={transaction.apn || ''} type="text" onSave={v => save('apn')(formatApn(v))} placeholder="000-000-000" tabIndex={6} />
              <AccessField transaction={transaction} isSeller={false} onFieldSave={onFieldSave} onMultiFieldSave={onMultiFieldSave} tabIndex={7} />
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

          {/* LISTING DETAILS — Seller only */}
          {!isBuyer && (
            <div className="txp-section">
              <div className="txp-section-title">Listing Details</div>
              <div className="txp-listing-grid">
                {/* Left column: List Price / MLS # / Lockbox / Sign */}
                <div className="txp-listing-col">
                  <TxField
                    label="List Price"
                    value={String(transaction.price || '')}
                    displayValue={fmtWhole(transaction.price)}
                    type="text"
                    onSave={save('price')}
                    placeholder="$0"
                    tabIndex={14}
                  />
                  <TxField label="MLS #" value={transaction.mls_number || ''} type="text" onSave={save('mls_number')} placeholder="MLS #" tabIndex={15} />
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
                {/* Right column: Bedrooms / Bathrooms / Square Ft / Year Built */}
                <div className="txp-listing-col">
                  {!isVacantLand && (<>
                    <TxField label="Bedrooms"   value={String(transaction.bedrooms   ?? '')} type="text" onSave={savePropFeature('bedrooms')}   placeholder="e.g. 3"    tabIndex={19} />
                    <TxField label="Bathrooms"  value={String(transaction.bathrooms  ?? '')} type="text" onSave={savePropFeature('bathrooms')}  placeholder="e.g. 2"    tabIndex={20} />
                    <TxField label="Square Ft"  value={String(transaction.square_ft  ?? '')} type="text" onSave={savePropFeature('square_ft')}  placeholder="e.g. 1800" tabIndex={21} />
                    <TxField label="Year Built" value={String(transaction.year_built ?? '')}  type="text" onSave={savePropFeature('year_built')} placeholder="e.g. 1998" tabIndex={22} />
                  </>)}
                </div>
              </div>
            </div>
          )}

          {/* PROPERTY FEATURES — Seller: always; Buyer: Pending+ only */}
          {(!isBuyer || isPendingOrBeyond) && (
            <div className="txp-section">
              <div className="txp-section-title">Property Features</div>
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

              <TxField
                label="Purchase Price"
                value={String(transaction.contract_price || '')}
                displayValue={fmtWhole(transaction.contract_price)}
                type="text"
                onSave={save('contract_price')}
                placeholder="$0"
                tabIndex={31}
              />

              {titleCollab ? (
                <div className="txp-field">
                  <span className="txp-field-label">Title Contact</span>
                  <div className="txp-title-linked">
                    <span className="txp-title-linked-name">
                      {[titleCollab.first_name, titleCollab.last_name].filter(Boolean).join(' ')}
                    </span>
                    <button
                      className="txp-title-clear-btn"
                      title="Clear selection"
                      onClick={() => {
                        save('title_collaborator_id')(null)
                        setTitleCollab(null)
                      }}
                    >✕</button>
                  </div>
                </div>
              ) : (
                <CollaboratorSearch
                  label="Title Contact"
                  value=""
                  category="title-escrow"
                  onSave={() => {}}
                  onSelect={c => {
                    onMultiFieldSave({
                      title_collaborator_id: c.id,
                      title_company:         c.company || null,
                      title_contact_name:    [c.first_name, c.last_name].filter(Boolean).join(' ') || null,
                      title_company_email:   c.email || null,
                      title_company_phone:   c.phone || null,
                    })
                    setTitleCollab(c)
                  }}
                  placeholder="Search title contacts…"
                  tabIndex={32}
                />
              )}

              <TxField label="Company" value={titleCollab?.company || transaction.title_company || ''} type="text" readOnly={!!titleCollab} onSave={save('title_company')} placeholder="Title company name" tabIndex={33} />

              <TxField label="Title Email" value={titleCollab?.email || transaction.title_company_email || ''} type="text" readOnly={!!titleCollab} onSave={save('title_company_email')} placeholder="title@company.com" tabIndex={34} />

              <TxField label="Title Phone" value={titleCollab?.phone || transaction.title_company_phone || ''} type="text" readOnly={!!titleCollab} onSave={v => save('title_company_phone')(v ? formatPhone(v) : null)} placeholder="(555) 000-0000" tabIndex={35} />

              <TxField label="Escrow Number" value={transaction.escrow_number || ''} type="text" onSave={save('escrow_number')} placeholder="Escrow #" tabIndex={36} />

              <TxField label="Co-op Agent" value={transaction.co_op_agent || ''} type="text" onSave={save('co_op_agent')} placeholder="Agent name" tabIndex={37} />

              <TxField label={isBuyer ? "Seller's Name" : "Buyer's Name"} value={transaction.opposite_party_name || ''} type="text" onSave={save('opposite_party_name')} placeholder={isBuyer ? 'Seller name' : 'Buyer name'} tabIndex={38} />

              <TxField
                label="Financing Type"
                value={transaction.financing_type || ''}
                type="select"
                options={FINANCING_TYPE_OPTIONS}
                onSave={save('financing_type')}
                tabIndex={39}
              />

              {transaction.financing_type !== 'Cash' && transaction.financing_type !== 'Owner Financing' && (<>
                <CollaboratorSearch
                  label="Lender"
                  value={transaction.lender_name || ''}
                  category="lenders"
                  onSave={save('lender_name')}
                  onSelect={c => {
                    if (c.email) save('lender_email')(c.email)
                    if (c.phone) save('lender_phone')(c.phone)
                  }}
                  placeholder="Lender name"
                  tabIndex={40}
                />
                <TxField label="Lender Email" value={transaction.lender_email || ''} type="text" onSave={save('lender_email')} placeholder="lender@company.com" tabIndex={41} />
                <TxField label="Lender Phone" value={transaction.lender_phone || ''} type="text" onSave={v => save('lender_phone')(v ? formatPhone(v) : null)} placeholder="(555) 000-0000" tabIndex={42} />
              </>)}

              <div className="txp-field txp-additional-parcel-row">
                <span className="txp-field-label">Additional Parcel</span>
                <div className="txp-additional-parcel-inner">
                  <input
                    type="checkbox"
                    className="txp-additional-parcel-check"
                    tabIndex={43}
                    checked={parcelsChecked}
                    onChange={e => {
                      setParcelsChecked(e.target.checked)
                      if (!e.target.checked) save('additional_parcels')(null)
                    }}
                  />
                  {parcelsChecked && (
                    <input
                      type="text"
                      className="txp-additional-parcel-text"
                      value={parcelsText}
                      placeholder="Parcel APN(s)…"
                      tabIndex={44}
                      onChange={e => setParcelsText(e.target.value)}
                      onBlur={() => {
                        const val = parcelsText.trim() || null
                        if (String(val ?? '') !== String(transaction.additional_parcels ?? '')) save('additional_parcels')(val)
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                    />
                  )}
                </div>
              </div>

              <TxField
                label="Add. Terms & Conditions"
                value={transaction.additional_terms || ''}
                type="textarea"
                onSave={save('additional_terms')}
                placeholder="Enter any additional terms or conditions…"
                tabIndex={45}
              />

            </div>
          )}

        </div>{/* end left */}

        {/* RIGHT COLUMN */}
        <div className="txp-col-right">

          {/* CLIENT */}
          <div className="txp-section" style={{ paddingBottom: '2px' }}>
            <div className="txp-section-title">Client</div>
            <ClientRow
              label="Client 1"
              first={transaction.client_first_name || ''}
              last={transaction.client_last_name   || ''}
              email={transaction.client_email || ''}
              phone={transaction.client_phone || ''}
              tabIndex={16}
              onUnlink={() => {
                save('client_first_name')(null)
                save('client_last_name')(null)
                save('client_phone')(null)
                save('client_email')(null)
              }}
              onFubSelect={(result) => {
                const p = result?.client1
                if (!p) return
                save('client_first_name')(p.first_name || '')
                save('client_last_name')(p.last_name   || '')
                save('client_phone')(p.phone            || '')
                save('client_email')(p.email            || '')
              }}
              onRelatedParty={(related) => {
                const r = related[0]
                if (!r) return
                save('client2_first_name')(r.first_name || '')
                save('client2_last_name')(r.last_name   || '')
                save('client2_phone')(r.phone            || '')
                save('client2_email')(r.email            || '')
              }}
            />
            <ClientRow
              label="Client 2"
              first={transaction.client2_first_name || ''}
              last={transaction.client2_last_name   || ''}
              email={transaction.client2_email || ''}
              phone={transaction.client2_phone || ''}
              tabIndex={17}
              onUnlink={() => {
                save('client2_first_name')(null)
                save('client2_last_name')(null)
                save('client2_phone')(null)
                save('client2_email')(null)
              }}
              onFubSelect={(result) => {
                const p = result._isRelationship ? result.client2 : result?.client1
                if (!p) return
                save('client2_first_name')(p.first_name || '')
                save('client2_last_name')(p.last_name   || '')
                save('client2_phone')(p.phone            || '')
                save('client2_email')(p.email            || '')
              }}
            />
          </div>

          {/* KEY DATES */}
          <div className="txp-section txp-key-dates-section" style={{ paddingBottom: '2px' }}>
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
          </div>

          {/* NOTES */}
          <NotesSection
            transactionId={transaction.id}
            transactionAddr={transactionAddr}
            onNoteAdded={onNoteAdded}
            tcSettings={tcSettings}
          />

          {/* CONTRACT DATES */}
          {isPendingOrBeyond && (
            <div className="txp-section txp-pending-dates-section">
              <div className="txp-section-title txp-pending-dates-title">Contract Dates</div>
              {pendingContractFields.map(({ key, label }, i) => (
                <TxField
                  key={key}
                  label={label}
                  value={transaction[key] || ''}
                  displayValue={formatDate(transaction[key])}
                  type="date"
                  onSave={save(key)}
                  tabIndex={50 + i}
                />
              ))}
              <div className="txp-field">
                <span className="txp-field-label">Contingency</span>
                <label className="txp-checkbox-item">
                  <input
                    type="checkbox"
                    tabIndex={60}
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
                  tabIndex={61}
                />
              )}
            </div>
          )}

          {/* REFERRALS */}
          <div className="txp-section">
            <div className="txp-section-title">Referrals</div>
            <TxField label="Referring Agent"       value={transaction.referring_agent       || ''} type="text" onSave={save('referring_agent')}       placeholder="Agent name"        tabIndex={43} />
            <TxField label="Referring Agent Email" value={transaction.referring_agent_email || ''} type="text" onSave={save('referring_agent_email')} placeholder="email@example.com" tabIndex={44} />
            <TxField label="Referring Agent Phone" value={transaction.referring_agent_phone || ''} type="text" onSave={v => save('referring_agent_phone')(formatPhone(v))} placeholder="(555) 000-0000"   tabIndex={45} />
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

  // Draft states live here so GCI can be computed from live-typed values
  const [scPctDraft,  setScPctDraft]  = useState(commission.commission_rate != null ? String(commission.commission_rate) : '')
  const [scFlatDraft, setScFlatDraft] = useState(commission.seller_concession_flat     != null ? String(commission.seller_concession_flat)     : '')
  const [bcPctDraft,  setBcPctDraft]  = useState(commission.commission_rate != null ? String(commission.commission_rate) : '')
  const [bcFlatDraft, setBcFlatDraft] = useState(commission.buyer_contribution_flat    != null ? String(commission.buyer_contribution_flat)    : '')

  // Sync drafts when transaction changes (e.g. user opens a different transaction)
  useEffect(() => {
    setScPctDraft(commission.commission_rate != null ? String(commission.commission_rate) : '')
    setScFlatDraft(commission.seller_concession_flat    != null ? String(commission.seller_concession_flat)     : '')
    setBcPctDraft(commission.commission_rate != null ? String(commission.commission_rate) : '')
    setBcFlatDraft(commission.buyer_contribution_flat   != null ? String(commission.buyer_contribution_flat)    : '')
  }, [transaction.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const price = Number(transaction.contract_price || transaction.price) || 0
  const referralPct = Number(transaction.referral_pct) || 0

  // GCI computed from live draft values — updates as user types
  const scPctLive  = Number(scPctDraft)  || 0
  const scFlatLive = scFlatDraft.trim() !== '' ? Number(scFlatDraft) : null
  const bcPctLive  = Number(bcPctDraft)  || 0
  const bcFlatLive = bcFlatDraft.trim() !== '' ? Number(bcFlatDraft) : null

  const sellerGCI = scFlatLive != null ? scFlatLive : scPctLive / 100 * price
  const buyerGCI  = bcFlatLive != null ? bcFlatLive : bcPctLive  / 100 * price
  const gci       = sellerGCI + buyerGCI

  console.log('[Commission] scPct draft:', scPctDraft, '→ sellerGCI:', sellerGCI, '| price:', price, '| GCI:', gci)

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

      {/* Seller Compensation */}
      <div className="txp-field txp-cm-split-row">
        <span className="txp-field-label">Seller Compensation</span>
        <div className="txp-cm-split-inputs">
          <div className={`txp-cm-split-item${scFlatDraft.trim() !== '' ? ' txp-cm-split-item--dim' : ''}`}>
            <input
              className="txp-cm-num-input"
              type="number" min="0" step="any" placeholder="0"
              value={scPctDraft}
              disabled={scFlatDraft.trim() !== ''}
              onChange={e => setScPctDraft(e.target.value)}
              onBlur={() => { const v = scPctDraft.trim() === '' ? null : Number(scPctDraft); saveCm('commission_rate')(isNaN(v) ? null : v) }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
            />
            <span className="txp-cm-split-unit">%</span>
          </div>
          <span className="txp-cm-split-or">or</span>
          <div className={`txp-cm-split-item${scPctDraft.trim() !== '' ? ' txp-cm-split-item--dim' : ''}`}>
            <span className="txp-cm-split-unit txp-cm-split-unit--pre">$</span>
            <input
              className="txp-cm-num-input"
              type="number" min="0" step="any" placeholder="0"
              value={scFlatDraft}
              disabled={scPctDraft.trim() !== ''}
              onChange={e => setScFlatDraft(e.target.value)}
              onBlur={() => { const v = scFlatDraft.trim() === '' ? null : Number(scFlatDraft); saveCm('seller_concession_flat')(isNaN(v) ? null : v) }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
            />
          </div>
        </div>
      </div>

      {/* Buyer Contribution */}
      <div className="txp-field txp-cm-split-row">
        <span className="txp-field-label">Buyer Contribution</span>
        <div className="txp-cm-split-inputs">
          <div className={`txp-cm-split-item${bcFlatDraft.trim() !== '' ? ' txp-cm-split-item--dim' : ''}`}>
            <input
              className="txp-cm-num-input"
              type="number" min="0" step="any" placeholder="0"
              value={bcPctDraft}
              disabled={bcFlatDraft.trim() !== ''}
              onChange={e => setBcPctDraft(e.target.value)}
              onBlur={() => { const v = bcPctDraft.trim() === '' ? null : Number(bcPctDraft); saveCm('commission_rate')(isNaN(v) ? null : v) }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
            />
            <span className="txp-cm-split-unit">%</span>
          </div>
          <span className="txp-cm-split-or">or</span>
          <div className={`txp-cm-split-item${bcPctDraft.trim() !== '' ? ' txp-cm-split-item--dim' : ''}`}>
            <span className="txp-cm-split-unit txp-cm-split-unit--pre">$</span>
            <input
              className="txp-cm-num-input"
              type="number" min="0" step="any" placeholder="0"
              value={bcFlatDraft}
              disabled={bcPctDraft.trim() !== ''}
              onChange={e => setBcFlatDraft(e.target.value)}
              onBlur={() => { const v = bcFlatDraft.trim() === '' ? null : Number(bcFlatDraft); saveCm('buyer_contribution_flat')(isNaN(v) ? null : v) }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
            />
          </div>
        </div>
      </div>

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

      {/* ── BBA Addendum ── */}
      <Sub label="BBA Addendum" />
      <div className="txp-field">
        <span className="txp-field-label">BBA Addendum Required</span>
        <label className="txp-checkbox-item">
          <input type="checkbox" checked={!!commission.buyer_broker_addendum} onChange={e => handleBba(e.target.checked)} />
          {commission.buyer_broker_addendum && <span className="txp-cm-check-hint">Task + doc added</span>}
        </label>
      </div>
    </div>
  )
}

const TDL_TASK_TYPES  = ['Task', 'Email', 'Notification', 'Critical Date']
const TDL_ASSIGNEES   = ['Me', 'Justina Morris', 'Victoria Lareau']

function TdlAddTaskModal({ transaction, onAdd, onClose }) {
  const [title,         setTitle]        = useState('')
  const [taskType,      setTaskType]     = useState('Task')
  const [assigned,      setAssigned]     = useState('Me')
  const [dueDate,       setDueDate]      = useState('')
  const [trackProgress, setTrackProgress] = useState(false)
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSave = () => {
    if (!title.trim()) return
    onAdd({
      title:              title.trim(),
      task_type:          taskType,
      assigned_to:        assigned,
      due_date:           dueDate || null,
      track_progress:     trackProgress,
      status:             'open',
      notes:              '',
      transaction_id:     transaction.id,
    })
    onClose()
  }

  return (
    <div className="tdl-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tdl-modal">
        <div className="tdl-modal-header">
          <span className="tdl-modal-title">Add Task</span>
          <button className="tdl-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="tdl-modal-body">
          <label className="tdl-modal-field">
            <span className="tdl-modal-label">Task Name</span>
            <input
              ref={inputRef}
              className="tdl-modal-input"
              value={title}
              placeholder="Task name…"
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
            />
          </label>
          <div className="tdl-modal-row">
            <label className="tdl-modal-field">
              <span className="tdl-modal-label">Task Type</span>
              <select className="tdl-modal-select" value={taskType} onChange={e => setTaskType(e.target.value)}>
                {TDL_TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="tdl-modal-field">
              <span className="tdl-modal-label">Due Date</span>
              <DateInput className="tdl-modal-input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </label>
          </div>
          <label className="tdl-modal-field">
            <span className="tdl-modal-label">Assign To</span>
            <select className="tdl-modal-select" value={assigned} onChange={e => setAssigned(e.target.value)}>
              {TDL_ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="tdl-modal-checkbox">
            <input type="checkbox" checked={trackProgress} onChange={e => setTrackProgress(e.target.checked)} />
            <span>Track Progress Dates</span>
          </label>
        </div>
        <div className="tdl-modal-footer">
          <button className="tdl-modal-cancel" onClick={onClose}>Cancel</button>
          <button className="tdl-modal-save" onClick={handleSave} disabled={!title.trim()}>Add Task</button>
        </div>
      </div>
    </div>
  )
}

// ─── Tasks & Documents — Left Column ─────────────────────────────────────────
function TasksDocsLeft({ transactionId, transaction, onAdd, onUpdate, onDelete, dbTemplates, dbTemplateTasks, onApplyTemplate, taskComments = [], onAddTaskComment, onDeleteTaskComment, tcSettings = [], transactionAddr = '' }) {
  const [localTasks,   setLocalTasks]  = useState([])
  const [tasksLoaded,  setTasksLoaded] = useState(false)
  const [modalOpen,    setModalOpen]   = useState(false)
  const [tplDropOpen,  setTplDropOpen] = useState(false)
  const [selectedTpl,  setSelectedTpl] = useState(null)
  const [excludedIds,  setExcludedIds] = useState(new Set())
  const [applying,     setApplying]    = useState(false)
  const tplDropRef = useRef(null)

  // Fetch tasks from DB on mount — source of truth, not relying on parent state
  useEffect(() => {
    if (!transactionId) { setTasksLoaded(true); return }
    supabase
      .from('tasks')
      .select('*')
      .eq('transaction_id', transactionId)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        setLocalTasks(data || [])
        setTasksLoaded(true)
      })
  }, [transactionId])

  useEffect(() => {
    if (!tplDropOpen) return
    const handler = (e) => { if (!tplDropRef.current?.contains(e.target)) setTplDropOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [tplDropOpen])

  const refetchTasks = async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('transaction_id', transactionId)
      .order('sort_order', { ascending: true })
    setLocalTasks(data || [])
  }

  // Wrap handlers to keep localTasks in sync
  const handleAdd = async (taskData) => {
    await onAdd(taskData)
    await refetchTasks()
  }

  const handleUpdate = (taskId, updates) => {
    onUpdate(taskId, updates)
    setLocalTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t))
  }

  const handleDelete = async (taskId) => {
    setLocalTasks(prev => prev.filter(t => t.id !== taskId))
    await onDelete(taskId)
  }

  // Wrapper for onApplyTemplate that re-fetches after insert
  const handleApplyTemplateWrapped = async (txId, tplId, tx, excludedTplIds) => {
    await onApplyTemplate(txId, tplId, tx, excludedTplIds)
    await refetchTasks()
  }

  const previewTasks = selectedTpl
    ? (dbTemplateTasks || [])
        .filter(t => t.template_id === selectedTpl.id && !excludedIds.has(t.id))
        .sort((a, b) => a.sort_order - b.sort_order)
    : []

  const handleApply = async () => {
    if (!selectedTpl || !onApplyTemplate) return
    setApplying(true)
    try {
      await onApplyTemplate(transactionId, selectedTpl.id, transaction, excludedIds)
      await refetchTasks()
      setSelectedTpl(null)
      setExcludedIds(new Set())
    } finally {
      setApplying(false)
    }
  }

  const selectTemplate = (tpl) => {
    setSelectedTpl(tpl)
    setExcludedIds(new Set())
    setTplDropOpen(false)
  }

  if (!tasksLoaded) {
    return <div className="tdl-wrap"><div className="tdl-loading">Loading tasks…</div></div>
  }

  // Tasks exist — show full spreadsheet view with Add Task + Apply Template in its toolbar
  if (localTasks.length > 0) {
    return (
      <TasksSpreadsheet
        tasks={localTasks}
        transactionId={transactionId}
        transaction={transaction}
        onAdd={handleAdd}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        dbTemplates={dbTemplates}
        dbTemplateTasks={dbTemplateTasks}
        onApplyTemplate={handleApplyTemplateWrapped}
        taskComments={taskComments}
        onAddTaskComment={onAddTaskComment}
        onDeleteTaskComment={onDeleteTaskComment}
        tcSettings={tcSettings}
        transactionAddr={transactionAddr}
      />
    )
  }

  // No tasks yet — show Apply Template screen
  return (
    <div className="tdl-wrap">
      {/* ── Add Task modal ── */}
      {modalOpen && (
        <TdlAddTaskModal
          transaction={transaction}
          onAdd={handleAdd}
          onClose={() => setModalOpen(false)}
        />
      )}

      {/* ── Add Task button ── */}
      <div>
        <button className="tdl-add-btn" onClick={() => setModalOpen(true)}>+ Add Task</button>
      </div>

      {/* ── Apply Template ── */}
      {(dbTemplates?.length > 0) && (
        <div className="tdl-tpl-section" ref={tplDropRef}>
          <button className="tdl-tpl-btn" onClick={() => setTplDropOpen(o => !o)}>
            Apply Template ▾
          </button>
          {tplDropOpen && (
            <div className="tdl-tpl-menu">
              {dbTemplates.map(tpl => (
                <button key={tpl.id} className="tdl-tpl-item" onClick={() => selectTemplate(tpl)}>
                  {tpl.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Inline template preview ── */}
      {selectedTpl && (
        <div className="tdl-preview">
          <div className="tdl-preview-header">
            <span className="tdl-preview-name">{selectedTpl.name}</span>
            <span className="tdl-preview-count">{previewTasks.length} task{previewTasks.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="tdl-preview-scroll">
            <table className="tdl-preview-table">
              <thead>
                <tr>
                  <th className="tdl-th-num">#</th>
                  <th>Task Name</th>
                  <th>Type</th>
                  <th>Timing</th>
                  <th>Assign To</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {previewTasks.map((t, i) => {
                  const isCritical = t.task_type === 'Critical Date'
                  return (
                    <tr key={t.id} className={isCritical ? 'tdl-preview-critical' : ''}>
                      <td className="tdl-td-num">{i + 1}</td>
                      <td className="tdl-td-title">{t.title}</td>
                      <td className="tdl-td-type">
                        {isCritical
                          ? <span className="tdl-critical-badge">Critical Date</span>
                          : <span className="tdl-type-label">{t.task_type || 'Task'}</span>}
                      </td>
                      <td className="tdl-td-timing">{fmtTemplateTiming(t.timing_type, t.timing_days)}</td>
                      <td className="tdl-td-assign">{t.auto_assign_to}</td>
                      <td className="tdl-td-remove">
                        <button
                          className="tdl-remove-btn"
                          title="Remove from this apply"
                          onClick={() => setExcludedIds(prev => new Set([...prev, t.id]))}
                        >✕</button>
                      </td>
                    </tr>
                  )
                })}
                {previewTasks.length === 0 && (
                  <tr><td colSpan={6} className="tdl-preview-empty">All tasks removed</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="tdl-preview-actions">
            <button
              className="tdl-apply-btn"
              onClick={handleApply}
              disabled={applying || previewTasks.length === 0}
            >
              {applying ? 'Adding…' : `Add ${previewTasks.length} Task${previewTasks.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Uploaded Documents Row ───────────────────────────────────────────────────
function getFileIcon(ext) {
  if (ext === 'pdf')                                        return '📄'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '🖼'
  if (['doc', 'docx'].includes(ext))                        return '📝'
  if (['xls', 'xlsx', 'csv'].includes(ext))                 return '📊'
  return '📎'
}

function fmtShortDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}/${String(dt.getFullYear()).slice(-2)}`
}

function UploadedDocRow({ doc, onDelete }) {
  const [showPreview, setShowPreview] = useState(false)
  const name = doc.filename || doc.doc_name || 'Untitled'
  const ext  = name.split('.').pop().toLowerCase()
  const isImage    = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
  const thumbUrl   = doc.drive_id ? `https://drive.google.com/thumbnail?id=${doc.drive_id}&sz=w200` : null

  return (
    <div className="txp-udoc-row">
      <span className="txp-udoc-icon">{getFileIcon(ext)}</span>
      <span className="txp-udoc-name-wrap">
        <a
          href={doc.drive_link}
          target="_blank"
          rel="noopener noreferrer"
          className="txp-udoc-name"
          onMouseEnter={() => setShowPreview(true)}
          onMouseLeave={() => setShowPreview(false)}
        >
          {name}
        </a>
        {showPreview && (
          <div className="txp-udoc-preview">
            {isImage && thumbUrl
              ? <img src={thumbUrl} alt={name} className="txp-udoc-preview-img" />
              : <span className="txp-udoc-preview-label">{getFileIcon(ext)} {ext.toUpperCase()}</span>
            }
          </div>
        )}
      </span>
      <span className="txp-udoc-date">{fmtShortDate(doc.created_at)}</span>
      <button
        className="txp-udoc-del"
        onClick={() => onDelete(doc.id)}
        title="Remove upload"
      >✕</button>
    </div>
  )
}

// ─── Documents Required (with Google Drive upload) ────────────────────────────
function DocsRequiredSection({ transaction, commissions, onTransactionUpdate }) {
  const [docStatuses,  setDocStatuses]  = useState({})   // { docName: { checked, filename, drive_id, drive_link } }
  const [uploading,    setUploading]    = useState({})
  const [customDocs,   setCustomDocs]   = useState({ buyer: [], listing: [], pending: [] })
  const [uploadedDocs, setUploadedDocs] = useState([])
  const customInputRefs = useRef({ buyer: null, listing: null, pending: null })
  const [folderIds,   setFolderIds]   = useState({
    drive_folder_id:         transaction.drive_folder_id         || null,
    drive_under_contract_id: transaction.drive_under_contract_id || null,
  })
  const fileRefs = useRef({})

  // Drive folder linking state
  const [linkOpen,   setLinkOpen]   = useState(false)
  const [linkDraft,  setLinkDraft]  = useState('')
  const [linkSaving, setLinkSaving] = useState(false)

  const extractFolderId = (input) => {
    const m = input.match(/\/folders\/([a-zA-Z0-9_-]+)/)
    return m ? m[1] : input.trim()
  }

  const handleSaveFolder = async () => {
    const folderId = extractFolderId(linkDraft)
    if (!folderId) return
    setLinkSaving(true)
    try {
      const { error } = await supabase
        .from('transactions')
        .update({ drive_folder_id: folderId })
        .eq('id', transaction.id)
      if (error) throw error
      setFolderIds(prev => ({ ...prev, drive_folder_id: folderId }))
      if (onTransactionUpdate) onTransactionUpdate(transaction.id, { drive_folder_id: folderId })
      setLinkOpen(false)
      setLinkDraft('')
    } catch (err) {
      toast.error('Could not save folder: ' + err.message)
    } finally {
      setLinkSaving(false)
    }
  }

  const handleDeleteUpload = async (id) => {
    const { error } = await supabase.from('document_uploads').delete().eq('id', id)
    if (error) { toast.error('Failed to remove document'); return }
    setUploadedDocs(prev => prev.filter(d => d.id !== id))
    setDocStatuses(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(key => { if (next[key].id === id) delete next[key] })
      return next
    })
  }

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
        const uploaded = []
        data.forEach(r => {
          map[r.doc_name] = r
          if (r.is_custom && r.section && customs[r.section]) {
            customs[r.section].push(r.doc_name)
          }
          if (r.drive_link) uploaded.push(r)
        })
        setDocStatuses(map)
        setCustomDocs(customs)
        setUploadedDocs(uploaded.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))
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
  const yearBuilt      = Number((String(transaction.year_built || '')).match(/\d{4}/)?.[0]) || 0
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
    const el   = customInputRefs.current[section]
    const name = el?.value?.trim()
    if (!name) return
    const record = {
      transaction_id: transaction.id, doc_name: name,
      section, is_custom: true, checked: false,
    }
    const { error } = await supabase.from('document_uploads')
      .upsert(record, { onConflict: 'transaction_id,doc_name' })
    if (error) { toast.error('Could not add document'); return }
    setCustomDocs(prev => ({ ...prev, [section]: [...prev[section], name] }))
    if (el) el.value = ''
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
                ref={el => { customInputRefs.current[sectionKey] = el }}
                onKeyDown={e => { if (e.key === 'Enter') addCustomDoc(sectionKey) }}
              />
            </td>
            <td className="txp-doc-td-status"></td>
            <td className="txp-doc-td-action">
              <button
                className="txp-doc-upload-btn"
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

      {/* Drive Folder row */}
      <div className="txp-drive-folder-row">
        {folderIds.drive_folder_id && !linkOpen ? (
          <>
            <a
              href={`https://drive.google.com/drive/folders/${folderIds.drive_folder_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="txp-drive-folder-link"
            >
              📁 Open Drive Folder
            </a>
            <button
              className="txp-drive-folder-edit-btn"
              onClick={() => { setLinkDraft(''); setLinkOpen(true) }}
              title="Change folder"
            ><Pencil size={16} /></button>
          </>
        ) : linkOpen ? (
          <div className="txp-drive-link-form">
            <div className="txp-drive-link-inputs">
              <input
                className="txp-drive-link-input"
                placeholder="Paste Drive folder URL or ID…"
                value={linkDraft}
                onChange={e => setLinkDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveFolder(); if (e.key === 'Escape') setLinkOpen(false) }}
                autoFocus
              />
              <button className="txp-doc-upload-btn" onClick={handleSaveFolder} disabled={linkSaving || !linkDraft.trim()}>
                {linkSaving ? 'Saving…' : 'Save'}
              </button>
              <button className="txp-drive-folder-edit-btn" onClick={() => setLinkOpen(false)}>Cancel</button>
            </div>
            <div className="txp-drive-link-hint">Tip: Folder naming convention — Street Name, Street Address — Last Name</div>
          </div>
        ) : (
          <button className="txp-drive-link-btn" onClick={() => setLinkOpen(true)}>
            🔗 Link Drive Folder
          </button>
        )}
      </div>

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

      {/* Uploaded Documents */}
      <div className="txp-uploaded-docs">
        <div className="txp-uploaded-docs-title">Uploaded Documents</div>
        {uploadedDocs.length === 0 ? (
          <div className="txp-uploaded-docs-empty">No documents uploaded yet</div>
        ) : (
          <div className="txp-uploaded-docs-list">
            {uploadedDocs.map(doc => (
              <UploadedDocRow key={doc.id} doc={doc} onDelete={handleDeleteUpload} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Google Drive Section ─────────────────────────────────────────────────────
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

// ─── Showings Section ─────────────────────────────────────────────────────────
function fmtShowingDate(d) {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}/${dt.getFullYear()}`
}

const EMPTY_SHOWING = { agent_name: '', agent_email: '', showing_date: '', feedback: '' }

function ShowingsSection({ transaction }) {
  const [showings,        setShowings]        = useState([])
  const [loading,         setLoading]         = useState(true)
  const [formOpen,        setFormOpen]        = useState(false)
  const [editing,         setEditing]         = useState(null)
  const [saving,          setSaving]          = useState(false)
  const [emailingId,      setEmailingId]      = useState(null)
  const [emailTemplates,  setEmailTemplates]  = useState([])

  useEffect(() => { loadShowings() }, [transaction.id])

  useEffect(() => {
    supabase.from('email_templates').select('*')
      .then(({ data }) => setEmailTemplates(data || []))
  }, [])

  const loadShowings = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('showings')
      .select('*')
      .eq('transaction_id', transaction.id)
      .order('showing_date', { ascending: false })
    setShowings(data || [])
    setLoading(false)
  }

  const openAdd   = () => { setEditing({ ...EMPTY_SHOWING });                         setFormOpen(true) }
  const openEdit  = (s) => { setEditing({ ...s, feedback: s.feedback ?? '' });        setFormOpen(true) }
  const closeForm = () => { setFormOpen(false); setEditing(null) }

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    try {
      if (editing.id) {
        const { id, created_at, transaction_id, ...updates } = editing
        const payload = { ...updates, feedback: updates.feedback || '' }
        const { error } = await supabase.from('showings').update(payload).eq('id', id)
        if (error) throw error
        setShowings(prev => prev.map(s => s.id === id ? { ...s, ...payload } : s))
      } else {
        const { data, error } = await supabase
          .from('showings')
          .insert({ ...editing, feedback: editing.feedback || '', transaction_id: transaction.id })
          .select().single()
        if (error) throw error
        setShowings(prev => [data, ...prev])
      }
      closeForm()
    } catch (err) {
      toast.error('Failed to save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this showing?')) return
    const { error } = await supabase.from('showings').delete().eq('id', id)
    if (error) { toast.error('Delete failed'); return }
    setShowings(prev => prev.filter(s => s.id !== id))
  }

  const handleSendFeedbackToSeller = async (s) => {
    const toEmail = transaction.client_email
    if (!toEmail) { toast.error('No client email on this transaction'); return }
    const clientName = [transaction.client_first_name, transaction.client_last_name].filter(Boolean).join(' ') || 'Seller'
    const addr = transaction.property_address || 'your property'
    const subject = `Showing Feedback — ${addr}`
    const plainBody = `Hi ${clientName},\n\nA showing was held at ${addr} on ${fmtShowingDate(s.showing_date)} by ${s.agent_name || 'an agent'}.\n\nFeedback:\n${s.feedback || '(No feedback provided yet)'}`
    const htmlBody = plainBody.replace(/\n/g, '<br>')
    setEmailingId(`${s.id}_seller`)
    try {
      const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''
      const gmailRes = await fetch(`${API_BASE}/api/google/gmail-send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: toEmail, subject, body: wrapEmailBody(htmlBody), transactionId: transaction.id }),
      })
      const result = await gmailRes.json()
      if (!gmailRes.ok) {
        toast.error('Email failed: ' + (result.error || 'Unknown error'))
      } else {
        toast.success('Email sent')
      }
    } catch (err) {
      toast.error('Email failed: ' + (err.message || 'Unknown error'))
    } finally {
      setEmailingId(null)
    }
  }

  const fmtRequestDate = (ts) => {
    if (!ts) return ''
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
    const addr       = transaction.property_address || 'our listing'
    const agentName  = s.agent_name || 'Agent'
    const showingDate = fmtShowingDate(s.showing_date)

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
        body: JSON.stringify({ to: toEmail, subject, body: wrapEmailBody(htmlBody), transactionId: transaction.id }),
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
      setShowings(prev => prev.map(sh => sh.id === s.id ? { ...sh, feedback_requested: true, feedback_requested_at: now } : sh))
    }
  }

  return (
    <div className="sh-section">
      <div className="sh-section-header">
        <h3 className="sh-section-title">Showings</h3>
        <button className="sh-add-btn" onClick={openAdd}>+ Add Showing</button>
      </div>

      {loading ? (
        <div className="sh-section-loading">Loading…</div>
      ) : showings.length === 0 ? (
        <div className="sh-section-empty">
          No showings recorded. Click <strong>+ Add Showing</strong> to log one.
        </div>
      ) : (
        <div className="sh-section-scroll">
          <table className="sh-section-table">
            <thead>
              <tr>
                <th>Agent Name</th>
                <th>Agent Email</th>
                <th>Date</th>
                <th>Feedback</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {showings.map(s => (
                <tr key={s.id}>
                  <td>{s.agent_name  || '—'}</td>
                  <td className="sh-sec-email">{s.agent_email || '—'}</td>
                  <td className="sh-sec-date">{fmtShowingDate(s.showing_date)}</td>
                  <td className="sh-sec-feedback">{s.feedback || '—'}</td>
                  <td className="sh-sec-actions">
                    <button className="sh-sec-btn sh-sec-btn--icon" onClick={() => openEdit(s)} title="Edit">✏️</button>
                    <button
                      className="sh-sec-btn sh-sec-btn--action"
                      onClick={() => handleSendFeedbackToSeller(s)}
                      disabled={!!emailingId}
                      title="Send feedback to seller"
                    >
                      {emailingId === `${s.id}_seller` ? '…' : 'Send to Seller'}
                    </button>
                    <div className="sh-sec-req-wrap">
                      <button
                        className="sh-sec-btn sh-sec-btn--action"
                        onClick={() => handleRequestFeedback(s)}
                        disabled={!!emailingId}
                        title="Request feedback from showing agent"
                      >
                        {emailingId === `${s.id}_agent` ? '…' : 'Req. Feedback'}
                      </button>
                      {(s.feedback_requested || s.feedback_requested_at) && (
                        <span className="sh-sec-feedback-badge">
                          ✓ Requested {fmtRequestDate(s.feedback_requested_at)}
                        </span>
                      )}
                    </div>
                    <button
                      className="sh-sec-btn sh-sec-btn--delete"
                      onClick={() => handleDelete(s.id)}
                      title="Delete"
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && editing && (
        <div className="sh-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) closeForm() }}>
          <div className="sh-modal">
            <div className="sh-modal-header">
              <h3 className="sh-modal-title">{editing.id ? 'Edit Showing' : 'Add Showing'}</h3>
              <button className="sh-modal-close" onClick={closeForm}>✕</button>
            </div>
            <div className="sh-modal-body">
              <label className="sh-modal-label">Showing Agent Name</label>
              <input
                className="sh-modal-input"
                type="text"
                placeholder="Agent name"
                value={editing.agent_name}
                onChange={e => setEditing(p => ({ ...p, agent_name: e.target.value }))}
                autoFocus
              />
              <label className="sh-modal-label">Showing Agent Email</label>
              <input
                className="sh-modal-input"
                type="email"
                placeholder="agent@brokerage.com"
                value={editing.agent_email}
                onChange={e => setEditing(p => ({ ...p, agent_email: e.target.value }))}
              />
              <label className="sh-modal-label">Date</label>
              <DateInput
                className="sh-modal-input"
                value={editing.showing_date}
                onChange={e => setEditing(p => ({ ...p, showing_date: e.target.value }))}
              />
              <label className="sh-modal-label">Feedback</label>
              <textarea
                className="sh-modal-textarea"
                placeholder="Buyer's feedback on the property…"
                value={editing.feedback}
                onChange={e => setEditing(p => ({ ...p, feedback: e.target.value }))}
                rows={5}
              />
            </div>
            <div className="sh-modal-footer">
              <button className="sh-modal-cancel" onClick={closeForm}>Cancel</button>
              <button className="sh-modal-save" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function TransactionDetailPage({
  transaction,
  transactions = [],
  onNavigate,
  from = 'board',
  columns,
  commissions,
  tasks,
  tcSettings,
  onBack,
  onFieldSave,
  onMultiFieldSave,
  onCommissionChange,
  onDelete,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onStatusChange,
  onTransactionUpdate,
  dbTemplates,
  dbTemplateTasks,
  onApplyTemplate,
  taskComments,
  onAddTaskComment,
  onDeleteTaskComment,
  initialSection = 'details',
}) {
  const [activeSection, setActiveSection]   = useState(initialSection)
  const [sessionHistory, setSessionHistory] = useState([])
  const [notifyOpen, setNotifyOpen]         = useState(false)

  // Navigate only within the same stage, sorted by close_of_escrow (soonest first, nulls last)
  const sameStage = [...transactions.filter(t => t.status === transaction.status)]
    .sort((a, b) => {
      if (!a.close_of_escrow && !b.close_of_escrow) return 0
      if (!a.close_of_escrow) return 1
      if (!b.close_of_escrow) return -1
      return a.close_of_escrow.localeCompare(b.close_of_escrow)
    })
  const currentIdx = sameStage.findIndex(t => t.id === transaction.id)
  const prevTx = currentIdx > 0 ? sameStage[currentIdx - 1] : null
  const nextTx = currentIdx < sameStage.length - 1 ? sameStage[currentIdx + 1] : null

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
        <div className="txp-topbar-left">
          <button className="txp-back-btn" onClick={onBack} title={from === 'tasks' ? 'Back to Tasks (Esc)' : 'Back to Start to Close (Esc)'}>←</button>
          {sameStage.length > 1 && (
            <div className="txp-nav-arrows">
              <button
                className="txp-nav-arrow"
                disabled={!prevTx}
                onClick={() => prevTx && onNavigate?.(prevTx, activeSection)}
                title={prevTx ? prevTx.property_address : 'No previous transaction'}
              >‹</button>
              <button
                className="txp-nav-arrow"
                disabled={!nextTx}
                onClick={() => nextTx && onNavigate?.(nextTx, activeSection)}
                title={nextTx ? nextTx.property_address : 'No next transaction'}
              >›</button>
            </div>
          )}
        </div>
        <div className="txp-topbar-center">
          <span className="txp-topbar-address">{fullAddress || '—'}</span>
        </div>
        <div className="txp-topbar-right">
          <button className="txp-share-btn" onClick={() => setNotifyOpen(true)}>Notify</button>
          <button className="txp-topbar-delete-btn" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      {/* Body */}
      <div className="txp-body">
        <aside className="txp-sidebar">
          {SECTIONS.filter(s => !s.sellerOnly || transaction.rep_type === 'Seller').map(s => (
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
              onMultiFieldSave={onMultiFieldSave}
              onStatusChange={handleStatusChange}
              onNoteAdded={handleNoteAdded}
              transactionAddr={fullAddress}
              tcSettings={tcSettings}
            />
          )}

          {activeSection === 'docs-req' && (
            <div className="txp-td-wrap">
              <div className="txp-td-col">
                <TasksDocsLeft
                  transactionId={transaction.id}
                  transaction={transaction}
                  onAdd={onAddTask}
                  onUpdate={onUpdateTask}
                  onDelete={onDeleteTask}
                  dbTemplates={dbTemplates}
                  dbTemplateTasks={dbTemplateTasks}
                  onApplyTemplate={onApplyTemplate}
                  taskComments={taskComments}
                  onAddTaskComment={onAddTaskComment}
                  onDeleteTaskComment={onDeleteTaskComment}
                  tcSettings={tcSettings}
                  transactionAddr={fullAddress}
                />
              </div>
              <div className="txp-td-col">
                <DocsRequiredSection
                  transaction={transaction}
                  commissions={commissions}
                  onTransactionUpdate={onTransactionUpdate}
                />
              </div>
            </div>
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

          {activeSection === 'showings' && transaction.rep_type === 'Seller' && (
            <ShowingsSection transaction={transaction} />
          )}

          {activeSection === 'history' && (
            <HistorySection
              transactionId={transaction.id}
              sessionEntries={sessionHistory}
            />
          )}
        </main>
      </div>

      {notifyOpen && (
        <NotifyModal
          transaction={transaction}
          tcSettings={tcSettings}
          column={column}
          fullAddress={fullAddress}
          onClose={() => setNotifyOpen(false)}
        />
      )}
    </div>
  )
}
