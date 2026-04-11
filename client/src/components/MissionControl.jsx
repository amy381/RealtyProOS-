import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import './MissionControl.css'

// ─── Commission calculation (mirrors CommissionsTab / GoalsDashboard) ─────────
function calcGCI(t, c) {
  if (!c) return 0
  const price    = Number(t.price) || 0
  const scFlat   = c.seller_concession_flat  != null ? Number(c.seller_concession_flat)  : null
  const scPct    = Number(c.seller_concession_percent) || 0
  const bcFlat   = c.buyer_contribution_flat != null ? Number(c.buyer_contribution_flat) : null
  const bcPct    = Number(c.buyer_contribution_percent) || 0
  return (scFlat != null ? scFlat : scPct / 100 * price) +
         (bcFlat != null ? bcFlat : bcPct / 100 * price)
}

function calcNet(t, c) {
  if (!c) return 0
  const CAP_RATE = 0.30; const ROYALTY_RATE = 0.06; const EO_FLAT = 35
  const gci         = calcGCI(t, c)
  const referralAmt = (Number(t.referral_pct) || 0) > 0 ? gci * (Number(t.referral_pct) / 100) : 0
  const capAmt      = c.cap_deduction     ? gci * CAP_RATE     : 0
  const royaltyAmt  = c.royalty_deduction ? gci * ROYALTY_RATE : 0
  const eoAmt       = gci > 0 ? EO_FLAT : 0
  const tcFeeAmt    = Number(c.tc_fee_commission) || 0
  const concAmt     = Number(c.concessions) || 0
  return gci - referralAmt - capAmt - royaltyAmt - eoAmt - tcFeeAmt - concAmt
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtShort(n) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000)     return '$' + Math.round(n / 1_000) + 'K'
  return '$' + Math.round(n).toLocaleString()
}

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`
}

function getYear(tx) {
  const d = tx.close_of_escrow || tx.updated_at?.slice(0, 10)
  if (!d) return null
  return new Date(d + (d.length === 10 ? 'T00:00:00' : '')).getFullYear()
}

function getQuarter(tx) {
  const d = tx.close_of_escrow
  if (!d) return null
  return Math.floor(new Date(d + 'T00:00:00').getMonth() / 3) + 1
}

const INITIALS_MAP = { 'Amy Casanova': 'AC', 'Justina Morris': 'JM', 'Victoria Lareau': 'VL' }
function initials(name) {
  if (!name) return '?'
  return INITIALS_MAP[name] || name.trim().slice(0, 2).toUpperCase()
}

const PIPELINE_STAGES = [
  { id: 'pre-listing',    label: 'Pre-Listing'    },
  { id: 'active-listing', label: 'Active Listing' },
  { id: 'pending',        label: 'Pending'        },
  { id: 'closed',         label: 'Closed'         },
]

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return <div className="mc-section-label">{children}</div>
}

function ProgressBar({ pct }) {
  return (
    <div className="mc-bar-track">
      <div className="mc-bar-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function GoalCard({ label, actualStr, goalStr, pct, isAbove }) {
  return (
    <div className="mc-goal-card">
      <div className="mc-goal-label">{label}</div>
      <div className="mc-goal-actual">{actualStr}</div>
      <div className="mc-goal-target">Goal: {goalStr}</div>
      <ProgressBar pct={pct} />
      <div className="mc-goal-footer">
        <span className="mc-goal-pct">{Math.round(pct)}%</span>
        <span className={`mc-goal-indicator${isAbove ? ' mc-goal-indicator--above' : ' mc-goal-indicator--behind'}`}>
          {isAbove ? '↑ Above' : '↓ Behind'}
        </span>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function MissionControl({ transactions, commissions }) {
  const [goals,        setGoals]        = useState(null)
  const [overdueTasks, setOverdueTasks] = useState([])
  const [critDates,    setCritDates]    = useState([])
  const [txMap,        setTxMap]        = useState({})

  const currentYear = new Date().getFullYear()

  // ── Fetch goals from agent_settings ─────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('agent_settings')
      .select('goal_gci, goal_units, goal_volume, goal_avg_price')
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setGoals(data)
      })
  }, [])

  // ── Fetch alerts tasks ───────────────────────────────────────────────────────
  useEffect(() => {
    const today    = new Date(); today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().slice(0, 10)
    const in14     = new Date(today); in14.setDate(today.getDate() + 14)
    const in14Str  = in14.toISOString().slice(0, 10)

    // Due today + overdue
    supabase
      .from('tasks')
      .select('id, title, transaction_id, due_date, assigned_to, task_type')
      .lte('due_date', todayStr)
      .neq('status', 'complete')
      .order('due_date', { ascending: true })
      .limit(8)
      .then(({ data }) => setOverdueTasks(data || []))

    // Upcoming critical dates (next 14 days)
    supabase
      .from('tasks')
      .select('id, title, transaction_id, due_date, task_type')
      .eq('task_type', 'Critical Date')
      .neq('status', 'complete')
      .gt('due_date', todayStr)
      .lte('due_date', in14Str)
      .order('due_date', { ascending: true })
      .limit(8)
      .then(({ data }) => setCritDates(data || []))
  }, [])

  // ── Build txMap for alert labels ─────────────────────────────────────────────
  useEffect(() => {
    const map = {}
    for (const tx of transactions) map[tx.id] = tx
    setTxMap(map)
  }, [transactions])

  // ── Actuals — closed this year ───────────────────────────────────────────────
  const { units, volume, gci, avgPrice, quarters } = useMemo(() => {
    const closed = transactions.filter(t => t.status === 'closed' && getYear(t) === currentYear)
    let vol = 0, gciSum = 0
    for (const t of closed) {
      vol    += Number(t.price) || 0
      gciSum += calcNet(t, commissions[t.id])
    }
    const units    = closed.length
    const avgPrice = units > 0 ? vol / units : 0

    const quarters = [1, 2, 3, 4].map(q => {
      const txns = closed.filter(t => getQuarter(t) === q)
      const qGci = txns.reduce((s, t) => s + calcNet(t, commissions[t.id]), 0)
      return { q, units: txns.length, gci: qGci }
    })

    return { units, volume: vol, gci: gciSum, avgPrice, quarters }
  }, [transactions, commissions, currentYear])

  // ── Pipeline snapshot ────────────────────────────────────────────────────────
  const pipeline = useMemo(() =>
    PIPELINE_STAGES.map(({ id, label }) => {
      const txns = transactions.filter(t => t.status === id)
      const vol  = txns.reduce((s, t) => s + (Number(t.price) || 0), 0)
      return { id, label, count: txns.length, volume: vol }
    }),
  [transactions])

  // ── Goals (with fallback to GoalsDashboard hardcoded values) ─────────────────
  const G = goals
    ? { gci: Number(goals.goal_gci) || 360_000, units: Number(goals.goal_units) || 60,
        volume: Number(goals.goal_volume) || 12_000_000, avgPrice: Number(goals.goal_avg_price) || 200_000 }
    : { gci: 360_000, units: 60, volume: 12_000_000, avgPrice: 200_000 }

  const elapsedPct = (() => {
    const now = Date.now()
    const y0  = new Date(currentYear, 0, 1).getTime()
    const y1  = new Date(currentYear + 1, 0, 1).getTime()
    return (now - y0) / (y1 - y0) * 100
  })()

  const Q_MONTHS = ['Jan – Mar', 'Apr – Jun', 'Jul – Sep', 'Oct – Dec']
  const currentQ = Math.floor(new Date().getMonth() / 3) + 1

  return (
    <div className="mc-wrap">

      {/* ── Section 1: Goal Progress Cards ─────────────────────────────── */}
      <SectionLabel>Annual Goals</SectionLabel>
      <div className="mc-goal-cards">
        <GoalCard
          label="GCI"
          actualStr={fmtShort(gci)}
          goalStr={fmtShort(G.gci)}
          pct={G.gci > 0 ? (gci / G.gci) * 100 : 0}
          isAbove={(gci / G.gci) * 100 >= elapsedPct - 5}
        />
        <GoalCard
          label="Units Sold"
          actualStr={String(units)}
          goalStr={String(G.units)}
          pct={G.units > 0 ? (units / G.units) * 100 : 0}
          isAbove={(units / G.units) * 100 >= elapsedPct - 5}
        />
        <GoalCard
          label="Total Volume"
          actualStr={fmtShort(volume)}
          goalStr={fmtShort(G.volume)}
          pct={G.volume > 0 ? (volume / G.volume) * 100 : 0}
          isAbove={(volume / G.volume) * 100 >= elapsedPct - 5}
        />
        <GoalCard
          label="Avg Purchase Price"
          actualStr={units > 0 ? fmtShort(avgPrice) : '—'}
          goalStr={fmtShort(G.avgPrice)}
          pct={G.avgPrice > 0 ? (avgPrice / G.avgPrice) * 100 : 0}
          isAbove={avgPrice >= G.avgPrice}
        />
      </div>

      {/* ── Section 2: Quarterly Breakdown ─────────────────────────────── */}
      <SectionLabel>Quarterly Breakdown</SectionLabel>
      <div className="mc-quarters">
        {quarters.map(({ q, units: qu, gci: qg }) => {
          const isCurrent = q === currentQ
          const isPast    = q < currentQ
          const qUnitGoal = Math.round(G.units / 4)
          const qGciGoal  = G.gci / 4
          return (
            <div
              key={q}
              className={`mc-quarter${isCurrent ? ' mc-quarter--current' : ''}${isPast ? ' mc-quarter--past' : ''}`}
            >
              <div className="mc-quarter-head">
                <span className="mc-quarter-label">Q{q}</span>
                <span className="mc-quarter-months">{Q_MONTHS[q - 1]}</span>
              </div>
              <div className="mc-quarter-row">
                <span className="mc-quarter-key">Units</span>
                <span className="mc-quarter-val">
                  {qu}
                  <span className="mc-quarter-goal"> / {qUnitGoal}</span>
                </span>
              </div>
              <div className="mc-quarter-row">
                <span className="mc-quarter-key">GCI</span>
                <span className="mc-quarter-val">
                  {fmtShort(qg)}
                  <span className="mc-quarter-goal"> / {fmtShort(qGciGoal)}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Section 3: Pipeline Snapshot ───────────────────────────────── */}
      <SectionLabel>Pipeline Snapshot</SectionLabel>
      <div className="mc-pipeline">
        {pipeline.map(({ id, label, count, volume: vol }) => (
          <div key={id} className={`mc-pipeline-card mc-pipeline-card--${id}`}>
            <div className="mc-pipeline-label">{label}</div>
            <div className="mc-pipeline-count">{count}</div>
            <div className="mc-pipeline-vol">{vol > 0 ? fmtShort(vol) : '—'}</div>
          </div>
        ))}
      </div>

      {/* ── Section 4: Alerts ──────────────────────────────────────────── */}
      <SectionLabel>Alerts</SectionLabel>
      <div className="mc-alerts">

        {/* Left — Due Today & Overdue */}
        <div className="mc-alert-panel">
          <div className="mc-alert-panel-title">Due Today &amp; Overdue</div>
          {overdueTasks.length === 0
            ? <div className="mc-alert-empty">No overdue tasks</div>
            : (
              <div className="mc-alert-list">
                {overdueTasks.map(task => {
                  const addr = txMap[task.transaction_id]?.property_address?.split(',')[0] || '—'
                  return (
                    <div key={task.id} className="mc-alert-row">
                      <div className="mc-alert-row-main">
                        <span className="mc-alert-task-title">{task.title}</span>
                        <span className="mc-alert-addr">{addr}</span>
                      </div>
                      <div className="mc-alert-row-meta">
                        <span className={`mc-assignee-bubble`}>{initials(task.assigned_to)}</span>
                        <span className="mc-alert-date">{fmtDate(task.due_date)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>

        {/* Right — Upcoming Critical Dates */}
        <div className="mc-alert-panel">
          <div className="mc-alert-panel-title">Upcoming Critical Dates <span className="mc-alert-panel-sub">next 14 days</span></div>
          {critDates.length === 0
            ? <div className="mc-alert-empty">No critical dates in the next 14 days</div>
            : (
              <div className="mc-alert-list">
                {critDates.map(task => {
                  const addr = txMap[task.transaction_id]?.property_address?.split(',')[0] || '—'
                  return (
                    <div key={task.id} className="mc-alert-row">
                      <div className="mc-alert-row-main">
                        <span className="mc-alert-task-title">{task.title}</span>
                        <span className="mc-alert-addr">{addr}</span>
                      </div>
                      <div className="mc-alert-row-meta">
                        <span className="mc-alert-date mc-alert-date--crit">{fmtDate(task.due_date)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>

      </div>
    </div>
  )
}
