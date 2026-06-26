import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import {
  Upload, Download, RotateCw, RotateCcw, Trash2, Scissors,
  Crop, FilePlus2, Copy, Minimize2, FileStack, X,
  ArrowUp, ArrowDown,
} from 'lucide-react'
// @cantoo/pdf-lib is a drop-in, same-API fork of pdf-lib that can decrypt
// permission-locked PDFs (owner-password only, empty user password) — common
// with AAR/zipForm real-estate forms. Plain pdf-lib only skips the load-time
// check and leaves such pages blank on rebuild. Load with { password: '' }.
import { PDFDocument, degrees } from '@cantoo/pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './LegacyPDF.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// ── id helpers (module-level counters, stable within a session) ───────────────
let _srcSeq = 0
let _pageSeq = 0
const nextSrcId = () => `src_${++_srcSeq}`
const nextPageId = () => `pg_${++_pageSeq}`

const ZOOM_MIN = 25   // %
const ZOOM_MAX = 400  // %

// Build a single working PDF (Uint8Array) from the source files + ordered page list.
// This is the single derived artifact used for both rendering (pdf.js) and download.
async function buildWorkingPdf(sources, pages, { compress = false } = {}) {
  const out = await PDFDocument.create()
  const loaded = {} // srcId -> PDFDocument (cached per build)

  for (const p of pages) {
    if (p.blank) {
      out.addPage([p.width || 612, p.height || 792])
      continue
    }
    if (!loaded[p.srcId]) {
      loaded[p.srcId] = await PDFDocument.load(sources[p.srcId].bytes, { password: '' })
    }
    const [copied] = await out.copyPages(loaded[p.srcId], [p.srcIndex])
    if (p.rotation) {
      const current = copied.getRotation().angle || 0
      copied.setRotation(degrees(((current + p.rotation) % 360 + 360) % 360))
    }
    if (p.crop) {
      const { x, y, width, height } = p.crop
      copied.setCropBox(x, y, width, height)
    }
    out.addPage(copied)
  }

  return out.save({ useObjectStreams: compress })
}

