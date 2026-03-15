import { useState } from 'react'
import './ColumnFooter.css'

const getMetrics = (columnLabel) => [
  { value: 'volume', label: 'Total Volume' },
  { value: 'cards', label: `Total ${columnLabel}` },
  { value: 'commission', label: 'Total Commission' },
  { value: 'avg_price', label: 'Average Price' },
]

function fmt(n) {
  return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function ColumnFooter({ transactions, commissions, columnLabel }) {
  const [metric, setMetric] = useState('volume')
  const METRICS = getMetrics(columnLabel || 'Cards')

  let display = ''
  if (metric === 'volume') {
    display = fmt(transactions.reduce((s, t) => s + (Number(t.price) || 0), 0))
  } else if (metric === 'cards') {
    display = String(transactions.length)
  } else if (metric === 'commission') {
    const total = transactions.reduce((s, t) => {
      const c = commissions?.[t.id] || {}
      return s + ((Number(t.price) || 0) * (Number(c.commission_rate) || 0) / 100)
    }, 0)
    display = fmt(total)
  } else if (metric === 'avg_price') {
    const prices = transactions.map(t => Number(t.price) || 0).filter(Boolean)
    display = prices.length ? fmt(prices.reduce((a, b) => a + b, 0) / prices.length) : '—'
  }

  return (
    <div className="column-footer">
      <select value={metric} onChange={e => setMetric(e.target.value)}>
        {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      <span className="footer-value">{display}</span>
    </div>
  )
}
