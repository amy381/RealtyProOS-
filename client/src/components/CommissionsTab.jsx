import { useState, useMemo } from 'react'
import './CommissionsTab.css'

const STATUS_OPTIONS = ['Pending', 'Closed']
const EO_FLAT = 35
const CAP_RATE = 0.30
const ROYALTY_RATE = 0.06
const CAP_LIMIT = 10000
const ROYALTY_LIMIT = 3000

const COMMISSION_STATUSES = new Set(['pending', 'closed', 'cancelled-expired'])

// June 1 of the current cap year (cap year runs June 1 – May 31)
function getCapYearStart() {
  const today = new Date()
  const year = today.getMonth() >= 5 ? today.getFullYear() : today.getFullYear() - 1
  return new Date(year, 5, 1) // June 1
}

function fmt(n) {
  if (!n || isNaN(n)) return ''
  return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtCents(n) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return ''
  const num = Number(n)
  if (num === 0) return ''
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  const yyyy = dt.getFullYear()
  return `${mm}/${dd}/${yyyy}`
}

const NET_TOOLTIP = 'Net = (GCI − Ref $) − Cap (30% of GCI after Ref, max $10k/yr) − Royalty (6% of GCI after Ref, max $3k/yr) − E&O ($35 flat) − TC Fee. Cap & Royalty reset June 1. No deductions on COE before June 1.'

const COLS = [
  { key: 'address',           label: 'Transaction Address' },
  { key: 'rep',               label: 'Rep' },
  { key: 'coe',               label: 'COE' },
  { key: 'sale_price',        label: 'Sale Price' },
  { key: 'commission_rate',   label: 'Comp' },
  { key: 'gci',               label: 'GCI' },
  { key: 'net',               label: 'Net', tooltip: NET_TOOLTIP },
  { key: 'ref_percent',       label: 'Ref %' },
  { key: 'ref_dollar',        label: 'Ref $' },
  { key: 'cap',               label: 'Cap' },
  { key: 'royalty',           label: 'Royalty' },
  { key: 'tc_fee',            label: 'TC Fee' },
  { key: 'commission_status', label: 'Status' },
]

function gciForTx(t, c) {
  const salePrice = Number(t.price) || 0
  const rateVal = (c.commission_rate || '').toString().trim()
  const isFlat = rateVal.startsWith('$')
  return isFlat
    ? (Number(rateVal.replace(/[$,]/g, '')) || 0)
    : salePrice * (Number(rateVal) || 0) / 100
}

// Batch-computes all rows + YTD totals.
// Cap/royalty accumulate chronologically across eligible transactions.
function computeAllRows(transactions, commissions) {
  const capYearStart = getCapYearStart()

  // Determine which transactions are in the cap year (have COE >= capYearStart)
  const inCapYear = new Set()
  for (const t of transactions) {
    if (!t.close_of_escrow) continue
    const coe = new Date(t.close_of_escrow + 'T00:00:00')
    if (coe >= capYearStart) inCapYear.add(t.id)
  }

  // Sort cap-year transactions by COE to accumulate in order
  const sorted = transactions
    .filter(t => inCapYear.has(t.id))
    .sort((a, b) => {
      const da = new Date(a.close_of_escrow + 'T00:00:00')
      const db = new Date(b.close_of_escrow + 'T00:00:00')
      return da - db || a.id.localeCompare(b.id)
    })

  let capPaidYTD = 0
  let royaltyPaidYTD = 0
  const capByTx = {}
  const royaltyByTx = {}

  for (const t of sorted) {
    const c = commissions[t.id] || {}
    const gci = gciForTx(t, c)
    const refPercent = Number(c.ref_percent) || 0
    const gciAfterRef = gci - (gci * refPercent / 100)

    const capThisTx = Math.min(gciAfterRef * CAP_RATE, Math.max(0, CAP_LIMIT - capPaidYTD))
    const royaltyThisTx = Math.min(gciAfterRef * ROYALTY_RATE, Math.max(0, ROYALTY_LIMIT - royaltyPaidYTD))

    capPaidYTD += capThisTx
    royaltyPaidYTD += royaltyThisTx
    capByTx[t.id] = capThisTx
    royaltyByTx[t.id] = royaltyThisTx
  }

  const rows = transactions.map(t => {
    const c = commissions[t.id] || {}
    const salePrice = Number(t.price) || 0
    const gci = gciForTx(t, c)
    const refPercent = Number(c.ref_percent) || 0
    const refDollar = gci * refPercent / 100
    const gciAfterRef = gci - refDollar
    const cap = capByTx[t.id] ?? 0
    const royalty = royaltyByTx[t.id] ?? 0
    const tcFee = Number(c.tc_fee) || 0
    const eo = gci > 0 ? EO_FLAT : 0
    const net = Math.max(0, gciAfterRef - cap - royalty - eo - tcFee)

    return {
      id: t.id,
      address:           t.property_address,
      coe:               t.close_of_escrow || '',
      sale_price:        salePrice,
      commission_rate:   c.commission_rate || '',
      gci,
      net,
      ref_percent:       c.ref_percent || '',
      ref_dollar:        refDollar,
      cap,
      royalty,
      tc_fee:            c.tc_fee || '',
      rep:               t.rep_type || '',
      commission_status: c.commission_status || 'Pending',
    }
  })

  return { rows, capPaidYTD, royaltyPaidYTD }
}