export default function LegacyPDF() {
  // Single source of truth
  const [sources, setSources] = useState({})        // srcId -> { name, bytes }
  const [pages, setPages]     = useState([])         // ordered [{ id, srcId, srcIndex, rotation, crop }]
  const [selected, setSelected] = useState([])       // selected page ids
  const [currentId, setCurrentId] = useState(null)   // page id currently scrolled into view

  // Derived render state
  const [pdfDoc, setPdfDoc]   = useState(null)
  const workingBytesRef = useRef(null)               // Uint8Array of current working doc (for download)
  const [building, setBuilding] = useState(false)

  // Zoom — a single continuous scale factor (1 = 100%) driven by the top-bar slider.
  // On first load we auto-fit the whole page; after that the slider controls it.
  const [scale, setScale] = useState(1)
  const fittedRef = useRef(false)                    // have we auto-fit the current document yet?

  // Crop panel
  const [cropOpen, setCropOpen] = useState(false)
  const [cropMargins, setCropMargins] = useState({ top: 0, right: 0, bottom: 0, left: 0 })

  const [isDragging, setIsDragging] = useState(false)

  const scrollRef = useRef(null)
  const fileInputRef = useRef(null)
  const pageRefs = useRef({})        // pageId -> wrapper element (main canvas)
  const canvasRefs = useRef({})      // pageId -> main canvas element
  const renderTokenRef = useRef(0)

  const hasDoc = pages.length > 0

  // ── Load files ──────────────────────────────────────────────────────────────
  const loadFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList).filter(f =>
      f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (!files.length) {
      toast.error('Please drop PDF files only')
      return
    }
    const newSources = {}
    const newPages = []
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const probe = await PDFDocument.load(bytes, { password: '' })
        const count = probe.getPageCount()
        const srcId = nextSrcId()
        newSources[srcId] = { name: file.name, bytes }
        for (let i = 0; i < count; i++) {
          newPages.push({ id: nextPageId(), srcId, srcIndex: i, rotation: 0, crop: null })
        }
      } catch (err) {
        console.error('[LegacyPDF] failed to load', file.name, err)
        toast.error(`Couldn't read ${file.name}`)
      }
    }
    if (!newPages.length) return
    setSources(prev => ({ ...prev, ...newSources }))
    setPages(prev => [...prev, ...newPages])
    setCurrentId(prev => prev ?? newPages[0].id)
    toast.success(`Loaded ${newPages.length} page${newPages.length > 1 ? 's' : ''}`)
  }, [])

  const onFileInput = (e) => {
    if (e.target.files?.length) loadFiles(e.target.files)
    e.target.value = ''
  }

  // ── Drag & drop onto canvas ──────────────────────────────────────────────────
  const onDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer?.files?.length) loadFiles(e.dataTransfer.files)
  }
  const onDragOver = (e) => { e.preventDefault(); if (!isDragging) setIsDragging(true) }
  const onDragLeave = (e) => {
    if (e.currentTarget === e.target) setIsDragging(false)
  }

  // ── Rebuild working PDF whenever the model changes ───────────────────────────
  useEffect(() => {
    let cancelled = false
    if (!pages.length) {
      workingBytesRef.current = null
      setPdfDoc(null)
      fittedRef.current = false   // next loaded doc should auto-fit again
      return
    }
    setBuilding(true)
    ;(async () => {
      try {
        const bytes = await buildWorkingPdf(sources, pages)
        if (cancelled) return
        workingBytesRef.current = bytes
        // pdf.js detaches the buffer it's given — hand it a copy.
        const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
        if (cancelled) { doc.destroy?.(); return }
        setPdfDoc(doc)
      } catch (err) {
        console.error('[LegacyPDF] build failed', err)
        if (!cancelled) toast.error('Failed to render document')
      } finally {
        if (!cancelled) setBuilding(false)
      }
    })()
    return () => { cancelled = true }
  }, [sources, pages])

  // ── Auto-fit the whole page on first load (viewport-computed, runs once) ──────
  useEffect(() => {
    if (!pdfDoc || fittedRef.current) return
    let cancelled = false
    ;(async () => {
      try {
        const page = await pdfDoc.getPage(1)
        const base = page.getViewport({ scale: 1 })
        const el = scrollRef.current
        const cw = (el?.clientWidth || 800) - 48   // minus canvas-area padding
        const ch = (el?.clientHeight || 800) - 48
        const fit = Math.min(cw / base.width, ch / base.height)
        if (cancelled) return
        setScale(Math.max(0.1, fit))
        fittedRef.current = true
      } catch (err) {
        console.error('[LegacyPDF] auto-fit failed', err)
      }
    })()
    return () => { cancelled = true }
  }, [pdfDoc])

  // ── Render main pages (depends on zoom) ──────────────────────────────────────
  useEffect(() => {
    if (!pdfDoc) return
    const token = ++renderTokenRef.current
    ;(async () => {
      for (let i = 0; i < pages.length; i++) {
        if (token !== renderTokenRef.current) return
        const pageId = pages[i].id
        const canvas = canvasRefs.current[pageId]
        if (!canvas) continue
        try {
          const page = await pdfDoc.getPage(i + 1)
          const dpr = window.devicePixelRatio || 1
          const viewport = page.getViewport({ scale })
          const ctx = canvas.getContext('2d')
          canvas.width = Math.floor(viewport.width * dpr)
          canvas.height = Math.floor(viewport.height * dpr)
          canvas.style.width = `${Math.floor(viewport.width)}px`
          canvas.style.height = `${Math.floor(viewport.height)}px`
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          await page.render({ canvasContext: ctx, viewport }).promise
        } catch (err) {
          if (err?.name !== 'RenderingCancelledException') console.error(err)
        }
      }
    })()
  }, [pdfDoc, pages, scale])

  // ── Track current page on scroll (for the "Page X / N" indicator) ────────────
  useEffect(() => {
    const root = scrollRef.current
    if (!root || !pages.length) return
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
      if (visible[0]) setCurrentId(visible[0].target.dataset.pageId)
    }, { root, threshold: [0.25, 0.5, 0.75] })
    Object.values(pageRefs.current).forEach(el => el && observer.observe(el))
    return () => observer.disconnect()
  }, [pages])

  // ── Selection (click a page in the canvas; ⌘/Ctrl-click to multi-select) ─────
  const selectPage = (id, e) => {
    if (e && (e.metaKey || e.ctrlKey)) {
      setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
    } else {
      setSelected([id])
    }
    setCurrentId(id)
  }

  // Pages an op should target: selection if any, else the current (in-view) page.
  const targetIds = () => (selected.length ? selected : (currentId ? [currentId] : []))

  // ── Organize operations ───────────────────────────────────────────────────────
  const reorder = (from, to) => {
    if (from === to || from == null || to == null) return
    setPages(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  // Move the selected page earlier/later in document order (replaces drag-in-rail).
  const moveSelected = (dir) => {
    const id = selected[0] ?? currentId
    if (!id) { toast.error('Select a page first'); return }
    const idx = pages.findIndex(p => p.id === id)
    const to = idx + dir
    if (idx < 0 || to < 0 || to >= pages.length) return
    reorder(idx, to)
    setSelected([id])  // keep the moved page selected
  }

  const rotateSelected = (dir) => {
    const ids = targetIds()
    if (!ids.length) return
    setPages(prev => prev.map(p =>
      ids.includes(p.id) ? { ...p, rotation: (p.rotation + dir * 90) } : p))
  }

  const deleteSelected = () => {
    const ids = targetIds()
    if (!ids.length) return
    setPages(prev => prev.filter(p => !ids.includes(p.id)))
    setSelected([])
  }

  const duplicateSelected = () => {
    const ids = targetIds()
    if (!ids.length) return
    setPages(prev => {
      const next = []
      for (const p of prev) {
        next.push(p)
        if (ids.includes(p.id)) next.push({ ...p, id: nextPageId() })
      }
      return next
    })
  }

  const insertBlank = () => {
    const ids = targetIds()
    const blank = { id: nextPageId(), blank: true, width: 612, height: 792, rotation: 0, crop: null }
    setPages(prev => {
      if (!ids.length) return [...prev, blank]
      const lastIdx = Math.max(...ids.map(id => prev.findIndex(p => p.id === id)))
      const next = [...prev]
      next.splice(lastIdx + 1, 0, blank)
      return next
    })
  }

  const applyCrop = async () => {
    const ids = targetIds()
    if (!ids.length) { toast.error('Select a page to crop'); return }
    const { top, right, bottom, left } = cropMargins
    if ([top, right, bottom, left].every(v => !v)) { toast.error('Set crop margins (%) first'); return }
    // Compute crop box per page from its rendered size.
    const updates = {}
    for (const id of ids) {
      const idx = pages.findIndex(p => p.id === id)
      if (idx < 0 || !pdfDoc) continue
      const page = await pdfDoc.getPage(idx + 1)
      const vp = page.getViewport({ scale: 1 })
      const w = vp.width, h = vp.height
      const x = w * (left / 100)
      const y = h * (bottom / 100)
      const cw = w * (1 - (left + right) / 100)
      const ch = h * (1 - (top + bottom) / 100)
      if (cw <= 0 || ch <= 0) { toast.error('Crop margins too large'); return }
      updates[id] = { x, y, width: cw, height: ch }
    }
    setPages(prev => prev.map(p => updates[p.id] ? { ...p, crop: updates[p.id] } : p))
    setCropOpen(false)
    toast.success('Crop applied')
  }

  const downloadBytes = (bytes, name) => {
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const extractSelected = async () => {
    const ids = selected.length ? selected : (currentId ? [currentId] : [])
    if (!ids.length) { toast.error('Select pages to extract'); return }
    // Preserve document order of the selected pages.
    const subset = pages.filter(p => ids.includes(p.id))
    try {
      const bytes = await buildWorkingPdf(sources, subset)
      downloadBytes(bytes, `extract-${subset.length}-pages.pdf`)
      toast.success(`Extracted ${subset.length} page${subset.length > 1 ? 's' : ''}`)
    } catch (err) {
      console.error(err)
      toast.error('Extract failed')
    }
  }

  const compress = async () => {
    if (!pages.length) return
    const before = workingBytesRef.current?.byteLength || 0
    try {
      const bytes = await buildWorkingPdf(sources, pages, { compress: true })
      const after = bytes.byteLength
      downloadBytes(bytes, 'compressed.pdf')
      const pct = before ? Math.max(0, Math.round((1 - after / before) * 100)) : 0
      toast.success(`Compressed: ${(before/1024/1024).toFixed(2)}MB → ${(after/1024/1024).toFixed(2)}MB (-${pct}%)`)
    } catch (err) {
      console.error(err)
      toast.error('Compress failed')
    }
  }

  const downloadCurrent = async () => {
    if (!workingBytesRef.current) { toast.error('Nothing to download'); return }
    downloadBytes(workingBytesRef.current, 'legacy-pdf-export.pdf')
    toast.success('Downloaded')
  }

  const clearAll = () => {
    setSources({})
    setPages([])
    setSelected([])
    setCurrentId(null)
    fittedRef.current = false
    canvasRefs.current = {}
    pageRefs.current = {}
  }

  const currentIndex = pages.findIndex(p => p.id === currentId)
  const zoomPct = Math.round(scale * 100)

  return (
    <div className="lpdf">
      {/* Top bar */}
      <div className="lpdf-topbar">
        <div className="lpdf-topbar-left">
          <FileStack size={18} className="lpdf-title-icon" />
          <span className="lpdf-title">Legacy PDF</span>
          {hasDoc && (
            <span className="lpdf-meta">
              Page {currentIndex >= 0 ? currentIndex + 1 : 1} / {pages.length}
              {building && <span className="lpdf-building"> · rendering…</span>}
            </span>
          )}
        </div>
        <div className="lpdf-topbar-right">
          {hasDoc && (
            <div className="lpdf-zoom" title="Zoom">
              <input
                type="range"
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                value={Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomPct))}
                onChange={(e) => { fittedRef.current = true; setScale(Number(e.target.value) / 100) }}
              />
              <span className="lpdf-zoom-val">{zoomPct}%</span>
            </div>
          )}
          <button className="lpdf-btn" onClick={() => fileInputRef.current?.click()}>
            <Upload size={15} /> {hasDoc ? 'Add PDF' : 'Upload PDF'}
          </button>
          {hasDoc && (
            <>
              <button className="lpdf-btn" onClick={clearAll}><X size={15} /> Clear</button>
              <button className="lpdf-btn lpdf-btn--primary" onClick={downloadCurrent}>
                <Download size={15} /> Download
              </button>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={onFileInput}
          />
        </div>
      </div>

      {!hasDoc ? (
        // ── Empty state / drop zone ──
        <div
          className={`lpdf-dropzone${isDragging ? ' lpdf-dropzone--active' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <FileStack size={48} className="lpdf-dropzone-icon" />
          <div className="lpdf-dropzone-title">Drop a PDF here</div>
          <div className="lpdf-dropzone-sub">or click to browse — load multiple files to merge</div>
        </div>
      ) : (
        <div className="lpdf-workspace">
          {/* Center: canvas (the only scrolling region) */}
          <div
            className="lpdf-canvas-area"
            ref={scrollRef}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
          >
            {isDragging && <div className="lpdf-drop-overlay">Drop to add PDF</div>}
            {pages.map((p, i) => (
              <div
                key={p.id}
                className={`lpdf-page${selected.includes(p.id) ? ' lpdf-page--selected' : ''}`}
                data-page-id={p.id}
                ref={el => { if (el) pageRefs.current[p.id] = el }}
                onClick={(e) => selectPage(p.id, e)}
              >
                <canvas ref={el => { if (el) canvasRefs.current[p.id] = el }} />
                <div className="lpdf-page-badge">{i + 1}</div>
              </div>
            ))}
          </div>

          {/* Right: tools (sticky — stays pinned while the canvas scrolls) */}
          <div className="lpdf-tools">
            <div className="lpdf-tool-group">
              <div className="lpdf-tool-label">Organize</div>
              <div className="lpdf-tool-hint">
                {selected.length
                  ? `${selected.length} page${selected.length > 1 ? 's' : ''} selected`
                  : 'Click a page to select · ⌘-click to add more'}
              </div>
              <div className="lpdf-tool-row">
                <button className="lpdf-tool-btn wide" onClick={() => moveSelected(-1)}><ArrowUp size={16} /> Move Up</button>
                <button className="lpdf-tool-btn wide" onClick={() => moveSelected(1)}><ArrowDown size={16} /> Move Down</button>
              </div>
              <div className="lpdf-tool-row">
                <button className="lpdf-tool-btn wide" onClick={() => rotateSelected(-1)}><RotateCcw size={16} /> Left</button>
                <button className="lpdf-tool-btn wide" onClick={() => rotateSelected(1)}><RotateCw size={16} /> Right</button>
              </div>
              <button className="lpdf-tool-btn full" onClick={deleteSelected}><Trash2 size={16} /> Delete</button>
              <button className="lpdf-tool-btn full" onClick={duplicateSelected}><Copy size={16} /> Duplicate</button>
              <button className="lpdf-tool-btn full" onClick={insertBlank}><FilePlus2 size={16} /> Insert blank page</button>
              <button className="lpdf-tool-btn full" onClick={() => setCropOpen(o => !o)}><Crop size={16} /> Crop…</button>
              {cropOpen && (
                <div className="lpdf-crop-panel">
                  <div className="lpdf-crop-hint">Trim margins (% of page)</div>
                  {['top', 'right', 'bottom', 'left'].map(side => (
                    <label key={side} className="lpdf-crop-row">
                      <span>{side}</span>
                      <input
                        type="number" min={0} max={49}
                        value={cropMargins[side]}
                        onChange={(e) => setCropMargins(m => ({ ...m, [side]: Math.max(0, Math.min(49, Number(e.target.value) || 0)) }))}
                      />
                    </label>
                  ))}
                  <button className="lpdf-tool-btn full active" onClick={applyCrop}>Apply crop</button>
                </div>
              )}
            </div>

            <div className="lpdf-tool-group">
              <div className="lpdf-tool-label">Split & Output</div>
              <button className="lpdf-tool-btn full" onClick={extractSelected}><Scissors size={16} /> Extract selected →</button>
              <button className="lpdf-tool-btn full" onClick={compress}><Minimize2 size={16} /> Compress & download</button>
              <button className="lpdf-tool-btn full active" onClick={downloadCurrent}><Download size={16} /> Download PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
