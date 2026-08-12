// VendorFormPreviewModal — PDF pre-fill preview + send workflow.
// Only used for vendors with contact_method = "PDF Form + Email".
// Calls api/vendor/fill-pdf on mount, shows the filled PDF in an iframe,
// and lets Amy send directly or add to the Send Queue.

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase, getUserId } from '../lib/supabase'
import { wrapEmailBody } from '../lib/emailWrapper'
import { toast } from 'react-hot-toast'
import { apiFetch } from '../lib/apiClient'
import { markTaskInProgress } from '../lib/taskStatus'
import './VendorFormPreviewModal.css'

// vendor_type → friendly form label, mirrored server-side in
// api/vendor/fill-pdf.js (that response drives the PDF filename; this drives
// the modal header + email subject/body — kept in sync by hand since client
// and api/ are separate bundles).
const VENDOR_FORM_LABELS = {
  'Home Inspector': 'Home Inspection Request',
  'Septic':         'Septic Inspection Request',
  'Permits':        'Permits Request',
  'Tiedowns':       'Tiedown Request',
  'Home Warranty':  'Home Warranty Request',
}
function vendorFormLabel(vendorType) {
  if (!vendorType) return 'Vendor Form Request'
  return VENDOR_FORM_LABELS[vendorType] || `${vendorType} Request`
}

export default function VendorFormPreviewModal({ taskId, vendorId, tx, onClose, onUpdate }) {
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [pdfData,   setPdfData]   = useState(null)   // { pdfBase64, filename, vendorEmail, vendorName, propertyAddress, missingFields }
  const [blobUrl,   setBlobUrl]   = useState(null)
  const [sending,   setSending]   = useState(false)
  const [queuing,   setQueuing]   = useState(false)
  const prevBlobUrl = useRef(null)

  // Fetch filled PDF on mount
  useEffect(() => {
    let cancelled = false
    async function fetchPdf() {
      setLoading(true)
      setError(null)
      try {
        const res = await apiFetch('/api/vendor/fill-pdf', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ taskId, vendorId }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || `Server error ${res.status}`)
        if (cancelled) return
        setPdfData(json)

        // Build a blob URL so the PDF previews in all browsers (avoids Safari data: URI block)
        const bytes   = Uint8Array.from(atob(json.pdfBase64), c => c.charCodeAt(0))
        const blob    = new Blob([bytes], { type: 'application/pdf' })
        const url     = URL.createObjectURL(blob)
        prevBlobUrl.current = url
        setBlobUrl(url)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchPdf()
    return () => {
      cancelled = true
      if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current)
    }
  }, [taskId, vendorId])

  const formLabel = vendorFormLabel(pdfData?.vendorType)

  const buildEmailBody = () => {
    const addr = pdfData?.propertyAddress || ''
    const name = pdfData?.vendorName      || 'Vendor'
    return wrapEmailBody(
      `<p>Hi ${name},</p>` +
      `<p>Please find the attached ${formLabel.toLowerCase()} form for <strong>${addr}</strong>.</p>` +
      `<p>Please review the attached form and let us know your availability.</p>` +
      `<p>Thank you!</p>`
    )
  }

  const handleSend = async () => {
    if (!pdfData?.vendorEmail) { toast.error('No email address on file for this vendor'); return }
    setSending(true)
    try {
      const subject = `${formLabel} - ${pdfData.propertyAddress || 'Property'}`
      const res = await apiFetch('/api/google/gmail-send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:            pdfData.vendorEmail,
          subject,
          body:          buildEmailBody(),
          transactionId: tx?.id || undefined,
          attachments: [{
            filename:    pdfData.filename,
            contentType: 'application/pdf',
            data:        pdfData.pdfBase64,
          }],
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Send failed')
      toast.success(`Sent to ${pdfData.vendorName}`)
      await markTaskInProgress(supabase, taskId, onUpdate)
      onClose()
    } catch (err) {
      toast.error('Send failed: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  const handleQueue = async () => {
    if (!pdfData) return
    setQueuing(true)
    const subject = `${formLabel} - ${pdfData.propertyAddress || 'Property'}`
    const uid = await getUserId()
    const { error: insertErr } = await supabase.from('email_queue').insert({
      transaction_id: tx?.id        || null,
      to_email:       pdfData.vendorEmail,
      to_name:        pdfData.vendorName,
      subject,
      body:           buildEmailBody(),
      pdf_data:       pdfData.pdfBase64,
      pdf_filename:   pdfData.filename,
      status:         'pending',
      prepared_by:    'Me',
      user_id:        uid,
    })
    setQueuing(false)
    if (insertErr) { toast.error('Failed to add to queue'); return }
    toast.success('Added to Send Queue')
    onClose()
  }

  // Portal to <body> — escapes the vendor-select modal's backdrop-filter
  // containing block (TasksTab.css .gtd-vendor-modal), which otherwise traps
  // this position:fixed overlay and washes it out. Same pattern as
  // TaskEditModal/AddTaskModal in TasksTab.jsx.
  return createPortal(
    <div className="vfp-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="vfp-modal">

        {/* Header */}
        <div className="vfp-header">
          <div className="vfp-header-info">
            <span className="vfp-title">{formLabel}</span>
            {pdfData?.propertyAddress && (
              <span className="vfp-subtitle">{pdfData.propertyAddress}</span>
            )}
          </div>
          <button className="vfp-close" onClick={onClose}>✕</button>
        </div>

        {/* Action bar */}
        <div className="vfp-action-bar">
          <button
            className="vfp-send-btn"
            onClick={handleSend}
            disabled={loading || !!error || sending || queuing}
          >
            {sending ? 'Sending…' : '✓ Send to Vendor'}
          </button>
          <button
            className="vfp-queue-btn"
            onClick={handleQueue}
            disabled={loading || !!error || sending || queuing}
          >
            {queuing ? 'Adding…' : 'Add to Queue'}
          </button>
          {pdfData?.vendorEmail && (
            <span className="vfp-recipient">To: {pdfData.vendorEmail}</span>
          )}
        </div>

        {/* Missing fields notice */}
        {pdfData?.missingFields?.length > 0 && (
          <div className="vfp-missing-banner">
            <strong>Fields left blank</strong> — missing from transaction:{' '}
            {pdfData.missingFields.join(', ')}
          </div>
        )}

        {/* Body */}
        <div className="vfp-body">
          {loading && (
            <div className="vfp-state">
              <div className="vfp-spinner" />
              <span>Filling PDF…</span>
            </div>
          )}
          {!loading && error && (
            <div className="vfp-state vfp-state--error">
              <span>⚠ {error}</span>
            </div>
          )}
          {!loading && !error && blobUrl && (
            <iframe
              className="vfp-iframe"
              src={blobUrl}
              title={`Filled ${formLabel.toLowerCase()} form`}
            />
          )}
        </div>

      </div>
    </div>,
    document.body
  )
}
