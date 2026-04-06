// VendorFormPreviewModal — PDF pre-fill preview + send workflow.
// Only used for vendors with contact_method = "PDF Form + Email".
// Calls api/vendor/fill-pdf on mount, shows the filled PDF in an iframe,
// and lets Amy send directly or add to the Send Queue.

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { wrapEmailBody } from '../lib/emailWrapper'
import { toast } from 'react-hot-toast'
import './VendorFormPreviewModal.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''

export default function VendorFormPreviewModal({ taskId, vendorId, tx, onClose }) {
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
        const res = await fetch(`${API_BASE}/api/vendor/fill-pdf`, {
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

  const buildEmailBody = () => {
    const addr = pdfData?.propertyAddress || ''
    const name = pdfData?.vendorName      || 'Vendor'
    return wrapEmailBody(
      `<p>Hi ${name},</p>` +
      `<p>Please find the attached inspection request form for <strong>${addr}</strong>.</p>` +
      `<p>Please review the attached form and let us know your availability.</p>` +
      `<p>Thank you!</p>`
    )
  }

  const handleSend = async () => {
    if (!pdfData?.vendorEmail) { toast.error('No email address on file for this vendor'); return }
    setSending(true)
    try {
      const subject = `Inspection Request - ${pdfData.propertyAddress || 'Property'}`
      const res = await fetch(`${API_BASE}/api/google/gmail-send`, {
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
    const subject = `Inspection Request - ${pdfData.propertyAddress || 'Property'}`
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
    })
    setQueuing(false)
    if (insertErr) { toast.error('Failed to add to queue'); return }
    toast.success('Added to Send Queue')
    onClose()
  }

  return (
    <div className="vfp-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="vfp-modal">

        {/* Header */}
        <div className="vfp-header">
          <div className="vfp-header-info">
            <span className="vfp-title">Inspection Request Form</span>
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
              title="Filled inspection request form"
            />
          )}
        </div>

      </div>
    </div>
  )
}
