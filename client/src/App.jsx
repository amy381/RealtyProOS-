import { useState, useEffect, useRef, useCallback } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { supabase } from './lib/supabase'
import { syncDriveFolder } from './lib/googleDrive'
import { buildTemplateTasks, buildTemplateTasksFromDB, getTemplateKey } from './lib/taskTemplates'
import { sendMentionNotifications, parseMentions } from './lib/emailNotify'
import KanbanBoard from './components/KanbanBoard'
import ListView from './components/ListView'
import GoalsDashboard from './components/GoalsDashboard'
import TransactionDetailPage from './components/TransactionDetailPage'
import CommissionsTab from './components/CommissionsTab'
import TasksTab from './components/TasksTab'
import CollaboratorsTab from './components/CollaboratorsTab'
import NewTransactionPopup from './components/NewTransactionPopup'
import SettingsModal from './components/SettingsModal'
import LoginPage from './components/LoginPage'
import TemplatesTab from './components/TemplatesTab'
import ShowingsTab  from './components/ShowingsTab'
import MeshBackground from './components/MeshBackground'
import Sidebar from './components/Sidebar'
import MissionControl from './components/MissionControl'
import AppHeader from './components/AppHeader'
import './App.css'
import './styles/darkTheme.css'

const ALLOWED_EMAILS = (import.meta.env.VITE_ALLOWED_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

const STAGE_ORDER = ['pre-listing', 'buyer-broker', 'active-listing', 'pending', 'closed', 'cancelled-expired']
const DEFAULT_BOARD_FILTERS = { year: '2026', tcs: [], repType: 'All' }
const TC_OPTIONS = ['Amy Casanova', 'Justina Morris', 'Victoria Lareau']

function stageName(s) {
  return { 'pre-listing': 'Pre-Listing', 'buyer-broker': 'Buyer-Broker', 'active-listing': 'Active Listing',
           'pending': 'Pending', 'closed': 'Closed', 'cancelled-expired': 'Cancelled/Expired' }[s] || s
}

function parsePrice(val) {
  if (val === null || val === undefined || val === '') return null
  const n = Number(String(val).replace(/[^0-9.]/g, ''))
  return isNaN(n) || n === 0 ? null : n
}

// Convert empty strings to null so PostgreSQL date/numeric columns don't reject the insert
function sanitizeForDB(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === '' ? null : v
  }
  return out
}

const COLUMNS = [
  { id: 'pre-listing',       label: 'Pre-Listing',          color: '#888888', bgColor: 'transparent', priceLabel: 'List Price',     viewMode: 'list'   },
  { id: 'buyer-broker',      label: 'Buyer-Broker',         color: '#666666', bgColor: 'transparent', priceLabel: 'Purchase Price', viewMode: 'list'   },
  { id: 'active-listing',    label: 'Active Listing',       color: '#555555', bgColor: 'transparent', priceLabel: 'List Price',     viewMode: 'medium' },
  { id: 'pending',           label: 'Pending',              color: '#333333', bgColor: 'transparent', priceLabel: 'Purchase Price', viewMode: 'wide'   },
  { id: 'closed',            label: 'Closed',               color: '#444444', bgColor: 'transparent', priceLabel: 'Purchase Price', viewMode: 'narrow' },
]

