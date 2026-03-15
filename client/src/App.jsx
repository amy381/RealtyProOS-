import { useState, useEffect, useRef, useCallback } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { supabase } from './lib/supabase'
import KanbanBoard from './components/KanbanBoard'
import TransactionModal from './components/TransactionModal'
import TransactionPanel from './components/TransactionPanel'
import CommissionsTab from './components/CommissionsTab'
import IntakeModal from './components/IntakeModal'
import './App.css'

// Strip $, commas, spaces and return a number (or null if empty)
function parsePrice(val) {
  if (val === null || val === undefined || val === '') return null
  const n = Number(String(val).replace(/[^0-9.]/g, ''))
  return isNaN(n) || n === 0 ? null : n
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
  const [loading, setLoading]                   = useState(true)
  const [intakeOpen, setIntakeOpen]             = useState(false)
  const [modalOpen, setModalOpen]               = useState(false)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [activeTab, setActiveTab]               = useState('board')

  // Ref mirrors commissions state so debounced saves read current values
  const commissionsRef = useRef({})
  const saveTimers     = useRef({})

  // ── Load all data on mount ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [
        { data: txData,  error: txErr },
        { data: cmData,  error: cmErr },
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

      setLoading(false)
    }
    load()
  }, [])

  // ── New transaction (IntakeModal) ───────────────────────────────────────────
  const handleIntakeSave = async (data) => {
    try {
      const { data: newTx, error: txErr } = await supabase
        .from('transactions')
        .insert({ ...data, price: parsePrice(data.price) })
        .select()
        .single()
      if (txErr) throw txErr

      // Create a matching commission row immediately
      const { data: newCm, error: cmErr } = await supabase
        .from('commissions')
        .insert({ transaction_id: newTx.id, commission_status: 'Pending' })
        .select()
        .single()
      if (cmErr) throw cmErr

      setTransactions(prev => [newTx, ...prev])
      setCommissions(prev => {
        const next = { ...prev, [newTx.id]: newCm }
        commissionsRef.current = next
        return next
      })
      setIntakeOpen(false)
      toast.success('Transaction created!')
    } catch (err) {
      toast.error('Failed to create transaction')
      console.error(err)
    }
  }

  // ── Edit transaction (TransactionModal) ─────────────────────────────────────
  const handleEdit = (transaction) => {
    setEditingTransaction(transaction)
    setModalOpen(true)
  }

  const handleSave = async (data) => {
    if (!editingTransaction) { setModalOpen(false); return }

    // Strip DB-managed fields before update; sanitize price
    const { id, created_at, updated_at, ...updateData } = data
    if ('price' in updateData) updateData.price = parsePrice(updateData.price)

    try {
      const { data: updated, error } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', editingTransaction.id)
        .select()
        .single()
      if (error) throw error

      setTransactions(prev => prev.map(t => t.id === editingTransaction.id ? updated : t))

      // Keep side panel in sync if it's open for this transaction
      if (selectedTransaction?.id === editingTransaction.id) setSelectedTransaction(updated)

      toast.success('Transaction updated!')
    } catch (err) {
      toast.error('Failed to update transaction')
      console.error(err)
    }
    setModalOpen(false)
    setEditingTransaction(null)
  }

  // ── Drag-drop status change ─────────────────────────────────────────────────
  const handleStatusChange = async (transactionId, newStatus) => {
    // Optimistic update for instant UI response
    setTransactions(prev =>
      prev.map(t => t.id === transactionId ? { ...t, status: newStatus } : t)
    )

    const { error } = await supabase
      .from('transactions')
      .update({ status: newStatus })
      .eq('id', transactionId)

    if (error) {
      toast.error('Failed to save status change')
      // Revert by reloading from DB
      const { data } = await supabase
        .from('transactions').select('*').order('created_at', { ascending: false })
      if (data) setTransactions(data)
    }
  }

  // ── Inline field save from side panel ──────────────────────────────────────
  const handleFieldSave = async (field, value) => {
    if (!selectedTransaction) return
    const txId = selectedTransaction.id
    const dbValue = field === 'price' ? parsePrice(value) : value
    const updated = { ...selectedTransaction, [field]: dbValue }

    setTransactions(prev => prev.map(t => t.id === txId ? updated : t))
    setSelectedTransaction(updated)

    const { error } = await supabase
      .from('transactions')
      .update({ [field]: dbValue })
      .eq('id', txId)

    if (error) {
      toast.error('Failed to save field')
      console.error(error)
    }
  }

  // ── Delete transaction ──────────────────────────────────────────────────────
  const handleDelete = async (transactionId) => {
    // Optimistic remove
    setTransactions(prev => prev.filter(t => t.id !== transactionId))
    setCommissions(prev => {
      const next = { ...prev }
      delete next[transactionId]
      commissionsRef.current = next
      return next
    })

    // Supabase cascade deletes the commission row automatically
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transactionId)

    if (error) {
      toast.error('Failed to delete transaction')
      // Reload to restore consistent state
      const { data } = await supabase
        .from('transactions').select('*').order('created_at', { ascending: false })
      if (data) setTransactions(data)
    } else {
      toast.success('Transaction removed!')
    }
  }

  // ── Commission field change (debounced upsert) ──────────────────────────────
  const handleCommissionChange = useCallback((txId, field, value) => {
    // Immediate local update
    setCommissions(prev => {
      const next = { ...prev, [txId]: { ...(prev[txId] || {}), [field]: value } }
      commissionsRef.current = next
      return next
    })

    // Debounce: wait 600ms after last keystroke before writing to DB
    clearTimeout(saveTimers.current[txId])
    saveTimers.current[txId] = setTimeout(async () => {
      const cm = commissionsRef.current[txId] || {}
      const { error } = await supabase
        .from('commissions')
        .upsert({
          transaction_id:    txId,
          commission_rate:   cm.commission_rate   ?? null,
          ref_percent:       cm.ref_percent !== '' && cm.ref_percent != null ? Number(cm.ref_percent) : null,
          tc_fee:            cm.tc_fee      !== '' && cm.tc_fee      != null ? Number(cm.tc_fee)      : null,
          commission_status: cm.commission_status || 'Pending',
        }, { onConflict: 'transaction_id' })

      if (error) console.error('Commission save error:', error)
    }, 600)
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="app">
        <div className="app-loading">Loading…</div>
      </div>
    )
  }

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
          <button
            className={`tab-btn ${activeTab === 'board' ? 'active' : ''}`}
            onClick={() => setActiveTab('board')}
          >
            Board
          </button>
          <button
            className={`tab-btn ${activeTab === 'commissions' ? 'active' : ''}`}
            onClick={() => setActiveTab('commissions')}
          >
            Commissions
          </button>
        </div>
      </header>

      <main className="app-main">
        {activeTab === 'board' && (
          <div className="board-toolbar">
            <button className="btn-new-transaction" onClick={() => setIntakeOpen(true)}>
              + New Transaction
            </button>
          </div>
        )}
        {activeTab === 'board' ? (
          <KanbanBoard
            columns={COLUMNS}
            transactions={transactions}
            onEdit={handleEdit}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
            onCardClick={(tx) => setSelectedTransaction(tx)}
            commissions={commissions}
          />
        ) : (
          <CommissionsTab
            transactions={transactions}
            commissions={commissions}
            onCommissionChange={handleCommissionChange}
          />
        )}
      </main>

      {selectedTransaction && (
        <TransactionPanel
          transaction={selectedTransaction}
          columns={COLUMNS}
          commissions={commissions}
          onClose={() => setSelectedTransaction(null)}
          onFieldSave={handleFieldSave}
          onCommissionChange={handleCommissionChange}
          onDelete={handleDelete}
        />
      )}

      {intakeOpen && (
        <IntakeModal
          onSave={handleIntakeSave}
          onClose={() => setIntakeOpen(false)}
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
    </div>
  )
}
