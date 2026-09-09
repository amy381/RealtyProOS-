import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { nextAnnotationId, translateAnnotation } from '../lib/pdfAnnotations'

const MIN_SIZE = 2 // scale-1 px — below this a draft is discarded as an accidental click

// Non-destructive rect sign-fix for the live in-progress preview only — a
// drag toward up/left produces a momentarily negative width/height, which
// SVG rejects. normalizeDraft (below) does the same at commit time, but also
// discards too-small shapes, which would make the preview flicker away.
function previewSafe(d) {
  if (d.type !== 'cover' && d.type !== 'redact' && d.type !== 'highlight' && d.type !== 'rectangle') return d
  let { x, y, w, h } = d
  if (w < 0) { x += w; w = -w }
  if (h < 0) { y += h; h = -h }
  return { ...d, x, y, w, h }
}

function normalizeDraft(d) {
  if (d.type === 'cover' || d.type === 'redact' || d.type === 'highlight' || d.type === 'rectangle') {
    let { x, y, w, h } = d
    if (w < 0) { x += w; w = -w }
    if (h < 0) { y += h; h = -h }
    if (w < MIN_SIZE || h < MIN_SIZE) return null
    return { ...d, x, y, w, h }
  }
  if (d.type === 'line' || d.type === 'arrow') {
    return Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < MIN_SIZE ? null : d
  }
  if (d.type === 'ellipse') {
    return d.rx < MIN_SIZE || d.ry < MIN_SIZE ? null : d
  }
  if (d.type === 'pen') {
    return d.points.length < 2 ? null : d
  }
  return d
}

// Renders one annotation's SVG shape. `extraProps` carries selection/drag
// handlers, spread onto the shape element so it only reacts in "select" mode.
function Shape({ a, extraProps }) {
  const strokeW = a.strokeWidth || 2
  switch (a.type) {
    case 'cover':
    case 'redact':
    case 'highlight':
    case 'rectangle':
      return (
        <rect
          x={a.x} y={a.y} width={a.w} height={a.h}
          fill={a.type === 'rectangle' ? 'none' : a.color}
          fillOpacity={a.type === 'highlight' ? (a.opacity ?? 0.35) : (a.type === 'cover' || a.type === 'redact' ? 1 : undefined)}
          stroke={a.type === 'rectangle' ? a.color : 'none'}
          strokeWidth={a.type === 'rectangle' ? strokeW : 0}
          {...extraProps}
        />
      )
    case 'line':
    case 'arrow': {
      const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1)
      const headLen = Math.max(6, strokeW * 4)
      const spread = Math.PI / 7
      return (
        <g {...extraProps}>
          <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={a.color} strokeWidth={strokeW} />
          {a.type === 'arrow' && [-1, 1].map(dir => {
            const ang = angle + Math.PI - dir * spread
            return (
              <line
                key={dir}
                x1={a.x2} y1={a.y2}
                x2={a.x2 + headLen * Math.cos(ang)} y2={a.y2 + headLen * Math.sin(ang)}
                stroke={a.color} strokeWidth={strokeW}
              />
            )
          })}
          {/* invisible fat hit-target so thin lines are easy to select */}
          <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="transparent" strokeWidth={Math.max(strokeW, 14)} />
        </g>
      )
    }
    case 'ellipse':
      return (
        <ellipse
          cx={a.cx} cy={a.cy} rx={a.rx} ry={a.ry}
          fill={a.filled ? a.color : 'none'}
          stroke={a.filled ? 'none' : a.color}
          strokeWidth={a.filled ? 0 : strokeW}
          {...extraProps}
        />
      )
    case 'pen': {
      const d = a.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
      return (
        <g {...extraProps}>
          <path d={d} fill="none" stroke={a.color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(strokeW, 14)} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )
    }
    default:
      return null
  }
}

function boundsOf(a) {
  switch (a.type) {
    case 'cover': case 'redact': case 'highlight': case 'rectangle':
      return { x: a.x, y: a.y, w: a.w, h: a.h }
    case 'line': case 'arrow':
      return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) }
    case 'ellipse':
      return { x: a.cx - a.rx, y: a.cy - a.ry, w: a.rx * 2, h: a.ry * 2 }
    case 'pen': {
      const xs = a.points.map(p => p.x), ys = a.points.map(p => p.y)
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    }
    case 'text':
      return { x: a.x, y: a.y, w: a.w, h: (a.fontSize || 16) * 1.4 }
    default:
      return { x: 0, y: 0, w: 0, h: 0 }
  }
}

