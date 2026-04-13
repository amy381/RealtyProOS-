import { useState, useEffect, useRef } from 'react'
import './DateInput.css'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

function buildDate(yearStr, monthStr, dayStr) {
  let y = parseInt(yearStr, 10)
  const mo = parseInt(monthStr, 10)
  const d  = parseInt(dayStr,  10)
  if (String(yearStr).length === 2) y = y <= 30 ? 2000 + y : 1900 + y
  if (isNaN(y) || isNaN(mo) || isNaN(d)) return null
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const date = new Date(y, mo - 1, d)
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseTyped(str) {
  if (!str || !str.trim()) return null
  const s = str.trim()

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [yr, mo, dy] = s.split('-').map(Number)
    const d = new Date(yr, mo - 1, dy)
    if (!isNaN(d) && d.getFullYear() === yr) return s
    return null
  }

  // MM/DD/YY or MM/DD/YYYY
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) return buildDate(m[3], m[1], m[2])

  // MM-DD-YY or MM-DD-YYYY
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/)
  if (m) return buildDate(m[3], m[1], m[2])

  // Mon DD YYYY  or  Month DD, YYYY
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m) {
    const idx = MONTHS.findIndex(mn => mn.toLowerCase().startsWith(m[1].toLowerCase()))
    if (idx >= 0) return buildDate(m[3], String(idx + 1), m[2])
    return null
  }

  // MMDDYYYY — 8 digits, no separators: e.g. 02022026
  m = s.match(/^(\d{2})(\d{2})(\d{4})$/)
  if (m) return buildDate(m[3], m[1], m[2])

  // MMDDYY — 6 digits, no separators: e.g. 020226
  m = s.match(/^(\d{2})(\d{2})(\d{2})$/)
  if (m) return buildDate(m[3], m[1], m[2])

  return null
}

function toDisplay(yyyymmdd) {
  if (!yyyymmdd) return ''
  const [y, mo, d] = yyyymmdd.split('-')
  return `${mo}/${d}/${y}`
}

// ─── Calendar popup ───────────────────────────────────────────────────────────

function CalendarPopup({ value, onSelect }) {
  const today = new Date()
  const sel = value
    ? (() => { const [y, m, d] = value.split('-').map(Number); return { y, m: m - 1, d } })()
    : null

  const [vy, setVy] = useState(sel?.y ?? today.getFullYear())
  const [vm, setVm] = useState(sel?.m ?? today.getMonth())

  const daysInMonth = new Date(vy, vm + 1, 0).getDate()
  const startDow    = new Date(vy, vm, 1).getDay()

  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const isToday    = d => d === today.getDate() && vm === today.getMonth() && vy === today.getFullYear()
  const isSelected = d => sel && d === sel.d && vm === sel.m && vy === sel.y

  const prev = () => { if (vm === 0)  { setVm(11); setVy(y => y - 1) } else setVm(m => m - 1) }
  const next = () => { if (vm === 11) { setVm(0);  setVy(y => y + 1) } else setVm(m => m + 1) }

  return (
    <div className="di-popup">
      <div className="di-popup-header">
        <button className="di-popup-nav" onMouseDown={e => e.preventDefault()} onClick={prev}>‹</button>
        <span className="di-popup-label">{MONTHS[vm]} {vy}</span>
        <button className="di-popup-nav" onMouseDown={e => e.preventDefault()} onClick={next}>›</button>
      </div>
      <div className="di-popup-grid">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(dow => (
          <span key={dow} className="di-popup-dow">{dow}</span>
        ))}
        {cells.map((d, i) => d != null ? (
          <button
            key={i}
            className={`di-popup-day${isSelected(d) ? ' sel' : ''}${isToday(d) ? ' tod' : ''}`}
            onMouseDown={e => e.preventDefault()}
            onClick={() => onSelect(buildDate(String(vy), String(vm + 1), String(d)))}
          >
            {d}
          </button>
        ) : (
          <span key={i} className="di-popup-empty" />
        ))}
      </div>
    </div>
  )
}

// ─── DateInput ────────────────────────────────────────────────────────────────

export default function DateInput({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  tabIndex,
  autoFocus,
  style,
}) {
  const [text,    setText]    = useState(() => toDisplay(value))
  const [invalid, setInvalid] = useState(false)
  const [open,    setOpen]    = useState(false)
  const wrapRef  = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setText(toDisplay(value))
    setInvalid(false)
  }, [value])

  const fire = (val) => {
    if (typeof onChange === 'function') {
      onChange({ target: { value: val } })
    }
  }

  const processCommit = () => {
    const t = text.trim()
    if (!t) {
      if (value) fire('')
      setInvalid(false)
      return
    }
    const parsed = parseTyped(t)
    if (parsed) {
      setText(toDisplay(parsed))
      setInvalid(false)
      if (parsed !== value) fire(parsed)
    } else {
      setInvalid(true)
      setTimeout(() => {
        setText('')
        setInvalid(false)
        fire('')
      }, 1200)
    }
  }

  const handleWrapBlur = (e) => {
    if (wrapRef.current?.contains(e.relatedTarget)) return
    setOpen(false)
    processCommit()
    onBlur?.()
  }

  const handleSelect = (yyyymmdd) => {
    fire(yyyymmdd)
    setText(toDisplay(yyyymmdd))
    setInvalid(false)
    setOpen(false)
    onBlur?.()
  }

  return (
    <div className="di-wrap" ref={wrapRef} onBlur={handleWrapBlur} style={style}>
      <input
        ref={inputRef}
        className={`di-text${invalid ? ' di-invalid' : ''}${className ? ` ${className}` : ''}`}
        value={text}
        placeholder={placeholder || 'MM/DD/YYYY'}
        tabIndex={tabIndex}
        autoFocus={autoFocus}
        onChange={e => { setText(e.target.value); setInvalid(false) }}
        onKeyDown={e => {
          if (e.key === 'Enter')  { processCommit(); setOpen(false) }
          if (e.key === 'Escape') { setText(toDisplay(value)); setInvalid(false); setOpen(false) }
        }}
      />
      <button
        className="di-icon-btn"
        tabIndex={-1}
        type="button"
        aria-label="Pick date"
        onMouseDown={e => e.preventDefault()}
        onClick={() => { setOpen(o => !o); inputRef.current?.focus() }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M1 5.5h12" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M4.5 1v3M9.5 1v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </button>
      {open && <CalendarPopup value={value} onSelect={handleSelect} />}
    </div>
  )
}
