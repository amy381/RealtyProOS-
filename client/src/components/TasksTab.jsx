import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from 'react-hot-toast'
import { mouseDownIsInside } from '../lib/dragGuard'
import TaskCommentPanel from './TaskCommentPanel'
import { useGmailStatus } from '../lib/useGmailStatus'
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
const STATUS_ORDER  = { open: 0, in_progress: 1, complete: 2 }
const STATUS_LABELS = { open: 'To Do', in_progress: 'In Progress', complete: 'Completed' }
const STATUS_NEXT   = { open: 'in_progress', in_progress: 'complete', complete: 'open' }
const STATUS_STYLE  = {
  open:        { bg: '#f0f0f0', color: '#555555' },
  in_progress: { bg: '#dbeafe', color: '#1d4ed8' },
  complete:    { bg: '#d1fae5', color: '#065f46' },
}

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

const TC_NAMES         = ['Justina Morris', 'Victoria Lareau', 'Amy Casanova']
const ASSIGNEE_OPTIONS = ['Me', 'Justina Morris', 'Victoria Lareau']
const STATUS_OPTIONS   = [{ value: 'open', label: 'Open' }, { value: 'complete', label: 'Done' }]

// Category 1: task title substring → { field on transaction, label }
const CAT1_TASK_MAP = [
  { match: 'Appraisal Ordered',         field: 'appraisal_date',       label: 'Appraisal Date'      },
  { match: 'BINSR Submitted',           field: 'binsr_submitted_date',  label: 'BINSR Submitted'     },
  { match: 'Home Inspection Scheduled', field: 'home_inspection_date',  label: 'Home Inspection Date' },
]

// Category 2: task title substring → label (stored on task.row_date)
const CAT2_TASK_MAP = [
  { match: 'Septic Inspection Ordered', label: 'Scheduled Date' },
  { match: 'Water Test Ordered',        label: 'Scheduled Date' },
  { match: 'Tiedowns Ordered',          label: 'Install Date'   },
  { match: 'Engineering Cert Ordered',  label: 'Scheduled Date' },
]

function getTaskDateConfig(title = '') {
  const cat1 = CAT1_TASK_MAP.find(m => title.includes(m.match))
  if (cat1) return { category: 1, ...cat1 }
  const cat2 = CAT2_TASK_MAP.find(m => title.includes(m.match))
  if (cat2) return { category: 2, ...cat2 }
  return null
}

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


// ─── Vendor task mapping ──────────────────────────────────────────────────────
const VENDOR_TASK_KEYWORDS = [
  { keyword: 'Septic Inspection', vendorType: 'Septic' },
  { keyword: 'Order Permits',     vendorType: 'Permits' },
  { keyword: 'Tiedowns',          vendorType: 'Tiedowns' },
  { keyword: 'Home Warranty',     vendorType: 'Home Warranty' },
  { keyword: 'Home Inspection',   vendorType: 'Home Inspector' },
]

function getVendorTypeForTask(title) {
  const t = (title || '').toLowerCase()
  for (const m of VENDOR_TASK_KEYWORDS) {
    if (t.includes(m.keyword.toLowerCase())) return m.vendorType
  }
  return null
}

const VENDOR_FIELD_LABELS = {
  realtor_name:       'Realtor Name',
  company:            'Company',
  realtor_phone:      'Realtor Phone',
  realtor_email:      'Realtor Email',
  property_address:   'Property Address',
  apn:                'APN / Parcel Number',
  bedrooms:           'Number of Bedrooms',
  bathrooms:          'Number of Bathrooms',
  vacant_or_occupied: 'Vacant or Occupied',
  year_built:         'Year Built',
  title_company:      'Title Company',
  title_contact_name: 'Title Contact Name',
  title_email:        'Title Email',
  title_phone:        'Title Phone',
  escrow_number:      'Escrow Number',
  seller_name:        'Seller Name',
  buyer_name:         'Buyer Name',
  close_of_escrow:    'Close of Escrow Date',
}

function buildFormFields(vendor, tx, tcSettings) {
  const me = tcSettings?.find(t => t.name === 'Me')
  const clientName = [tx?.client_first_name, tx?.client_last_name].filter(Boolean).join(' ')
  const valueMap = {
    realtor_name:       'Amy Casanova',
    company:            'Keller Williams',
    realtor_phone:      me?.phone || '',
    realtor_email:      me?.email || '',
    property_address:   tx?.property_address || '',
    apn:                tx?.apn || '',
    bedrooms:           tx?.bedrooms || '',
    bathrooms:          tx?.bathrooms || '',
    vacant_or_occupied: tx?.vacant_or_occupied || '',
    year_built:         tx?.year_built || '',
    title_company:      tx?.title_company || '',
    title_contact_name: '',
    title_email:        tx?.title_company_email || '',
    title_phone:        tx?.title_company_phone || '',
    escrow_number:      tx?.escrow_number || '',
    seller_name:        clientName,
    buyer_name:         clientName,
    close_of_escrow:    tx?.close_of_escrow || '',
  }
  return (vendor.field_mappings || []).map(key => ({
    key,
    label: VENDOR_FIELD_LABELS[key] || key,
    value: valueMap[key] ?? '',
  }))
}

