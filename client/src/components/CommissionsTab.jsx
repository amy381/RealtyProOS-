import { useState, useMemo } from 'react'
import './CommissionsTab.css'

const CAP_RATE      = 0.30
const CAP_LIMIT     = 10000
const ROYALTY_RATE  = 0.06
const ROYALTY_LIMIT = 3000
const EO_FLAT       = 35

const COMMISSION_STATUSES = new Set(['pending', 'closed'])
const FILTERS = ['All', 'Pending', 'Closed', 'Buyer', 'Seller']

function getCapYearStart() {
  const today = new Date()
  const year = today.getMonth() >= 5 ? today.getFullYear() : today.getFullYear() - 1
  return new Date(year, 5, 1)
}

function fmt(n) {
  if (!n || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtCents(n) {
  if (n === null || n === undefined || isNaN(n) || Number(n) === 0) return '—'
  return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}/${dt.getFullYear()}`
}

function calcGCI(t, c) {
  const price     = Number(t.price) || 0
  const scFlat    = c.seller_concession_flat     != null ? Number(c.seller_concession_flat)     : null
  const scPct     = Number(c.seller_concession_percent)  || 0
  const bcFlat    = c.buyer_contribution_flat    != null ? Number(c.buyer_contribution_flat)    : null
  const bcPct     = Number(c.buyer_contribution_percent) || 0
  const sellerGCI = scFlat != null ? scFlat : scPct / 100 * price
  const buyerGCI  = bcFlat != null ? bcFlat : bcPct / 100 * price
  return sellerGCI + buyerGCI
}

// Mirrors CommissionSection calculation from TransactionDetailPage exactly
function calcRow(t, c) {
  const referralPct = Number(t.referral_pct) || 0
  const gci         = calcGCI(t, c)

  const referralAmt    = referralPct > 0 ? gci * referralPct / 100 : 0
  const capAmt         = c.cap_deduction     ? gci * CAP_RATE    : 0
  const royaltyAmt     = c.royalty_deduction ? gci * ROYALTY_RATE : 0
  const eoAmt          = gci > 0 ? EO_FLAT : 0
  const tcFeeAmt       = Number(c.tc_fee_commission) || 0
  const concessionsAmt = Number(c.concessions) || 0
  const net            = gci - referralAmt - capAmt - royaltyAmt - eoAmt - tcFeeAmt - concessionsAmt

  return { gci, referralAmt, capAmt, royaltyAmt, net, tcFeeAmt }
}

function statusFromStage(s) {
  return s === 'closed' ? 'Closed' : 'Pending'
}

const NET_TOOLTIP = 'Net = GCI − Ref $ − Cap (30%, if checked, max $10k/yr) − Royalty (6%, if checked, max $3k/yr) − E&O ($35) − TC Fee − Concessions. Cap & Royalty reset June 1.'

const COLS = [
  { key: 'address',     label: 'Transaction Address' },
  { key: 'rep',         label: 'Rep'                 },
  { key: 'coe',         label: 'COE'                 },
  { key: 'sale_price',  label: 'Sale Price'          },
  { key: 'comp',        label: 'Comp'                },
  { key: 'gci',         label: 'GCI'                 },
  { key: 'net',         label: 'Net', tooltip: NET_TOOLTIP },
  { key: 'ref_percent', label: 'Ref %'               },
  { key: 'ref_dollar',  label: 'Ref $'               },
  { key: 'cap',         label: 'Cap'                 },
  { key: 'royalty',     label: 'Royalty'             },
  { key: 'tc_fee',      label: 'TC Fee'              },
  { key: 'status',      label: 'Status'              },
  { key: '_delete',     label: ''                    },
]

// True when a commissions record has enough data to compute GCI.
// commission_rate was never wired to a UI input — gate on concession fields instead.
function hasCommissionData(c) {
  return (
    (c.commission_rate != null && !isNaN(parseFloat(c.commission_rate))) ||
    c.seller_concession_percent != null ||
    c.seller_concession_flat    != null ||
    c.buyer_contribution_percent != null ||
    c.buyer_contribution_flat    != null
  )
}

// Derive a Comp display string: explicit commission_rate wins; fall back to
// summing the two concession percentages if no flat amounts were used.
function deriveComp(c) {
  if (c.commission_rate != null && !isNaN(parseFloat(c.commission_rate))) {
    return String(c.commission_rate)
  }
  if (c.seller_concession_flat == null && c.buyer_contribution_flat == null) {
    const pct = (Number(c.seller_concession_percent) || 0) +
                (Number(c.buyer_contribution_percent) || 0)
    if (pct > 0) return `${pct}%`
  }
  return '—'
}

function computeAllRows(transactions, commissions) {
  const capYearStart = getCapYearStart()

  // Transactions in the current cap year (COE >= June 1)
  const inCapYear = new Set()
  for (const t of transactions) {
    if (!t.close_of_escrow) continue
    if (new Date(t.close_of_escrow + 'T00:00:00') >= capYearStart) inCapYear.add(t.id)
  }

  // Sort cap-year transactions chronologically for accurate YTD accumulation
  const capYearSorted = transactions
    .filter(t => inCapYear.has(t.id))
    .sort((a, b) => {
      const da = new Date(a.close_of_escrow + 'T00:00:00')
      const db = new Date(b.close_of_escrow + 'T00:00:00')
      return da - db || a.id.localeCompare(b.id)
    })

  let capPaidYTD = 0, royaltyPaidYTD = 0
  const capByTx = {}, royaltyByTx = {}

  for (const t of capYearSorted) {
    const c       = commissions[t.id] || {}
    const hasCm   = hasCommissionData(c)
    const { gci } = hasCm ? calcRow(t, c) : { gci: 0 }
    const refPct  = Number(t.referral_pct) || 0
    const gciAfterRef = gci - gci * refPct / 100

    const capThisTx = hasCm && c.cap_deduction
      ? Math.min(gciAfterRef * CAP_RATE,    Math.max(0, CAP_LIMIT     - capPaidYTD))
      : 0
    const royaltyThisTx = hasCm && c.royalty_deduction
      ? Math.min(gciAfterRef * ROYALTY_RATE, Math.max(0, ROYALTY_LIMIT - royaltyPaidYTD))
      : 0

    capPaidYTD     += capThisTx
    royaltyPaidYTD += royaltyThisTx
    capByTx[t.id]     = capThisTx
    royaltyByTx[t.id] = royaltyThisTx
  }

  const rows = transactions.map(t => {
    const c     = commissions[t.id] || {}
    const hasCm = hasCommissionData(c)
    const { gci, referralAmt, net, tcFeeAmt } = hasCm ? calcRow(t, c) : {}
    const refPct = Number(t.referral_pct) || 0

    return {
      id:          t.id,
      address:     t.property_address || '—',
      rep:         t.rep_type         || '—',
      coe:         t.close_of_escrow  || '',
      sale_price:  Number(t.price)    || 0,
      comp:        deriveComp(c),
      gci:         hasCm ? gci         : null,
      net:         hasCm ? net         : null,
      ref_percent: hasCm ? (refPct || '—') : '—',
      ref_dollar:  hasCm ? referralAmt  : null,
      cap:         hasCm ? (capByTx[t.id]     ?? 0) : null,
      royalty:     hasCm ? (royaltyByTx[t.id] ?? 0) : null,
      tc_fee:      hasCm ? tcFeeAmt     : null,
      status:      statusFromStage(t.status),
    }
  })

  return { rows, capPaidYTD, royaltyPaidYTD }
}

export default function CommissionsTab({ transactions, commissions, onDeleteCommission }) {
  const [sortKey,      setSortKey]      = useState('coe')
  const [sortDir,      setSortDir]      = useState('asc')
  const [activeFilter, setActiveFilter] = useState('All')

  const handleSort = key => {
    if (key === '_delete') return
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const eligibleTx = useMemo(
    () => transactions.filter(t => COMMISSION_STATUSES.has(t.status)),
    [transactions]
  )

  const { rows, capPaidYTD, royaltyPaidYTD } = useMemo(
    () => computeAllRows(eligibleTx, commissions),
    [eligibleTx, commissions]
  )

  const visibleRows = useMemo(() => {
    switch (activeFilter) {
      case 'Pending': return rows.filter(r => r.status === 'Pending')
      case 'Closed':  return rows.filter(r => r.status === 'Closed')
      case 'Buyer':   return rows.filter(r => r.rep    === 'Buyer')
      case 'Seller':  return rows.filter(r => r.rep    === 'Seller')
      default:        return rows
    }
  }, [rows, activeFilter])

  const sorted = useMemo(() => [...visibleRows].sort((a, b) => {
    const av = a[sortKey] ?? ''; const bv = b[sortKey] ?? ''
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ?  1 : -1
    return 0
  }), [visibleRows, sortKey, sortDir])

  const totals = visibleRows.reduce((acc, r) => ({
    sale_price: acc.sale_price + (r.sale_price || 0),
    gci:        acc.gci        + (r.gci        || 0),
    ref_dollar: acc.ref_dollar + (r.ref_dollar || 0),
    cap:        acc.cap        + (r.cap        || 0),
    royalty:    acc.royalty    + (r.royalty    || 0),
    net:        acc.net        + (r.net        || 0),
    tc_fee:     acc.tc_fee     + (r.tc_fee     || 0),
  }), { sale_price: 0, gci: 0, ref_dollar: 0, cap: 0, royalty: 0, net: 0, tc_fee: 0 })

  const capPct     = Math.min(capPaidYTD     / CAP_LIMIT     * 100, 100)
  const royaltyPct = Math.min(royaltyPaidYTD / ROYALTY_LIMIT * 100, 100)

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
        {FILTERS.map(f => (
          <button
            key={f}
            className={`commissions-filter-btn${activeFilter === f ? ' active' : ''}`}
            onClick={() => setActiveFilter(f)}
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
                  className={[
                    sortKey === col.key ? 'sorted' : '',
                    col.key === '_delete' ? 'no-sort' : '',
                  ].filter(Boolean).join(' ')}
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
              <tr key={row.id} className={`row-${row.status.toLowerCase()}`}>
                <td className="addr-cell">{row.address}</td>
                <td className="computed">{row.rep}</td>
                <td className="computed">{fmtDate(row.coe)}</td>
                <td className="computed">{fmt(row.sale_price)}</td>
                <td className="computed">{row.comp}</td>
                <td className="computed">{fmtCents(row.gci)}</td>
                <td className="computed net-cell">{fmtCents(row.net)}</td>
                <td className="computed">{row.ref_percent !== '—' ? `${row.ref_percent}%` : '—'}</td>
                <td className="computed">{fmtCents(row.ref_dollar)}</td>
                <td className="computed">{fmtCents(row.cap)}</td>
                <td className="computed">{fmtCents(row.royalty)}</td>
                <td className="computed">{fmtCents(row.tc_fee)}</td>
                <td className="computed">
                  <span className={`commission-status-badge status-${row.status.toLowerCase()}`}>
                    {row.status}
                  </span>
                </td>
                <td className="delete-cell">
                  <button
                    className="commission-delete-btn"
                    onClick={() => {
                      if (window.confirm('Remove this commission row?')) onDeleteCommission(row.id)
                    }}
                    title="Delete row"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="totals-row">
              <td><strong>Totals</strong></td>
              <td></td><td></td>
              <td className="computed"><strong>{fmt(totals.sale_price)}</strong></td>
              <td></td>
              <td className="computed"><strong>{fmtCents(totals.gci)}</strong></td>
              <td className="computed"><strong>{fmtCents(totals.net)}</strong></td>
              <td></td>
              <td className="computed"><strong>{fmtCents(totals.ref_dollar)}</strong></td>
              <td className="computed"><strong>{fmtCents(totals.cap)}</strong></td>
              <td className="computed"><strong>{fmtCents(totals.royalty)}</strong></td>
              <td className="computed"><strong>{fmtCents(totals.tc_fee)}</strong></td>
              <td></td><td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
