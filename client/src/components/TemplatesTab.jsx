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

const TIMING_OPTIONS = [
  { value: 'at_stage_change',             label: 'At stage change',                                hasDays: false },
  { value: 'days_after_contract',         label: 'days after Contract Acceptance',                 hasDays: true  },
  { value: 'days_before_coe',             label: 'days before Close of Escrow',                    hasDays: true  },
  { value: 'days_after_coe',              label: 'days after Close of Escrow',                     hasDays: true  },
  { value: 'days_after_listing_contract', label: 'days after Listing Contract',                    hasDays: true  },
  { value: 'days_after_bba',             label: 'days after BBA Contract',                        hasDays: true  },
  { value: 'days_before_ipe',             label: 'days before Inspection Period End / BINSR Due',  hasDays: true  },
  { value: 'days_after_ipe',              label: 'days after Inspection Period End / BINSR Due',   hasDays: true  },
  { value: 'days_after_binsr',            label: 'days after BINSR Submitted',                     hasDays: true  },
  { value: 'specific_date',               label: 'Specific date (manual)',                         hasDays: false },
]

const TASK_TYPES = ['Task', 'Email', 'Notification']
const APPLIES_TO = ['Buyer', 'Seller', 'Both']

function formatTiming(timingType, timingDays) {
  if (timingType === 'at_stage_change') return 'At stage change'
  if (timingType === 'specific_date')   return 'Specific date'
  const opt = TIMING_OPTIONS.find(o => o.value === timingType)
  if (!opt) return timingType
  const d = Number(timingDays) || 0
  if (timingType === 'days_before_ipe' && d === 0) return 'At Inspection Period End'
  return `${d} ${opt.label}`
}

const EMPTY_TASK = {
  title:          '',
  task_type:      'Task',
  timing_type:    'at_stage_change',
  timing_days:    0,
  applies_to:     'Both',
  auto_assign_to: 'Me',
}

// ── Sortable row (normal + bulk mode) ────────────────────────────────────────
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

// ── Main component ────────────────────────────────────────────────────────────
export default function TemplatesTab({ templates, allTemplateTasks, onRefresh }) {
  const [sideSection,        setSideSection]        = useState('tasks')
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [editingTask,        setEditingTask]        = useState(null)
  const [saving,             setSaving]             = useState(false)

  // Export dropdown
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef(null)

  // Bulk edit
  const [bulkMode,      setBulkMode]      = useState(false)
  const [selectedIds,   setSelectedIds]   = useState(new Set())
  const [bulkAssignTo,  setBulkAssignTo]  = useState('')
  const [bulkTaskType,  setBulkTaskType]  = useState('')
  const [bulkAppliesTo, setBulkAppliesTo] = useState('')
  const [bulkSaving,    setBulkSaving]    = useState(false)

  const sensors = useSensors(useSensor(PointerSensor))

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || null
  const taskRows = selectedTemplateId
    ? [...allTemplateTasks.filter(t => t.template_id === selectedTemplateId)]
        .sort((a, b) => a.sort_order - b.sort_order)
    : []

  // Close export dropdown when clicking outside
  useEffect(() => {
    if (!exportOpen) return
    const handler = (e) => { if (!exportRef.current?.contains(e.target)) setExportOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportOpen])

  // Reset bulk state when template changes
  const selectTemplate = (id) => {
    setSelectedTemplateId(id)
    setEditingTask(null)
    setBulkMode(false)
    setSelectedIds(new Set())
  }

  // ── Export ──────────────────────────────────────────────────────────────────
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

  // ── Bulk edit ───────────────────────────────────────────────────────────────
  const enterBulkMode = () => {
    setBulkMode(true)
    setSelectedIds(new Set())
    setBulkAssignTo('')
    setBulkTaskType('')
    setBulkAppliesTo('')
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

  const toggleAll = () => {
    if (selectedIds.size === taskRows.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(taskRows.map(t => t.id)))
    }
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
    } finally {
      setBulkSaving(false)
    }
  }

  // ── Template CRUD ───────────────────────────────────────────────────────────
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

  // ── Task CRUD ───────────────────────────────────────────────────────────────
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
          ...editingTask,
          sort_order: taskRows.length,
        })
        if (error) throw error
      }
      await onRefresh()
      setEditingTask(null)
    } catch (err) {
      alert('Failed to save task: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const timingOption = TIMING_OPTIONS.find(o => o.value === editingTask?.timing_type)
  const allSelected  = taskRows.length > 0 && selectedIds.size === taskRows.length
  const someSelected = selectedIds.size > 0 && !allSelected
  const hasChanges   = bulkAssignTo || bulkTaskType || bulkAppliesTo

  return (
    <div className="templates-tab">

      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────── */}
      <aside className="templates-sidebar">
        <div
          className={`templates-sidebar-hdr${sideSection === 'tasks' ? ' active' : ''}`}
          onClick={() => setSideSection('tasks')}
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

        <div
          className={`templates-sidebar-hdr${sideSection === 'email' ? ' active' : ''}`}
          onClick={() => setSideSection('email')}
        >
          Email Templates
        </div>

        {sideSection === 'email' && (
          <div className="templates-coming-soon">Coming soon</div>
        )}
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────── */}
      <div className="templates-main">
        {!selectedTemplate ? (
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
                {/* Export dropdown */}
                <div className="tt-export-wrap" ref={exportRef}>
                  <button
                    className="tt-header-btn tt-export-btn"
                    onClick={() => setExportOpen(o => !o)}
                  >
                    Export ▾
                  </button>
                  {exportOpen && (
                    <div className="tt-export-menu">
                      <button className="tt-export-item" onClick={handleExportPDF}>
                        Export as PDF
                      </button>
                      <button className="tt-export-item" onClick={handleExportCSV}>
                        Export as CSV
                      </button>
                    </div>
                  )}
                </div>

                {/* Bulk edit toggle */}
                {bulkMode ? (
                  <button className="tt-header-btn tt-bulk-cancel-btn" onClick={exitBulkMode}>
                    Cancel
                  </button>
                ) : (
                  <button className="tt-header-btn tt-bulk-btn" onClick={enterBulkMode}>
                    Bulk Edit
                  </button>
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
                  <select
                    className="tt-bulk-select"
                    value={bulkAssignTo}
                    onChange={e => setBulkAssignTo(e.target.value)}
                  >
                    <option value="">Auto-Assign To…</option>
                    {TC_ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>

                  <select
                    className="tt-bulk-select"
                    value={bulkTaskType}
                    onChange={e => setBulkTaskType(e.target.value)}
                  >
                    <option value="">Task Type…</option>
                    {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>

                  <select
                    className="tt-bulk-select"
                    value={bulkAppliesTo}
                    onChange={e => setBulkAppliesTo(e.target.value)}
                  >
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
        )}
      </div>

      {/* ── EDIT MODAL ───────────────────────────────────────────────── */}
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
