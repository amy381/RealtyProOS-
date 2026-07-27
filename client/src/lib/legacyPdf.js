// Build a Letter-portrait PDF from an ordered list of images and trigger a
// browser download. 100% client-side — no network, no storage. Kept as a pure
// module (out of the entangled LegacyPDF.jsx) so it can be tested/staged alone.
import { jsPDF } from 'jspdf'

// Letter portrait, in points (1pt = 1/72in).
const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 36   // 0.5in
const GAP    = 18   // vertical gap between the two images in 2-per-page

// Fit (imgW × imgH) inside a box, preserving aspect ratio, centered.
// Returns the placement rect { x, y, w, h } in page points.
function fitCentered(imgW, imgH, boxX, boxY, boxW, boxH) {
  const scale = Math.min(boxW / imgW, boxH / imgH)
  const w = imgW * scale
  const h = imgH * scale
  return {
    x: boxX + (boxW - w) / 2,
    y: boxY + (boxH - h) / 2,
    w,
    h,
  }
}

// images: [{ dataUrl, w, h, format }]  (w/h = intrinsic pixel dimensions;
//   format = 'PNG' | 'JPEG' for jsPDF's addImage).
// opts.perPage: 1 (default) or 2.
// opts.filename: defaults to legacy-<timestamp>.pdf.
export function generateLegacyPdf(images, { perPage = 1, filename } = {}) {
  if (!images || !images.length) throw new Error('No images to export')

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' })

  const contentX = MARGIN
  const contentY = MARGIN
  const contentW = PAGE_W - MARGIN * 2
  const contentH = PAGE_H - MARGIN * 2

  const place = (img, box) => {
    const f = fitCentered(img.w, img.h, box.x, box.y, box.w, box.h)
    doc.addImage(img.dataUrl, img.format || undefined, f.x, f.y, f.w, f.h)
  }

  if (perPage === 2) {
    const halfH = (contentH - GAP) / 2
    const topBox = { x: contentX, y: contentY, w: contentW, h: halfH }
    const botBox = { x: contentX, y: contentY + halfH + GAP, w: contentW, h: halfH }
    for (let i = 0; i < images.length; i += 2) {
      if (i > 0) doc.addPage()
      place(images[i], topBox)
      // Odd final image lands here alone → its own page with one image (top half).
      if (images[i + 1]) place(images[i + 1], botBox)
    }
  } else {
    const box = { x: contentX, y: contentY, w: contentW, h: contentH }
    images.forEach((img, i) => {
      if (i > 0) doc.addPage()
      place(img, box)
    })
  }

  doc.save(filename || `legacy-${Date.now()}.pdf`)
}
