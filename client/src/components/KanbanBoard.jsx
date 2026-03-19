import {
  DndContext,
  DragOverlay,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useState } from 'react'
import KanbanColumn from './KanbanColumn'
import TransactionCard from './TransactionCard'
import './KanbanBoard.css'

export default function KanbanBoard({ columns, transactions, onEdit, onStatusChange, onDelete, onCardClick, commissions }) {
  const [activeId, setActiveId] = useState(null)
  const [showCancelled, setShowCancelled] = useState(false)

  // Main board columns — always exclude cancelled/expired from the top board
  const mainColumns = columns.filter(c => c.id !== 'cancelled-expired')
  const cancelledTxns = transactions.filter(t => t.status === 'cancelled-expired')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  const activeTransaction = activeId ? transactions.find(t => t.id === activeId) : null
  const activeColumn = activeTransaction ? columns.find(c => c.id === activeTransaction.status) : null

  const handleDragStart = ({ active }) => setActiveId(active.id)

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null)
    console.log('[Drag] handleDragEnd fired — active.id:', active.id, '| over:', over ? over.id : 'null (dropped outside)')
    if (!over) return
    if (over.id) {
      console.log('[Drag] Calling onStatusChange with transactionId:', active.id, '→ newStatus:', over.id)
      onStatusChange(active.id, over.id)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="kanban-board-wrap">

        <div className="kanban-board">
          {/* Left stacked panel: Pre-Listing on top, Buyer-Broker below */}
          <div className="stacked-list-panel">
            {mainColumns.filter(c => c.viewMode === 'list').map(col => (
              <KanbanColumn
                key={col.id}
                column={col}
                transactions={transactions.filter(t => t.status === col.id)}
                onEdit={onEdit}
                onDelete={onDelete}
                onCardClick={onCardClick}
                commissions={commissions}
              />
            ))}
          </div>

          {/* Card columns */}
          {mainColumns.filter(c => c.viewMode !== 'list').map(col => (
            <KanbanColumn
              key={col.id}
              column={col}
              transactions={transactions.filter(t => t.status === col.id)}
              onEdit={onEdit}
              onDelete={onDelete}
              onCardClick={onCardClick}
              commissions={commissions}
            />
          ))}
        </div>

        {/* Cancelled / Expired — collapsed section below the board */}
        <div className="cancelled-section">
          <button
            className="cancelled-section-toggle"
            onClick={() => setShowCancelled(s => !s)}
          >
            {showCancelled ? '▼' : '▶'}&nbsp; Cancelled / Expired ({cancelledTxns.length})
          </button>
          {showCancelled && (
            <div className="cancelled-section-rows">
              {cancelledTxns.length === 0 ? (
                <span className="cancelled-section-empty">No cancelled transactions</span>
              ) : (
                cancelledTxns.map(tx => (
                  <div
                    key={tx.id}
                    className="cancelled-section-row"
                    onClick={() => onCardClick(tx)}
                  >
                    <span className="csr-addr">{tx.property_address || '—'}</span>
                    <span className="csr-client">{tx.client_name || '—'}</span>
                    <span className="csr-rep">{tx.rep_type || ''}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

      </div>

      <DragOverlay>
        {activeTransaction ? (
          activeColumn?.viewMode === 'list' ? (
            <div className="list-drag-pill">
              {activeTransaction.property_address || '(No address)'}
            </div>
          ) : (
            <TransactionCard transaction={activeTransaction} isDragging viewMode={activeColumn?.viewMode} />
          )
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
