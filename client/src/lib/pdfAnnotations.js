// Pure helpers for the LegacyPDF overlay markup editor.
// Annotation geometry is always stored in page-viewport CSS pixels at scale=1
// (top-left origin, y-down — the same space pdf.js hands the canvas), so zoom
// changes never touch stored data. Baking maps that space into PDF user space
// via the pdf.js viewport for the corresponding page, which already encodes
// the page's rotation and crop — see bakeAnnotationsIntoPage below.
import { rgb, degrees } from '@cantoo/pdf-lib'

let _annSeq = 0
export const nextAnnotationId = () => `ann_${++_annSeq}`

export const DEFAULT_COLOR = '#32C8DC'

// hex ("#rrggbb") -> pdf-lib rgb() color, 0..1 components.
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '')
  if (!m) return rgb(0.2, 0.78, 0.86)
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255)
}

// The local coordinate frame at a given screen-space (scale-1) point: where it
// lands in PDF user space, plus the PDF-space vectors for one unit of screen
// +x and +y. Derived by sampling viewport.convertToPdfPoint rather than
// assumed, so it's correct regardless of page rotation/crop.
function frameAt(viewport, x, y) {
  const [ox, oy] = viewport.convertToPdfPoint(x, y)
  const [xx, xy] = viewport.convertToPdfPoint(x + 1, y)
  const [yx, yy] = viewport.convertToPdfPoint(x, y + 1)
  return { origin: [ox, oy], xAxis: [xx - ox, xy - oy], yAxis: [yx - ox, yy - oy] }
}

const toPdf = (viewport, x, y) => viewport.convertToPdfPoint(x, y)
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay)

// PDF units per screen (scale-1) px — used to scale stroke widths / font sizes.
function unitScale(viewport, x, y) {
  const { origin, xAxis } = frameAt(viewport, x, y)
  return Math.hypot(xAxis[0], xAxis[1]) || 1
}

function drawRectLike(page, viewport, a, { filled }) {
  const [px1, py1] = toPdf(viewport, a.x, a.y)
  const [px2, py2] = toPdf(viewport, a.x + a.w, a.y + a.h)
  const x = Math.min(px1, px2)
  const y = Math.min(py1, py2)
  const width = Math.abs(px2 - px1)
  const height = Math.abs(py2 - py1)
  const scale = unitScale(viewport, a.x, a.y)
  const color = hexToRgb(a.color)
  const opts = { x, y, width, height }
  if (filled) {
    opts.color = color
    opts.opacity = a.opacity ?? 1
  } else {
    opts.borderColor = color
    opts.borderWidth = Math.max(0.5, (a.strokeWidth || 2) * scale)
  }
  page.drawRectangle(opts)
}

function drawLineLike(page, viewport, a) {
  const [x1, y1] = toPdf(viewport, a.x1, a.y1)
  const [x2, y2] = toPdf(viewport, a.x2, a.y2)
  const scale = unitScale(viewport, a.x1, a.y1)
  const thickness = Math.max(0.5, (a.strokeWidth || 2) * scale)
  const color = hexToRgb(a.color)
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color })

  if (a.type === 'arrow') {
    const headLen = Math.max(6 * scale, thickness * 4)
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const spread = Math.PI / 7
    for (const dir of [-1, 1]) {
      const a2 = angle + Math.PI - dir * spread
      page.drawLine({
        start: { x: x2, y: y2 },
        end: { x: x2 + headLen * Math.cos(a2), y: y2 + headLen * Math.sin(a2) },
        thickness,
        color,
      })
    }
  }
}

function drawEllipseLike(page, viewport, a) {
  const [cx, cy] = toPdf(viewport, a.cx, a.cy)
  const [rxX, rxY] = toPdf(viewport, a.cx + a.rx, a.cy)
  const [ryX, ryY] = toPdf(viewport, a.cx, a.cy + a.ry)
  const xScale = dist(cx, cy, rxX, rxY) || 1
  const yScale = dist(cx, cy, ryX, ryY) || 1
  const scale = unitScale(viewport, a.cx, a.cy)
  const color = hexToRgb(a.color)
  page.drawEllipse({
    x: cx,
    y: cy,
    xScale,
    yScale,
    borderColor: a.filled ? undefined : color,
    borderWidth: a.filled ? undefined : Math.max(0.5, (a.strokeWidth || 2) * scale),
    color: a.filled ? color : undefined,
    opacity: a.filled ? (a.opacity ?? 1) : 1,
  })
}

