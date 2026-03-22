import { useDroppable } from '@dnd-kit/core'
import TransactionCard from './TransactionCard'
import CompactListRow from './CompactListRow'
import ColumnFooter from './ColumnFooter'
import './KanbanColumn.css'

const LIST_HEADERS = {
  'buyer-broker': ['Address', 'BBA', 'Exp'],
  'pre-listing':  ['Address', 'Listed', 'Exp'],
}

export default function KanbanColumn({ column, transactions, onEdit, onDelete, onCardClick, commissions }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const isListMode = column.viewMode === 'list'
  const headers = LIST_HEADERS[column.id]

  return (
    <div
      ref={setNodeRef}
      className={`kanban-column kanban-column--${column.viewMode} ${isOver ? 'is-over' : ''}`}
      style={{ background: column.bgColor }}
    >
      <div className="column-header" style={{ borderTopColor: column.color }}>
        <div className="column-title-row">
          <span className="column-dot" style={{ background: column.color }} />
          <h3 className="column-title">{column.label}</h3>
        </div>
        <span className="column-count">{transactions.length}</span>
      </div>

      {isListMode ? (
        <div className="column-list">
          {headers && (
            <div className="list-col-header">
              <span className="lch-addr">{headers[0]}</span>
              <span className="lch-d1">{headers[1]}</span>
              <span className="lch-d2">{headers[2]}</span>
            </div>
          )}
          <div className="list-rows">
            {transactions.length === 0 && (
              <div className="column-empty">Drop here</div>
            )}
            {transactions.map(tx => (
              <CompactListRow
                key={tx.id}
                transaction={tx}
                columnId={column.id}
                onCardClick={onCardClick}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="column-cards">
          {transactions.length === 0 && (
            <div className="column-empty">Drop cards here</div>
          )}
          {transactions.map(tx => (
            <TransactionCard
              key={tx.id}
              transaction={tx}
              onEdit={onEdit}
              onDelete={onDelete}
              onCardClick={onCardClick}
              priceLabel={column.priceLabel}
              viewMode={column.viewMode}
            />
          ))}
        </div>
      )}

      <ColumnFooter transactions={transactions} commissions={commissions} columnLabel={column.label} />
    </div>
  )
}
