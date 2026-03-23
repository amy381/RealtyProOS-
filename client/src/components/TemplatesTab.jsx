import { useState, useRef, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import { TC_ASSIGNEES } from '../lib/taskTemplates'
import './TemplatesTab.css'

// ─── Task template constants ───────────────────────────────────────────────────
const TIMING_OPTIONS = [
  { value: 'stage_pre_listing',           label: 'When moved to Pre-Listing',                      hasDays: false },
  { value: 'stage_active_listing',        label: 'When moved to Active Listing',                   hasDays: false },
  { value: 'stage_buyer_broker',          label: 'When moved to Buyer-Broker',                     hasDays: false },
  { value: 'stage_pending',               label: 'When moved to Pending',                          hasDays: false },
  { value: 'stage_closed',               label: 'When moved to Closed',                           hasDays: false },
  { value: 'stage_cancelled_expired',    label: 'When moved to Cancelled/Expired',                hasDays: false },
  { value: 'days_after_contract',         label: 'days after Contract Acceptance',                 hasDays: true  },
  { value: 'days_before_coe',             label: 'days before Close of Escrow',                    hasDays: true  },
  { value: 'days_after_coe',             label: 'days after Close of Escrow',                     hasDays: true  },
  { value: 'days_after_listing_contract', label: 'days after Listing Contract',                    hasDays: true  },
  { value: 'days_after_bba',             label: 'days after BBA Contract',                        hasDays: true  },
  { value: 'days_before_ipe',             label: 'days before Inspection Period End / BINSR Due',  hasDays: true  },
  { value: 'days_after_ipe',             label: 'days after Inspection Period End / BINSR Due',   hasDays: true  },
  { value: 'days_after_binsr',           label: 'days after BINSR Submitted',                     hasDays: true  },
  { value: 'specific_date',               label: 'Specific date (manual)',                         hasDays: false },
]

const TASK_TYPES = ['Task', 'Email', 'Notification']
const APPLIES_TO = ['Buyer', 'Seller', 'Both']

function formatTiming(timingType, timingDays) {
  if (timingType === 'specific_date') return 'Specific date'
  if (timingType === 'at_stage_change') return 'At stage change' // legacy fallback
  const opt = TIMING_OPTIONS.find(o => o.value === timingType)
  if (!opt) return timingType
  if (!opt.hasDays) return opt.label
  const d = Number(timingDays) || 0
  if (timingType === 'days_before_ipe' && d === 0) return 'At Inspection Period End'
  return `${d} ${opt.label}`
}

const EMPTY_TASK = {
  title:          '',
  task_type:      'Task',
  timing_type:    'stage_pending',
  timing_days:    0,
  applies_to:     'Both',
  auto_assign_to: 'Me',
}

// ─── Email template constants ─────────────────────────────────────────────────
const EMPTY_EMAIL = {
  name:       '',
  subject:    '',
  body:       '',
  cc:         '',
  auto_send:  false,
  trigger:    'manual',
  applies_to: 'Both',
}

const TRIGGER_OPTIONS = [
  { value: 'manual',                label: 'Manual only'                    },
  { value: 'stage_pre_listing',     label: 'When moved to Pre-Listing'      },
  { value: 'stage_active_listing',  label: 'When moved to Active Listing'   },
  { value: 'stage_buyer_broker',    label: 'When moved to Buyer-Broker'     },
  { value: 'stage_pending',         label: 'When moved to Pending'          },
  { value: 'stage_closed',          label: 'When moved to Closed'           },
  { value: 'stage_cancelled_expired', label: 'When moved to Cancelled/Expired' },
]

const EMAIL_APPLIES_TO = ['Buyer', 'Seller', 'Both']

const EMAIL_VARIABLES = [
  {
    group: 'Client — Smart',
    vars:  [
      'client_greeting',
      'client_full_name',
      'client_full_names',
      'client_last_name',
      'client2_full_name',
    ],
  },
  {
    group: 'Client — Fields',
    vars:  [
      'client_first_name', 'client_last_name', 'client_phone', 'client_email',
      'client2_first_name', 'client2_last_name', 'client2_phone', 'client2_email',
    ],
  },
  {
    group: 'Property',
    vars:  ['property_address', 'city', 'zip'],
  },
  {
    group: 'Price',
    vars:  ['list_price', 'purchase_price'],
  },
  {
    group: 'Listing Dates',
    vars:  ['listing_contract', 'listing_expiration', 'target_live'],
  },
  {
    group: 'Contract Dates',
    vars:  ['contract_acceptance', 'inspection_period_end', 'close_of_escrow'],
  },
  {
    group: 'Parties',
    vars:  ['lender_name', 'title_company', 'escrow_officer', 'tc_name', 'tc_email', 'agent_name'],
  },
]

// ─── Sortable task row ────────────────────────────────────────────────────────
function SortableRow({ task, onEdit, onDelete, bulkMode, isSelected, onToggle }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled: bulkMode })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={[
        isDragging  ? 'tt-row-dragging' : '',
        isSelected  ? 'tt-row-selected' : '',
      ].filter(Boolean).join(' ')}
    >
      {bulkMode ? (
        <td className="tt-check-cell">
          <input
            type="checkbox"
            className="tt-checkbox"
            checked={isSelected}
            onChange={() => onToggle(task.id)}
          />
        </td>
      ) : (
        <td className="tt-drag-cell" {...attributes} {...listeners}>⠿</td>
      )}
      <td className="tt-order-cell">{task.sort_order + 1}</td>
      <td className="tt-title-cell">{task.title}</td>
      <td className="tt-type-cell">
        <span className={`tt-type-badge tt-type--${task.task_type.toLowerCase()}`}>
          {task.task_type}
        </span>
      </td>
      <td className="tt-timing-cell">{formatTiming(task.timing_type, task.timing_days)}</td>
      <td className="tt-applies-cell">{task.applies_to}</td>
      <td className="tt-assign-cell">{task.auto_assign_to}</td>
      {!bulkMode && (
        <td className="tt-actions-cell">
          <button className="tt-row-btn" onClick={() => onEdit(task)} title="Edit">✏️</button>
          <button className="tt-row-btn tt-delete-btn" onClick={() => onDelete(task.id)} title="Delete">✕</button>
        </td>
      )}
    </tr>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TemplatesTab({ templates, allTemplateTasks, onRefresh, tcSettings = [] }) {
  // ── Sidebar section
  const [sideSection,        setSideSection]        = useState('tasks')

  // ── Task template state
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [editingTask,        setEditingTask]        = useState(null)
  const [saving,             setSaving]             = useState(false)

  // ── Task template export
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef(null)

  // ── Task template bulk edit
  const [bulkMode,      setBulkMode]      = useState(false)
  const [selectedIds,   setSelectedIds]   = useState(new Set())
  const [bulkAssignTo,  setBulkAssignTo]  = useState('')
  const [bulkTaskType,  setBulkTaskType]  = useState('')
  const [bulkAppliesTo, setBulkAppliesTo] = useState('')
  const [bulkSaving,    setBulkSaving]    = useState(false)

  // ── Email template state
  const [emailTemplates,  setEmailTemplates]  = useState([])
  const [emailsLoading,   setEmailsLoading]   = useState(false)
  const [editingEmail,    setEditingEmail]    = useState(null)  // null = nothing selected
  const [emailSaving,     setEmailSaving]     = useState(false)
  const [lastFocused,     setLastFocused]     = useState('body') // 'subject' | 'cc' | 'body'

  const subjectRef       = useRef(null)
  const ccRef            = useRef(null)
  const bodyRef          = useRef(null)
  const lastSyncedIdRef  = useRef(null)   // tracks which template's HTML is in the editor

  // Sync body HTML into the contentEditable only when the template changes —
  // never on every keystroke, which is what caused the cursor-jump bug.
  useEffect(() => {
    if (!bodyRef.current) return
    // Use <br> for line breaks instead of <div> wrappers — prevents cursor
    // jumping across block-element boundaries on delete.
    document.execCommand('defaultParagraphSeparator', false, 'br')
    const key = editingEmail?.id ?? 'new'
    if (key !== lastSyncedIdRef.current) {
      lastSyncedIdRef.current = key
      bodyRef.current.innerHTML = editingEmail?.body ?? ''
    }
  }, [editingEmail?.id])

  const sensors = useSensors(useSensor(PointerSensor))

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || null
  const taskRows = selectedTemplateId
    ? [...allTemplateTasks.filter(t => t.template_id === selectedTemplateId)]
        .sort((a, b) => a.sort_order - b.sort_order)
    : []

  // ── Load email templates when switching to email section
  useEffect(() => {
    if (sideSection !== 'email') return
    loadEmailTemplates()
  }, [sideSection])

  const loadEmailTemplates = async () => {
    setEmailsLoading(true)
    const { data } = await supabase
      .from('email_templates')
      .select('*')
      .order('created_at', { ascending: true })
    setEmailTemplates(data || [])
    setEmailsLoading(false)
  }

  // ── Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return
    const handler = (e) => { if (!exportRef.current?.contains(e.target)) setExportOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportOpen])

  // ── Reset task bulk state on template switch
  const selectTemplate = (id) => {
    setSelectedTemplateId(id)
    setEditingTask(null)
    setBulkMode(false)
    setSelectedIds(new Set())
  }

  // ── Switch sidebar section
  const switchSection = (section) => {
    setSideSection(section)
    if (section === 'tasks') {
      setEditingEmail(null)
    } else {
      setSelectedTemplateId(null)
      setEditingTask(null)
      setBulkMode(false)
    }
  }

  // ══════════════════════════════════════════════════════════════
  // TASK TEMPLATE HANDLERS (unchanged)
  // ══════════════════════════════════════════════════════════════

  const handleExportCSV = () => {
    setExportOpen(false)
    const headers = ['Order', 'Task Name', 'Task Type', 'Timing', 'Applies To', 'Auto-Assign To']
    const rows = taskRows.map((t, i) => [
      i + 1,
      `"${t.title.replace(/"/g, '""')}"`,
      t.task_type,
      `"${formatTiming(t.timing_type, t.timing_days)}"`,
      t.applies_to,
      t.auto_assign_to,
    ].join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${selectedTemplate.name.replace(/[^a-z0-9]/gi, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportPDF = () => {
    setExportOpen(false)
    const tblRows = taskRows.map((t, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${t.title.replace(/</g, '&lt;')}</td>
        <td>${t.task_type}</td>
        <td>${formatTiming(t.timing_type, t.timing_days)}</td>
        <td>${t.applies_to}</td>
        <td>${t.auto_assign_to}</td>
      </tr>`).join('')
    const html = `<!DOCTYPE html><html><head><title>${selectedTemplate.name}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 32px; color: #111; }
        h1   { font-size: 18px; margin: 0 0 4px; }
        .meta { font-size: 12px; color: #777; margin-bottom: 24px; text-transform: capitalize; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th    { text-align: left; padding: 7px 10px; border-bottom: 2px solid #111;
                font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: #555; }
        td    { padding: 8px 10px; border-bottom: 1px solid #e8e8e8; vertical-align: top; }
        tr:last-child td { border-bottom: none; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>${selectedTemplate.name}</h1>
      <div class="meta">${selectedTemplate.stage} &middot; ${selectedTemplate.rep_type || 'Both'} &middot; ${taskRows.length} tasks</div>
      <table>
        <thead><tr><th>#</th><th>Task Name</th><th>Type</th><th>Timing</th><th>Applies To</th><th>Auto-Assign To</th></tr></thead>
        <tbody>${tblRows}</tbody>
      </table></body></html>`
    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 300)
  }

  const enterBulkMode = () => {
    setBulkMode(true); setSelectedIds(new Set())
    setBulkAssignTo(''); setBulkTaskType(''); setBulkAppliesTo('')
  }
  const exitBulkMode = () => { setBulkMode(false); setSelectedIds(new Set()) }

  const toggleId = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === taskRows.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(taskRows.map(t => t.id)))
  }

  const handleBulkApply = async () => {
    if (selectedIds.size === 0) return
    const updates = {}
    if (bulkAssignTo)  updates.auto_assign_to = bulkAssignTo
    if (bulkTaskType)  updates.task_type       = bulkTaskType
    if (bulkAppliesTo) updates.applies_to      = bulkAppliesTo
    if (Object.keys(updates).length === 0) return
    setBulkSaving(true)
    try {
      await Promise.all([...selectedIds].map(id =>
        supabase.from('template_tasks').update(updates).eq('id', id)
      ))
      await onRefresh()
      exitBulkMode()
    } catch (err) {
      alert('Bulk update failed: ' + err.message)
    } finally { setBulkSaving(false) }
  }

  const handleCreateTemplate = async () => {
    const name = window.prompt('Template name:')
    if (!name?.trim()) return
    const stage = window.prompt('Stage (pending, closed, pre-listing, active-listing, buyer-broker):')
    if (!stage?.trim()) return
    const repTypeRaw = window.prompt('Rep type — enter Buyer, Seller, or leave blank for Both:')
    const repType = repTypeRaw?.trim() || null
    const { data, error } = await supabase
      .from('task_templates')
      .insert({ name: name.trim(), stage: stage.trim(), rep_type: repType, sort_order: templates.length + 1 })
      .select().single()
    if (error) { alert('Failed to create template: ' + error.message); return }
    await onRefresh()
    setSelectedTemplateId(data.id)
  }

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Delete this template and all its tasks?')) return
    await supabase.from('task_templates').delete().eq('id', id)
    await onRefresh()
    if (selectedTemplateId === id) setSelectedTemplateId(null)
  }

  const handleDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return
    const oldIdx = taskRows.findIndex(t => t.id === active.id)
    const newIdx = taskRows.findIndex(t => t.id === over.id)
    const reordered = arrayMove(taskRows, oldIdx, newIdx)
    await Promise.all(reordered.map((t, i) =>
      supabase.from('template_tasks').update({ sort_order: i }).eq('id', t.id)
    ))
    await onRefresh()
  }

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Delete this task from the template?')) return
    await supabase.from('template_tasks').delete().eq('id', taskId)
    await onRefresh()
  }

  const handleSaveTask = async () => {
    if (!editingTask.title?.trim()) return
    setSaving(true)
    try {
      if (editingTask.id) {
        const { id, created_at, template_id, sort_order, ...updates } = editingTask
        const { error } = await supabase.from('template_tasks').update(updates).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('template_tasks').insert({
          ...editingTask, sort_order: taskRows.length,
        })
        if (error) throw error
      }
      await onRefresh()
      setEditingTask(null)
    } catch (err) {
      alert('Failed to save task: ' + err.message)
    } finally { setSaving(false) }
  }

  // ══════════════════════════════════════════════════════════════
  // EMAIL TEMPLATE HANDLERS
  // ══════════════════════════════════════════════════════════════

  const selectEmail = (et) => {
    setEditingEmail({ ...et })
  }

  const newEmail = () => {
    setEditingEmail({ ...EMPTY_EMAIL })
  }

  const handleSaveEmail = async () => {
    if (!editingEmail.name?.trim()) { alert('Please enter a template name.'); return }
    // Read body directly from DOM — body editor is fully uncontrolled so state may be stale
    const currentBody = bodyRef.current?.innerHTML ?? editingEmail.body ?? ''
    setEmailSaving(true)
    try {
      if (editingEmail.id) {
        const { id, created_at, ...updates } = editingEmail
        const payload = { ...updates, body: currentBody }
        const { error } = await supabase.from('email_templates').update(payload).eq('id', id)
        if (error) throw error
        setEmailTemplates(prev => prev.map(e => e.id === id ? { ...e, ...payload } : e))
      } else {
        const { data, error } = await supabase
          .from('email_templates')
          .insert({
            name:       editingEmail.name.trim(),
            subject:    editingEmail.subject,
            body:       currentBody,
            cc:         editingEmail.cc || '',
            auto_send:  editingEmail.auto_send ?? false,
            trigger:    editingEmail.trigger,
            applies_to: editingEmail.applies_to,
          })
          .select().single()
        if (error) throw error
        setEmailTemplates(prev => [...prev, data])
        setEditingEmail(data)
      }
    } catch (err) {
      alert('Failed to save email template: ' + err.message)
    } finally { setEmailSaving(false) }
  }

  const handleDeleteEmail = async () => {
    if (!editingEmail?.id) return
    if (!window.confirm(`Delete "${editingEmail.name}"? This cannot be undone.`)) return
    const { error } = await supabase.from('email_templates').delete().eq('id', editingEmail.id)
    if (error) { alert('Failed to delete: ' + error.message); return }
    setEmailTemplates(prev => prev.filter(e => e.id !== editingEmail.id))
    setEditingEmail(null)
  }

  const handleDuplicateEmail = async () => {
    if (!editingEmail) return
    setEmailSaving(true)
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .insert({
          name:       `Copy of ${editingEmail.name || 'Template'}`,
          subject:    editingEmail.subject,
          body:       bodyRef.current?.innerHTML ?? editingEmail.body ?? '',
          trigger:    editingEmail.trigger,
          applies_to: editingEmail.applies_to,
        })
        .select().single()
      if (error) throw error
      setEmailTemplates(prev => [...prev, data])
      setEditingEmail(data)
    } catch (err) {
      alert('Failed to duplicate: ' + err.message)
    } finally { setEmailSaving(false) }
  }

  const setEmailField = (key, val) => {
    setEditingEmail(e => ({ ...e, [key]: val }))
  }

  // Insert variable at cursor in the last-focused field (subject, cc, or body)
  const insertVariable = (varName) => {
    const token = `{{${varName}}}`

    if (lastFocused === 'body') {
      // contentEditable — use Selection API; don't sync to state (read at save time)
      const el = bodyRef.current
      if (!el) return
      el.focus()
      const sel = window.getSelection()
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0)
        range.deleteContents()
        const node = document.createTextNode(token)
        range.insertNode(node)
        range.setStartAfter(node)
        range.setEndAfter(node)
        sel.removeAllRanges()
        sel.addRange(range)
      }
      return
    }

    // Subject / CC — plain textarea API
    const ref   = lastFocused === 'subject' ? subjectRef : ccRef
    const field = lastFocused === 'subject' ? 'subject'  : 'cc'
    const el = ref.current
    if (!el) return
    const start  = el.selectionStart ?? el.value.length
    const end    = el.selectionEnd   ?? el.value.length
    const newVal = el.value.substring(0, start) + token + el.value.substring(end)
    setEmailField(field, newVal)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    }, 0)
  }

  // Rich-text commands for the body toolbar
  // Body is fully uncontrolled — don't sync to state here, read from DOM at save time
  const execCmd = (cmd, value = null) => {
    bodyRef.current?.focus()
    document.execCommand(cmd, false, value)
  }


  const insertLink = () => {
    const url = window.prompt('Enter URL:', 'https://')
    if (!url?.trim()) return
    execCmd('createLink', url.trim())
  }

  // ── Computed
  const timingOption = TIMING_OPTIONS.find(o => o.value === editingTask?.timing_type)
  const allSelected  = taskRows.length > 0 && selectedIds.size === taskRows.length
  const someSelected = selectedIds.size > 0 && !allSelected
  const hasChanges   = bulkAssignTo || bulkTaskType || bulkAppliesTo

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="templates-tab">

      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────── */}
      <aside className="templates-sidebar">

        {/* Task Templates section */}
        <div
          className={`templates-sidebar-hdr${sideSection === 'tasks' ? ' active' : ''}`}
          onClick={() => switchSection('tasks')}
        >
          Task Templates
        </div>

        {sideSection === 'tasks' && (
          <>
            <div className="templates-list">
              {templates.map(t => (
                <div
                  key={t.id}
                  className={`templates-list-item${selectedTemplateId === t.id ? ' active' : ''}`}
                  onClick={() => selectTemplate(t.id)}
                >
                  <span className="templates-list-name">{t.name}</span>
                  <button
                    className="templates-list-del"
                    onClick={e => { e.stopPropagation(); handleDeleteTemplate(t.id) }}
                    title="Delete template"
                  >✕</button>
                </div>
              ))}
            </div>
            <button className="templates-create-btn" onClick={handleCreateTemplate}>
              + Create New Template
            </button>
          </>
        )}

        {/* Email Templates section */}
        <div
          className={`templates-sidebar-hdr${sideSection === 'email' ? ' active' : ''}`}
          onClick={() => switchSection('email')}
        >
          Email Templates
        </div>

        {sideSection === 'email' && (
          <>
            {emailsLoading ? (
              <div className="templates-coming-soon">Loading…</div>
            ) : (
              <div className="templates-list">
                {emailTemplates.map(et => (
                  <div
                    key={et.id}
                    className={`templates-list-item${editingEmail?.id === et.id ? ' active' : ''}`}
                    onClick={() => selectEmail(et)}
                  >
                    <span className="templates-list-name">{et.name || '(Untitled)'}</span>
                    <span className="et-list-badge">{et.applies_to}</span>
                  </div>
                ))}
                {emailTemplates.length === 0 && (
                  <div className="templates-coming-soon">No email templates yet</div>
                )}
              </div>
            )}
            <button className="templates-create-btn" onClick={newEmail}>
              + New Template
            </button>
          </>
        )}

      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────── */}
      <div className="templates-main">

        {/* ── EMAIL TEMPLATE SECTION ── */}
        {sideSection === 'email' ? (
          !editingEmail ? (
            <div className="templates-placeholder">
              Select a template from the sidebar or click + New Template
            </div>
          ) : (
            <div className="et-editor-wrap">

              {/* ── Editor (left) ── */}
              <div className="et-form">

                {/* Header row */}
                <div className="et-form-header">
                  <h2 className="et-form-heading">
                    {editingEmail.id ? editingEmail.name || '(Untitled)' : 'New Email Template'}
                  </h2>
                  <div className="et-form-header-actions">
                    {editingEmail.id && (
                      <>
                        <button
                          className="et-btn et-btn-outline"
                          onClick={handleDuplicateEmail}
                          disabled={emailSaving}
                          title="Duplicate"
                        >
                          Duplicate
                        </button>
                        <button
                          className="et-btn et-btn-danger"
                          onClick={handleDeleteEmail}
                          disabled={emailSaving}
                          title="Delete"
                        >
                          Delete
                        </button>
                      </>
                    )}
                    <button
                      className="et-btn et-btn-primary"
                      onClick={handleSaveEmail}
                      disabled={emailSaving || !editingEmail.name?.trim()}
                    >
                      {emailSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Form fields */}
                <div className="et-form-body">

                  <div className="et-field">
                    <label className="et-label">Template Name</label>
                    <input
                      className="et-input"
                      type="text"
                      placeholder="e.g. Listing Agreement Welcome"
                      value={editingEmail.name}
                      onChange={e => setEmailField('name', e.target.value)}
                    />
                    <span className="et-hint">Internal reference name — not visible to clients</span>
                  </div>

                  <div className="et-field">
                    <label className="et-label">Subject Line</label>
                    <input
                      ref={subjectRef}
                      className="et-input"
                      type="text"
                      placeholder="e.g. Your listing at {{property_address}} is live!"
                      value={editingEmail.subject}
                      onChange={e => setEmailField('subject', e.target.value)}
                      onFocus={() => setLastFocused('subject')}
                    />
                    <span className="et-hint">Supports variables — click any variable on the right to insert</span>
                  </div>

                  <div className="et-field">
                    <label className="et-label">CC</label>
                    <input
                      ref={ccRef}
                      className="et-input"
                      type="text"
                      placeholder="e.g. {{tc_email}}, coordinator@example.com"
                      value={editingEmail.cc}
                      onChange={e => setEmailField('cc', e.target.value)}
                      onFocus={() => setLastFocused('cc')}
                    />
                    <span className="et-hint">Comma-separated emails. Supports variables like <code>{'{{tc_email}}'}</code></span>
                  </div>

                  <div className="et-field">
                    <label className="et-label">Body</label>
                    <div className="et-richbody-wrap">
                      {/* Formatting toolbar */}
                      <div className="et-toolbar">
                        {[
                          { label: 'B',  cmd: 'bold',                title: 'Bold',           cls: 'et-tb-bold'   },
                          { label: 'I',  cmd: 'italic',              title: 'Italic',          cls: 'et-tb-italic' },
                          { label: 'U',  cmd: 'underline',           title: 'Underline',       cls: 'et-tb-under'  },
                        ].map(({ label, cmd, title, cls }) => (
                          <button
                            key={cmd}
                            type="button"
                            className={`et-toolbar-btn ${cls}`}
                            title={title}
                            onMouseDown={e => { e.preventDefault(); execCmd(cmd) }}
                          >{label}</button>
                        ))}
                        <span className="et-toolbar-sep" />
                        {[
                          { label: '• —', cmd: 'insertUnorderedList', title: 'Bullet list'    },
                          { label: '1. —', cmd: 'insertOrderedList',  title: 'Numbered list'  },
                        ].map(({ label, cmd, title }) => (
                          <button
                            key={cmd}
                            type="button"
                            className="et-toolbar-btn"
                            title={title}
                            onMouseDown={e => { e.preventDefault(); execCmd(cmd) }}
                          >{label}</button>
                        ))}
                        <span className="et-toolbar-sep" />
                        <button
                          type="button"
                          className="et-toolbar-btn"
                          title="Insert hyperlink"
                          onMouseDown={e => { e.preventDefault(); insertLink() }}
                        >🔗</button>
                      </div>

                      {/* contentEditable body — fully uncontrolled.
                          React never writes innerHTML here during typing.
                          Content is synced in only on template switch (useEffect above).
                          Body is read from DOM at save time via bodyRef.current.innerHTML.
                          onKeyDown routes Backspace/Delete through execCommand to prevent
                          the browser from losing the cursor position after DOM mutations. */}
                      <div
                        ref={bodyRef}
                        className="et-richbody"
                        contentEditable
                        suppressContentEditableWarning
                        onFocus={() => setLastFocused('body')}
                      />
                    </div>
                    <span className="et-hint">Select text then click a format button. Click variables on the right to insert them.</span>
                  </div>

                  <div className="et-field-row">
                    <div className="et-field">
                      <label className="et-label">Send Mode</label>
                      <div className="et-toggle-group">
                        <button
                          type="button"
                          className={`et-toggle-btn${!editingEmail.auto_send ? ' active' : ''}`}
                          onClick={() => setEmailField('auto_send', false)}
                        >Send Queue</button>
                        <button
                          type="button"
                          className={`et-toggle-btn${editingEmail.auto_send ? ' active' : ''}`}
                          onClick={() => setEmailField('auto_send', true)}
                        >Auto-Send</button>
                      </div>
                      <span className="et-hint">
                        {editingEmail.auto_send
                          ? 'Sends immediately when triggered by a task.'
                          : 'Held for review in the Send Queue before sending.'}
                      </span>
                    </div>
                    <div className="et-field">
                      <label className="et-label">Trigger</label>
                      <select
                        className="et-select"
                        value={editingEmail.trigger}
                        onChange={e => setEmailField('trigger', e.target.value)}
                      >
                        {TRIGGER_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="et-field">
                      <label className="et-label">Applies To</label>
                      <div className="et-toggle-group">
                        {EMAIL_APPLIES_TO.map(v => (
                          <button
                            key={v}
                            className={`et-toggle-btn${editingEmail.applies_to === v ? ' active' : ''}`}
                            onClick={() => setEmailField('applies_to', v)}
                            type="button"
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* ── Variables panel (right) ── */}
              <div className="et-vars">
                <div className="et-vars-title">Variables</div>
                <div className="et-vars-hint">
                  Click to insert at cursor in Subject or Body
                </div>
                <div className="et-vars-scroll">
                  {EMAIL_VARIABLES.map(group => (
                    <div key={group.group} className="et-vars-group">
                      <div className="et-vars-group-title">{group.group}</div>
                      <div className="et-vars-list">
                        {group.vars.map(v => (
                          <button
                            key={v}
                            className="et-var-chip"
                            type="button"
                            onClick={() => insertVariable(v)}
                            title={`Insert {{${v}}}`}
                          >
                            {`{{${v}}}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )
        ) : (
          /* ── TASK TEMPLATE SECTION ── */
          !selectedTemplate ? (
            <div className="templates-placeholder">
              Select a template from the sidebar to view and edit its tasks
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="templates-main-header">
                <div>
                  <h2 className="templates-main-title">{selectedTemplate.name}</h2>
                  <div className="templates-main-meta">
                    {selectedTemplate.stage} · {selectedTemplate.rep_type || 'Both'}
                    {' · '}{taskRows.length} task{taskRows.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="templates-header-actions">
                  <div className="tt-export-wrap" ref={exportRef}>
                    <button
                      className="tt-header-btn tt-export-btn"
                      onClick={() => setExportOpen(o => !o)}
                    >
                      Export ▾
                    </button>
                    {exportOpen && (
                      <div className="tt-export-menu">
                        <button className="tt-export-item" onClick={handleExportPDF}>Export as PDF</button>
                        <button className="tt-export-item" onClick={handleExportCSV}>Export as CSV</button>
                      </div>
                    )}
                  </div>
                  {bulkMode ? (
                    <button className="tt-header-btn tt-bulk-cancel-btn" onClick={exitBulkMode}>Cancel</button>
                  ) : (
                    <button className="tt-header-btn tt-bulk-btn" onClick={enterBulkMode}>Bulk Edit</button>
                  )}
                  {!bulkMode && (
                    <button
                      className="templates-add-task-btn"
                      onClick={() => setEditingTask({ ...EMPTY_TASK, template_id: selectedTemplateId })}
                    >
                      + Add Task
                    </button>
                  )}
                </div>
              </div>

              {/* Bulk action bar */}
              {bulkMode && (
                <div className="tt-bulk-bar">
                  <label className="tt-bulk-selectall">
                    <input
                      type="checkbox"
                      className="tt-checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected }}
                      onChange={toggleAll}
                    />
                    <span>
                      {selectedIds.size === 0
                        ? 'Select all'
                        : `${selectedIds.size} of ${taskRows.length} selected`}
                    </span>
                  </label>
                  <div className="tt-bulk-fields">
                    <select className="tt-bulk-select" value={bulkAssignTo} onChange={e => setBulkAssignTo(e.target.value)}>
                      <option value="">Auto-Assign To…</option>
                      {TC_ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <select className="tt-bulk-select" value={bulkTaskType} onChange={e => setBulkTaskType(e.target.value)}>
                      <option value="">Task Type…</option>
                      {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select className="tt-bulk-select" value={bulkAppliesTo} onChange={e => setBulkAppliesTo(e.target.value)}>
                      <option value="">Applies To…</option>
                      {APPLIES_TO.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <button
                      className="tt-bulk-apply-btn"
                      onClick={handleBulkApply}
                      disabled={bulkSaving || selectedIds.size === 0 || !hasChanges}
                    >
                      {bulkSaving ? 'Applying…' : 'Apply'}
                    </button>
                  </div>
                </div>
              )}

              {/* Task table */}
              <div className="templates-table-wrap">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={taskRows.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    <table className="templates-table">
                      <thead>
                        <tr>
                          <th className={bulkMode ? 'tt-check-cell' : 'tt-drag-cell'}></th>
                          <th className="tt-order-cell">#</th>
                          <th>Task Name</th>
                          <th className="tt-type-cell">Type</th>
                          <th className="tt-timing-cell">Timing</th>
                          <th className="tt-applies-cell">Applies To</th>
                          <th className="tt-assign-cell">Auto-Assign To</th>
                          {!bulkMode && <th className="tt-actions-cell">Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {taskRows.map(task => (
                          <SortableRow
                            key={task.id}
                            task={task}
                            onEdit={t => setEditingTask({ ...t })}
                            onDelete={handleDeleteTask}
                            bulkMode={bulkMode}
                            isSelected={selectedIds.has(task.id)}
                            onToggle={toggleId}
                          />
                        ))}
                        {taskRows.length === 0 && (
                          <tr>
                            <td colSpan={bulkMode ? 7 : 8} className="tt-empty-row">
                              No tasks yet — click + Add Task to get started
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </SortableContext>
                </DndContext>
              </div>
            </>
          )
        )}
      </div>

      {/* ── TASK EDIT MODAL ───────────────────────────────────────────── */}
      {editingTask && (
        <div
          className="tt-modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) setEditingTask(null) }}
        >
          <div className="tt-modal">
            <div className="tt-modal-header">
              <h3>{editingTask.id ? 'Edit Task' : 'New Task'}</h3>
              <button className="tt-modal-close" onClick={() => setEditingTask(null)}>✕</button>
            </div>
            <div className="tt-modal-body">
              <label className="tt-modal-label">Task Name</label>
              <input
                className="tt-modal-input"
                value={editingTask.title}
                onChange={e => setEditingTask(p => ({ ...p, title: e.target.value }))}
                placeholder="Task name"
                autoFocus
              />
              <label className="tt-modal-label">Task Type</label>
              <select
                className="tt-modal-select"
                value={editingTask.task_type}
                onChange={e => setEditingTask(p => ({ ...p, task_type: e.target.value }))}
              >
                {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <label className="tt-modal-label">Timing</label>
              <div className="tt-timing-row">
                {timingOption?.hasDays && (
                  <input
                    type="number"
                    className="tt-days-input"
                    min={0}
                    value={editingTask.timing_days ?? 0}
                    onChange={e => setEditingTask(p => ({ ...p, timing_days: Number(e.target.value) }))}
                  />
                )}
                <select
                  className={`tt-modal-select tt-timing-select${timingOption?.hasDays ? ' has-days' : ''}`}
                  value={editingTask.timing_type}
                  onChange={e => setEditingTask(p => ({ ...p, timing_type: e.target.value, timing_days: 0 }))}
                >
                  {TIMING_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <label className="tt-modal-label">Applies To</label>
              <select
                className="tt-modal-select"
                value={editingTask.applies_to}
                onChange={e => setEditingTask(p => ({ ...p, applies_to: e.target.value }))}
              >
                {APPLIES_TO.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <label className="tt-modal-label">Auto-Assign To</label>
              <select
                className="tt-modal-select"
                value={editingTask.auto_assign_to}
                onChange={e => setEditingTask(p => ({ ...p, auto_assign_to: e.target.value }))}
              >
                {TC_ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="tt-modal-actions">
              <button className="tt-modal-cancel" onClick={() => setEditingTask(null)}>Cancel</button>
              <button
                className="tt-modal-save"
                onClick={handleSaveTask}
                disabled={saving || !editingTask.title?.trim()}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