// ─── Vendor Email Preview Modal (Email Only vendors) ─────────────────────────
function VendorEmailModal({ vendor, tx, onClose }) {
  const [subject, setSubject] = useState('')
  const [body,    setBody]    = useState('')
  const [loading, setLoading] = useState(!!vendor.email_template_id)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!vendor.email_template_id) return
    supabase.from('email_templates').select('subject,body').eq('id', vendor.email_template_id).single()
      .then(({ data }) => {
        if (data) { setSubject(data.subject || ''); setBody(data.body || '') }
        setLoading(false)
      })
  }, [vendor.email_template_id])

  const handleSend = async () => {
    if (!vendor.email) { toast.error('No email address for this vendor'); return }
    setSending(true)
    const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''
    const htmlBody = body.trimStart().startsWith('<')
      ? body
      : `<pre style="font-family:monospace;font-size:13px;white-space:pre-wrap;line-height:1.5;">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
    try {
      const res    = await fetch(`${API_BASE}/api/google/gmail-send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:            vendor.email,
          subject,
          body:          htmlBody,
          transactionId: tx?.id || undefined,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Send failed')
      toast.success(`Sent to ${vendor.name}`)
      onClose()
    } catch (err) {
      toast.error('Send failed: ' + err.message)
    } finally { setSending(false) }

    // ── EMAILJS LEGACY — unreachable, kept for reference until migration is verified ──
    // await emailjs.send(SERVICE_ID, TEMPLATE_ID, { to_email: vendor.email, ... }, PUBLIC_KEY)
  }

  const handleQueue = async () => {
    const { error } = await supabase.from('email_queue').insert({
      transaction_id: tx?.id || null, to_email: vendor.email, to_name: vendor.name,
      subject, body, status: 'pending', prepared_by: 'Me',
    })
    if (error) { toast.error('Failed to add to queue'); return }
    toast.success('Added to Send Queue')
    onClose()
  }

  return (
    <div className="vf-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="vf-modal vf-modal--email">
        <div className="vf-header">
          <div className="vf-header-info">
            <span className="vf-vendor-name">{vendor.name}</span>
            {vendor.email && <span className="vf-vendor-email">To: {vendor.email}</span>}
          </div>
          <button className="vf-close" onClick={onClose}>✕</button>
        </div>
        <div className="vf-action-bar">
          <button className="vf-send-btn" onClick={handleSend} disabled={sending || loading}>
            {sending ? 'Sending…' : '✓ Send Email'}
          </button>
          <button className="vf-queue-btn" onClick={handleQueue} disabled={loading}>Send to Queue</button>
        </div>
        {loading ? (
          <div className="vf-body vf-loading">Loading template…</div>
        ) : (
          <div className="vf-body vf-body--email">
            <div className="vf-field vf-field--full">
              <label className="vf-label">Subject</label>
              <input className="vf-input" value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
            <div className="vf-field vf-field--full">
              <label className="vf-label">Body</label>
              <textarea className="vf-textarea" rows={10} value={body} onChange={e => setBody(e.target.value)} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Vendor Form Preview Modal ────────────────────────────────────────────────
function VendorFormModal({ vendor, tx, task, tcSettings, onClose, onTaskUpdate }) {
  const [formFields, setFormFields] = useState(() => buildFormFields(vendor, tx, tcSettings))
  const [sending,    setSending]    = useState(false)

  const setFieldValue = (idx, val) =>
    setFormFields(prev => prev.map((f, i) => i === idx ? { ...f, value: val } : f))

  const buildBody = () =>
    formFields.map(f => `${f.label}: ${f.value || '(blank)'}`).join('\n')

  const handleSend = async () => {
    if (!vendor.email) { toast.error('No email address on file for this vendor'); return }
    setSending(true)
    const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''
    const subject  = `${vendor.name} — ${tx?.property_address || 'Property'}`
    const plain    = buildBody()
    const htmlBody = `<pre style="font-family:monospace;font-size:13px;white-space:pre-wrap;line-height:1.5;">${plain.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
    try {
      const res    = await fetch(`${API_BASE}/api/google/gmail-send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:            vendor.email,
          subject,
          body:          htmlBody,
          transactionId: tx?.id || undefined,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Send failed')
      toast.success(`Sent to ${vendor.name}`)
      await supabase.from('tasks').update({ status: 'in-progress' }).eq('id', task.id)
      onTaskUpdate?.(task.id, { status: 'in-progress' })
      onClose()
    } catch (err) {
      toast.error('Send failed: ' + err.message)
    } finally { setSending(false) }

    // ── EMAILJS LEGACY — unreachable, kept for reference until migration is verified ──
    // await emailjs.send(SERVICE_ID, TEMPLATE_ID, { to_email: vendor.email, ... }, PUBLIC_KEY)
  }

  const handleQueue = async () => {
    const subject = `${vendor.name} — ${tx?.property_address || 'Property'}`
    const { error } = await supabase.from('email_queue').insert({
      transaction_id: tx?.id || null,
      to_email:       vendor.email,
      to_name:        vendor.name,
      subject,
      body:           buildBody(),
      status:         'pending',
      prepared_by:    'Me',
    })
    if (error) { toast.error('Failed to add to queue'); return }
    toast.success('Added to Send Queue')
    onClose()
  }

  return (
    <div className="vf-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="vf-modal">
        <div className="vf-header">
          <div className="vf-header-info">
            <span className="vf-vendor-name">{vendor.name}</span>
            {vendor.email && <span className="vf-vendor-email">{vendor.email}</span>}
          </div>
          <button className="vf-close" onClick={onClose}>✕</button>
        </div>
        <div className="vf-action-bar">
          <button className="vf-send-btn" onClick={handleSend} disabled={sending}>
            {sending ? 'Sending…' : '✓ Approve & Send'}
          </button>
          <button className="vf-queue-btn" onClick={handleQueue}>Send to Queue</button>
        </div>
        <div className="vf-body">
          {formFields.length === 0 ? (
            <div className="vf-empty">No form fields configured for this vendor.</div>
          ) : formFields.map((f, i) => (
            <div className="vf-field" key={f.key}>
              <label className="vf-label">{f.label}</label>
              <input
                className="vf-input"
                value={f.value}
                onChange={e => setFieldValue(i, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components for grouped view ─────────────────────────────────────────
function CriticalDateRow({ task, onDelete, flatAddr }) {
  const ddl = dueDateLabel(task.due_date, false, null)
  return (
    <div className="gtd-cd-row">
      <span className="gtd-cd-label">{task.title}</span>
      {flatAddr && <span className="gtd-cd-flat-addr">{flatAddr}</span>}
      <span className={`gtd-cd-countdown gtd-due--${ddl.cls || 'none'}`}>{ddl.text}</span>
      <span className="gtd-cd-date">
        {task.due_date
          ? new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '—'}
      </span>
      {onDelete && (
        <button className="gtd-grow-del-btn gtd-cd-del-btn" onClick={() => onDelete(task.id)} title="Delete critical date">✕</button>
      )}
    </div>
  )
}

function GlobalTaskRow({ task, tx, onUpdate, onUpdateTx, onDelete, onOpenEdit, onOpenComments, commentCount, bulkMode, selected, onToggleSelect, vendors = [], tcSettings = [], isEven = false, txAddress = null }) {
  const done      = task.status === 'complete'
  const statusKey = task.status || 'open'

  // Inline editing state
  const [editingField,    setEditingField]    = useState(null) // 'title' | 'due' | 'assignee'
  const [titleDraft,      setTitleDraft]      = useState(task.title || '')
  const [vendorFormOpen,  setVendorFormOpen]  = useState(false)
  const [vendorEmailOpen, setVendorEmailOpen] = useState(false)
  useEffect(() => { setTitleDraft(task.title || '') }, [task.title])

  const vendorType     = getVendorTypeForTask(task.title)
  const matchedVendors = vendorType ? vendors.filter(v => v.vendor_type === vendorType) : []
  const selectedVendor = matchedVendors.find(v => v.id === task.selected_vendor_id) || null

  const cycleStatus = () => {
    const next = STATUS_NEXT[statusKey] || 'open'
    const extra = next === 'complete'
      ? { completed_at: new Date().toISOString() }
      : statusKey === 'complete' ? { completed_at: null } : {}
    onUpdate(task.id, { status: next, ...extra })
  }
  const dateCfg = getTaskDateConfig(task.title)

  // For Cat1 the displayed date value comes from the transaction; for Cat2 from task.row_date
  const rowDateValue = dateCfg?.category === 1
    ? (tx?.[dateCfg.field] || '')
    : (task.row_date || '')

  const handleRowDateChange = (e) => {
    const val = e.target.value || null
    if (dateCfg.category === 1) {
      onUpdateTx?.(tx.id, dateCfg.field, val)
    } else {
      onUpdate(task.id, { row_date: val })
    }
  }

  const commitTitle = () => {
    const val = titleDraft.trim()
    if (val && val !== task.title) onUpdate(task.id, { title: val })
    else setTitleDraft(task.title || '')
    setEditingField(null)
  }

  // Progress Date: ordered_date / scheduled_date with Option A one-way sync to transaction fields
  const handleProgressDateChange = (field, val) => {
    onUpdate(task.id, { [field]: val || null })
    const title = (task.title || '').toLowerCase()
    if (field === 'ordered_date') {
      if (title.includes('appraisal'))     onUpdateTx?.(tx?.id, 'appraisal_date',       val || null)
      else if (title.includes('binsr'))    onUpdateTx?.(tx?.id, 'binsr_submitted_date', val || null)
    } else if (field === 'scheduled_date') {
      if (title.includes('home inspection')) onUpdateTx?.(tx?.id, 'home_inspection_date', val || null)
    }
  }

  // Resolve "Me" to display name
  const assigneeDisplay = task.assigned_to === 'Me' ? 'Amy Casanova' : (task.assigned_to || '')

  // Due Status urgency indicator — plain text with colored left-border divider
  const dueStatusInfo = (() => {
    if (done || !task.due_date) return null
    const today = new Date(); today.setHours(0,0,0,0)
    const diff  = Math.ceil((new Date(task.due_date + 'T00:00:00') - today) / 86400000)
    if (diff < 0)   return { label: 'Overdue',                              cls: 'overdue' }
    if (diff === 0) return { label: 'Today',                                cls: 'soon'    }
    if (diff <= 3)  return { label: `${diff} day${diff !== 1 ? 's' : ''}`, cls: 'soon'    }
    return           { label: `${diff} days`,                               cls: 'future'  }
  })()

  return (
    <div className={[
      'gtd-grow',
      isEven   ? 'gtd-grow-even'     : '',
      done     ? 'gtd-grow-done'     : '',
      selected ? 'gtd-grow-selected' : '',
    ].filter(Boolean).join(' ')}>

      {/* 1. Status cell — rectangular block; checkbox in bulk mode */}
      <div className="gtd-grow-status-cell" onClick={e => e.stopPropagation()}>
        {bulkMode ? (
          <input
            type="checkbox"
            className="gtd-bulk-checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <button
            className={`gtd-status-rect-btn gtd-status-rect--${statusKey}`}
            onClick={e => { e.stopPropagation(); cycleStatus() }}
            title="Click to advance status"
          >
            <span className="gtd-status-rect-label">{STATUS_LABELS[statusKey]}</span>
            {done && task.completed_at && (
              <span className="gtd-status-rect-date">
                {new Date(task.completed_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </button>
        )}
      </div>

      {/* 2. Task title + row_date field */}
      <div className="gtd-grow-title-col">
        {editingField === 'title' ? (
          <input
            autoFocus
            className="gtd-inline-title-input"
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onFocus={e => e.target.select()}
            onBlur={e => { if (!mouseDownIsInside(e.currentTarget)) commitTitle() }}
            onKeyDown={e => {
              if (e.key === 'Enter') e.target.blur()
              if (e.key === 'Escape') { setTitleDraft(task.title || ''); setEditingField(null) }
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span
            className={`gtd-grow-title gtd-inline-editable${done ? ' gtd-done-text' : ''}`}
            onClick={e => { e.stopPropagation(); setEditingField('title') }}
            title="Click to edit"
          >
            {task.title}
          </span>
        )}
      </div>

      {/* 3. Action — vendor dropdown + preview links */}
      <div className="gtd-grow-action-col" onClick={e => e.stopPropagation()}>
        {matchedVendors.length > 0 && (
          <>
            <select
              className="gtd-vendor-select"
              value={task.selected_vendor_id || ''}
              onChange={e => onUpdate(task.id, { selected_vendor_id: e.target.value || null })}
            >
              <option value="">— vendor —</option>
              {matchedVendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {selectedVendor && (
              <>
                {selectedVendor.contact_method === 'PDF Form + Email' && (
                  <button className="gtd-vendor-action" onClick={() => setVendorFormOpen(true)}>
                    Preview Form ↗
                  </button>
                )}
                {selectedVendor.contact_method === 'Website' && selectedVendor.website_url && (
                  <a className="gtd-vendor-action" href={selectedVendor.website_url} target="_blank" rel="noreferrer">
                    Open Website ↗
                  </a>
                )}
                {selectedVendor.contact_method === 'Text' && selectedVendor.phone && (
                  <a
                    className="gtd-vendor-action"
                    href={`sms:${selectedVendor.phone}?body=${encodeURIComponent(`Hi, I'd like to schedule for ${tx?.property_address || 'the property'}. Please let me know your availability.`)}`}
                  >
                    Send Text ↗
                  </a>
                )}
                {selectedVendor.contact_method === 'Email Only' && (
                  <button className="gtd-vendor-action" onClick={() => setVendorEmailOpen(true)}>
                    Preview Email ↗
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* 4. Progress Date — ordered_date / scheduled_date (only when has_progress_tracking) */}
      {task.has_progress_tracking && (
        <div className="gtd-progress-date-col" onClick={e => e.stopPropagation()}>
          <div className="gtd-progress-date-row">
            <span className="gtd-progress-date-label">Ordered</span>
            <input
              type="date"
              className="gtd-progress-date-input"
              value={task.ordered_date || ''}
              onChange={e => handleProgressDateChange('ordered_date', e.target.value)}
            />
          </div>
          <div className="gtd-progress-date-row">
            <span className="gtd-progress-date-label">Scheduled</span>
            <input
              type="date"
              className="gtd-progress-date-input"
              value={task.scheduled_date || ''}
              onChange={e => handleProgressDateChange('scheduled_date', e.target.value)}
            />
          </div>
        </div>
      )}

      {/* 4.5. Transaction Address — flat list only */}
      {txAddress != null && (
        <span className="gtd-grow-addr-col" title={txAddress}>{txAddress}</span>
      )}

      {/* 5. Comments */}
      <button
        className={`gtd-cmt-btn${commentCount > 0 ? ' active' : ''}`}
        onClick={e => { e.stopPropagation(); onOpenComments() }}
        title={commentCount > 0 ? `${commentCount} comment${commentCount !== 1 ? 's' : ''}` : 'Add comment'}
      >
        💬{commentCount > 0 && <span className="gtd-cmt-count">{commentCount}</span>}
      </button>

      {/* 6. Due date (inline editable) */}
      {!done && editingField === 'due' ? (
        <input
          autoFocus
          type="date"
          className="gtd-inline-due-input"
          defaultValue={task.due_date || ''}
          onChange={e => { onUpdate(task.id, { due_date: e.target.value || null }); setEditingField(null) }}
          onBlur={e => { if (!mouseDownIsInside(e.currentTarget)) setEditingField(null) }}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span
          className={`gtd-grow-due${!done ? ' gtd-inline-editable' : ''}`}
          onClick={e => { if (!done) { e.stopPropagation(); setEditingField('due') } }}
          title={!done ? 'Click to edit due date' : undefined}
        >
          {done
            ? <span className="gtd-inline-placeholder">—</span>
            : task.due_date
              ? new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : <span className="gtd-inline-placeholder">+ date</span>
          }
        </span>
      )}

      {/* 7. Due Status — colored urgency bar */}
      <span className={`gtd-due-status-bar${dueStatusInfo ? ` gtd-due-status--${dueStatusInfo.cls}` : ' gtd-due-status--none'}`}>
        {dueStatusInfo?.label || ''}
      </span>

      {/* 8. Assigned To */}
      {editingField === 'assignee' ? (
        <select
          autoFocus
          className="gtd-inline-select"
          value={task.assigned_to || ''}
          onChange={e => { onUpdate(task.id, { assigned_to: e.target.value || null }); setEditingField(null) }}
          onBlur={e => { if (!mouseDownIsInside(e.currentTarget)) setEditingField(null) }}
          onClick={e => e.stopPropagation()}
        >
          <option value="">— unassigned —</option>
          {ASSIGNEE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : (
        <span
          className="gtd-grow-assignee gtd-inline-editable"
          onClick={e => { e.stopPropagation(); setEditingField('assignee') }}
          title="Click to edit"
        >
          {task.assigned_to
            ? assigneeDisplay
            : <span className="gtd-inline-placeholder">+ assign</span>
          }
        </span>
      )}

      {/* 9. Edit */}
      <button className="gtd-grow-edit-btn" onClick={e => { e.stopPropagation(); onOpenEdit() }} title="Edit task">✎</button>

      {/* 10. Remove */}
      <button className="gtd-grow-del-btn" onClick={e => { e.stopPropagation(); onDelete(task.id) }} title="Delete task">✕</button>

      {vendorFormOpen && selectedVendor && (
        <VendorFormModal
          vendor={selectedVendor}
          tx={tx}
          task={task}
          tcSettings={tcSettings}
          onClose={() => setVendorFormOpen(false)}
          onTaskUpdate={onUpdate}
        />
      )}
      {vendorEmailOpen && selectedVendor && (
        <VendorEmailModal
          vendor={selectedVendor}
          tx={tx}
          onClose={() => setVendorEmailOpen(false)}
        />
      )}
    </div>
  )
}

const TASK_TYPE_OPTIONS = ['Task', 'Email', 'Notification', 'Critical Date']

function TaskEditModal({ task, tx, critDateTasks = [], onUpdate, onClose }) {
  const [title,      setTitle]      = useState(task.title || '')
  const [taskType,   setTaskType]   = useState(task.task_type || 'Task')
  const [dueDate,    setDueDate]    = useState(task.due_date || '')
  const [assigned,   setAssigned]   = useState(task.assigned_to || 'Me')
  const [status,     setStatus]     = useState(task.status || 'open')
  const [resolvesCd, setResolvesCd] = useState(!!task.resolves_critical_date)
  const [cdKey,      setCdKey]      = useState(task.resolves_critical_date || '')

  const handleSave = () => {
    onUpdate(task.id, {
      title:                  title.trim() || task.title,
      task_type:              taskType,
      due_date:               dueDate || null,
      assigned_to:            assigned,
      status,
      completed_at:           status === 'complete' && task.status !== 'complete'
                                ? new Date().toISOString()
                                : status !== 'complete' ? null : task.completed_at,
      resolves_critical_date: resolvesCd && cdKey ? cdKey : null,
    })
    onClose()
  }

  return (
    <div className="gtd-edit-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="gtd-edit-modal">
        <div className="gtd-edit-header">
          <span className="gtd-edit-title">Edit Task</span>
          <button className="gtd-edit-close" onClick={onClose}>✕</button>
        </div>
        <div className="gtd-edit-body">
          <label className="gtd-edit-field">
            <span className="gtd-edit-label">Title</span>
            <input className="gtd-edit-input" value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }} autoFocus />
          </label>
          <div className="gtd-edit-row">
            <label className="gtd-edit-field">
              <span className="gtd-edit-label">Task Type</span>
              <select className="gtd-edit-input" value={taskType} onChange={e => setTaskType(e.target.value)}>
                {TASK_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="gtd-edit-field">
              <span className="gtd-edit-label">Due Date</span>
              <input className="gtd-edit-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </label>
          </div>
          <div className="gtd-edit-row">
            <label className="gtd-edit-field">
              <span className="gtd-edit-label">Assigned To</span>
              <select className="gtd-edit-input" value={assigned} onChange={e => setAssigned(e.target.value)}>
                {ASSIGNEE_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="gtd-edit-field">
              <span className="gtd-edit-label">Status</span>
              <select className="gtd-edit-input" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="complete">Done</option>
              </select>
            </label>
          </div>
          {taskType !== 'Critical Date' && (
            <div className="gtd-edit-cd-section">
              <label className="gtd-edit-cd-toggle">
                <input type="checkbox" checked={resolvesCd} onChange={e => { setResolvesCd(e.target.checked); if (!e.target.checked) setCdKey('') }} />
                <span>Resolves a critical date</span>
              </label>
              {resolvesCd && (
                <select className="gtd-edit-input gtd-edit-cd-select" value={cdKey} onChange={e => setCdKey(e.target.value)}>
                  <option value="">— Select critical date —</option>
                  {critDateTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
        <div className="gtd-edit-footer">
          <button className="gtd-edit-cancel" onClick={onClose}>Cancel</button>
          <button className="gtd-edit-save" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

function AddTaskModal({ tx, critDateTasks = [], onAdd, onClose }) {
  const [title,      setTitle]      = useState('')
  const [taskType,   setTaskType]   = useState('Task')
  const [dueDate,    setDueDate]    = useState('')
  const [assigned,   setAssigned]   = useState('Me')
  const [resolvesCd, setResolvesCd] = useState(false)
  const [cdKey,      setCdKey]      = useState('')
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSave = () => {
    if (!title.trim()) return
    onAdd({
      title:                  title.trim(),
      task_type:              taskType,
      due_date:               dueDate || null,
      assigned_to:            assigned,
      status:                 'open',
      notes:                  '',
      transaction_id:         tx.id,
      resolves_critical_date: resolvesCd && cdKey ? cdKey : null,
    })
    onClose()
  }

  return (
    <div className="gtd-edit-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="gtd-edit-modal">
        <div className="gtd-edit-header">
          <span className="gtd-edit-title">Add Task — {tx.property_address?.split(',')[0] || 'Transaction'}</span>
          <button className="gtd-edit-close" onClick={onClose}>✕</button>
        </div>
        <div className="gtd-edit-body">
          <label className="gtd-edit-field">
            <span className="gtd-edit-label">Title</span>
            <input ref={inputRef} className="gtd-edit-input" value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }} placeholder="Task title…" />
          </label>
          <div className="gtd-edit-row">
            <label className="gtd-edit-field">
              <span className="gtd-edit-label">Task Type</span>
              <select className="gtd-edit-input" value={taskType} onChange={e => setTaskType(e.target.value)}>
                {TASK_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="gtd-edit-field">
              <span className="gtd-edit-label">Due Date</span>
              <input className="gtd-edit-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </label>
          </div>
          <div className="gtd-edit-row">
            <label className="gtd-edit-field">
              <span className="gtd-edit-label">Assigned To</span>
              <select className="gtd-edit-input" value={assigned} onChange={e => setAssigned(e.target.value)}>
                {ASSIGNEE_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          </div>
          {taskType !== 'Critical Date' && (
            <div className="gtd-edit-cd-section">
              <label className="gtd-edit-cd-toggle">
                <input type="checkbox" checked={resolvesCd} onChange={e => { setResolvesCd(e.target.checked); if (!e.target.checked) setCdKey('') }} />
                <span>Resolves a critical date</span>
              </label>
              {resolvesCd && (
                <select className="gtd-edit-input gtd-edit-cd-select" value={cdKey} onChange={e => setCdKey(e.target.value)}>
                  <option value="">— Select critical date —</option>
                  {critDateTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
        <div className="gtd-edit-footer">
          <button className="gtd-edit-cancel" onClick={onClose}>Cancel</button>
          <button className="gtd-edit-save" onClick={handleSave} disabled={!title.trim()}>Add Task</button>
        </div>
      </div>
    </div>
  )
}

// ─── Variable resolver ────────────────────────────────────────────────────────
export function resolveVars(text, tx, tcSettings = []) {
  if (!text) return ''
  if (!tx)   return text.replace(/\{\{(\w+)\}\}/g, '')  // no transaction → all blanks

  const tc  = tcSettings.find(t => t.name === tx.assigned_tc)
  const fmt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

  // Raw client fields
  const f1 = (tx.client_first_name  || '').trim()
  const l1 = (tx.client_last_name   || '').trim()
  const f2 = (tx.client2_first_name || '').trim()
  const l2 = (tx.client2_last_name  || '').trim()

  // Smart combo variables
  const client_greeting   = f2 ? `${f1} and ${f2}` : f1
  const client_full_name  = [f1, l1].filter(Boolean).join(' ')
  const client2_full_name = f2 ? [f2, l2].filter(Boolean).join(' ') : ''
  const client_full_names = client2_full_name
    ? `${client_full_name} and ${client2_full_name}`
    : client_full_name

  // commission_rate: derive from new split fields if present on tx (populated via joined query)
  const commission_rate = tx.seller_concession_flat != null && tx.seller_concession_flat !== ''
    ? `$${Number(tx.seller_concession_flat).toLocaleString()}`
    : tx.seller_concession_percent != null && tx.seller_concession_percent !== ''
      ? `${tx.seller_concession_percent}%`
      : ''

  // Block variables — lines joined with <br> for HTML email bodies
  const titleParts  = [tx.title_company, tx.escrow_officer, tx.title_company_phone, tx.title_company_email].filter(Boolean)
  const lenderParts = [tx.lender_name,   tx.lender_phone,   tx.lender_email].filter(Boolean)
  const title_block  = titleParts.join('<br>')
  const lender_block = lenderParts.join('<br>')

  const map = {
    // Smart combos
    client_greeting,
    client_full_name,
    client_full_names,
    client2_full_name,
    // Individual client fields
    client_first_name:     f1,
    client_last_name:      l1,
    client_phone:          tx.client_phone            || '',
    client_email:          tx.client_email            || '',
    client2_first_name:    f2,
    client2_last_name:     l2,
    client2_phone:         tx.client2_phone           || '',
    client2_email:         tx.client2_email           || '',
    // Property
    property_address:      tx.property_address        || '',
    city:                  tx.city                    || '',
    zip:                   tx.zip                     || '',
    apn:                   tx.apn                     || '',
    occupancy:             tx.vacant_or_occupied      || '',
    year_built:            tx.year_built ? String(tx.year_built) : '',
    square_ft:             tx.square_ft  ? String(tx.square_ft)  : '',
    // Price
    list_price:            tx.price ? `$${Number(tx.price).toLocaleString()}` : '',
    purchase_price:        tx.price ? `$${Number(tx.price).toLocaleString()}` : '',
    commission_rate,
    // Listing dates
    listing_contract:      fmt(tx.listing_contract),
    listing_expiration:    fmt(tx.listing_expiration_date),
    target_live:           fmt(tx.target_live_date),
    // Contract dates
    contract_acceptance:   fmt(tx.contract_acceptance_date),
    inspection_period_end: fmt(tx.ipe_date),
    close_of_escrow:       fmt(tx.close_of_escrow),
    // Contract details
    co_agent:              tx.co_op_agent             || '',
    home_inspection_date:  fmt(tx.home_inspection_date),
    home_inspector:        tx.home_inspector          || '',
    // Parties
    lender_name:           tx.lender_name             || '',
    title_company:         tx.title_company           || '',
    escrow_officer:        tx.escrow_officer          || '',
    tc_name:               tx.assigned_tc             || '',
    tc_email:              tc?.email                  || '',
    agent_name:            tx.agent_name              || '',
    // Blocks
    title_block,
    lender_block,
  }

  // Any unrecognised key resolves to '' — never shows raw {{variable}} text
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => map[k] ?? '')
}

function fmtTs(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Compose Modal ────────────────────────────────────────────────────────────
function ComposeModal({ row, transactions, tcSettings, onSave, onClose }) {
  const [emailTemplates, setEmailTemplates] = useState([])
  const [form, setForm] = useState({
    transaction_id: row?.transaction_id || '',
    template_id:    row?.template_id    || '',
    template_name:  row?.template_name  || '',
    to_email:       row?.to_email       || '',
    to_name:        row?.to_name        || '',
    subject:        row?.subject        || '',
    cc:             row?.cc             || '',
    body:           row?.body           || '',
    ...(row?.id ? { id: row.id, created_at: row.created_at } : {}),
  })
  const [saving, setSaving] = useState(false)
  const bodyRef = useRef(null)

  useEffect(() => {
    supabase.from('email_templates').select('*').order('name')
      .then(({ data }) => setEmailTemplates(data || []))
  }, [])

  // Sync form.body → DOM when template or transaction changes (external update)
  useEffect(() => {
    if (bodyRef.current && bodyRef.current.innerHTML !== form.body) {
      bodyRef.current.innerHTML = form.body
    }
  }, [form.body])

  const handleBodyInput = () => {
    set('body', bodyRef.current.innerHTML)
  }

  const selectedTx = transactions.find(t => t.id === form.transaction_id) || null

  // When template is picked, fill subject/cc/body with resolved vars
  const applyTemplate = (tmplId) => {
    const tmpl = emailTemplates.find(t => t.id === tmplId)
    if (!tmpl) { setForm(f => ({ ...f, template_id: '', template_name: '' })); return }
    setForm(f => ({
      ...f,
      template_id:   tmpl.id,
      template_name: tmpl.name,
      subject:       resolveVars(tmpl.subject, selectedTx, tcSettings),
      cc:            resolveVars(tmpl.cc,      selectedTx, tcSettings),
      body:          resolveVars(tmpl.body,    selectedTx, tcSettings),
    }))
  }

  // Re-resolve when transaction changes (if a template is selected)
  const applyTransaction = (txId) => {
    const tx   = transactions.find(t => t.id === txId) || null
    const tmpl = emailTemplates.find(t => t.id === form.template_id)
    setForm(f => ({
      ...f,
      transaction_id: txId,
      ...(tmpl ? {
        subject: resolveVars(tmpl.subject, tx, tcSettings),
        cc:      resolveVars(tmpl.cc,      tx, tcSettings),
        body:    resolveVars(tmpl.body,    tx, tcSettings),
      } : {}),
    }))
  }

  const useClientEmail = () => {
    if (!selectedTx) return
    const name = [selectedTx.client_first_name, selectedTx.client_last_name].filter(Boolean).join(' ')
    setForm(f => ({ ...f, to_email: selectedTx.client_email || '', to_name: name }))
  }

  // If a CC entry matches a tcSettings display name, swap it for their email address.
  const resolveCc = (ccStr) => {
    if (!ccStr.trim()) return ccStr
    return ccStr.split(',').map(part => {
      const trimmed = part.trim()
      const match   = (tcSettings || []).find(s => s.name === trimmed)
      return match?.email || trimmed
    }).join(', ')
  }

  const handleSave = async () => {
    if (!form.to_email.trim() || !form.subject.trim()) {
      toast.error('To email and subject are required')
      return
    }
    setSaving(true)
    try { await onSave({ ...form, cc: resolveCc(form.cc) }) }
    finally { setSaving(false) }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="sq-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sq-modal sq-modal--compose">
        <div className="sq-modal-header">
          <h3 className="sq-modal-title">{form.id ? 'Edit Email' : 'Compose Email'}</h3>
          <button className="sq-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="sq-modal-body">

          <div className="sq-field-row">
            <div className="sq-field">
              <label className="sq-label">Transaction</label>
              <select className="sq-input" value={form.transaction_id} onChange={e => applyTransaction(e.target.value)}>
                <option value="">— None —</option>
                {transactions.map(tx => (
                  <option key={tx.id} value={tx.id}>{tx.property_address || '(No address)'}</option>
                ))}
              </select>
            </div>
            <div className="sq-field">
              <label className="sq-label">Email Template</label>
              <select className="sq-input" value={form.template_id} onChange={e => applyTemplate(e.target.value)}>
                <option value="">— Manual / None —</option>
                {emailTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="sq-field-row">
            <div className="sq-field">
              <label className="sq-label">To Name</label>
              <input className="sq-input" type="text" placeholder="Recipient name" value={form.to_name} onChange={e => set('to_name', e.target.value)} />
            </div>
            <div className="sq-field">
              <label className="sq-label">
                To Email
                {selectedTx?.client_email && (
                  <button className="sq-use-client" onClick={useClientEmail} type="button">Use client email</button>
                )}
              </label>
              <input className="sq-input" type="email" placeholder="recipient@example.com" value={form.to_email} onChange={e => set('to_email', e.target.value)} />
            </div>
          </div>

          <div className="sq-field">
            <label className="sq-label">Subject</label>
            <input className="sq-input" type="text" placeholder="Email subject" value={form.subject} onChange={e => set('subject', e.target.value)} />
          </div>

          <div className="sq-field">
            <label className="sq-label">CC</label>
            <input className="sq-input" type="text" placeholder="cc@example.com, another@example.com" value={form.cc} onChange={e => set('cc', e.target.value)} />
          </div>

          <div className="sq-field">
            <label className="sq-label">Body</label>
            <div
              ref={bodyRef}
              className="sq-body-editor"
              contentEditable
              suppressContentEditableWarning
              onInput={handleBodyInput}
              data-placeholder="Email body…"
            />
          </div>

        </div>
        <div className="sq-modal-footer">
          <button className="sq-modal-cancel" onClick={onClose}>Cancel</button>
          <button className="sq-modal-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Add to Queue'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Send Queue View ──────────────────────────────────────────────────────────
function SendQueueView({ transactions, tcSettings, onQueueCountChange }) {
  const [queue,      setQueue]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [previewing, setPreviewing] = useState(null)
  const [composing,  setComposing]  = useState(null)   // null | 'new' | row
  const [sending,    setSending]    = useState(null)   // row.id being sent
  const [rowErrors,  setRowErrors]  = useState({})     // { [row.id]: errorMessage }
  const gmailStatus = useGmailStatus()

  const txById = useMemo(() => {
    const m = {}; for (const t of transactions) m[t.id] = t; return m
  }, [transactions])

  useEffect(() => { loadQueue() }, [])

  const loadQueue = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('email_queue')
      .select('*')
      .in('status', ['pending', 'failed'])
      .order('prepared_at', { ascending: false })
    const rows = data || []
    setQueue(rows)
    onQueueCountChange?.(rows.filter(r => r.status === 'pending').length)
    setLoading(false)
  }

  const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''

  const handleSend = async (row) => {
    setSending(row.id)
    setRowErrors(prev => { const n = { ...prev }; delete n[row.id]; return n })

    const raw = row.body || ''
    const htmlBody = raw.trimStart().startsWith('<')
      ? raw
      : `<pre style="font-family:monospace;font-size:13px;white-space:pre-wrap;line-height:1.5;">${raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`

    try {
      const gmailRes = await fetch(`${API_BASE}/api/google/gmail-send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:            row.to_email,
          cc:            row.cc     || undefined,
          subject:       row.subject,
          body:          htmlBody,
          transactionId: row.transaction_id || undefined,
        }),
      })

      const result = await gmailRes.json()

      if (!gmailRes.ok) {
        await supabase.from('email_queue').update({ status: 'failed' }).eq('id', row.id)
        setQueue(prev => prev.map(q => q.id === row.id ? { ...q, status: 'failed' } : q))
        setRowErrors(prev => ({ ...prev, [row.id]: result.error || 'Send failed' }))
        return
      }

      // Success: mark sent then remove — gmail-send.js already writes the sent log server-side
      await supabase.from('email_queue').update({ status: 'sent' }).eq('id', row.id)
      await supabase.from('email_queue').delete().eq('id', row.id)
      const next = queue.filter(q => q.id !== row.id)
      setQueue(next)
      onQueueCountChange?.(next.filter(r => r.status === 'pending').length)
      setPreviewing(null)
      toast.success('Email sent')
    } catch (err) {
      await supabase.from('email_queue').update({ status: 'failed' }).eq('id', row.id)
      setQueue(prev => prev.map(q => q.id === row.id ? { ...q, status: 'failed' } : q))
      setRowErrors(prev => ({ ...prev, [row.id]: err.message || 'Send failed' }))
    } finally {
      setSending(null)
    }

    // ── EMAILJS LEGACY — unreachable, kept for reference until migration is verified ──
    // const { default: emailjs } = await import('@emailjs/browser')
    // await emailjs.send(SERVICE_ID, TEMPLATE_ID, { to_email, to_name, subject, ... }, PUBLIC_KEY)
  }

  const handleDiscard = async (id) => {
    if (!window.confirm('Remove this email from the queue?')) return
    await supabase.from('email_queue').delete().eq('id', id)
    const next = queue.filter(q => q.id !== id)
    setQueue(next)
    onQueueCountChange?.(next.length)
  }

  const handleSaveCompose = async (entry) => {
    if (entry.id) {
      const { id, created_at, ...updates } = entry
      const { error } = await supabase.from('email_queue').update(updates).eq('id', id)
      if (error) { toast.error('Save failed'); return }
      setQueue(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q))
    } else {
      const { data, error } = await supabase
        .from('email_queue')
        .insert({ ...entry, status: 'pending', prepared_by: 'Me' })
        .select().single()
      if (error) { toast.error('Failed to add to queue'); return }
      const next = [data, ...queue]
      setQueue(next)
      onQueueCountChange?.(next.length)
    }
    setComposing(null)
    toast.success('Added to Send Queue')
  }

  const gmailReady = !gmailStatus.loading && gmailStatus.connected && gmailStatus.hasGmailScope
  const pendingCount = queue.filter(r => r.status === 'pending').length
  const failedCount  = queue.filter(r => r.status === 'failed').length

  return (
    <div className="sq-view">
      <div className="sq-topbar">
        <span className="sq-count">
          {loading ? '…' : (
            <>
              {pendingCount} email{pendingCount !== 1 ? 's' : ''} waiting
              {failedCount > 0 && <span className="sq-failed-badge">{failedCount} failed</span>}
            </>
          )}
        </span>
        <button className="sq-compose-btn" onClick={() => setComposing('new')}>+ Compose Email</button>
      </div>

      {!gmailStatus.loading && (!gmailStatus.connected || !gmailStatus.hasGmailScope) && (
        <div className="sq-reconnect-banner">
          Gmail not connected —{' '}
          <a href="/api/google/auth" className="sq-reconnect-link">Reconnect Google</a>
          {' '}to send emails from the queue.
        </div>
      )}

      {loading ? (
        <div className="sq-loading">Loading queue…</div>
      ) : queue.length === 0 ? (
        <div className="sq-empty">The queue is empty. Compose an email or trigger one from a template.</div>
      ) : (
        <div className="sq-scroll">
          <table className="sq-table">
            <thead>
              <tr>
                <th>To</th>
                <th>Subject</th>
                <th>Transaction</th>
                <th>Template</th>
                <th>Prepared</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {queue.map(row => {
                const isFailed = row.status === 'failed'
                const rowError = rowErrors[row.id]
                return (
                  <tr key={row.id} className={`sq-row${isFailed ? ' sq-row--failed' : ''}`} onClick={() => setPreviewing(row)} title="Click to preview">
                    <td className="sq-col-to">{row.to_name ? `${row.to_name}` : row.to_email}<span className="sq-email-small"> {row.to_name ? `<${row.to_email}>` : ''}</span></td>
                    <td className="sq-col-subject">{row.subject}</td>
                    <td className="sq-col-tx">{txById[row.transaction_id]?.property_address?.split(',')[0] || '—'}</td>
                    <td className="sq-col-tmpl">{row.template_name || '—'}</td>
                    <td className="sq-col-date">{fmtTs(row.prepared_at)}</td>
                    <td className="sq-col-actions" onClick={e => e.stopPropagation()}>
                      {isFailed && rowError && (
                        <span className="sq-row-error" title={rowError}>⚠ {rowError}</span>
                      )}
                      <button
                        className="sq-btn sq-btn--send"
                        onClick={() => handleSend(row)}
                        disabled={!!sending || !gmailReady}
                        title={!gmailReady ? 'Reconnect Google to send' : isFailed ? 'Retry send' : 'Send'}
                      >
                        {sending === row.id ? '…' : isFailed ? 'Retry' : 'Send'}
                      </button>
                      <button className="sq-btn sq-btn--edit" onClick={() => setComposing(row)} disabled={!!sending}>Edit</button>
                      <button className="sq-btn sq-btn--discard" onClick={() => handleDiscard(row.id)} disabled={!!sending}>Discard</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview modal */}
      {previewing && (
        <div className="sq-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setPreviewing(null) }}>
          <div className="sq-modal sq-modal--preview">
            <div className="sq-modal-header">
              <h3 className="sq-modal-title">Email Preview</h3>
              <button className="sq-modal-close" onClick={() => setPreviewing(null)}>✕</button>
            </div>
            <div className="sq-modal-body">
              <div className="sq-preview-meta">
                <div className="sq-preview-row"><span className="sq-preview-label">To</span><span>{previewing.to_name ? `${previewing.to_name} <${previewing.to_email}>` : previewing.to_email}</span></div>
                {previewing.cc && <div className="sq-preview-row"><span className="sq-preview-label">CC</span><span>{previewing.cc}</span></div>}
                <div className="sq-preview-row"><span className="sq-preview-label">Subject</span><strong>{previewing.subject}</strong></div>
              </div>
              <div className="sq-preview-divider" />
              <div
                className="sq-preview-body"
                dangerouslySetInnerHTML={{ __html: previewing.body || '' }}
              />
            </div>
            <div className="sq-modal-footer">
              <button className="sq-modal-cancel" onClick={() => setPreviewing(null)}>Close</button>
              {gmailReady ? (
                <button className="sq-modal-save" onClick={() => handleSend(previewing)} disabled={!!sending}>
                  {sending === previewing.id ? 'Sending…' : previewing.status === 'failed' ? 'Retry Send' : 'Send Now'}
                </button>
              ) : (
                <a href="/api/google/auth" className="sq-reconnect-link sq-reconnect-link--btn">
                  Reconnect Google to Send
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Compose / Edit modal */}
      {composing && (
        <ComposeModal
          row={composing === 'new' ? null : composing}
          transactions={transactions}
          tcSettings={tcSettings}
          onSave={handleSaveCompose}
          onClose={() => setComposing(null)}
        />
      )}
    </div>
  )
}

// ─── Sent Log View ────────────────────────────────────────────────────────────
function SentLogView({ transactions }) {
  const [log,     setLog]     = useState([])
  const [loading, setLoading] = useState(true)

  const txById = useMemo(() => {
    const m = {}; for (const t of transactions) m[t.id] = t; return m
  }, [transactions])

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('email_sent_log')
      .select('*')
      .order('sent_at', { ascending: false })
    setLog(data || [])
    setLoading(false)
  }

  return (
    <div className="sq-view">
      <div className="sq-topbar">
        <span className="sq-count">{loading ? '…' : `${log.length} email${log.length !== 1 ? 's' : ''} sent`}</span>
      </div>

      {loading ? (
        <div className="sq-loading">Loading sent log…</div>
      ) : log.length === 0 ? (
        <div className="sq-empty">No emails have been sent yet.</div>
      ) : (
        <div className="sq-scroll">
          <table className="sq-table">
            <thead>
              <tr>
                <th>To</th>
                <th>Subject</th>
                <th>Transaction</th>
                <th>Template</th>
                <th>Sent Date</th>
                <th>Sent By</th>
              </tr>
            </thead>
            <tbody>
              {log.map(row => (
                <tr key={row.id}>
                  <td className="sq-col-to">{row.to_name ? `${row.to_name}` : row.to_email}<span className="sq-email-small"> {row.to_name ? `<${row.to_email}>` : ''}</span></td>
                  <td className="sq-col-subject">{row.subject}</td>
                  <td className="sq-col-tx">{txById[row.transaction_id]?.property_address?.split(',')[0] || '—'}</td>
                  <td className="sq-col-tmpl">{row.template_name || '—'}</td>
                  <td className="sq-col-date">{row.sent_at ? new Date(row.sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                  <td>{row.sent_by || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
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
                  {v === 'Justina Morris' ? 'Justina' : v === 'Victoria Lareau' ? 'Victoria' : v === 'Amy Casanova' ? 'Amy' : v}
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
  tasks, transactions, onTaskUpdate, onDeleteTask, onAddTask, onUpdateTransaction,
  taskComments = [], onAddTaskComment, onDeleteTaskComment,
  tcSettings = [], onCardClick,
}) {
  // Sub-tab
  const [activeSubTab,  setActiveSubTab]  = useState('tasks')
  const [queueCount,    setQueueCount]    = useState(0)
  const tasksScrollRef  = useRef(null)
  const savedScrollTop  = useRef(0)

  useEffect(() => {
    if (activeSubTab === 'tasks' && tasksScrollRef.current) {
      tasksScrollRef.current.scrollTop = savedScrollTop.current
    }
  }, [activeSubTab])

  useEffect(() => {
    supabase
      .from('email_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setQueueCount(count || 0))
  }, [])

  // Filter state
  const [filters,      setFilters]      = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('taskFilters') || 'null')
      return raw ? deserializeFilters(raw) : DEFAULT_FILTERS
    } catch { return DEFAULT_FILTERS }
  })
  const [draft,        setDraft]        = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('taskFilters') || 'null')
      return raw ? deserializeFilters(raw) : DEFAULT_FILTERS
    } catch { return DEFAULT_FILTERS }
  })
  const [panelOpen,    setPanelOpen]    = useState(false)
  const [savedViews,   setSavedViews]   = useState(loadSavedViews)
  const [activeViewId, setActiveViewId] = useState(null)

  // Grouped view state
  const [collapsed,     setCollapsed]     = useState({})
  const [showCompleted, setShowCompleted] = useState({})
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [addingForTx,   setAddingForTx]   = useState(null)

  // Bulk edit state
  const [bulkMode,     setBulkMode]     = useState(false)
  const [selectedIds,  setSelectedIds]  = useState(new Set())
  const [bulkAssignTo, setBulkAssignTo] = useState('')
  const [bulkStatus,   setBulkStatus]   = useState('')
  const [bulkApplying, setBulkApplying] = useState(false)

  // Comment panel
  const [commentTaskId, setCommentTaskId] = useState(null)

  // Column sort
  const [sortField, setSortField] = useState('due_date')
  const [sortDir,   setSortDir]   = useState('asc')

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // View mode: grouped accordion or flat list
  const [viewMode, setViewMode] = useState('grouped')

  // Vendors
  const [vendors, setVendors] = useState([])
  useEffect(() => {
    supabase.from('vendors').select('*').order('name').then(({ data }) => setVendors(data || []))
  }, [])

  const selectAllRef = useRef(null)

  const txMap = useMemo(() => {
    const m = {}
    transactions.forEach(t => { m[t.id] = t })
    return m
  }, [transactions])

  const stageLabel = v => TASK_STAGES.find(s => s.value === v)?.label || v || '—'

  // ── Group + Sort ───────────────────────────────────────────────────────────
  const groupedData = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0)
    const eow   = endOfWeek()

    // Filter tasks (include completed — per-group toggle controls their visibility)
    const passedTasks = tasks.filter(task => {
      const tx = txMap[task.transaction_id]
      if (!tx) return false
      if (!filters.stageChecks.has(tx.status)) return false
      if (filters.typeFilter !== 'All' && tx.rep_type !== filters.typeFilter) return false
      if (filters.tcFilter !== 'All') {
        const match = filters.tcFilter === 'Amy Casanova' ? 'Me' : filters.tcFilter
        if (tx.assigned_tc !== match) return false
      }
      if (filters.search.trim()) {
        const q = filters.search.toLowerCase()
        if (!(task.title || '').toLowerCase().includes(q) &&
            !(tx.property_address || '').toLowerCase().includes(q)) return false
      }
      // For due bucket filter, always include completed (handled per-group toggle)
      // Critical Date tasks bypass the due-bucket filter — they always show
      if (task.task_type !== 'Critical Date') {
        if (task.status !== 'complete' && !filters.dueChecks.has(dueBucket(task, today, eow))) return false
      }
      return true
    })

    // Group by transaction
    const txGroupMap = new Map()
    passedTasks.forEach(task => {
      const tx = txMap[task.transaction_id]
      if (!tx) return
      if (!txGroupMap.has(tx.id)) txGroupMap.set(tx.id, { tx, tasks: [] })
      txGroupMap.get(tx.id).tasks.push(task)
    })

    const todayStr = new Date().toISOString().slice(0, 10)

    // Build each group, filtering Critical Date tasks that are resolved/past
    const groups = [...txGroupMap.values()].map(({ tx, tasks: txTasks }) => {
      // IDs of critical date tasks resolved by a completed regular task
      const resolvedCritIds = new Set(
        txTasks.filter(t => t.status === 'complete' && t.resolves_critical_date)
          .map(t => t.resolves_critical_date)
      )

      const visibleTasks = txTasks.filter(t => {
        if (t.task_type === 'Critical Date') {
          if (t.status === 'complete') return false
          if (resolvedCritIds.has(t.id)) return false
          if (t.due_date && t.due_date < todayStr) return false
        }
        return true
      })

      // Sort — Critical Date tasks always float to top; others sort by selected column
      const allItems = visibleTasks.slice().sort((a, b) => {
        const aCD = a.task_type === 'Critical Date'
        const bCD = b.task_type === 'Critical Date'
        if (aCD !== bCD) return aCD ? -1 : 1
        let cmp = 0
        switch (sortField) {
          case 'status':      cmp = (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0); break
          case 'title':       cmp = (a.title || '').localeCompare(b.title || ''); break
          case 'assigned_to': cmp = (a.assigned_to || '').localeCompare(b.assigned_to || ''); break
          default:            cmp = (a.due_date || 'zzzz').localeCompare(b.due_date || 'zzzz')
        }
        return sortDir === 'asc' ? cmp : -cmp
      })

      const completedCount = txTasks.filter(t => t.task_type !== 'Critical Date' && t.status === 'complete').length
      return { tx, items: allItems, completedCount }
    })

    // Sort groups: Pending first → active by soonest COE → Closed → Cancelled/Expired
    const BOTTOM_STATUSES = new Set(['closed', 'cancelled-expired'])
    groups.sort((a, b) => {
      const aBottom = BOTTOM_STATUSES.has(a.tx.status)
      const bBottom = BOTTOM_STATUSES.has(b.tx.status)
      if (aBottom !== bBottom) return aBottom ? 1 : -1
      if (aBottom && bBottom) {
        if (a.tx.status !== b.tx.status) return a.tx.status === 'closed' ? -1 : 1
        return 0
      }
      const aPending = a.tx.status === 'pending'
      const bPending = b.tx.status === 'pending'
      if (aPending !== bPending) return aPending ? -1 : 1
      const aCoe = a.tx.close_of_escrow || '9999-12-31'
      const bCoe = b.tx.close_of_escrow || '9999-12-31'
      if (aCoe !== bCoe) return aCoe.localeCompare(bCoe)
      return (STAGE_ORDER[a.tx.status] ?? 9) - (STAGE_ORDER[b.tx.status] ?? 9)
    })

    return groups
  }, [tasks, txMap, filters, sortField, sortDir])

  const allFilteredTasks = groupedData.flatMap(g => g.items.filter(i => i.task_type !== 'Critical Date'))
  const openCount        = allFilteredTasks.filter(t => t.status !== 'complete').length
  const doneCount        = allFilteredTasks.filter(t => t.status === 'complete').length
  const filterCount      = countFilters(filters)

  // Flat list: all items from all groups, globally sorted, each item carries _tx reference
  const flatListData = useMemo(() => {
    if (viewMode !== 'flat') return []
    const all = groupedData.flatMap(({ tx, items }) =>
      items.map(item => ({ ...item, _tx: tx }))
    )
    return all.slice().sort((a, b) => {
      const aCD = a.task_type === 'Critical Date'
      const bCD = b.task_type === 'Critical Date'
      if (aCD !== bCD) return aCD ? -1 : 1
      let cmp = 0
      switch (sortField) {
        case 'status':      cmp = (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0); break
        case 'title':       cmp = (a.title || '').localeCompare(b.title || ''); break
        case 'assigned_to': cmp = (a.assigned_to || '').localeCompare(b.assigned_to || ''); break
        case 'tx_address':  cmp = (a._tx?.property_address || '').localeCompare(b._tx?.property_address || ''); break
        default:            cmp = (a.due_date || 'zzzz').localeCompare(b.due_date || 'zzzz')
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [viewMode, groupedData, sortField, sortDir])

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
      TASK_STAGES.filter(s => filters.stageChecks.has(s.value)).forEach(s => {
        chips.push({
          key: `stage-${s.value}`,
          label: `Stage: ${s.label}`,
          onRemove: () => {
            setFilters(f => { const next = new Set(f.stageChecks); next.delete(s.value); return { ...f, stageChecks: next } })
            setDraft(d => { const next = new Set(d.stageChecks); next.delete(s.value); return { ...d, stageChecks: next } })
            setActiveViewId(null)
          }
        })
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
      const short = filters.tcFilter === 'Justina Morris' ? 'Justina' : filters.tcFilter === 'Victoria Lareau' ? 'Victoria' : 'Amy'
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
    localStorage.setItem('taskFilters', JSON.stringify(serializeFilters(draft)))
  }

  const clearAll = () => {
    setDraft(DEFAULT_FILTERS)
    setFilters(DEFAULT_FILTERS)
    setActiveViewId(null)
    setPanelOpen(false)
    localStorage.removeItem('taskFilters')
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

  const allSelected  = allFilteredTasks.length > 0 && selectedIds.size === allFilteredTasks.length
  const someSelected = selectedIds.size > 0 && !allSelected

  const setSelectAllRef = (el) => {
    selectAllRef.current = el
    if (el) el.indeterminate = someSelected
  }

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(allFilteredTasks.map(t => t.id)))
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

      {/* ── Sub-tab bar ─────────────────────────────────────────────── */}
      <div className="gtd-subtabs">
        <button
          className={`gtd-subtab${activeSubTab === 'tasks' ? ' active' : ''}`}
          onClick={() => setActiveSubTab('tasks')}
        >Tasks</button>
        <button
          className={`gtd-subtab${activeSubTab === 'queue' ? ' active' : ''}`}
          onClick={() => { if (tasksScrollRef.current) savedScrollTop.current = tasksScrollRef.current.scrollTop; setActiveSubTab('queue') }}
        >
          Send Queue
          {queueCount > 0 && <span className="gtd-subtab-badge">{queueCount}</span>}
        </button>
        <button
          className={`gtd-subtab${activeSubTab === 'log' ? ' active' : ''}`}
          onClick={() => { if (tasksScrollRef.current) savedScrollTop.current = tasksScrollRef.current.scrollTop; setActiveSubTab('log') }}
        >Sent Log</button>
      </div>

      {/* ── Send Queue view ─────────────────────────────────────────── */}
      {activeSubTab === 'queue' && (
        <SendQueueView
          transactions={transactions}
          tcSettings={tcSettings}
          onQueueCountChange={setQueueCount}
        />
      )}

      {/* ── Sent Log view ───────────────────────────────────────────── */}
      {activeSubTab === 'log' && (
        <SentLogView transactions={transactions} />
      )}

      {activeSubTab !== 'tasks' && null}
      {activeSubTab === 'tasks' && <>

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
        <div className="gtd-view-toggle-group">
          <button
            className={`gtd-vt-btn${viewMode === 'grouped' ? ' active' : ''}`}
            onClick={() => setViewMode('grouped')}
          >Grouped</button>
          <button
            className={`gtd-vt-btn${viewMode === 'flat' ? ' active' : ''}`}
            onClick={() => setViewMode('flat')}
          >Flat</button>
        </div>
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
              {selectedIds.size === 0 ? 'Select all' : `${selectedIds.size} of ${allFilteredTasks.length} selected`}
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

      {/* ── Grouped accordion list ──────────────────────────────────── */}
      <div className="gtd-grouped-list" ref={tasksScrollRef}>

        {/* ── Column headers ────────────────────────────────────────── */}
        <div className="gtd-col-header-row">
          {(() => {
            const hdr = (field, label, cls) => {
              const active = sortField === field
              const dir    = active ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'
              return (
                <button
                  key={field}
                  className={`gtd-col-hdr gtd-col-hdr--${cls} gtd-col-hdr--sortable${active ? ' gtd-col-hdr--active' : ''}`}
                  onClick={() => handleSort(field)}
                >
                  {label}<span className="gtd-col-hdr-arrow">{dir}</span>
                </button>
              )
            }
            return <>
              {hdr('status',      'Status',      'status')}
              {hdr('title',       'Task',        'task')}
              <div className="gtd-col-hdr gtd-col-hdr--action">Action</div>
              {viewMode === 'flat' && hdr('tx_address', 'Transaction', 'addr')}
              <div className="gtd-col-hdr gtd-col-hdr--cmt" />
              {hdr('due_date',    'Due',         'due')}
              <div className="gtd-col-hdr gtd-col-hdr--due-status">Due Status</div>
              <div className="gtd-col-hdr gtd-col-hdr--assignee">Assigned To</div>
              <div className="gtd-col-hdr gtd-col-hdr--acts" />
            </>
          })()}
        </div>

        {/* ── Grouped accordion view ────────────────────────────────── */}
        {viewMode === 'grouped' && groupedData.length === 0 && (
          <div className="gtd-empty">No tasks match these filters</div>
        )}

        {viewMode === 'grouped' && groupedData.map(({ tx, items, completedCount }) => {
          const isCollapsed = !!collapsed[tx.id]
          const showDone    = !!showCompleted[tx.id]

          const visibleItems = isCollapsed ? [] : items.filter(item =>
            item.task_type === 'Critical Date' || item.status !== 'complete' || showDone
          )

          return (
            <div key={tx.id} className="gtd-tx-group">
              {/* Transaction header */}
              <div
                className="gtd-tx-header"
                onClick={() => setCollapsed(p => ({ ...p, [tx.id]: !isCollapsed }))}
              >
                <span className={`gtd-tx-collapse${isCollapsed ? ' collapsed' : ''}`}>
                  {isCollapsed ? '▶' : '▼'}
                </span>
                <span
                  className="gtd-tx-addr"
                  onClick={e => { e.stopPropagation(); onCardClick(tx) }}
                  title="Open transaction"
                >
                  {tx.property_address?.split(',')[0] || '(No address)'}
                </span>
                <span className={`gtd-stage-badge gtd-stage--${tx.status}`}>
                  {stageLabel(tx.status)}
                </span>
                {tx.rep_type && (
                  <span className={`gtd-stage-badge gtd-rep-type--${(tx.rep_type || '').toLowerCase()}`}>
                    {tx.rep_type}
                  </span>
                )}
                {tx.close_of_escrow && (
                  <span className="gtd-tx-coe">
                    COE: {new Date(tx.close_of_escrow + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
                <span className="gtd-tx-header-spacer" />
                {!isCollapsed && completedCount > 0 && (
                  <button
                    className="gtd-show-completed-btn"
                    onClick={e => { e.stopPropagation(); setShowCompleted(p => ({ ...p, [tx.id]: !showDone })) }}
                  >
                    {showDone ? 'Hide' : 'Show'} {completedCount} completed
                  </button>
                )}
                <button
                  className="gtd-tx-open-btn"
                  onClick={e => { e.stopPropagation(); onCardClick(tx) }}
                >
                  Open →
                </button>
              </div>

              {/* Task / critical date rows */}
              {!isCollapsed && (() => {
                let taskRowIdx = 0
                return visibleItems.map(item =>
                  item.task_type === 'Critical Date' ? (
                    <CriticalDateRow key={item.id} task={item} onDelete={onDeleteTask} />
                  ) : (
                    <GlobalTaskRow
                      key={item.id}
                      task={item}
                      tx={tx}
                      onUpdate={onTaskUpdate}
                      onUpdateTx={onUpdateTransaction}
                      onDelete={onDeleteTask}
                      onOpenEdit={() => setEditingTaskId(item.id)}
                      onOpenComments={() => setCommentTaskId(item.id)}
                      commentCount={taskComments.filter(c => c.task_id === item.id).length}
                      bulkMode={bulkMode}
                      selected={selectedIds.has(item.id)}
                      onToggleSelect={() => toggleId(item.id)}
                      vendors={vendors}
                      tcSettings={tcSettings}
                      isEven={taskRowIdx++ % 2 === 1}
                    />
                  )
                )
              })()}
              {!isCollapsed && onAddTask && (
                <div className="gtd-add-task-row">
                  <button className="gtd-add-task-btn" onClick={() => setAddingForTx(tx)}>
                    + Add Task
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {/* ── Flat list view ────────────────────────────────────────── */}
        {viewMode === 'flat' && (
          <div className="gtd-flat-list">
            {flatListData.length === 0 && (
              <div className="gtd-empty">No tasks match these filters</div>
            )}
            {(() => {
              let taskRowIdx = 0
              return flatListData.map(item => {
                const addr = item._tx.property_address?.split(',')[0] || ''
                return item.task_type === 'Critical Date' ? (
                  <CriticalDateRow
                    key={item.id}
                    task={item}
                    onDelete={onDeleteTask}
                    flatAddr={addr}
                  />
                ) : (
                  <GlobalTaskRow
                    key={item.id}
                    task={item}
                    tx={item._tx}
                    onUpdate={onTaskUpdate}
                    onUpdateTx={onUpdateTransaction}
                    onDelete={onDeleteTask}
                    onOpenEdit={() => setEditingTaskId(item.id)}
                    onOpenComments={() => setCommentTaskId(item.id)}
                    commentCount={taskComments.filter(c => c.task_id === item.id).length}
                    bulkMode={bulkMode}
                    selected={selectedIds.has(item.id)}
                    onToggleSelect={() => toggleId(item.id)}
                    vendors={vendors}
                    tcSettings={tcSettings}
                    isEven={taskRowIdx++ % 2 === 1}
                    txAddress={addr}
                  />
                )
              })
            })()}
          </div>
        )}
      </div>

      {/* ── Add task modal ──────────────────────────────────────────── */}
      {addingForTx && (
        <AddTaskModal
          tx={addingForTx}
          critDateTasks={tasks.filter(t => t.transaction_id === addingForTx.id && t.task_type === 'Critical Date')}
          onAdd={onAddTask}
          onClose={() => setAddingForTx(null)}
        />
      )}

      {/* ── Task edit modal ─────────────────────────────────────────── */}
      {editingTaskId && (() => {
        const et = tasks.find(t => t.id === editingTaskId)
        const etx = et ? txMap[et.transaction_id] : null
        const etCritDateTasks = et
          ? tasks.filter(t => t.transaction_id === et.transaction_id && t.task_type === 'Critical Date' && t.id !== et.id)
          : []
        return et ? (
          <TaskEditModal
            task={et}
            tx={etx}
            critDateTasks={etCritDateTasks}
            onUpdate={onTaskUpdate}
            onClose={() => setEditingTaskId(null)}
          />
        ) : null
      })()}

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
      </>}
    </div>
  )
}