export default function App() {
  const [session, setSession]                   = useState(undefined) // undefined = loading
  const [accessDenied, setAccessDenied]         = useState(false)
  const [transactions, setTransactions]         = useState([])
  const [commissions, setCommissions]           = useState({})
  const [tasks, setTasks]                       = useState([])
  const [tcSettings, setTcSettings]             = useState([])
  const [userSettings, setUserSettings]         = useState({}) // keyed by email
  const [dbTemplates,      setDbTemplates]      = useState([])
  const [dbTemplateTasks,  setDbTemplateTasks]  = useState([])
  const [taskComments,     setTaskComments]     = useState([])
  const [backMoveModal,    setBackMoveModal]    = useState(null)
  const [loading, setLoading]                   = useState(true)
  const [newTxOpen, setNewTxOpen]               = useState(false)
  const [newTxPrefill, setNewTxPrefill]         = useState(null)
  const [settingsOpen, setSettingsOpen]         = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [selectedSection,     setSelectedSection]     = useState('details')
  const [txOpenRevision,      setTxOpenRevision]      = useState(0)
  const [txFrom,              setTxFrom]              = useState('board')
  const [activeTab,  setActiveTab]  = useState(() => {
    const p = new URLSearchParams(window.location.search)
    const VALID_TABS = ['dashboard','board','tasks','commissions','collaborators','templates','showings','reporting']
    const t = p.get('tab')
    return VALID_TABS.includes(t) ? t : 'board'
  })
  const [boardView,           setBoardView]           = useState(() => localStorage.getItem('boardView') || 'board')
  const [collaboratorFilter, setCollaboratorFilter]  = useState('title-escrow')
  const [templatesFilter,    setTemplatesFilter]     = useState('task-templates')
  const [tasksFilter,        setTasksFilter]         = useState('tasks')
  const [boardFilters,        setBoardFilters]        = useState(DEFAULT_BOARD_FILTERS)
  const [boardFilterOpen,     setBoardFilterOpen]     = useState(false)
  const boardFilterRef = useRef(null)

  const commissionsRef = useRef({})
  const saveTimers     = useRef({})

  const switchBoardView = (v) => { setBoardView(v); localStorage.setItem('boardView', v) }

  // ── Auth ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      const email = s?.user?.email?.toLowerCase() || ''
      if (s && ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(email)) {
        setAccessDenied(true)
        setSession(null)
      } else {
        setSession(s)
        setAccessDenied(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      const email = s?.user?.email?.toLowerCase() || ''
      if (s && ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(email)) {
        setAccessDenied(true)
        setSession(null)
      } else {
        setSession(s)
        setAccessDenied(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const openTransaction = (tx, section = 'details', from = 'board') => {
    setSelectedSection(section)
    setSelectedTransaction(tx)
    setTxOpenRevision(r => r + 1)
    setTxFrom(from)
    window.history.pushState({}, '', `?tab=${activeTab}&tx=${tx.id}&from=${from}`)
  }

  // Show a toast when returning from Google OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('drive_connected') === '1') {
      toast.success('Google Drive connected!')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Open New Transaction popup pre-filled when launched from FUB widget
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('newTransaction') === 'true') {
      const fubContactId = params.get('fubContactId')
      const name         = params.get('name') || ''
      const email        = params.get('email') || ''
      const [firstName, ...rest] = name.trim().split(' ')
      setNewTxPrefill({
        fubContactId: fubContactId ? Number(fubContactId) : null,
        first_name:   firstName || '',
        last_name:    rest.join(' '),
        email,
      })
      setNewTxOpen(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Close board filter panel on outside click
  useEffect(() => {
    if (!boardFilterOpen) return
    const handler = (e) => { if (!boardFilterRef.current?.contains(e.target)) setBoardFilterOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [boardFilterOpen])

  // Apply a partial update to a transaction in local state (used by Drive callbacks)
  const handleTransactionUpdate = useCallback((transactionId, updates) => {
    setTransactions(prev => prev.map(t => t.id === transactionId ? { ...t, ...updates } : t))
    setSelectedTransaction(prev => prev?.id === transactionId ? { ...prev, ...updates } : prev)
  }, [])

  // ── Load all data ───────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      // Core tables — fatal if these fail
      const [
        { data: txData, error: txErr },
        { data: cmData, error: cmErr },
      ] = await Promise.all([
        supabase.from('transactions').select('*').order('created_at', { ascending: false }),
        supabase.from('commissions').select('*'),
      ])

      if (txErr || cmErr) {
        toast.error('Failed to load data — check your Supabase credentials')
        console.error(txErr || cmErr)
        setLoading(false)
        return
      }

      setTransactions(txData || [])

      const cmMap = {}
      for (const cm of (cmData || [])) cmMap[cm.transaction_id] = cm
      setCommissions(cmMap)
      commissionsRef.current = cmMap

      // Optional tables — gracefully degrade if not created yet
      const [
        { data: tkData, error: tkErr },
        { data: tcData, error: tcErr },
        { data: tplData },
        { data: tplTaskData },
        { data: tcmData },
      ] = await Promise.all([
        supabase.from('tasks').select('*').order('sort_order', { ascending: true }),
        supabase.from('tc_settings').select('*'),
        supabase.from('task_templates').select('*').order('sort_order', { ascending: true }),
        supabase.from('template_tasks').select('*').order('sort_order', { ascending: true }),
        supabase.from('task_comments').select('*').order('created_at', { ascending: true }),
      ])

      setDbTemplates(tplData || [])
      setDbTemplateTasks(tplTaskData || [])
      setTaskComments(tcmData || [])

      if (tkErr) {
        console.warn('tasks table not found — run the new SQL in Supabase to enable tasks:', tkErr.message)
      } else {
        setTasks(tkData || [])
      }

      if (tcErr) {
        console.warn('tc_settings table not found — run the new SQL in Supabase to enable settings:', tcErr.message)
        setTcSettings([
          { name: 'Amy Casanova', email: '' },
          { name: 'Justina Morris', email: '' },
          { name: 'Victoria Lareau', email: '' },
        ])
      } else {
        const tcs = tcData || []
        if (tcs.length === 0) {
          const defaults = [
            { name: 'Amy Casanova', email: '' },
            { name: 'Justina Morris', email: '' },
            { name: 'Victoria Lareau', email: '' },
          ]
          const { data: seeded } = await supabase.from('tc_settings').insert(defaults).select()
          setTcSettings(seeded || defaults)
        } else {
          setTcSettings(tcs)
        }
      }

      // Load digest preferences (keyed by email)
      const { data: usData } = await supabase
        .from('user_settings')
        .select('email, daily_digest_enabled')
      if (usData) {
        const map = {}
        for (const row of usData) map[row.email] = row
        setUserSettings(map)
      }

      setLoading(false)

      // Restore open transaction from URL on refresh
      const params = new URLSearchParams(window.location.search)
      const txId   = params.get('tx')
      const from   = params.get('from') || 'board'
      if (txId && txData) {
        const tx = txData.find(t => t.id === txId)
        if (tx) {
          setSelectedSection('details')
          setSelectedTransaction(tx)
          setTxOpenRevision(r => r + 1)
          setTxFrom(from)
        }
      }
    }
    load()
  }, [])

  // ── New transaction ─────────────────────────────────────────────────────────
  const handleCreateTransaction = async (txData) => {
    try {
      const { data: newTx, error: txErr } = await supabase
        .from('transactions')
        .insert(txData)
        .select().single()
      if (txErr) throw txErr

      const { data: newCm, error: cmErr } = await supabase
        .from('commissions')
        .insert({ transaction_id: newTx.id, commission_status: 'Pending' })
        .select().single()
      if (cmErr) console.warn('[create] commission insert failed:', cmErr.message)

      setTransactions(prev => [newTx, ...prev])
      if (newCm) {
        setCommissions(prev => {
          const next = { ...prev, [newTx.id]: newCm }
          commissionsRef.current = next
          return next
        })
      }

      setNewTxOpen(false)
      setSelectedTransaction(newTx)
    } catch (err) {
      toast.error('Failed to create transaction')
      console.error('[create]', err)
    }
  }

  // ── Status change (drag-drop or detail page Stage dropdown) ────────────────
  const handleStatusChange = async (transactionId, newStatus) => {
    const transaction = transactions.find(t => t.id === transactionId)

    setTransactions(prev =>
      prev.map(t => t.id === transactionId ? { ...t, status: newStatus } : t)
    )
    if (selectedTransaction?.id === transactionId) {
      setSelectedTransaction(prev => ({ ...prev, status: newStatus }))
    }

    const { error } = await supabase
      .from('transactions').update({ status: newStatus }).eq('id', transactionId)

    if (error) {
      toast.error('Failed to save status change')
      const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false })
      if (data) setTransactions(data)
      return
    }

    // Auto-delete commission row when moved to Cancelled/Expired
    if (newStatus === 'cancelled-expired' && commissions[transactionId]) {
      await supabase.from('commissions').delete().eq('transaction_id', transactionId)
      setCommissions(prev => { const next = { ...prev }; delete next[transactionId]; return next })
    }

    // Auto-delete showings when transaction is closed or cancelled
    if (newStatus === 'closed' || newStatus === 'cancelled-expired') {
      await supabase.from('showings').delete().eq('transaction_id', transactionId)
    }

    // Backward stage move: offer to remove incomplete tasks
    if (transaction) {
      const oldIdx = STAGE_ORDER.indexOf(transaction.status)
      const newIdx = STAGE_ORDER.indexOf(newStatus)
      if (oldIdx > 0 && newIdx >= 0 && newIdx < oldIdx) {
        const incompleteTasks = tasks.filter(t => t.transaction_id === transactionId && t.status === 'open')
        if (incompleteTasks.length > 0) {
          setBackMoveModal({ transactionId, oldStage: transaction.status, newStage: newStatus })
        }
      }
    }

    // Move the Drive folder to match the new status (fire-and-forget, never blocks the UI)
    if (transaction) {
      const hasAddress    = transaction.property_address && transaction.property_address.trim() !== ''
      const hasFolderInfo = transaction.drive_folder_id || transaction.client_last_name
      if (!hasAddress && !hasFolderInfo) {
        // nothing to name the folder — skip
      } else {
        syncDriveFolder({
          transactionId,
          newStatus,
          driveFolderId:        transaction.drive_folder_id         || null,
          driveUnderContractId: transaction.drive_under_contract_id || null,
          repType:              transaction.rep_type,
          propertyAddress:      transaction.property_address,
          clientLastName:       transaction.client_last_name,
        }).then(result => {
          if (result?.drive_folder_id) handleTransactionUpdate(transactionId, result)
        }).catch(err => console.error('[Drive] Status-change sync failed:', err.message))
      }
    }
  }

  // ── Template task insertion helper ──────────────────────────────────────────
  const insertTemplateTasks = async (transactionId, status, repType, transaction) => {
    // Prefer DB templates when available
    if (dbTemplates.length > 0) {
      const tpl = dbTemplates.find(t =>
        t.stage === status &&
        (t.rep_type === repType || t.rep_type === null || t.rep_type === 'Both')
      )
      if (tpl) {
        const alreadyHas = tasks.some(
          t => t.transaction_id === transactionId && t.template_key === tpl.id
        )
        if (alreadyHas) return

        const tplTaskRows = dbTemplateTasks.filter(t => t.template_id === tpl.id)
        const builtTasks  = buildTemplateTasksFromDB(tplTaskRows, transaction)
        if (!builtTasks.length) return

        const toInsert = builtTasks.map(t => ({ ...t, transaction_id: transactionId }))
        const { data: inserted, error } = await supabase.from('tasks').insert(toInsert).select()
        if (error) {
          console.warn('Could not insert template tasks:', error.message)
          return
        }
        if (inserted) {
          setTasks(prev => [...prev, ...inserted])
          toast.success(`${inserted.length} tasks added`, { duration: 2000 })
        }
        return
      }
    }

    // Fallback: hardcoded templates
    const templateKey = getTemplateKey(status, repType)
    const alreadyHas = tasks.some(
      t => t.transaction_id === transactionId && t.template_key === templateKey
    )
    if (alreadyHas) return

    const tplTasks = buildTemplateTasks(status, repType, transaction)
    if (!tplTasks.length) return

    const toInsert = tplTasks.map(t => ({ ...t, transaction_id: transactionId }))
    const { data: inserted, error } = await supabase.from('tasks').insert(toInsert).select()
    if (error) {
      console.warn('Could not insert template tasks (run the tasks SQL in Supabase):', error.message)
      return
    }
    if (inserted) {
      setTasks(prev => [...prev, ...inserted])
      toast.success(`${inserted.length} tasks added`, { duration: 2000 })
    }
  }

  // ── Generic transaction field update (used by global Tasks tab date sync) ───
  const handleUpdateTransactionField = async (txId, field, value) => {
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, [field]: value } : t))
    if (selectedTransaction?.id === txId) setSelectedTransaction(prev => ({ ...prev, [field]: value }))
    const { error } = await supabase.from('transactions').update({ [field]: value }).eq('id', txId)
    if (error) toast.error(`Failed to save: ${error.message}`)
  }

  // ── Inline field save ───────────────────────────────────────────────────────
  const handleFieldSave = async (field, value) => {
    if (!selectedTransaction) return
    const txId    = selectedTransaction.id
    const dbValue = field === 'price'     ? parsePrice(value)
                  : field === 'square_ft' ? (String(value).replace(/,/g, '') || null)
                  : value
    // Keep a snapshot for Drive sync reads below (status, rep_type, address, etc.)
    const updated = { ...selectedTransaction, [field]: dbValue }

    // Functional updaters so concurrent saves (e.g. FUB multi-field select) stack correctly
    // instead of each one overwriting from the same stale snapshot.
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, [field]: dbValue } : t))
    setSelectedTransaction(prev => ({ ...prev, [field]: dbValue }))

    const { error } = await supabase
      .from('transactions').update({ [field]: dbValue }).eq('id', txId)
    if (error) {
      console.error('[handleFieldSave]', field, error)
      toast.error(`Failed to save "${field}": ${error.message}`)
      return
    }
    toast.success('Saved', { duration: 900 })

    // When address or client name is first entered, create the Drive folder
    const DRIVE_FIELDS = ['property_address', 'client_last_name']
    if (DRIVE_FIELDS.includes(field)) {
      if (!updated.drive_folder_id) {
        const hasName = updated.property_address || updated.client_last_name
        if (hasName) {
          syncDriveFolder({
            transactionId:        txId,
            newStatus:            updated.status,
            driveFolderId:        null,
            driveUnderContractId: null,
            repType:              updated.rep_type,
            propertyAddress:      updated.property_address,
            clientLastName:       updated.client_last_name,
          }).then(result => {
            if (result?.drive_folder_id) {
              handleTransactionUpdate(txId, result)
              toast.success('Drive folder created', { duration: 2000 })
            }
          }).catch(err => console.error('[Drive] Folder creation failed:', err.message))
        }
      }
    }
  }

  // ── Multi-field atomic save (avoids race conditions with multiple save() calls) ──
  const handleMultiFieldSave = useCallback(async (updates) => {
    if (!selectedTransaction) return
    const txId = selectedTransaction.id
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, ...updates } : t))
    setSelectedTransaction(prev => ({ ...prev, ...updates }))
    const { error } = await supabase.from('transactions').update(updates).eq('id', txId)
    if (error) {
      console.error('[handleMultiFieldSave]', error)
      toast.error(`Failed to save: ${error.message}`)
    } else {
      toast.success('Saved', { duration: 900 })
    }
  }, [selectedTransaction])

  // ── Delete transaction ──────────────────────────────────────────────────────
  const handleDelete = async (transactionId) => {
    setTransactions(prev => prev.filter(t => t.id !== transactionId))
    setTasks(prev => prev.filter(t => t.transaction_id !== transactionId))
    setCommissions(prev => {
      const next = { ...prev }
      delete next[transactionId]
      commissionsRef.current = next
      return next
    })

    const { error } = await supabase.from('transactions').delete().eq('id', transactionId)
    if (error) {
      toast.error('Failed to delete transaction')
      const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false })
      if (data) setTransactions(data)
    } else {
      toast.success('Transaction removed!')
    }
  }

  // ── Task CRUD ───────────────────────────────────────────────────────────────
  const handleAddTask = useCallback(async (taskData) => {
    try {
      const { data: newTask, error } = await supabase.from('tasks').insert({
        ...sanitizeForDB(taskData),
        notified_mentions: [],
      }).select().single()
      if (error) throw error

      // @mention notifications
      const notified = await sendMentionNotifications({
        notes:                newTask.notes,
        prevNotifiedMentions: [],
        tcSettings,
        transaction:          transactions.find(t => t.id === taskData.transaction_id) || {},
        taskTitle:            newTask.title,
      })
      if (notified.length) {
        await supabase.from('tasks').update({ notified_mentions: notified }).eq('id', newTask.id)
        setTasks(prev => prev.map(t => t.id === newTask.id ? { ...t, notified_mentions: notified } : t))
      }

      setTasks(prev => [...prev, { ...newTask, notified_mentions: notified }])
    } catch (err) {
      toast.error('Failed to add task')
      console.error(err)
    }
  }, [tcSettings, transactions])

  const handleUpdateTask = useCallback(async (taskId, updates) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t))

    const { error } = await supabase.from('tasks').update(updates).eq('id', taskId)
    if (error) {
      console.error('Task update error:', error)
      toast.error(`Failed to save task: ${error.message}`)
      // Revert local state so UI doesn't show a false save
      setTasks(prev => prev.map(t => t.id === taskId ? tasks.find(orig => orig.id === taskId) || t : t))
      return
    }

    // Handle @mention notifications when notes change
    if (updates.notes !== undefined) {
      const task        = tasks.find(t => t.id === taskId)
      const transaction = task ? transactions.find(t => t.id === task.transaction_id) : null
      if (task && transaction) {
        const prev      = task.notified_mentions || []
        const notified  = await sendMentionNotifications({
          notes: updates.notes, prevNotifiedMentions: prev,
          tcSettings, transaction, taskTitle: task.title,
        })
        if (notified.length) {
          const merged = [...new Set([...prev, ...notified])]
          await supabase.from('tasks').update({ notified_mentions: merged }).eq('id', taskId)
          setTasks(p => p.map(t => t.id === taskId ? { ...t, notified_mentions: merged } : t))
        }
      }
    }
  }, [tasks, transactions, tcSettings])

  const handleDeleteTask = useCallback(async (taskId) => {
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setTaskComments(prev => prev.filter(c => c.task_id !== taskId))
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (error) console.error('Task delete error:', error)
  }, [])

  const handleAddTaskComment = useCallback(async (taskId, author, body) => {
    const { data, error } = await supabase
      .from('task_comments')
      .insert({ task_id: taskId, author, body })
      .select()
      .single()
    if (error) { toast.error('Failed to add comment'); return }
    if (data) setTaskComments(prev => [...prev, data])
  }, [])

  const handleDeleteTaskComment = useCallback(async (commentId) => {
    setTaskComments(prev => prev.filter(c => c.id !== commentId))
    const { error } = await supabase.from('task_comments').delete().eq('id', commentId)
    if (error) console.error('Comment delete error:', error)
  }, [])

  // ── Apply template manually ─────────────────────────────────────────────────
  const handleApplyTemplate = useCallback(async (transactionId, templateId, transaction, excludedTplIds = new Set()) => {
    const tplTaskRows = dbTemplateTasks.filter(t => t.template_id === templateId && !excludedTplIds.has(t.id))
    const builtTasks  = buildTemplateTasksFromDB(tplTaskRows, transaction)
    if (!builtTasks.length) return

    // Fetch existing task titles for this transaction so we never duplicate or overwrite
    const { data: existingTasks } = await supabase
      .from('tasks')
      .select('title')
      .eq('transaction_id', transactionId)
    const existingTitles = new Set(
      (existingTasks || []).map(t => (t.title || '').toLowerCase().trim())
    )
    const newTasks = builtTasks.filter(t => !existingTitles.has((t.title || '').toLowerCase().trim()))
    if (!newTasks.length) {
      toast('All tasks from this template already exist', { duration: 2000 })
      return
    }

    // Strip internal mapping fields before inserting into tasks table
    const toInsert = newTasks.map(({ _template_task_id, resolves_critical_date, ...rest }) => ({
      ...rest, transaction_id: transactionId, template_key: templateId,
    }))
    const { data: inserted, error } = await supabase.from('tasks').insert(toInsert).select()
    if (error) { toast.error('Failed to apply template'); return }
    if (inserted) {
      // Build map: template_task_id → actual inserted task id
      const tplToActual = {}
      newTasks.forEach((bt, i) => {
        if (bt._template_task_id) tplToActual[bt._template_task_id] = inserted[i].id
      })
      // Resolve resolves_critical_date from template task ids → actual task ids
      const linkUpdates = newTasks
        .map((bt, i) => ({ bt, actual: inserted[i] }))
        .filter(({ bt }) => bt.resolves_critical_date && tplToActual[bt.resolves_critical_date])
      if (linkUpdates.length) {
        await Promise.all(linkUpdates.map(({ bt, actual }) =>
          supabase.from('tasks')
            .update({ resolves_critical_date: tplToActual[bt.resolves_critical_date] })
            .eq('id', actual.id)
        ))
        // Reflect the resolved links in local state
        const finalInserted = inserted.map((task, i) => {
          const rcd = newTasks[i].resolves_critical_date
          return rcd && tplToActual[rcd] ? { ...task, resolves_critical_date: tplToActual[rcd] } : task
        })
        setTasks(prev => [...prev, ...finalInserted])
      } else {
        setTasks(prev => [...prev, ...inserted])
      }
      toast.success(`${inserted.length} task${inserted.length !== 1 ? 's' : ''} added`, { duration: 2000 })
    }
  }, [dbTemplateTasks])

  // ── Backward move — remove incomplete tasks ──────────────────────────────────
  const handleBackMoveYes = useCallback(async () => {
    if (!backMoveModal) return
    const { transactionId } = backMoveModal
    const toDelete = tasks.filter(t => t.transaction_id === transactionId && t.status === 'open')
    setTasks(prev => prev.filter(t => !(t.transaction_id === transactionId && t.status === 'open')))
    await Promise.all(toDelete.map(t => supabase.from('tasks').delete().eq('id', t.id)))
    setBackMoveModal(null)
  }, [backMoveModal, tasks])

  // ── Templates refresh ───────────────────────────────────────────────────────
  const handleTemplatesRefresh = useCallback(async () => {
    const [{ data: tplData }, { data: tplTaskData }] = await Promise.all([
      supabase.from('task_templates').select('*').order('sort_order', { ascending: true }),
      supabase.from('template_tasks').select('*').order('sort_order', { ascending: true }),
    ])
    setDbTemplates(tplData || [])
    setDbTemplateTasks(tplTaskData || [])
  }, [])

  // ── Commission change ───────────────────────────────────────────────────────
  const handleCommissionChange = useCallback((txId, field, value) => {
    setCommissions(prev => {
      const next = { ...prev, [txId]: { ...(prev[txId] || {}), [field]: value } }
      commissionsRef.current = next
      return next
    })

    clearTimeout(saveTimers.current[txId])
    saveTimers.current[txId] = setTimeout(async () => {
      const cm = commissionsRef.current[txId] || {}
      const n = v => (v !== '' && v != null ? Number(v) : null)
      const payload = {
        transaction_id:              txId,
        commission_rate:             cm.commission_rate   ?? null,
        ref_percent:                 n(cm.ref_percent),
        tc_fee:                      n(cm.tc_fee),
        commission_status:           cm.commission_status || 'Pending',
        seller_concession_percent:   n(cm.seller_concession_percent),
        seller_concession_flat:      n(cm.seller_concession_flat),
        buyer_contribution_percent:  n(cm.buyer_contribution_percent),
        buyer_contribution_flat:     n(cm.buyer_contribution_flat),
        cap_deduction:               cm.cap_deduction     ?? null,
        royalty_deduction:           cm.royalty_deduction ?? null,
        tc_fee_commission:           n(cm.tc_fee_commission),
        concessions:                 n(cm.concessions),
        buyer_broker_addendum:       cm.buyer_broker_addendum ?? null,
      }
      console.log('[Commission] saving payload:', payload)
      const { error } = await supabase.from('commissions').upsert(payload, { onConflict: 'transaction_id' })
      if (error) {
        console.error('Commission save error:', error)
        toast.error(`Commission save failed: ${error.message}`)
      }
    }, 600)
  }, [])

  // ── Commission delete ───────────────────────────────────────────────────────
  const handleDeleteCommission = useCallback(async (txId) => {
    setCommissions(prev => { const next = { ...prev }; delete next[txId]; return next })
    const { error } = await supabase.from('commissions').delete().eq('transaction_id', txId)
    if (error) console.error('Commission delete error:', error)
  }, [])

  // ── TC Settings save ────────────────────────────────────────────────────────
  const handleSaveTcSettings = useCallback(async (updated, digestPrefs) => {
    setTcSettings(updated)
    for (const tc of updated) {
      await supabase.from('tc_settings')
        .upsert({ name: tc.name, email: tc.email }, { onConflict: 'name' })
    }

    // Save digest preferences
    if (digestPrefs) {
      const newMap = {}
      for (const pref of digestPrefs) {
        if (!pref.email) continue
        await supabase.from('user_settings')
          .upsert({ email: pref.email, daily_digest_enabled: pref.daily_digest_enabled }, { onConflict: 'email' })
        newMap[pref.email] = pref
      }
      setUserSettings(prev => ({ ...prev, ...newMap }))
    }

    toast.success('Settings saved!')
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────

  // Auth loading (session not yet resolved)
  if (session === undefined) {
    return <div className="app"><div className="app-loading">Loading…</div></div>
  }

  // Not authenticated or access denied
  if (!session || accessDenied) {
    return <LoginPage accessDenied={accessDenied} />
  }

  if (loading) {
    return (
      <div className="app">
        <div className="app-loading">Loading…</div>
      </div>
    )
  }

  const panelTasks = selectedTransaction
    ? tasks.filter(t => t.transaction_id === selectedTransaction.id)
    : []

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    setSelectedTransaction(null)
    if (tab === 'collaborators') setCollaboratorFilter('title-escrow')
    if (tab === 'templates')    setTemplatesFilter('task-templates')
    if (tab === 'tasks')        setTasksFilter('tasks')
    if (tab !== 'board')        { setBoardFilters(DEFAULT_BOARD_FILTERS); setBoardFilterOpen(false) }
    window.history.replaceState({}, '', `?tab=${tab}`)
  }

  // Derive available years from transactions' key dates
  const boardFilterYears = (() => {
    const yrs = new Set()
    transactions.forEach(t => {
      ;[t.close_of_escrow, t.listing_contract, t.contract_acceptance_date].forEach(d => {
        if (d) { const y = d.slice(0, 4); if (y) yrs.add(y) }
      })
    })
    return [...yrs].sort().reverse()
  })()

  // Apply board filters to transactions
  const boardFilteredTx = transactions.filter(t => {
    // Year — only filter closed transactions by close_of_escrow; all other statuses show regardless
    if (boardFilters.year !== 'All' && t.status === 'closed') {
      if (!t.close_of_escrow || !t.close_of_escrow.startsWith(boardFilters.year)) return false
    }
    // TC
    if (boardFilters.tcs.length > 0) {
      if (!boardFilters.tcs.includes(t.assigned_tc || '')) return false
    }
    // Rep Type
    if (boardFilters.repType !== 'All') {
      if (t.rep_type !== boardFilters.repType) return false
    }
    return true
  })

  const boardFilterCount = (boardFilters.year !== '2026' ? 1 : 0)
    + (boardFilters.tcs.length > 0 ? 1 : 0)
    + (boardFilters.repType !== 'All' ? 1 : 0)

  const toggleBoardTc = (tc) => {
    setBoardFilters(f => ({
      ...f,
      tcs: f.tcs.includes(tc) ? f.tcs.filter(x => x !== tc) : [...f.tcs, tc],
    }))
  }

  return (
    <div className="app">
      <MeshBackground />
      <Toaster position="top-right" />

      <AppHeader
        transactions={transactions}
        onNavigateTransaction={(tx) => openTransaction(tx)}
        onNavigateTab={handleTabChange}
      />

      <div className="app-layout">
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onSettingsOpen={() => setSettingsOpen(true)}
          collaboratorFilter={collaboratorFilter}
          onCollaboratorFilterChange={setCollaboratorFilter}
          templatesFilter={templatesFilter}
          onTemplatesFilterChange={setTemplatesFilter}
          tasksFilter={tasksFilter}
          onTasksFilterChange={setTasksFilter}
        />

        <main className="app-main">
          {activeTab === 'dashboard' && (
            <MissionControl
              transactions={transactions}
              commissions={commissions}
            />
          )}

          {activeTab === 'board' && (
            <div className="board-toolbar">
              <div className="board-view-toggle">
                <button className={`bvt-btn${boardView === 'board' ? ' active' : ''}`} onClick={() => switchBoardView('board')}>Board</button>
                <button className={`bvt-btn${boardView === 'list'  ? ' active' : ''}`} onClick={() => switchBoardView('list')}>List</button>
              </div>
              <div className="board-filter-wrap" ref={boardFilterRef}>
                <button
                  className={`board-filter-btn${boardFilterCount > 0 ? ' has-filters' : ''}`}
                  onClick={() => setBoardFilterOpen(o => !o)}
                >
                  Filters{boardFilterCount > 0 ? ` (${boardFilterCount})` : ''}
                </button>
                {boardFilterOpen && (
                  <div className="board-filter-panel">
                    {/* Year */}
                    <div className="bfp-row">
                      <span className="bfp-label">Year</span>
                      <div className="bfp-opts">
                        {['All', ...boardFilterYears.filter(y => !['All'].includes(y))].map(y => (
                          <button
                            key={y}
                            className={`bfp-opt${boardFilters.year === y ? ' active' : ''}`}
                            onClick={() => setBoardFilters(f => ({ ...f, year: y }))}
                          >{y}</button>
                        ))}
                      </div>
                    </div>
                    {/* TC */}
                    <div className="bfp-row">
                      <span className="bfp-label">TC</span>
                      <div className="bfp-opts">
                        {TC_OPTIONS.map(tc => (
                          <button
                            key={tc}
                            className={`bfp-opt${boardFilters.tcs.includes(tc) ? ' active' : ''}`}
                            onClick={() => toggleBoardTc(tc)}
                          >{tc.split(' ')[0]}</button>
                        ))}
                      </div>
                    </div>
                    {/* Rep Type */}
                    <div className="bfp-row">
                      <span className="bfp-label">Rep Type</span>
                      <div className="bfp-opts">
                        {['All', 'Buyer', 'Seller'].map(rt => (
                          <button
                            key={rt}
                            className={`bfp-opt${boardFilters.repType === rt ? ' active' : ''}`}
                            onClick={() => setBoardFilters(f => ({ ...f, repType: rt }))}
                          >{rt}</button>
                        ))}
                      </div>
                    </div>
                    {boardFilterCount > 0 && (
                      <button className="bfp-clear" onClick={() => setBoardFilters(DEFAULT_BOARD_FILTERS)}>
                        Clear Filters
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button className="btn-new-transaction" onClick={() => setNewTxOpen(true)}>
                + New Transaction
              </button>
            </div>
          )}

          {activeTab === 'board' && boardView === 'board' && (
            <KanbanBoard
              columns={COLUMNS}
              transactions={boardFilteredTx}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onCardClick={(tx) => openTransaction(tx)}
              commissions={commissions}
            />
          )}

          {activeTab === 'board' && boardView === 'list' && (
            <ListView
              transactions={boardFilteredTx}
              commissions={commissions}
              columns={COLUMNS}
              onCardClick={(tx) => openTransaction(tx)}
              onOpenSection={(tx, section) => openTransaction(tx, section)}
            />
          )}
          {activeTab === 'commissions' && (
            <CommissionsTab
              transactions={transactions}
              commissions={commissions}
              onDeleteCommission={handleDeleteCommission}
              onNavigate={(txId) => {
                const tx = transactions.find(t => t.id === txId)
                if (tx) openTransaction(tx, 'commission')
              }}
            />
          )}
          {activeTab === 'tasks' && (
            <TasksTab
              tasks={tasks}
              transactions={transactions}
              onTaskUpdate={handleUpdateTask}
              onDeleteTask={handleDeleteTask}
              onAddTask={handleAddTask}
              onUpdateTransaction={handleUpdateTransactionField}
              taskComments={taskComments}
              onAddTaskComment={handleAddTaskComment}
              onDeleteTaskComment={handleDeleteTaskComment}
              tcSettings={tcSettings}
              onCardClick={(tx) => openTransaction(tx, 'details', 'tasks')}
              activeSubTabProp={
                { 'tasks': 'tasks', 'send-queue': 'queue', 'sent-log': 'log' }[tasksFilter] ?? 'tasks'
              }
              onSubTabChange={(s) =>
                setTasksFilter({ tasks: 'tasks', queue: 'send-queue', log: 'sent-log' }[s] ?? 'tasks')
              }
            />
          )}
          {activeTab === 'collaborators' && (
            <CollaboratorsTab
              activeCat={collaboratorFilter}
              onCatChange={setCollaboratorFilter}
            />
          )}
          {activeTab === 'showings' && (
            <ShowingsTab transactions={transactions} />
          )}
          {activeTab === 'templates' && (
            <TemplatesTab
              templates={dbTemplates}
              allTemplateTasks={dbTemplateTasks}
              onRefresh={handleTemplatesRefresh}
              tcSettings={tcSettings}
              activeSectionProp={
                { 'task-templates': 'tasks', 'email-templates': 'email', 'vendor-templates': 'vendors' }[templatesFilter] ?? 'tasks'
              }
              onSectionChange={(s) =>
                setTemplatesFilter({ tasks: 'task-templates', email: 'email-templates', vendors: 'vendor-templates' }[s] ?? 'task-templates')
              }
            />
          )}
          {activeTab === 'reporting' && (
            <div className="placeholder-card">
              <div className="placeholder-title">Reporting</div>
              <div className="placeholder-sub">Coming Soon</div>
            </div>
          )}
        </main>
      </div>

      {selectedTransaction && (
        <TransactionDetailPage
          key={txOpenRevision}
          transaction={selectedTransaction}
          transactions={transactions}
          onNavigate={(tx, section) => { setSelectedSection(section ?? 'details'); setSelectedTransaction(tx); setTxOpenRevision(r => r + 1); window.history.replaceState({}, '', `?tab=${activeTab}&tx=${tx.id}&from=${txFrom}`) }}
          from={txFrom}
          initialSection={selectedSection}
          columns={COLUMNS}
          commissions={commissions}
          tasks={panelTasks}
          tcSettings={tcSettings}
          dbTemplates={dbTemplates}
          dbTemplateTasks={dbTemplateTasks}
          onBack={() => {
            const from = new URLSearchParams(window.location.search).get('from')
            const backTab = from === 'tasks' ? 'tasks' : activeTab
            window.history.replaceState({}, '', `?tab=${backTab}`)
            setSelectedTransaction(null)
            if (from === 'tasks') setActiveTab('tasks')
          }}
          onGoToBoard={() => {
            setActiveTab('board')
            window.history.replaceState({}, '', '?tab=board')
            setSelectedTransaction(null)
          }}
          onGoToTasks={() => {
            setActiveTab('tasks')
            window.history.replaceState({}, '', '?tab=tasks')
            setSelectedTransaction(null)
          }}
          onFieldSave={handleFieldSave}
          onMultiFieldSave={handleMultiFieldSave}
          onCommissionChange={handleCommissionChange}
          onDelete={handleDelete}
          onAddTask={handleAddTask}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onStatusChange={handleStatusChange}
          onTransactionUpdate={handleTransactionUpdate}
          onApplyTemplate={handleApplyTemplate}
          taskComments={taskComments}
          onAddTaskComment={handleAddTaskComment}
          onDeleteTaskComment={handleDeleteTaskComment}
        />
      )}

      {backMoveModal && (
        <div className="back-move-overlay">
          <div className="back-move-modal">
            <div className="back-move-title">Stage Moving Back</div>
            <div className="back-move-body">
              This transaction is moving back to <strong>{stageName(backMoveModal.newStage)}</strong>.
              Would you like to remove incomplete {stageName(backMoveModal.oldStage)} tasks?
              <br /><br />
              Completed tasks will always be kept.
            </div>
            <div className="back-move-actions">
              <button className="back-move-no"  onClick={() => setBackMoveModal(null)}>No, keep them</button>
              <button className="back-move-yes" onClick={handleBackMoveYes}>Yes, remove them</button>
            </div>
          </div>
        </div>
      )}

      {newTxOpen && (
        <NewTransactionPopup
          onCreate={handleCreateTransaction}
          onClose={() => { setNewTxOpen(false); setNewTxPrefill(null) }}
          prefill={newTxPrefill}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          tcSettings={tcSettings}
          userSettings={userSettings}
          onSave={handleSaveTcSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