export default function PdfAnnotationLayer({
  pageId, scale, baseWidth, baseHeight, annotations,
  tool, color, coverColor, redactColor, textColor, strokeWidth, highlightAlpha, fontSize,
  selectedId, onSelect, onAdd, onPatch, onDelete,
}) {
  const wrapRef = useRef(null)
  const [drafting, setDrafting] = useState(null)
  const [dragging, setDragging] = useState(null) // { id, startX, startY, dx, dy }
  const [editingTextId, setEditingTextId] = useState(null)
  const editingTextareaRef = useRef(null)

  // A textarea created in direct response to a pointerdown can lose the
  // focus() call to the browser's own default mousedown/click focus handling
  // if focused synchronously during that same event — defer to the next
  // frame, once the native gesture has finished, so it reliably sticks.
  useEffect(() => {
    if (!editingTextId) return
    const raf = requestAnimationFrame(() => {
      const el = editingTextareaRef.current
      if (el) { el.focus(); el.select() }
    })
    return () => cancelAnimationFrame(raf)
  }, [editingTextId])

  const interactive = !!tool
  const w = baseWidth * scale
  const h = baseHeight * scale

  const toStored = (e) => {
    const rect = wrapRef.current.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale }
  }

  const handleWrapPointerDown = (e) => {
    if (!tool) return
    if (tool === 'select') {
      if (e.target === wrapRef.current || e.target.tagName === 'svg') onSelect(null)
      return
    }
    if (editingTextId) return // let the textarea handle its own input
    const { x, y } = toStored(e)
    if (tool === 'text') {
      // No pointer capture here — text placement is a single click, not a
      // drag, and capturing the wrapper can interfere with the textarea
      // that's about to mount and take focus.
      const id = nextAnnotationId()
      onAdd({ id, type: 'text', x, y, w: 220, text: '', fontSize: fontSize || 16, color: textColor || '#000000' })
      setEditingTextId(id)
      return
    }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* no-op */ }
    const base = {
      id: nextAnnotationId(),
      type: tool,
      color: tool === 'cover' ? (coverColor || '#ffffff') : tool === 'redact' ? (redactColor || '#000000') : color,
      strokeWidth,
    }
    if (tool === 'cover' || tool === 'redact') setDrafting({ ...base, x, y, w: 0, h: 0, filled: true })
    else if (tool === 'highlight') setDrafting({ ...base, x, y, w: 0, h: 0, filled: true, opacity: highlightAlpha })
    else if (tool === 'rectangle') setDrafting({ ...base, x, y, w: 0, h: 0, filled: false })
    else if (tool === 'line' || tool === 'arrow') setDrafting({ ...base, x1: x, y1: y, x2: x, y2: y })
    else if (tool === 'ellipse') setDrafting({ ...base, cx: x, cy: y, rx: 0, ry: 0 })
    else if (tool === 'pen') setDrafting({ ...base, points: [{ x, y }] })
  }

  const handleWrapPointerMove = (e) => {
    if (dragging) {
      const { x, y } = toStored(e)
      setDragging(d => ({ ...d, dx: x - d.startX, dy: y - d.startY }))
      return
    }
    if (!drafting) return
    const { x, y } = toStored(e)
    setDrafting(d => {
      if (d.type === 'cover' || d.type === 'redact' || d.type === 'highlight' || d.type === 'rectangle') return { ...d, w: x - d.x, h: y - d.y }
      if (d.type === 'line' || d.type === 'arrow') return { ...d, x2: x, y2: y }
      if (d.type === 'ellipse') return { ...d, rx: Math.abs(x - d.cx), ry: Math.abs(y - d.cy) }
      if (d.type === 'pen') return { ...d, points: [...d.points, { x, y }] }
      return d
    })
  }

  const handleWrapPointerUp = () => {
    if (dragging) {
      if (dragging.dx || dragging.dy) {
        const ann = (annotations || []).find(a => a.id === dragging.id)
        if (ann) onPatch(dragging.id, translateAnnotation(ann, dragging.dx, dragging.dy))
      }
      setDragging(null)
      return
    }
    if (drafting) {
      const finalized = normalizeDraft(drafting)
      if (finalized) onAdd(finalized)
      setDrafting(null)
    }
  }

  const shapeSelectProps = (a) => tool === 'select' ? {
    style: { cursor: 'move' },
    onPointerDown: (e) => {
      e.stopPropagation()
      try { e.target.setPointerCapture(e.pointerId) } catch { /* no-op */ }
      onSelect(a.id)
      const { x, y } = toStored(e)
      setDragging({ id: a.id, startX: x, startY: y, dx: 0, dy: 0 })
    },
  } : { style: { pointerEvents: 'none' } }

  return (
    <div
      ref={wrapRef}
      className="pdf-ann-layer"
      style={{ position: 'absolute', inset: 0, pointerEvents: interactive ? 'auto' : 'none' }}
      onPointerDown={handleWrapPointerDown}
      onPointerMove={handleWrapPointerMove}
      onPointerUp={handleWrapPointerUp}
    >
      <svg
        width={w} height={h} viewBox={`0 0 ${baseWidth} ${baseHeight}`} preserveAspectRatio="none"
        style={{ display: 'block', pointerEvents: interactive ? 'auto' : 'none' }}
      >
        {(annotations || []).filter(a => a.type !== 'text').map(a => {
          const isDraggingThis = dragging?.id === a.id
          const shape = isDraggingThis ? translateAnnotation(a, dragging.dx, dragging.dy) : a
          return <Shape key={a.id} a={shape} extraProps={shapeSelectProps(a)} />
        })}
        {drafting && drafting.type !== 'text' && (
          <Shape a={previewSafe(drafting)} extraProps={{ style: { pointerEvents: 'none' } }} />
        )}
        {selectedId && (() => {
          const a = (annotations || []).find(x => x.id === selectedId)
          if (!a) return null
          const shape = dragging?.id === a.id ? translateAnnotation(a, dragging.dx, dragging.dy) : a
          const b = boundsOf(shape)
          const pad = 4
          return (
            <rect
              x={b.x - pad} y={b.y - pad} width={b.w + pad * 2} height={b.h + pad * 2}
              fill="none" stroke="#32C8DC" strokeWidth={1.5} strokeDasharray="4 3"
              style={{ pointerEvents: 'none' }}
            />
          )
        })()}
      </svg>

      {(annotations || []).filter(a => a.type === 'text').map(a => {
        const isDraggingThis = dragging?.id === a.id
        const shape = isDraggingThis ? translateAnnotation(a, dragging.dx, dragging.dy) : a
        const isEditing = editingTextId === a.id
        const isSelected = selectedId === a.id
        const common = {
          position: 'absolute',
          left: shape.x * scale,
          top: shape.y * scale,
          width: shape.w * scale,
          fontSize: (shape.fontSize || 16) * scale,
          color: shape.color,
          fontFamily: 'inherit',
          lineHeight: 1.3,
        }
        if (isEditing) {
          return (
            <textarea
              key={a.id}
              ref={editingTextareaRef}
              defaultValue={a.text}
              placeholder="Type…"
              className="pdf-ann-text-input"
              style={{ ...common, minWidth: 60, pointerEvents: 'auto' }}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={(e) => {
                const text = e.target.value
                setEditingTextId(null)
                if (!text.trim()) onDelete(a.id)
                else onPatch(a.id, { text })
              }}
              onKeyDown={(e) => { if (e.key === 'Escape') e.target.blur() }}
            />
          )
        }
        return (
          <div
            key={a.id}
            className={`pdf-ann-text${isSelected ? ' pdf-ann-text--selected' : ''}`}
            style={{ ...common, cursor: tool === 'select' ? 'move' : 'default', pointerEvents: tool === 'select' ? 'auto' : 'none' }}
            onPointerDown={(e) => {
              if (tool !== 'select') return
              e.stopPropagation()
              try { e.target.setPointerCapture(e.pointerId) } catch { /* no-op */ }
              onSelect(a.id)
              const { x, y } = toStored(e)
              setDragging({ id: a.id, startX: x, startY: y, dx: 0, dy: 0 })
            }}
            onDoubleClick={(e) => { if (tool === 'select') { e.stopPropagation(); setEditingTextId(a.id) } }}
          >
            {shape.text}
          </div>
        )
      })}

      {selectedId && tool === 'select' && !dragging && (() => {
        const a = (annotations || []).find(x => x.id === selectedId)
        if (!a) return null
        const b = boundsOf(a)
        return (
          <button
            type="button"
            className="pdf-ann-delete"
            style={{ left: (b.x + b.w) * scale + 2, top: b.y * scale - 10 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(selectedId) }}
            title="Delete annotation"
          >
            <X size={11} />
          </button>
        )
      })()}
    </div>
  )
}
