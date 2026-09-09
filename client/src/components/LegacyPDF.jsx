import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import {
  Upload, Download, RotateCw, RotateCcw, Trash2, Scissors,
  Crop, FilePlus2, Copy, Minimize2, FileStack, X,
  ArrowUp, ArrowDown,
  Square, Type, Minus, ArrowUpRight, Circle, Highlighter, Pen,
  MousePointer, Undo2, Redo2, Eraser, Ban,
} from 'lucide-react'
// @cantoo/pdf-lib is a drop-in, same-API fork of pdf-lib that can decrypt
// permission-locked PDFs (owner-password only, empty user password) — common
// with AAR/zipForm real-estate forms. Plain pdf-lib only skips the load-time
// check and leaves such pages blank on rebuild. Load with { password: '' }.
import { PDFDocument, degrees, StandardFonts } from '@cantoo/pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './LegacyPDF.css'

// Images → PDF builder (download-only). Self-contained; see ImagePdfBuilder below.
import { generateLegacyPdf } from '../lib/legacyPdf'
import './LegacyPdfImages.css'

// Overlay markup editor (Phase 1 — draw/annotate; NOT redaction, see Cover tool).
import PdfAnnotationLayer from './PdfAnnotationLayer'
import { nextAnnotationId, bakeAnnotationsIntoPage, drawAnnotationsOnCanvas, DEFAULT_COLOR, translateAnnotation, reprojectAnnotations } from '../lib/pdfAnnotations'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// ── id helpers (module-level counters, stable within a session) ───────────────
let _srcSeq = 0
let _pageSeq = 0
const nextSrcId = () => `src_${++_srcSeq}`
const nextPageId = () => `pg_${++_pageSeq}`

const ZOOM_MIN = 25   // %
const ZOOM_MAX = 400  // %

// Render scale for the redaction rasterizer, chosen for ~200 DPI output
// (the base PDF coordinate space is 72 DPI, so 200/72 ≈ 2.78). High enough
// that flattened text stays legible; see the Redact tool in buildWorkingPdf.
const REDACT_RENDER_SCALE = 200 / 72