export default function CommissionsTab({ transactions, commissions, onCommissionChange }) {
  const [sortKey, setSortKey] = useState('coe')
  const [sortDir, setSortDir] = useState('asc')
  const [statusFilter, setStatusFilter] = useState('All')

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filteredTransactions = useMemo(
    () => transactions.filter(t => COMMISSION_STATUSES.has(t.status)),
    [transactions]
  )

  const { rows, capPaidYTD, royaltyPaidYTD } = useMemo(
    () => computeAllRows(filteredTransactions, commissions),
    [filteredTransactions, commissions]
  )

  const visibleRows = useMemo(
    () => statusFilter === 'All' ? rows : rows.filter(r => r.commission_status === statusFilter),
    [rows, statusFilter]
  )

  const sorted = useMemo(() => [...visibleRows].sort((a, b) => {
    const av = a[sortKey] ?? ''; const bv = b[sortKey] ?? ''
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  }), [visibleRows, sortKey, sortDir])

  const totals = rows.reduce((acc, r) => ({
    sale_price: acc.sale_price + r.sale_price,
    gci:        acc.gci        + r.gci,
    ref_dollar: acc.ref_dollar + r.ref_dollar,
    net:        acc.net        + r.net,
    tc_fee:     acc.tc_fee     + (Number(r.tc_fee) || 0),
  }), { sale_price: 0, gci: 0, ref_dollar: 0, net: 0, tc_fee: 0 })

  const capPct     = Math.min(capPaidYTD / CAP_LIMIT * 100, 100)
  const royaltyPct = Math.min(royaltyPaidYTD / ROYALTY_LIMIT * 100, 100)

  const numInput = (row, field) => (
    <input
      type="number"
      value={row[field]}
      onChange={e => onCommissionChange(row.id, field, e.target.value)}
    />
  )

  return (
    <div className="commissions-tab">

      <div className="cap-tracker">
        <div className="cap-tracker-item">
          <div className="cap-tracker-label">
            <span>Cap Paid YTD</span>
            <span className="cap-tracker-amounts">
              {fmt(capPaidYTD)} <span className="cap-tracker-limit">/ $10,000</span>
            </span>
          </div>
          <div className="cap-tracker-bar">
            <div className="cap-tracker-fill cap-fill" style={{ width: `${capPct}%` }} />
          </div>
        </div>
        <div className="cap-tracker-item">
          <div className="cap-tracker-label">
            <span>Royalty Paid YTD</span>
            <span className="cap-tracker-amounts">
              {fmt(royaltyPaidYTD)} <span className="cap-tracker-limit">/ $3,000</span>
            </span>
          </div>
          <div className="cap-tracker-bar">
            <div className="cap-tracker-fill royalty-fill" style={{ width: `${royaltyPct}%` }} />
          </div>
        </div>
      </div>

      <div className="commissions-filter-bar">
        {['All', 'Pending', 'Closed'].map(f => (
          <button
            key={f}
            className={`commissions-filter-btn${statusFilter === f ? ' active' : ''}`}
            onClick={() => setStatusFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="commissions-scroll">
        <table className="commissions-table">
          <thead>
            <tr>
              {COLS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={sortKey === col.key ? 'sorted' : ''}
                >
                  {col.label}
                  {col.tooltip && (
                    <span className="col-tooltip-wrap">
                      <span className="col-tooltip-icon">ⓘ</span>
                      <span className="col-tooltip-box">{col.tooltip}</span>
                    </span>
                  )}
                  {sortKey === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.id} className={`row-${(row.commission_status || 'pending').toLowerCase().replace(/\s+/g, '-')}`}>
                <td className="addr-cell">{row.address}</td>
                <td className="computed">{row.rep}</td>
                <td>{fmtDate(row.coe)}</td>
                <td>{fmt(row.sale_price)}</td>
                <td>
                  <input
                    type="text"
                    value={row.commission_rate}
                    onChange={e => onCommissionChange(row.id, 'commission_rate', e.target.value)}
                  />
                </td>
                <td className="computed">{fmtCents(row.gci)}</td>
                <td className="computed net-cell">{fmtCents(row.net)}</td>
                <td>{numInput(row, 'ref_percent')}</td>
                <td className="computed">{fmtCents(row.ref_dollar)}</td>
                <td className="computed">{fmtCents(row.cap)}</td>
                <td className="computed">{fmtCents(row.royalty)}</td>
                <td>{numInput(row, 'tc_fee')}</td>
                <td>
                  <select value={row.commission_status} onChange={e => onCommissionChange(row.id, 'commission_status', e.target.value)}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="totals-row">
              <td><strong>Totals</strong></td>
              <td></td><td></td>
              <td>{fmt(totals.sale_price)}</td>
              <td></td>
              <td><strong>{fmtCents(totals.gci)}</strong></td>
              <td><strong>{fmtCents(totals.net)}</strong></td>
              <td></td>
              <td>{fmtCents(totals.ref_dollar)}</td>
              <td></td><td></td>
              <td>{fmtCents(totals.tc_fee)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
