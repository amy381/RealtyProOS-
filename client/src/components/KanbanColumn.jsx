import { useDroppable } from '@dnd-kit/core'
import TransactionCard from './TransactionCard'
import ColumnFooter from './ColumnFooter'
import './KanbanColumn.css'

export default function KanbanColumn({ column, transactions, onEdit, onDelete, onCardClick, commissions }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div
      ref={setNodeRef}
      className={`kanban-column ${isOver ? 'is-over' : ''}`}
      style={{ background: column.bgColor }}
    >
      <div className="column-header" style={{ borderTopColor: column.color, background: column.bgColor }}>
        <div className="column-title-row">
          <span className="column-dot" style={{ background: column.color }} />
          <h3 className="column-title">{column.label}</h3>
        </div>
        <span className="column-count">{transactions.length}</span>
      </div>

      <div className="column-cards">
        {transactions.length === 0 && (
          <div className="column-empty">Drop cards here</div>
        )}
        {transactions.map((tx) => (
          <TransactionCard
            key={tx.id}
            transaction={tx}
            onEdit={onEdit}
            onDelete={onDelete}
            onCardClick={onCardClick}
            priceLabel={column.priceLabel}
          />
        ))}
      </div>

      <ColumnFooter transactions={transactions} commissions={commissions} columnLabel={column.label} />
    </div>
  )
}
