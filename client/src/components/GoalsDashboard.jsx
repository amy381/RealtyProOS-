import { useMemo } from 'react'
import './GoalsDashboard.css'

// ─── Annual goals ─────────────────────────────────────────────────────────────
const GOALS = {
  units:    60,
  gci:      360_000,
  volume:   12_000_000,
  avgPrice: 200_000,
}

const Q_UNITS_GOAL = 15
const Q_GCI_GOAL   = 90_000

// ─── Helpers ──────────────────────────────────────────────────────────────────
function gciFor(transaction, commission) {
  if (!commission) return 0
  const price  = Number(transaction.price) || 0
  const rate   = Number((commission.commission_rate || '').toString().replace(/[$,%]/g, '').trim()) || 0
  const isFlat = (commission.commission_type || 'pct') === 'flat'
  return isFlat ? rate : price * rate / 100
}

function fmtShort(n) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000)     return '$' + Math.round(n / 1_000) + 'K'
  return '$' + Math.round(n).toLocaleString()
}

function fmtWhole(n) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function getYearOf(tx) {
  const d = tx.close_of_escrow || tx.updated_at?.slice(0, 10)
  if (!d) return null
  return new Date(d + (d.length === 10 ? 'T00:00:00' : '')).getFullYear()
}

function getQuarterOf(tx) {
  const d = tx.close_of_escrow
  if (!d) return null
  const month = new Date(d + 'T00:00:00').getMonth()
  return Math.floor(month / 3) + 1
}

function pace(actualPct, elapsedPct) {
  const diff = actualPct - elapsedPct
  if (diff >  5) return '↑ Ahead'
  if (diff > -5) return '→ On pace'
  return '↓ Behind'
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ProgressBar({ pct }) {
  return (
    <div className="gd-bar-wrap">
      <div className="gd-bar-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function MetricCard({ label, actualStr, goalStr, pct, paceStr }) {
  return (
    <div className="gd-card">
      <div className="gd-card-label">{label}</div>
      <div className="gd-card-actual">{actualStr}</div>
      <div className="gd-card-goal">Goal: {goalStr}</div>
      <ProgressBar pct={pct} />
      <div className="gd-card-footer">
        <span className="gd-pct">{Math.round(pct)}%</span>
        <span className="gd-pace">{paceStr}</span>
      </div>
    </div>
  )
}

function AvgPriceCard({ actual, goal }) {
  const hasData = actual > 0
  const pct     = hasData ? (actual / goal) * 100 : 0
  const diff    = actual - goal
  const arrow   = diff >= 0 ? '↑ Above goal' : '↓ Below goal'
  return (
    <div className="gd-card">
      <div className="gd-card-label">Avg Purchase Price</div>
      <div className="gd-card-actual">{hasData ? fmtShort(actual) : '—'}</div>
      <div className="gd-card-goal">Goal: {fmtShort(goal)}</div>
      <ProgressBar pct={pct} />
      <div className="gd-card-footer">
        <span className="gd-pct">{hasData ? Math.round(pct) + '%' : '—'}</span>
        <span className="gd-pace">{hasData ? arrow : 'No data'}</span>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function GoalsDashboard({ transactions, commissions }) {
  const today        = new Date()
  const currentYear  = today.getFullYear()
  const currentQ     = Math.floor(today.getMonth() / 3) + 1

  // % of year elapsed
  const startOfYear  = new Date(currentYear, 0, 1).getTime()
  const endOfYear    = new Date(currentYear + 1, 0, 1).getTime()
  const elapsedPct   = (today.getTime() - startOfYear) / (endOfYear - startOfYear) * 100

  // Closed transactions this year
  const closed = useMemo(() =>
    transactions.filter(t => t.status === 'closed' && getYearOf(t) === currentYear),
  [transactions, currentYear])

  // Annual totals
  const { units, volume, gci, avgPrice } = useMemo(() => {
    let volume = 0, gci = 0
    for (const t of closed) {
      volume += Number(t.price) || 0
      gci    += gciFor(t, commissions[t.id])
    }
    const units    = closed.length
    const avgPrice = units > 0 ? volume / units : 0
    return { units, volume, gci, avgPrice }
  }, [closed, commissions])

  // Quarterly totals
  const quarters = useMemo(() =>
    [1, 2, 3, 4].map(q => {
      const txns = closed.filter(t => getQuarterOf(t) === q)
      const gci  = txns.reduce((s, t) => s + gciFor(t, commissions[t.id]), 0)
      return { q, units: txns.length, gci }
    }),
  [closed, commissions])

  const unitsPct  = (units    / GOALS.units)  * 100
  const gciPct    = (gci      / GOALS.gci)    * 100
  const volumePct = (volume   / GOALS.volume) * 100

  const Q_LABELS = ['Q1', 'Q2', 'Q3', 'Q4']
  const Q_MONTHS = ['Jan – Mar', 'Apr – Jun', 'Jul – Sep', 'Oct – Dec']

  return (
    <div className="gd-wrap">

      {/* Row 1 — metric cards */}
      <div className="gd-cards">
        <MetricCard
          label="Units Sold"
          actualStr={String(units)}
          goalStr={String(GOALS.units)}
          pct={unitsPct}
          paceStr={pace(unitsPct, elapsedPct)}
        />
        <MetricCard
          label="GCI"
          actualStr={fmtShort(gci)}
          goalStr={fmtShort(GOALS.gci)}
          pct={gciPct}
          paceStr={pace(gciPct, elapsedPct)}
        />
        <MetricCard
          label="Total Volume"
          actualStr={fmtShort(volume)}
          goalStr={fmtShort(GOALS.volume)}
          pct={volumePct}
          paceStr={pace(volumePct, elapsedPct)}
        />
        <AvgPriceCard actual={avgPrice} goal={GOALS.avgPrice} />
      </div>

      {/* Row 2 — quarterly breakdown */}
      <div className="gd-quarters">
        {quarters.map(({ q, units: qu, gci: qg }) => {
          const isCurrent = q === currentQ
          const isPast    = q < currentQ
          return (
            <div
              key={q}
              className={`gd-quarter${isCurrent ? ' gd-quarter--current' : ''}${isPast ? ' gd-quarter--past' : ''}`}
            >
              <div className="gq-head">
                <span className="gq-label">{Q_LABELS[q - 1]}</span>
                <span className="gq-months">{Q_MONTHS[q - 1]}</span>
              </div>
              <div className="gq-row">
                <span className="gq-key">Units</span>
                <span className="gq-val">{qu} <span className="gq-goal">/ {Q_UNITS_GOAL}</span></span>
              </div>
              <div className="gq-row">
                <span className="gq-key">GCI</span>
                <span className="gq-val">{fmtShort(qg)} <span className="gq-goal">/ {fmtShort(Q_GCI_GOAL)}</span></span>
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