// data:image/jpeg;base64,... -> Uint8Array, for handing a rasterized canvas
// to pdf-lib's embedJpg.
function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// Build a single working PDF (Uint8Array) from the source files + ordered page list.
// This is the single derived artifact used for both rendering (pdf.js) and download.
//
// `annotations` + `pdfDoc` are optional and only passed by the download paths
// (never by the live-render effect, so the on-screen canvas stays clean and
// editable). When given, `pdfDoc` must be the pdf.js document already built
// from the CURRENT `pageIndexMap`-covered page set (i.e. the un-annotated
// render of the full document) — its per-page viewport is how stored overlay
// coordinates get mapped into PDF space, since that viewport already encodes
// the page's rotation and crop. `pageIndexMap` maps a page id to its 1-based
// page number in `pdfDoc` (not in the possibly-smaller `pages` being built
// here, e.g. for Extract).
async function buildWorkingPdf(sources, pages, { compress = false, annotations = null, pdfDoc = null, pageIndexMap = null } = {}) {
  const out = await PDFDocument.create()
  const loaded = {} // srcId -> PDFDocument (cached per build)
  let font = null
  let anyRedacted = false

  for (const p of pages) {
    const pageAnns = annotations?.[p.id]
    const hasRedact = !!pageAnns?.some(a => a.type === 'redact')
    const pageNum = pageIndexMap?.get(p.id)

    // A page with a redact box can't go through the vector copy path below —
    // the underlying text/image would still be present in the output PDF,
    // just visually covered (exactly the Cover tool's non-removal problem
    // this feature exists to fix). Instead render the page to a raster
    // canvas, paint every annotation directly onto those pixels (so
    // redaction boxes overwrite the data BEFORE encoding), then embed the
    // flattened bitmap as the page — the vector/text page is never copied in,
    // so nothing underneath the paint survives into the output.
    if (hasRedact && pdfDoc && pageNum) {
      anyRedacted = true
      const pjsPage = await pdfDoc.getPage(pageNum)
      const baseViewport = pjsPage.getViewport({ scale: 1 })
      const renderViewport = pjsPage.getViewport({ scale: REDACT_RENDER_SCALE })

      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(renderViewport.width)
      canvas.height = Math.ceil(renderViewport.height)
      const ctx = canvas.getContext('2d')
      await pjsPage.render({ canvasContext: ctx, viewport: renderViewport }).promise
      // Paint ALL of this page's markup onto the same raster — not just the
      // redact boxes — so cover/shape/text annotations still show up on the
      // flattened output (Part 2 "Coexistence").
      drawAnnotationsOnCanvas(ctx, pageAnns, REDACT_RENDER_SCALE)

      const jpgBytes = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92))
      const jpgImage = await out.embedJpg(jpgBytes)
      const page = out.addPage([baseViewport.width, baseViewport.height])
      page.drawImage(jpgImage, { x: 0, y: 0, width: baseViewport.width, height: baseViewport.height })

      // Redaction coords are stored relative to the pre-crop rendered size
      // (same as the vector path's crop below), so the crop box is applied
      // identically here, after painting onto the full raster.
      if (p.crop) {
        const { x, y, width, height } = p.crop
        page.setCropBox(x, y, width, height)
      }
      continue
    }

    // No redaction on this page — unchanged vector path: copy the page as-is
    // (preserving its text layer) and bake any non-destructive markup on top.
    let page
    if (p.blank) {
      page = out.addPage([p.width || 612, p.height || 792])
    } else {
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
      page = copied
    }

    if (pageAnns?.length && pdfDoc && pageIndexMap && pageNum) {
      if (!font && pageAnns.some(a => a.type === 'text')) {
        font = await out.embedFont(StandardFonts.Helvetica)
      }
      const pjsPage = await pdfDoc.getPage(pageNum)
      const viewport = pjsPage.getViewport({ scale: 1 })
      bakeAnnotationsIntoPage(page, pageAnns, viewport, font)
    }
  }

  // A redacted output shouldn't leak the source document's identity through
  // its metadata (Title/Author/etc. often carries the original filename or
  // author from the source PDF's producer).
  if (anyRedacted) {
    out.setTitle('')
    out.setAuthor('')
    out.setSubject('')
    out.setKeywords([])
    out.setProducer('')
    out.setCreator('')
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

  // ── Markup / overlay annotations (Phase 1 — draw only, not redaction) ────────
  const [annotations, setAnnotations] = useState({})  // pageId -> Annotation[]
  const [activeTool, setActiveTool] = useState(null)  // null | 'select' | 'cover' | 'text' | ...
  const [markupColor, setMarkupColor] = useState(DEFAULT_COLOR)
  const [coverColor, setCoverColor] = useState('#ffffff')  // Cover always defaults to opaque white, independent of the shared picker
  const [redactColor, setRedactColor] = useState('#000000')  // Redact always defaults to black (redaction convention)
  const [textColor, setTextColor] = useState('#000000')  // Text always defaults to black, independent of the shared picker
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [highlightAlpha, setHighlightAlpha] = useState(0.35)
  const [textFontSize, setTextFontSize] = useState(16)
  const [selectedAnn, setSelectedAnn] = useState(null)   // { pageId, id } | null
  const [pageBaseSize, setPageBaseSize] = useState({})   // pageId -> { w, h } at scale 1
  const historyRef = useRef([])   // past annotations snapshots (undo)
  const futureRef = useRef([])    // undone snapshots (redo)

  // Confirmation gate before any download that would flatten redacted pages
  // — holds the pending download action while the modal is open.
  const [redactConfirmAction, setRedactConfirmAction] = useState(null)

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
          if (token === renderTokenRef.current) {
            setPageBaseSize(prev => {
              const w = viewport.width / scale, h = viewport.height / scale
              const cur = prev[pageId]
              if (cur && cur.w === w && cur.h === h) return prev
              return { ...prev, [pageId]: { w, h } }
            })
          }
        } catch (err) {
          if (err?.name !== 'RenderingCancelledException') console.error(err)
        }
      }
    })()
  }, [pdfDoc, pages, scale])

  // ── Annotation history (undo/redo) — snapshot-based, one entry per commit ───
  const commitAnnotations = useCallback((updater) => {
    setAnnotations(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      historyRef.current.push(prev)
      futureRef.current = []
      return next
    })
  }, [])

  const addAnnotation = useCallback((pageId, ann) => {
    commitAnnotations(prev => ({ ...prev, [pageId]: [...(prev[pageId] || []), ann] }))
    setSelectedAnn(null)
  }, [commitAnnotations])

  const patchAnnotation = useCallback((pageId, id, patch) => {
    commitAnnotations(prev => ({
      ...prev,
      [pageId]: (prev[pageId] || []).map(a => (a.id === id ? { ...a, ...patch } : a)),
    }))
  }, [commitAnnotations])

  const deleteAnnotation = useCallback((pageId, id) => {
    commitAnnotations(prev => ({ ...prev, [pageId]: (prev[pageId] || []).filter(a => a.id !== id) }))
    setSelectedAnn(sel => (sel?.pageId === pageId && sel?.id === id ? null : sel))
  }, [commitAnnotations])

  const clearPageMarkup = useCallback(() => {
    if (!currentId) return
    if (!annotations[currentId]?.length) return
    commitAnnotations(prev => ({ ...prev, [currentId]: [] }))
    setSelectedAnn(sel => (sel?.pageId === currentId ? null : sel))
  }, [currentId, annotations, commitAnnotations])

  const undoAnnotations = useCallback(() => {
    if (!historyRef.current.length) return
    setAnnotations(prev => {
      const last = historyRef.current.pop()
      futureRef.current.push(prev)
      return last
    })
    setSelectedAnn(null)
  }, [])

  const redoAnnotations = useCallback(() => {
    if (!futureRef.current.length) return
    setAnnotations(prev => {
      const next = futureRef.current.pop()
      historyRef.current.push(prev)
      return next
    })
    setSelectedAnn(null)
  }, [])

  // Undo/redo (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z) + Delete/Backspace for the
  // selected annotation. Skipped while typing (matches the paste handler
  // pattern above) so it never fights with a text-box edit or another field.
  useEffect(() => {
    const handler = (e) => {
      const ae = document.activeElement
      const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (typing) return
        e.preventDefault()
        if (e.shiftKey) redoAnnotations()
        else undoAnnotations()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnn && !typing) {
        e.preventDefault()
        deleteAnnotation(selectedAnn.pageId, selectedAnn.id)
      }
      if (e.key === 'Escape' && !typing) {
        setActiveTool(null)
        setSelectedAnn(null)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedAnn, undoAnnotations, redoAnnotations, deleteAnnotation])

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

  // Rotating a page changes what "screen space" means for it, so any existing
  // annotations must be re-anchored to the same content — otherwise a cover
  // box silently slides off whatever it was hiding. pdf.js lets us compute the
  // post-rotation viewport directly from the current page (no PDF rebuild
  // needed) via the `rotation` override on getViewport.
  const rotateSelected = async (dir) => {
    const ids = targetIds()
    if (!ids.length) return
    if (pdfDoc) {
      const updates = {}
      for (const id of ids) {
        const pageAnns = annotations[id]
        if (!pageAnns?.length) continue
        const idx = pages.findIndex(p => p.id === id)
        if (idx < 0) continue
        try {
          const pjsPage = await pdfDoc.getPage(idx + 1)
          const oldViewport = pjsPage.getViewport({ scale: 1 })
          const newRotation = ((pjsPage.rotate + dir * 90) % 360 + 360) % 360
          const newViewport = pjsPage.getViewport({ scale: 1, rotation: newRotation })
          updates[id] = reprojectAnnotations(pageAnns, oldViewport, newViewport)
        } catch (err) {
          console.error('[LegacyPDF] annotation reproject (rotate) failed', err)
        }
      }
      if (Object.keys(updates).length) {
        setAnnotations(prev => ({ ...prev, ...updates }))
      }
    }
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
    // Compute crop box per page from its rendered size. Cropping shifts the
    // page's visible top-left corner, so any existing annotations need to
    // slide by the same amount to stay anchored to their content — the crop
    // margins are plain top-left-origin CSS percentages of the CURRENT
    // (pre-crop) rendered size, the exact space annotations are stored in,
    // so this is a pure translate (no rotation/scale change from crop alone).
    const updates = {}
    const annUpdates = {}
    for (const id of ids) {
      const idx = pages.findIndex(p => p.id === id)
      if (idx < 0 || !pdfDoc) continue
      const page = await pdfDoc.getPage(idx + 1)
      const vp = page.getViewport({ scale: 1 })
      const w = vp.width, h = vp.height
      const x = w * (left / 100)
      const y = h * (bottom / 100)
      const topPx = h * (top / 100)
      const cw = w * (1 - (left + right) / 100)
      const ch = h * (1 - (top + bottom) / 100)
      if (cw <= 0 || ch <= 0) { toast.error('Crop margins too large'); return }
      updates[id] = { x, y, width: cw, height: ch }
      const pageAnns = annotations[id]
      if (pageAnns?.length) {
        annUpdates[id] = pageAnns.map(a => translateAnnotation(a, -x, -topPx))
      }
    }
    setPages(prev => prev.map(p => updates[p.id] ? { ...p, crop: updates[p.id] } : p))
    if (Object.keys(annUpdates).length) {
      setAnnotations(prev => ({ ...prev, ...annUpdates }))
    }
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

  // Maps a page id to its 1-based page number in the current `pdfDoc` — the
  // pdf.js render of the full, un-annotated `pages` list — so bake steps can
  // look up the right viewport even when building a smaller subset (Extract).
  const pageIndexMap = () => new Map(pages.map((p, i) => [p.id, i + 1]))

  // Any page carrying a redact box is about to be permanently flattened to
  // an image on download — gate every download path behind one confirmation
  // so the user never ships a redacted file by accident, and understands the
  // downloaded copy (not the originally-loaded file) is the safe one to share.
  const hasAnyRedaction = () => Object.values(annotations).some(list => list?.some(a => a.type === 'redact'))
  const runWithRedactConfirm = (action) => {
    if (hasAnyRedaction()) setRedactConfirmAction(() => action)
    else action()
  }

  const extractSelectedImpl = async () => {
    const ids = selected.length ? selected : (currentId ? [currentId] : [])
    if (!ids.length) { toast.error('Select pages to extract'); return }
    // Preserve document order of the selected pages.
    const subset = pages.filter(p => ids.includes(p.id))
    try {
      const bytes = await buildWorkingPdf(sources, subset, { annotations, pdfDoc, pageIndexMap: pageIndexMap() })
      downloadBytes(bytes, `extract-${subset.length}-pages.pdf`)
      toast.success(`Extracted ${subset.length} page${subset.length > 1 ? 's' : ''}`)
    } catch (err) {
      console.error(err)
      toast.error('Extract failed')
    }
  }
  const extractSelected = () => runWithRedactConfirm(extractSelectedImpl)

  const compressImpl = async () => {
    if (!pages.length) return
    const before = workingBytesRef.current?.byteLength || 0
    try {
      const bytes = await buildWorkingPdf(sources, pages, { compress: true, annotations, pdfDoc, pageIndexMap: pageIndexMap() })
      const after = bytes.byteLength
      downloadBytes(bytes, 'compressed.pdf')
      const pct = before ? Math.max(0, Math.round((1 - after / before) * 100)) : 0
      toast.success(`Compressed: ${(before/1024/1024).toFixed(2)}MB → ${(after/1024/1024).toFixed(2)}MB (-${pct}%)`)
    } catch (err) {
      console.error(err)
      toast.error('Compress failed')
    }
  }
  const compress = () => runWithRedactConfirm(compressImpl)

  const downloadCurrentImpl = async () => {
    if (!workingBytesRef.current) { toast.error('Nothing to download'); return }
    try {
      const bytes = await buildWorkingPdf(sources, pages, { annotations, pdfDoc, pageIndexMap: pageIndexMap() })
      downloadBytes(bytes, 'legacy-pdf-export.pdf')
      toast.success('Downloaded')
    } catch (err) {
      console.error(err)
      toast.error('Download failed')
    }
  }
  const downloadCurrent = () => runWithRedactConfirm(downloadCurrentImpl)

  const clearAll = () => {
    setSources({})
    setPages([])
    setSelected([])
    setCurrentId(null)
    fittedRef.current = false
    canvasRefs.current = {}
    pageRefs.current = {}
    setAnnotations({})
    setSelectedAnn(null)
    setPageBaseSize({})
    historyRef.current = []
    futureRef.current = []
  }

  const toggleTool = (t) => {
    setActiveTool(cur => (cur === t ? null : t))
    setSelectedAnn(null)
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

      {/* Images → PDF — self-contained, download-only (see ImagePdfBuilder) */}
      <ImagePdfBuilder />

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
                onClick={(e) => { if (!activeTool) selectPage(p.id, e) }}
              >
                <canvas ref={el => { if (el) canvasRefs.current[p.id] = el }} />
                <div className="lpdf-page-badge">{i + 1}</div>
                {pageBaseSize[p.id] && (
                  <PdfAnnotationLayer
                    pageId={p.id}
                    scale={scale}
                    baseWidth={pageBaseSize[p.id].w}
                    baseHeight={pageBaseSize[p.id].h}
                    annotations={annotations[p.id] || []}
                    tool={activeTool}
                    color={markupColor}
                    coverColor={coverColor}
                    redactColor={redactColor}
                    textColor={textColor}
                    strokeWidth={strokeWidth}
                    highlightAlpha={highlightAlpha}
                    fontSize={textFontSize}
                    selectedId={selectedAnn?.pageId === p.id ? selectedAnn.id : null}
                    onSelect={(id) => setSelectedAnn(id ? { pageId: p.id, id } : null)}
                    onAdd={(ann) => addAnnotation(p.id, ann)}
                    onPatch={(id, patch) => patchAnnotation(p.id, id, patch)}
                    onDelete={(id) => deleteAnnotation(p.id, id)}
                  />
                )}
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
              <div className="lpdf-tool-label">Markup</div>
              <div className="lpdf-tool-hint">
                {activeTool
                  ? 'Draw on the page — Esc or click the tool again to stop'
                  : 'Pick a tool to draw on the current page'}
              </div>
              <div className="lpdf-markup-grid">
                <button className={`lpdf-tool-btn${activeTool === 'select' ? ' active' : ''}`} onClick={() => toggleTool('select')} title="Select / move markup">
                  <MousePointer size={16} />
                </button>
                <button className={`lpdf-tool-btn${activeTool === 'cover' ? ' active' : ''}`} onClick={() => toggleTool('cover')} title="Cover — covers content visually. Does not remove underlying text.">
                  <Eraser size={16} />
                </button>
                <button
                  className={`lpdf-tool-btn lpdf-tool-btn--redact${activeTool === 'redact' ? ' active' : ''}`}
                  onClick={() => toggleTool('redact')}
                  title="Redact — permanently removes the text/data underneath. The page becomes a flattened image."
                >
                  <Ban size={16} />
                </button>
                <button className={`lpdf-tool-btn${activeTool === 'highlight' ? ' active' : ''}`} onClick={() => toggleTool('highlight')} title="Highlighter">
                  <Highlighter size={16} />
                </button>
                <button className={`lpdf-tool-btn${activeTool === 'rectangle' ? ' active' : ''}`} onClick={() => toggleTool('rectangle')} title="Rectangle">
                  <Square size={16} />
                </button>
                <button className={`lpdf-tool-btn${activeTool === 'ellipse' ? ' active' : ''}`} onClick={() => toggleTool('ellipse')} title="Ellipse / circle">
                  <Circle size={16} />
                </button>
                <button className={`lpdf-tool-btn${activeTool === 'line' ? ' active' : ''}`} onClick={() => toggleTool('line')} title="Line">
                  <Minus size={16} />
                </button>
                <button className={`lpdf-tool-btn${activeTool === 'arrow' ? ' active' : ''}`} onClick={() => toggleTool('arrow')} title="Arrow">
                  <ArrowUpRight size={16} />
                </button>
                <button className={`lpdf-tool-btn${activeTool === 'pen' ? ' active' : ''}`} onClick={() => toggleTool('pen')} title="Freehand pen">
                  <Pen size={16} />
                </button>
                <button className={`lpdf-tool-btn${activeTool === 'text' ? ' active' : ''}`} onClick={() => toggleTool('text')} title="Text box">
                  <Type size={16} />
                </button>
              </div>

              <label className="lpdf-markup-row">
                <span>Color</span>
                {activeTool === 'cover' ? (
                  <input type="color" value={coverColor} onChange={(e) => setCoverColor(e.target.value)} title="Cover color (defaults to white)" />
                ) : activeTool === 'redact' ? (
                  <input type="color" value={redactColor} onChange={(e) => setRedactColor(e.target.value)} title="Redact color (defaults to black)" />
                ) : activeTool === 'text' ? (
                  <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} title="Text color (defaults to black)" />
                ) : (
                  <input type="color" value={markupColor} onChange={(e) => setMarkupColor(e.target.value)} />
                )}
              </label>

              {activeTool === 'highlight' && (
                <label className="lpdf-markup-row">
                  <span>Opacity</span>
                  <input
                    type="range" min={10} max={80}
                    value={Math.round(highlightAlpha * 100)}
                    onChange={(e) => setHighlightAlpha(Number(e.target.value) / 100)}
                  />
                </label>
              )}

              {['rectangle', 'line', 'arrow', 'ellipse', 'pen'].includes(activeTool) && (
                <label className="lpdf-markup-row">
                  <span>Width</span>
                  <input
                    type="range" min={1} max={12}
                    value={strokeWidth}
                    onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  />
                </label>
              )}

              {activeTool === 'text' && (
                <label className="lpdf-markup-row">
                  <span>Font size</span>
                  <input
                    type="number" min={8} max={72}
                    value={textFontSize}
                    onChange={(e) => setTextFontSize(Math.max(8, Math.min(72, Number(e.target.value) || 16)))}
                  />
                </label>
              )}

              <div className="lpdf-tool-row">
                <button className="lpdf-tool-btn wide" onClick={undoAnnotations} title="Undo"><Undo2 size={16} /> Undo</button>
                <button className="lpdf-tool-btn wide" onClick={redoAnnotations} title="Redo"><Redo2 size={16} /> Redo</button>
              </div>
              <button className="lpdf-tool-btn full" onClick={clearPageMarkup}><X size={16} /> Clear markup on this page</button>
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

      {redactConfirmAction && (
        <div className="lpdf-modal-backdrop" onClick={() => setRedactConfirmAction(null)}>
          <div className="lpdf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lpdf-modal-title">
              <Ban size={16} className="lpdf-modal-title-icon" /> Redacted pages will be flattened
            </div>
            <div className="lpdf-modal-body">
              This document has one or more <strong>Redact</strong> boxes. Downloading will permanently
              flatten those pages to images — the text/data underneath is removed and not recoverable,
              but the page also loses its text layer (no longer selectable or searchable).
              <br /><br />
              The file you're about to download is the safe one to share. The originally-loaded file
              still contains the original data — don't share that one.
            </div>
            <div className="lpdf-modal-actions">
              <button className="lpdf-tool-btn" onClick={() => setRedactConfirmAction(null)}>Cancel</button>
              <button
                className="lpdf-tool-btn active"
                onClick={() => { const action = redactConfirmAction; setRedactConfirmAction(null); action() }}
              >
                Flatten & download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Images → PDF builder — fully self-contained, 100% client-side, download-only.
// Add PNG/JPG via picker, drag-drop, or clipboard paste; choose 1- or 2-per-page;
// Generate downloads a Letter-portrait PDF. No network, no storage. Independent
// of everything above (including the other, separate unfinished PDF work).
// ─────────────────────────────────────────────────────────────────────────────
function ImagePdfBuilder() {
  const [images, setImages]   = useState([])          // [{ id, dataUrl, w, h, format, name }]
  const [perPage, setPerPage] = useState(1)           // 1 | 2
  const [dragging, setDragging] = useState(false)
  const idRef   = useRef(0)
  const fileRef = useRef(null)
  const zoneRef = useRef(null)

  // Read a File/Blob into { dataUrl, w, h, format } (intrinsic dims for aspect fit).
  const readImage = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const dataUrl = reader.result
      const im = new Image()
      im.onerror = reject
      im.onload = () => resolve({
        dataUrl,
        w: im.naturalWidth,
        h: im.naturalHeight,
        format: file.type === 'image/png' ? 'PNG' : 'JPEG',
        name: file.name || 'pasted-image',
      })
      im.src = dataUrl
    }
    reader.readAsDataURL(file)
  })

  const addFiles = async (fileList) => {
    const files = Array.from(fileList).filter(f =>
      f.type === 'image/png' || f.type === 'image/jpeg' || /\.(png|jpe?g)$/i.test(f.name || ''))
    if (!files.length) { toast.error('Add PNG or JPG images'); return }
    try {
      const loaded = await Promise.all(files.map(readImage))
      setImages(prev => [...prev, ...loaded.map(x => ({ id: `img_${++idRef.current}`, ...x }))])
    } catch {
      toast.error("Couldn't read that image")
    }
  }

  const onFileInput = (e) => {
    if (e.target.files?.length) addFiles(e.target.files)
    e.target.value = ''
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
  }

  const onPaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    const blobs = []
    for (const it of items) {
      if (it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) blobs.push(f) }
    }
    if (blobs.length) { e.preventDefault(); addFiles(blobs) }
  }

  // Also catch a screenshot paste anywhere on this screen (unless the user is
  // typing in a field). Lets Cmd+V work without first clicking the drop zone.
  useEffect(() => {
    const handler = (e) => {
      const ae = document.activeElement
      const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)
      if (typing) return
      const items = e.clipboardData?.items
      if (!items) return
      const hasImage = Array.from(items).some(it => it.type.startsWith('image/'))
      if (hasImage) onPaste(e)
    }
    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
  }, [])

  const removeImage = (id) => setImages(prev => prev.filter(x => x.id !== id))

  const generate = () => {
    if (!images.length) { toast.error('Add at least one image'); return }
    try {
      generateLegacyPdf(images, { perPage })
      toast.success('PDF downloaded')
    } catch (err) {
      console.error('[LegacyPDF] image PDF generate failed', err)
      toast.error(err.message || 'Could not generate PDF')
    }
  }

  return (
    <div className="lpi">
      <div className="lpi-head">
        <FileStack size={16} className="lpdf-title-icon" />
        <span className="lpi-title">Images → PDF</span>
        <span className="lpi-sub">Assemble PNG/JPG and download — nothing leaves your device.</span>
      </div>

      <div
        ref={zoneRef}
        className={`lpi-dropzone${dragging ? ' lpi-dropzone--active' : ''}`}
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true) }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }}
      >
        <div className="lpi-dropzone-title">Drop images, click to browse, or paste a screenshot (⌘V)</div>
        <div className="lpi-dropzone-sub">PNG or JPG</div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" multiple hidden onChange={onFileInput} />
      </div>

      {images.length > 0 && (
        <div className="lpi-thumbs">
          {images.map((img, i) => (
            <div key={img.id} className="lpi-thumb">
              <img src={img.dataUrl} alt={img.name} />
              <span className="lpi-thumb-idx">{i + 1}</span>
              <button className="lpi-thumb-x" onClick={() => removeImage(img.id)} title="Remove"><X size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="lpi-controls">
        <div className="lpi-layout">
          <span className="lpi-layout-label">Layout</span>
          <select className="lpi-select" value={perPage} onChange={(e) => setPerPage(Number(e.target.value))}>
            <option value={1}>1 per page</option>
            <option value={2}>2 per page</option>
          </select>
        </div>
        <button className="lpi-generate" onClick={generate} disabled={!images.length}>
          <Download size={15} /> Generate PDF
        </button>
      </div>
    </div>
  )
}