function drawPenLike(page, viewport, a) {
  const pts = a.points || []
  if (pts.length < 2) return
  const scale = unitScale(viewport, pts[0].x, pts[0].y)
  const thickness = Math.max(0.5, (a.strokeWidth || 2) * scale)
  const color = hexToRgb(a.color)
  let prev = toPdf(viewport, pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) {
    const cur = toPdf(viewport, pts[i].x, pts[i].y)
    page.drawLine({
      start: { x: prev[0], y: prev[1] },
      end: { x: cur[0], y: cur[1] },
      thickness,
      color,
      lineCap: 1, // Round — keeps segment joins from looking broken
    })
    prev = cur
  }
}

function drawTextLike(page, viewport, a, font) {
  const fontSize = a.fontSize || 14
  // Text is stored as a top-left anchor (CSS convention); pdf-lib anchors at
  // the baseline, so drop down by an approximate ascent before converting.
  const baselineX = a.x
  const baselineY = a.y + fontSize * 0.8
  const { origin, xAxis } = frameAt(viewport, baselineX, baselineY)
  const scale = Math.hypot(xAxis[0], xAxis[1]) || 1
  const rotateDeg = (Math.atan2(xAxis[1], xAxis[0]) * 180) / Math.PI
  page.drawText(a.text || '', {
    x: origin[0],
    y: origin[1],
    size: fontSize * scale,
    font,
    color: hexToRgb(a.color),
    rotate: degrees(rotateDeg),
  })
}

// Translates an annotation's stored (scale-1) geometry by (dx, dy) — used to
// commit a finished drag in the "Select" tool. Returns a new object; never
// mutates the input.
export function translateAnnotation(a, dx, dy) {
  switch (a.type) {
    case 'cover':
    case 'redact':
    case 'highlight':
    case 'rectangle':
    case 'text':
      return { ...a, x: a.x + dx, y: a.y + dy }
    case 'line':
    case 'arrow':
      return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy }
    case 'ellipse':
      return { ...a, cx: a.cx + dx, cy: a.cy + dy }
    case 'pen':
      return { ...a, points: a.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
    default:
      return a
  }
}

// Re-anchors a page's annotations to the same underlying page content after
// its rendered orientation changes (rotate) or its visible extent/origin
// shifts (crop). `oldViewport`/`newViewport` are pdf.js scale-1 viewports for
// the SAME page content before and after the change — a stored point is
// round-tripped old-screen → PDF space → new-screen, reusing the exact
// convertToPdfPoint machinery the bake path already relies on, so rotation,
// crop, or both together are handled uniformly without hand-rolled matrices.
function reprojectPoint(oldViewport, newViewport, x, y) {
  const [px, py] = oldViewport.convertToPdfPoint(x, y)
  return newViewport.convertToViewportPoint(px, py)
}

export function reprojectAnnotations(annotations, oldViewport, newViewport) {
  return (annotations || []).map(a => reprojectAnnotation(a, oldViewport, newViewport))
}

