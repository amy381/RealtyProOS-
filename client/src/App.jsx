import { useState, useEffect, useRef, useCallback } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { supabase } from './lib/supabase'
import { syncDriveFolder } from './lib/googleDrive'
import { buildTemplateTasks, getTemplateKey } from './lib/taskTemplates'
import { sendMentionNotifications, parseMentions } from './lib/emailNotify'
import KanbanBoard from './components/KanbanBoard'
import GoalsDashboard from './components/GoalsDashboard'
import TransactionModal from './components/TransactionModal'
import TransactionDetailPage from './components/TransactionDetailPage'
import CommissionsTab from './components/CommissionsTab'
import TasksTab from './components/TasksTab'
import NewTransactionPopup from './components/NewTransactionPopup'
import SettingsModal from './components/SettingsModal'
import './App.css'

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
  { id: 'pre-listing',       label: 'Pre-Listing',          color: '#888888', bgColor: '#e8e8e8', priceLabel: 'List Price',     viewMode: 'list'   },
  { id: 'buyer-broker',      label: 'Buyer-Broker',         color: '#666666', bgColor: '#e8e8e8', priceLabel: 'Purchase Price', viewMode: 'list'   },
  { id: 'active-listing',    label: 'Active Listing',       color: '#555555', bgColor: '#e8e8e8', priceLabel: 'List Price',     viewMode: 'medium' },
  { id: 'pending',           label: 'Pending',              color: '#333333', bgColor: '#e8e8e8', priceLabel: 'Purchase Price', viewMode: 'wide'   },
  { id: 'closed',            label: 'Closed',               color: '#444444', bgColor: '#e8e8e8', priceLabel: 'Purchase Price', viewMode: 'narrow' },
  { id: 'cancelled-expired', label: 'Cancelled / Expired',  color: '#aaaaaa', bgColor: '#e8e8e8', priceLabel: null,             viewMode: 'medium' },
]

