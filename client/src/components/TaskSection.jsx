import { useState, useRef, useEffect } from 'react'
import { TC_ASSIGNEES } from '../lib/taskTemplates'
import { mouseDownIsInside } from '../lib/dragGuard'
import DateInput from './DateInput'
import './TaskSection.css'

function fmtDue(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function dueCls(dateStr) {
  if (!dateStr) return 'due-none'
  const today = new Date(); today.setHours(0,0,0,0)
  const due   = new Date(dateStr + 'T00:00:00')
  const diff  = Math.ceil((due - today) / 86400000)
  if (diff < 0)  return 'due-overdue'
  if (diff === 0) return 'due-today'
  if (diff <= 3)  return 'due-soon'
  return 'due-ok'
}

const EMPTY = { title: '', due_date: '', assigned_to: 'Me', notes: '' }

export default function TaskSection({ tasks = [], transactionId, onAdd, onUpdate, onDelete }) {
  const [adding, setAdding]         = useState(false)
  const [newTask, setNewTask]       = useState({ ...EMPTY })
  const [expanded, setExpanded]     = useState(new Set())
  const [editingNotes, setEditNotes] = useState(null)
  const titleRef = useRef(null)

  useEffect(() => { if (adding) titleRef.current?.focus() }, [adding])

  const dueDateTasks   = [...tasks.filter(t => t.task_type === 'Due Date')].sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return a.due_date.localeCompare(b.due_date)
  })
  const regularTasks   = tasks.filter(t => t.task_type !== 'Due Date')
  const open = [...regularTasks.filter(t => t.status === 'open')].sort((a, b) => a.sort_order - b.sort_order)
  const done = [...regularTasks.filter(t => t.status === 'complete')].sort((a, b) => a.sort_order - b.sort_order)

  const handleAdd = () => {
    if (!newTask.title.trim()) return
    onAdd({ ...newTask, transaction_id: transactionId })
    setNewTask({ ...EMPTY })
    setAdding(false)
  }

  const toggleDone = (task) =>
    onUpdate(task.id, { status: task.status === 'complete' ? 'open' : 'complete' })

  const toggleExpand = (id) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  return (
    <div className="task-section">
      <div className="ts-header">
        <span className="ts-title">TASKS</span>
        <span className="ts-counts">
          {open.length > 0 && <span className="ts-count-open">{open.length} open</span>}
          {done.length > 0 && <span className="ts-count-done">{done.length} done</span>}
        </span>
        <button className="ts-add-btn" onClick={() => setAdding(true)}>+ Add</button>
      </div>

      {adding && (
        <div className="ts-add-form">
          <input
            ref={titleRef}
            className="ts-input"
            placeholder="Task title"
            value={newTask.title}
            onChange={e => setNewTask(f => ({ ...f, title: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
          />
          <div className="ts-add-row">
            <DateInput className="ts-input ts-date" value={newTask.due_date}
              onChange={e => setNewTask(f => ({ ...f, due_date: e.target.value }))} />
            <select className="ts-input ts-select" value={newTask.assigned_to}
              onChange={e => setNewTask(f => ({ ...f, assigned_to: e.target.value }))}>
              {TC_ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button className="ts-btn-save" onClick={handleAdd}>Add</button>
            <button className="ts-btn-cancel" onClick={() => setAdding(false)}>✕</button>
          </div>
          <textarea className="ts-input ts-notes-input" rows={2}
            placeholder="Notes — type @Justina or @Victoria to notify"
            value={newTask.notes}
            onChange={e => setNewTask(f => ({ ...f, notes: e.target.value }))} />
        </div>
      )}

      <div className="ts-list">
        {open.map(t => (
          <TaskRow key={t.id} task={t}
            isExpanded={expanded.has(t.id)} isEditingNotes={editingNotes === t.id}
            onToggle={() => toggleDone(t)} onToggleExpand={() => toggleExpand(t.id)}
            onUpdate={(field, val) => onUpdate(t.id, { [field]: val })}
            onDelete={() => onDelete(t.id)}
            onStartEditNotes={() => setEditNotes(t.id)}
            onStopEditNotes={() => setEditNotes(null)} />
        ))}

        {done.length > 0 && (
          <>
            {open.length > 0 && <div className="ts-divider" />}
            {done.map(t => (
              <TaskRow key={t.id} task={t} isDone
                isExpanded={expanded.has(t.id)} isEditingNotes={editingNotes === t.id}
                onToggle={() => toggleDone(t)} onToggleExpand={() => toggleExpand(t.id)}
                onUpdate={(field, val) => onUpdate(t.id, { [field]: val })}
                onDelete={() => onDelete(t.id)}
                onStartEditNotes={() => setEditNotes(t.id)}
                onStopEditNotes={() => setEditNotes(null)} />
            ))}
          </>
        )}

        {regularTasks.length === 0 && dueDateTasks.length === 0 && !adding && (
          <div className="ts-empty">No tasks — click + Add to create one</div>
        )}
      </div>

      {/* ── Key Dates section ── */}
      {dueDateTasks.length > 0 && (
        <div className="ts-key-dates">
          <div className="ts-key-dates-hdr">KEY DATES</div>
          {dueDateTasks.map(t => (
            <DueDateRow
              key={t.id}
              task={t}
              onUpdate={(field, val) => onUpdate(t.id, { [field]: val })}
              onDelete={() => onDelete(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DueDateRow({ task, onUpdate, onDelete }) {
  const [editTitle, setEditTitle]   = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)
  const [editDate, setEditDate]     = useState(false)
  const dc = dueCls(task.due_date)

  const saveTitle = (e) => {
    if (e?.type === 'blur' && mouseDownIsInside(e.currentTarget)) return
    if (titleDraft.trim() && titleDraft !== task.title) onUpdate('title', titleDraft.trim())
    else setTitleDraft(task.title)
    setEditTitle(false)
  }

  return (
    <div className="ts-row ts-row--due-date">
      <div className="ts-row-main">
        <span className="ts-cal-icon" title="Key date">📅</span>
        <div className="ts-row-body">
          {editTitle
            ? <input className="ts-title-input" value={titleDraft} autoFocus
                onChange={e => setTitleDraft(e.target.value)} onBlur={saveTitle}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitleDraft(task.title); setEditTitle(false) } }} />
            : <span className="ts-row-title" onClick={() => setEditTitle(true)}>{task.title}</span>
          }
          <div className="ts-meta">
            {editDate
              ? <DateInput className="ts-meta-input" value={task.due_date || ''} autoFocus
                  onChange={e => onUpdate('due_date', e.target.value)} onBlur={() => setEditDate(false)} />
              : <span className={`ts-due ts-${dc}`} onClick={() => setEditDate(true)}>
                  {task.due_date ? fmtDue(task.due_date) : '+ date'}
                </span>
            }
          </div>
        </div>
        <div className="ts-row-actions">
          <button className="ts-del" onClick={onDelete} title="Delete">✕</button>
        </div>
      </div>
    </div>
  )
}

function TaskRow({ task, isDone, isExpanded, isEditingNotes, onToggle, onToggleExpand, onUpdate, onDelete, onStartEditNotes, onStopEditNotes }) {
  const [editTitle, setEditTitle]     = useState(false)
  const [titleDraft, setTitleDraft]   = useState(task.title)
  const [notesDraft, setNotesDraft]   = useState(task.notes || '')
  const [editDate, setEditDate]       = useState(false)
  const [editAssign, setEditAssign]   = useState(false)
  const dc = dueCls(task.due_date)

  const saveTitle = (e) => {
    if (e?.type === 'blur' && mouseDownIsInside(e.currentTarget)) return
    if (titleDraft.trim() && titleDraft !== task.title) onUpdate('title', titleDraft.trim())
    else setTitleDraft(task.title)
    setEditTitle(false)
  }

  const saveNotes = (e) => {
    if (e?.type === 'blur' && mouseDownIsInside(e.currentTarget)) return
    if (notesDraft !== (task.notes || '')) onUpdate('notes', notesDraft)
    onStopEditNotes()
  }

  return (
    <div className={`ts-row${isDone ? ' ts-row-done' : ''}`}>
      <div className="ts-row-main">
        <button className={`ts-check${isDone ? ' ts-checked' : ''}`} onClick={onToggle}>
          {isDone ? '✓' : ''}
        </button>

        <div className="ts-row-body">
          {editTitle
            ? <input className="ts-title-input" value={titleDraft} autoFocus
                onChange={e => setTitleDraft(e.target.value)} onBlur={saveTitle}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitleDraft(task.title); setEditTitle(false) } }} />
            : <span className={`ts-row-title${isDone ? ' ts-title-done' : ''}`}
                onClick={() => !isDone && setEditTitle(true)}>{task.title}</span>
          }

          <div className="ts-meta">
            {editDate
              ? <DateInput className="ts-meta-input" value={task.due_date || ''} autoFocus
                  onChange={e => onUpdate('due_date', e.target.value)} onBlur={() => setEditDate(false)} />
              : <span className={`ts-due ts-${dc}`} onClick={() => setEditDate(true)}>
                  {task.due_date ? fmtDue(task.due_date) : '+ date'}
                </span>
            }
            {editAssign
              ? <select className="ts-meta-input" value={task.assigned_to} autoFocus
                  onChange={e => { onUpdate('assigned_to', e.target.value); setEditAssign(false) }}
                  onBlur={() => setEditAssign(false)}>
                  {TC_ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              : <span className="ts-assignee" onClick={() => setEditAssign(true)}>
                  {task.assigned_to === 'Me' ? 'Me' : task.assigned_to.split(' ')[0]}
                </span>
            }
          </div>
        </div>

        <div className="ts-row-actions">
          <button className={`ts-notes-toggle${task.notes ? ' has-notes' : ''}`} onClick={onToggleExpand} title="Notes">
            {isExpanded ? '▲' : '▼'}
          </button>
          <button className="ts-del" onClick={onDelete} title="Delete">✕</button>
        </div>
      </div>

      {isExpanded && (
        <div className="ts-notes-wrap">
          {isEditingNotes
            ? <textarea className="ts-notes-area" rows={3} autoFocus value={notesDraft}
                placeholder="Notes — type @Justina or @Victoria to notify"
                onChange={e => setNotesDraft(e.target.value)} onBlur={saveNotes} />
            : <div className="ts-notes-text"
                onClick={() => { setNotesDraft(task.notes || ''); onStartEditNotes() }}>
                {task.notes || <span className="ts-notes-ph">Add notes... (@Justina, @Victoria)</span>}
              </div>
          }
        </div>
      )}
    </div>
  )
}
