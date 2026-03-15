import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import KanbanColumn from './KanbanColumn'
import TransactionCard from './TransactionCard'
import './KanbanBoard.css'

export default function KanbanBoard({ columns, transactions, onEdit, onStatusChange, onDelete, onCardClick, commissions }) {
  const [activeId, setActiveId] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  const activeTransaction = activeId
    ? transactions.find((t) => t.id === activeId)
    : null

  const handleDragStart = ({ active }) => {
    setActiveId(active.id)
  }

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null)
    if (!over) return

    // over.id is always a column id since columns are the only droppables
    const targetColumnId = over.id
    if (targetColumnId) {
      onStatusChange(active.id, targetColumnId)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="kanban-board">
        {columns.map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            transactions={transactions.filter((t) => t.status === col.id)}
            onEdit={onEdit}
            onDelete={onDelete}
            onCardClick={onCardClick}
            commissions={commissions}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTransaction ? (
          <TransactionCard
            transaction={activeTransaction}
            isDragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
