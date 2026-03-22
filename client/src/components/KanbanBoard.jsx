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

  const mainColumns = columns.filter(c => c.id !== 'cancelled-expired')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  const activeTransaction = activeId ? transactions.find(t => t.id === activeId) : null
  const activeColumn = activeTransaction ? columns.find(c => c.id === activeTransaction.status) : null

  const handleDragStart = ({ active }) => setActiveId(active.id)

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null)
    if (!over) return
    if (over.id) onStatusChange(active.id, over.id)
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