function reprojectAnnotation(a, oldViewport, newViewport) {
  const pt = (x, y) => reprojectPoint(oldViewport, newViewport, x, y)
  switch (a.type) {
    case 'cover':
    case 'redact':
    case 'highlight':
    case 'rectangle': {
      const [x1, y1] = pt(a.x, a.y)
      const [x2, y2] = pt(a.x + a.w, a.y + a.h)
      return { ...a, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
    }
    case 'text': {
      const [nx, ny] = pt(a.x, a.y)
      const [wx, wy] = pt(a.x + (a.w || 0), a.y)
      return { ...a, x: nx, y: ny, w: Math.max(20, Math.hypot(wx - nx, wy - ny)) }
    }
    case 'line':
    case 'arrow': {
      const [x1, y1] = pt(a.x1, a.y1)
      const [x2, y2] = pt(a.x2, a.y2)
      return { ...a, x1, y1, x2, y2 }
    }
    case 'ellipse': {
      const [cx, cy] = pt(a.cx, a.cy)
      const [rx1, ry1] = pt(a.cx + a.rx, a.cy)
      const [rx2, ry2] = pt(a.cx, a.cy + a.ry)
      return { ...a, cx, cy, rx: Math.hypot(rx1 - cx, ry1 - cy), ry: Math.hypot(rx2 - cx, ry2 - cy) }
    }
    case 'pen':
      return { ...a, points: a.points.map(p => { const [x, y] = pt(p.x, p.y); return { x, y } }) }
    default:
      return a
  }
}

// Draws every annotation for one page onto its pdf-lib page, mapping stored
// scale-1 screen coordinates into PDF user space via the matching pdf.js
// viewport (which already accounts for the page's rotation and crop).
export function bakeAnnotationsIntoPage(pdfLibPage, annotations, viewport, font) {
  for (const a of annotations || []) {
    switch (a.type) {
      case 'cover':
      case 'redact':
        drawRectLike(pdfLibPage, viewport, a, { filled: true })
        break
      case 'highlight':
        drawRectLike(pdfLibPage, viewport, { ...a, opacity: a.opacity ?? 0.35 }, { filled: true })
        break
      case 'rectangle':
        drawRectLike(pdfLibPage, viewport, a, { filled: false })
        break
      case 'line':
      case 'arrow':
        drawLineLike(pdfLibPage, viewport, a)
        break
      case 'ellipse':
        drawEllipseLike(pdfLibPage, viewport, a)
        break
      case 'pen':
        drawPenLike(pdfLibPage, viewport, a)
        break
      case 'text':
        if (font) drawTextLike(pdfLibPage, viewport, a, font)
        break
      default:
        break
    }
  }
}

// Draws every annotation for one page directly onto a raster <canvas> 2D
// context, used by the redaction bake path (buildWorkingPdf in LegacyPDF.jsx)
// to flatten markup into the same bitmap the redaction boxes overwrite pixels
// on. Stored annotation geometry is in scale-1 CSS px with a top-left,
// y-down origin — the same convention pdf.js uses for canvas rendering — so
// mapping into raster px is a plain multiply by `scale` (the render scale
// the canvas was rasterized at), no viewport/PDF-space conversion needed.
export function drawAnnotationsOnCanvas(ctx, annotations, scale) {
  for (const a of annotations || []) {
    ctx.save()
    switch (a.type) {
      case 'cover':
      case 'redact':
        ctx.fillStyle = a.color || (a.type === 'redact' ? '#000000' : '#ffffff')
        ctx.globalAlpha = 1
        ctx.fillRect(a.x * scale, a.y * scale, a.w * scale, a.h * scale)
        break
      case 'highlight':
        ctx.fillStyle = a.color
        ctx.globalAlpha = a.opacity ?? 0.35
        ctx.fillRect(a.x * scale, a.y * scale, a.w * scale, a.h * scale)
        break
      case 'rectangle':
        ctx.strokeStyle = a.color
        ctx.lineWidth = Math.max(0.5, (a.strokeWidth || 2) * scale)
        ctx.strokeRect(a.x * scale, a.y * scale, a.w * scale, a.h * scale)
        break
      case 'line':
      case 'arrow': {
        const x1 = a.x1 * scale, y1 = a.y1 * scale, x2 = a.x2 * scale, y2 = a.y2 * scale
        const thickness = Math.max(0.5, (a.strokeWidth || 2) * scale)
        ctx.strokeStyle = a.color
        ctx.lineWidth = thickness
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        if (a.type === 'arrow') {
          const headLen = Math.max(6 * scale, thickness * 4)
          const angle = Math.atan2(y2 - y1, x2 - x1)
          const spread = Math.PI / 7
          for (const dir of [-1, 1]) {
            const a2 = angle + Math.PI - dir * spread
            ctx.beginPath()
            ctx.moveTo(x2, y2)
            ctx.lineTo(x2 + headLen * Math.cos(a2), y2 + headLen * Math.sin(a2))
            ctx.stroke()
          }
        }
        break
      }
      case 'ellipse':
        ctx.beginPath()
        ctx.ellipse(a.cx * scale, a.cy * scale, Math.max(a.rx * scale, 0.01), Math.max(a.ry * scale, 0.01), 0, 0, Math.PI * 2)
        if (a.filled) {
          ctx.fillStyle = a.color
          ctx.fill()
        } else {
          ctx.strokeStyle = a.color
          ctx.lineWidth = Math.max(0.5, (a.strokeWidth || 2) * scale)
          ctx.stroke()
        }
        break
      case 'pen': {
        const pts = a.points || []
        if (pts.length < 2) break
        ctx.strokeStyle = a.color
        ctx.lineWidth = Math.max(0.5, (a.strokeWidth || 2) * scale)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(pts[0].x * scale, pts[0].y * scale)
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * scale, pts[i].y * scale)
        ctx.stroke()
        break
      }
      case 'text':
        ctx.fillStyle = a.color || '#000000'
        ctx.textBaseline = 'top'
        ctx.font = `${(a.fontSize || 14) * scale}px Helvetica, Arial, sans-serif`
        ctx.fillText(a.text || '', a.x * scale, a.y * scale)
        break
      default:
        break
    }
    ctx.restore()
  }
}