export default function App() {
  const [transactions, setTransactions]         = useState([])
  const [commissions, setCommissions]           = useState({})
  const [tasks, setTasks]                       = useState([])
  const [tcSettings, setTcSettings]             = useState([])
  const [loading, setLoading]                   = useState(true)
  const [newTxOpen, setNewTxOpen]               = useState(false)
  const [modalOpen, setModalOpen]               = useState(false)
  const [settingsOpen, setSettingsOpen]         = useState(false)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [activeTab, setActiveTab]               = useState('board')

  const commissionsRef = useRef({})
  const saveTimers     = useRef({})

  // Show a toast when returning from Google OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('drive_connected') === '1') {
      toast.success('Google Drive connected!')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

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

      // Task tables — optional, gracefully degrade if not created yet
      const [
        { data: tkData, error: tkErr },
        { data: tcData, error: tcErr },
      ] = await Promise.all([
        supabase.from('tasks').select('*').order('sort_order', { ascending: true }),
        supabase.from('tc_settings').select('*'),
      ])

      if (tkErr) {
        console.warn('tasks table not found — run the new SQL in Supabase to enable tasks:', tkErr.message)
      } else {
        setTasks(tkData || [])
      }

      if (tcErr) {
        console.warn('tc_settings table not found — run the new SQL in Supabase to enable settings:', tcErr.message)
        setTcSettings([
          { name: 'Me', email: '' },
          { name: 'Justina Morris', email: '' },
          { name: 'Victoria Lareau', email: '' },
        ])
      } else {
        const tcs = tcData || []
        if (tcs.length === 0) {
          const defaults = [
            { name: 'Me', email: '' },
            { name: 'Justina Morris', email: '' },
            { name: 'Victoria Lareau', email: '' },
          ]
          const { data: seeded } = await supabase.from('tc_settings').insert(defaults).select()
          setTcSettings(seeded || defaults)
        } else {
          setTcSettings(tcs)
        }
      }

      setLoading(false)
    }
    load()
  }, [])

  // ── New transaction ─────────────────────────────────────────────────────────
  const handleCreateTransaction = async (repType, status) => {
    try {
      const { data: newTx, error: txErr } = await supabase
        .from('transactions')
        .insert({ rep_type: repType, status })
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

      await insertTemplateTasks(newTx.id, newTx.status, newTx.rep_type, newTx)

      setNewTxOpen(false)
      setSelectedTransaction(newTx)
    } catch (err) {
      toast.error('Failed to create transaction')
      console.error('[create]', err)
    }
  }

  // ── Edit transaction ────────────────────────────────────────────────────────
  const handleEdit = (transaction) => {
    setEditingTransaction(transaction)
    setModalOpen(true)
  }

  const handleSave = async (data) => {
    if (!editingTransaction) { setModalOpen(false); return }
    const { id, created_at, updated_at, ...updateData } = data
    if ('price' in updateData) updateData.price = parsePrice(updateData.price)

    try {
      const { data: updated, error } = await supabase
        .from('transactions').update(sanitizeForDB(updateData)).eq('id', editingTransaction.id).select().single()
      if (error) throw error

      setTransactions(prev => prev.map(t => t.id === editingTransaction.id ? updated : t))
      if (selectedTransaction?.id === editingTransaction.id) setSelectedTransaction(updated)
      toast.success('Transaction updated!')
    } catch (err) {
      toast.error('Failed to update transaction')
      console.error(err)
    }
    setModalOpen(false)
    setEditingTransaction(null)
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

    // Auto-populate template tasks (only if not already populated for this stage)
    if (transaction) {
      const updatedTx = { ...transaction, status: newStatus }
      await insertTemplateTasks(transactionId, newStatus, transaction.rep_type, updatedTx)
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
      // Table may not exist yet — fail silently so transaction creation still succeeds
      console.warn('Could not insert template tasks (run the tasks SQL in Supabase):', error.message)
      return
    }
    if (inserted) {
      setTasks(prev => [...prev, ...inserted])
      toast.success(`${inserted.length} tasks added`, { duration: 2000 })
    }
  }

  // ── Inline field save ───────────────────────────────────────────────────────
  const handleFieldSave = async (field, value) => {
    if (!selectedTransaction) return
    const txId    = selectedTransaction.id
    const dbValue = field === 'price' ? parsePrice(value) : value
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
    if (error) { console.error('Task update error:', error); return }

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
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (error) console.error('Task delete error:', error)
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
      const { error } = await supabase.from('commissions').upsert({
        transaction_id:    txId,
        commission_rate:   cm.commission_rate   ?? null,
        ref_percent:       cm.ref_percent !== '' && cm.ref_percent != null ? Number(cm.ref_percent) : null,
        tc_fee:            cm.tc_fee      !== '' && cm.tc_fee      != null ? Number(cm.tc_fee)      : null,
        commission_status: cm.commission_status || 'Pending',
      }, { onConflict: 'transaction_id' })
      if (error) console.error('Commission save error:', error)
    }, 600)
  }, [])

  // ── TC Settings save ────────────────────────────────────────────────────────
  const handleSaveTcSettings = useCallback(async (updated) => {
    setTcSettings(updated)
    for (const tc of updated) {
      await supabase.from('tc_settings')
        .upsert({ name: tc.name, email: tc.email }, { onConflict: 'name' })
    }
    toast.success('Settings saved!')
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────
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

  return (
    <div className="app">
      <Toaster position="top-right" />
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">🏠</span>
            <span className="logo-text">Legacy<span className="logo-os">OS</span></span>
          </div>
          <span className="header-subtitle">Transaction Management</span>
        </div>
        <div className="app-tabs">
          {[
            { id: 'board',       label: 'The Board'   },
            { id: 'commissions', label: 'Commissions' },
            { id: 'tasks',       label: 'Tasks'       },
          ].map(tab => (
            <button key={tab.id}
              className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="header-right">
          <button className="btn-new-transaction" onClick={() => setNewTxOpen(true)}>
            + New Transaction
          </button>
          <button className="btn-settings" onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
        </div>
      </header>

      <main className="app-main">
        {activeTab === 'board' && (
          <GoalsDashboard transactions={transactions} commissions={commissions} />
        )}

        {activeTab === 'board' && (
          <KanbanBoard
            columns={COLUMNS}
            transactions={transactions}
            onEdit={handleEdit}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
            onCardClick={(tx) => setSelectedTransaction(tx)}
            commissions={commissions}
          />
        )}
        {activeTab === 'commissions' && (
          <CommissionsTab
            transactions={transactions}
            commissions={commissions}
            onCommissionChange={handleCommissionChange}
          />
        )}
        {activeTab === 'tasks' && (
          <TasksTab
            tasks={tasks}
            transactions={transactions}
            onTaskUpdate={handleUpdateTask}
            onCardClick={(tx) => {
              setSelectedTransaction(tx)
              setActiveTab('board')
            }}
          />
        )}
      </main>

      {selectedTransaction && (
        <TransactionDetailPage
          transaction={selectedTransaction}
          columns={COLUMNS}
          commissions={commissions}
          tasks={panelTasks}
          tcSettings={tcSettings}
          onBack={() => setSelectedTransaction(null)}
          onFieldSave={handleFieldSave}
          onCommissionChange={handleCommissionChange}
          onDelete={handleDelete}
          onAddTask={handleAddTask}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onStatusChange={handleStatusChange}
          onTransactionUpdate={handleTransactionUpdate}
        />
      )}

      {newTxOpen && (
        <NewTransactionPopup
          onCreate={handleCreateTransaction}
          onClose={() => setNewTxOpen(false)}
        />
      )}

      {modalOpen && (
        <TransactionModal
          transaction={editingTransaction}
          columns={COLUMNS}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditingTransaction(null) }}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          tcSettings={tcSettings}
          onSave={handleSaveTcSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
