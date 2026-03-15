import { useState, useEffect, useRef, useCallback } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { supabase } from './lib/supabase'
import { buildTemplateTasks, getTemplateKey } from './lib/taskTemplates'
import { sendMentionNotifications, parseMentions } from './lib/emailNotify'
import KanbanBoard from './components/KanbanBoard'
import TransactionModal from './components/TransactionModal'
import TransactionPanel from './components/TransactionPanel'
import CommissionsTab from './components/CommissionsTab'
import TasksTab from './components/TasksTab'
import IntakeModal from './components/IntakeModal'
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
  { id: 'buyer-broker',      label: 'Buyer-Broker',        color: '#9ab8d0', bgColor: '#e8eef5', priceLabel: 'Purchase Price' },
  { id: 'pre-listing',       label: 'Pre-Listing',          color: '#8eb8a0', bgColor: '#e6eeea', priceLabel: 'List Price' },
  { id: 'active-listing',    label: 'Active Listing',       color: '#7ab0be', bgColor: '#e4ecee', priceLabel: 'List Price' },
  { id: 'pending',           label: 'Pending',              color: '#8e9ec0', bgColor: '#eaecf5', priceLabel: 'Purchase Price' },
  { id: 'closed',            label: 'Closed',               color: '#8ea87a', bgColor: '#eaecdf', priceLabel: 'Purchase Price' },
  { id: 'cancelled-expired', label: 'Cancelled / Expired',  color: '#a0a4a8', bgColor: '#eceaeb', priceLabel: null },
]

export default function App() {
  const [transactions, setTransactions]         = useState([])
  const [commissions, setCommissions]           = useState({})
  const [tasks, setTasks]                       = useState([])
  const [tcSettings, setTcSettings]             = useState([])
  const [loading, setLoading]                   = useState(true)
  const [intakeOpen, setIntakeOpen]             = useState(false)
  const [modalOpen, setModalOpen]               = useState(false)
  const [settingsOpen, setSettingsOpen]         = useState(false)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [activeTab, setActiveTab]               = useState('board')

  const commissionsRef = useRef({})
  const saveTimers     = useRef({})

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
  const handleIntakeSave = async (data) => {
    try {
      const { data: newTx, error: txErr } = await supabase
        .from('transactions')
        .insert({ ...sanitizeForDB(data), price: parsePrice(data.price) })
        .select().single()
      if (txErr) throw txErr

      const { data: newCm, error: cmErr } = await supabase
        .from('commissions')
        .insert({ transaction_id: newTx.id, commission_status: 'Pending' })
        .select().single()
      if (cmErr) throw cmErr

      setTransactions(prev => [newTx, ...prev])
      setCommissions(prev => {
        const next = { ...prev, [newTx.id]: newCm }
        commissionsRef.current = next
        return next
      })

      // Auto-populate template tasks for initial status
      await insertTemplateTasks(newTx.id, newTx.status, newTx.rep_type, newTx)

      setIntakeOpen(false)
      toast.success('Transaction created!')
    } catch (err) {
      toast.error('Failed to create transaction')
      console.error(err)
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

  // ── Status change (drag-drop) + template auto-populate ──────────────────────
  const handleStatusChange = async (transactionId, newStatus) => {
    const transaction = transactions.find(t => t.id === transactionId)

    setTransactions(prev =>
      prev.map(t => t.id === transactionId ? { ...t, status: newStatus } : t)
    )

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
    const updated = { ...selectedTransaction, [field]: dbValue }

    setTransactions(prev => prev.map(t => t.id === txId ? updated : t))
    setSelectedTransaction(updated)

    const { error } = await supabase
      .from('transactions').update({ [field]: dbValue }).eq('id', txId)
    if (error) { toast.error('Failed to save field'); console.error(error) }
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
        ...taskData,
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
            <span className="logo-text">RealtyPro <span className="logo-os">OS</span></span>
          </div>
          <span className="header-subtitle">Transaction Management</span>
        </div>
        <div className="app-tabs">
          {['board', 'commissions', 'tasks'].map(tab => (
            <button key={tab}
              className={`tab-btn${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn-settings" onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
      </header>

      <main className="app-main">
        {activeTab === 'board' && (
          <div className="board-toolbar">
            <button className="btn-new-transaction" onClick={() => setIntakeOpen(true)}>
              + New Transaction
            </button>
          </div>
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
        <TransactionPanel
          transaction={selectedTransaction}
          columns={COLUMNS}
          commissions={commissions}
          tasks={panelTasks}
          tcSettings={tcSettings}
          onClose={() => setSelectedTransaction(null)}
          onFieldSave={handleFieldSave}
          onCommissionChange={handleCommissionChange}
          onDelete={handleDelete}
          onAddTask={handleAddTask}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
        />
      )}

      {intakeOpen && (
        <IntakeModal onSave={handleIntakeSave} onClose={() => setIntakeOpen(false)} />
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
