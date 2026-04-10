import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { wrapEmailBody } from '../lib/emailWrapper'
import { resolveVars } from '../lib/resolveVars'
import { toast } from 'react-hot-toast'
import { useGmailStatus } from '../lib/useGmailStatus'
import './EmailPreviewModal.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''

// ─── Resolve a recipients/cc_recipients JSONB array → email strings ────────────
// titleContact is the collaborator record (or null) fetched from collaborators table
function resolveRecipients(entries = [], tx, titleContact) {
  if (!Array.isArray(entries)) return []
  const resolved = []
  const warnings = []

  for (const entry of entries) {
    if (entry.type === 'custom') {
      resolved.push(entry.value)
    } else if (entry.type === 'variable') {
      switch (entry.value) {
        case 'client': {
          const email = tx?.client_email
          if (email) resolved.push(email)
          else warnings.push('Client email not set')
          break
        }
        case 'client2': {
          const email = tx?.client2_email
          if (email) resolved.push(email)
          else warnings.push('Client 2 email not set')
          break
        }
        case 'lender': {
          const email = tx?.lender_email
          if (email) resolved.push(email)
          else warnings.push('Lender email not set')
          break
        }
        case 'title_contact': {
          const email = titleContact?.email
          if (email) resolved.push(email)
          else warnings.push('Title Contact email not set')
          break
        }
        case 'co_op_agent': {
          const email = tx?.co_op_agent_email
          if (email) resolved.push(email)
          else warnings.push('Co-op Agent email not set')
          break
        }
        default:
          warnings.push(`Unknown variable: ${entry.value}`)
      }
    }
  }

  return { emails: resolved, warnings }
}

// ─── Drive File Picker ────────────────────────────────────────────────────────
function DriveFilePicker({ folderId, selectedFiles, onToggleFile, onClose }) {
  const [files,   setFiles]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!folderId) { setLoading(false); return }

    async function fetchFiles() {
      try {
        const tokenRes = await fetch(`${API_BASE}/api/google/token`)
        if (!tokenRes.ok) throw new Error('Could not get Drive access token')
        const { access_token } = await tokenRes.json()

        const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
        const fields = encodeURIComponent('files(id,name,mimeType,size,iconLink,webViewLink)')
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        )
        if (!res.ok) throw new Error('Failed to list Drive files')
        const data = await res.json()
        setFiles(data.files || [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchFiles()
  }, [folderId])

  return (
    <div className="epm-drive-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="epm-drive-modal">
        <div className="epm-drive-header">
          <span className="epm-drive-title">Select files from Drive</span>
          <button className="epm-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="epm-drive-body">
          {loading && <div className="epm-drive-loading">Loading files…</div>}
          {error   && <div className="epm-drive-error">{error}</div>}
          {!loading && !error && !folderId && (
            <div className="epm-drive-empty">No Drive folder linked to this transaction.</div>
          )}
          {!loading && !error && folderId && files.length === 0 && (
            <div className="epm-drive-empty">No files in this transaction's Drive folder.</div>
          )}
          {!loading && !error && files.map(file => {
            const selected = selectedFiles.some(f => f.id === file.id)
            return (
              <label key={file.id} className={`epm-drive-file${selected ? ' epm-drive-file--selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleFile(file)}
                />
                <span className="epm-drive-file-name">{file.name}</span>
                <span className="epm-drive-file-type">{friendlyMime(file.mimeType)}</span>
              </label>
            )
          })}
        </div>
        <div className="epm-drive-footer">
          <button className="epm-btn epm-btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

function friendlyMime(mimeType = '') {
  if (mimeType.includes('pdf'))         return 'PDF'
  if (mimeType.includes('document'))    return 'Doc'
  if (mimeType.includes('spreadsheet')) return 'Sheet'
  if (mimeType.includes('presentation'))return 'Slide'
  if (mimeType.includes('image'))       return 'Image'
  return 'File'
}

// ─── Main EmailPreviewModal ───────────────────────────────────────────────────
export default function EmailPreviewModal({ task, tx, tcSettings = [], onClose }) {
  const [template,     setTemplate]     = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [titleContact, setTitleContact] = useState(null)
  const [driveOpen,    setDriveOpen]    = useState(false)
  const [attachments,  setAttachments]  = useState([])  // { id, name, mimeType }
  const [sending,      setSending]      = useState(false)
  const gmailStatus = useGmailStatus()

  // Load template
  useEffect(() => {
    if (!task.email_template_id) { setLoading(false); return }
    supabase
      .from('email_templates')
      .select('*')
      .eq('id', task.email_template_id)
      .single()
      .then(({ data }) => {
        setTemplate(data)
        setLoading(false)
      })
  }, [task.email_template_id])

  // Load title contact collaborator
  useEffect(() => {
    if (!tx?.title_collaborator_id) return
    supabase
      .from('collaborators')
      .select('*')
      .eq('id', tx.title_collaborator_id)
      .single()
      .then(({ data }) => setTitleContact(data || null))
  }, [tx?.title_collaborator_id])

  const gmailReady = !gmailStatus.loading && gmailStatus.connected && gmailStatus.hasGmailScope

  if (loading) {
    return (
      <div className="epm-overlay">
        <div className="epm-modal">
          <div className="epm-loading">Loading template…</div>
        </div>
      </div>
    )
  }

  if (!template) {
    return (
      <div className="epm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="epm-modal">
          <div className="epm-header">
            <span className="epm-title">Preview Email</span>
            <button className="epm-close-btn" onClick={onClose}>✕</button>
          </div>
          <div className="epm-body">
            <div className="epm-error">No email template linked to this task.</div>
          </div>
        </div>
      </div>
    )
  }

  // Resolve recipients/CC
  const recipientsResult = resolveRecipients(template.recipients || [], tx, titleContact)
  const ccResult         = resolveRecipients(template.cc_recipients || [], tx, titleContact)
  const allWarnings = [...recipientsResult.warnings, ...ccResult.warnings]

  // Legacy fallback: if no structured recipients/cc_recipients, fall back to resolved cc text
  const toEmails = recipientsResult.emails
  const ccEmails = ccResult.emails.length > 0
    ? ccResult.emails
    : template.cc
      ? resolveVars(template.cc, tx, tcSettings).split(',').map(s => s.trim()).filter(Boolean)
      : []

  // Resolve subject and body
  const resolvedSubject = resolveVars(template.subject || '', tx, tcSettings)
  const resolvedBody    = resolveVars(template.body    || '', tx, tcSettings)

  const toggleAttachment = (file) => {
    setAttachments(prev =>
      prev.some(f => f.id === file.id)
        ? prev.filter(f => f.id !== file.id)
        : [...prev, file]
    )
  }

  const handleSend = async () => {
    if (toEmails.length === 0) {
      toast.error('No recipients resolved — add recipients to the email template')
      return
    }
    setSending(true)
    try {
      // For Drive attachments, fetch each file's content via the Drive API
      const resolvedAttachments = await Promise.all(
        attachments.map(async (file) => {
          const tokenRes = await fetch(`${API_BASE}/api/google/token`)
          const { access_token } = await tokenRes.json()
          const contentRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`,
            { headers: { Authorization: `Bearer ${access_token}` } }
          )
          if (!contentRes.ok) throw new Error(`Could not download ${file.name}`)
          const blob = await contentRes.blob()
          const data = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload  = () => resolve(reader.result.split(',')[1]) // base64 part
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })
          return {
            filename:    file.name,
            contentType: file.mimeType || 'application/octet-stream',
            data,
          }
        })
      )

      const rawBody  = resolvedBody.trimStart().startsWith('<')
        ? resolvedBody
        : `<pre style="font-family:monospace;font-size:13px;white-space:pre-wrap;line-height:1.5;">${resolvedBody.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`

      const res = await fetch(`${API_BASE}/api/google/gmail-send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:            toEmails,
          cc:            ccEmails.length > 0 ? ccEmails : undefined,
          subject:       resolvedSubject,
          body:          wrapEmailBody(rawBody),
          transactionId: tx?.id || undefined,
          attachments:   resolvedAttachments.length > 0 ? resolvedAttachments : undefined,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Send failed')
      toast.success('Email sent')
      onClose()
    } catch (err) {
      toast.error('Send failed: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="epm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="epm-modal">

          <div className="epm-header">
            <span className="epm-title">Preview Email — {template.name}</span>
            <button className="epm-close-btn" onClick={onClose}>✕</button>
          </div>

          <div className="epm-body">

            {/* Warnings */}
            {allWarnings.length > 0 && (
              <div className="epm-warnings">
                {allWarnings.map((w, i) => (
                  <div key={i} className="epm-warning">⚠ {w}</div>
                ))}
              </div>
            )}

            {/* To */}
            <div className="epm-meta-row">
              <span className="epm-meta-label">To</span>
              <span className="epm-meta-value">
                {toEmails.length > 0
                  ? toEmails.join(', ')
                  : <em className="epm-meta-empty">No recipients — add recipients to this template</em>
                }
              </span>
            </div>

            {/* CC */}
            {ccEmails.length > 0 && (
              <div className="epm-meta-row">
                <span className="epm-meta-label">CC</span>
                <span className="epm-meta-value">{ccEmails.join(', ')}</span>
              </div>
            )}

            {/* Subject */}
            <div className="epm-meta-row">
              <span className="epm-meta-label">Subject</span>
              <span className="epm-meta-value epm-subject">{resolvedSubject || '(no subject)'}</span>
            </div>

            <div className="epm-divider" />

            {/* Body */}
            <div
              className="epm-preview-body"
              dangerouslySetInnerHTML={{ __html: resolvedBody || '' }}
            />

            <div className="epm-divider" />

            {/* Attachments */}
            <div className="epm-attachments-section">
              <span className="epm-attachments-label">Attachments:</span>
              {attachments.length === 0
                ? <span className="epm-attachments-none">None</span>
                : (
                  <div className="epm-attachment-tags">
                    {attachments.map(f => (
                      <span key={f.id} className="epm-attachment-tag">
                        {f.name}
                        <button className="epm-attachment-remove" onClick={() => toggleAttachment(f)}>×</button>
                      </span>
                    ))}
                  </div>
                )
              }
              <button
                className="epm-btn epm-btn-outline epm-attach-btn"
                onClick={() => setDriveOpen(true)}
              >
                + Attach from Drive
              </button>
            </div>

          </div>

          <div className="epm-footer">
            <button className="epm-btn epm-btn-cancel" onClick={onClose}>Cancel</button>
            {gmailReady ? (
              <button
                className="epm-btn epm-btn-primary"
                onClick={handleSend}
                disabled={sending || toEmails.length === 0}
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            ) : (
              <a href="/api/google/auth" className="epm-btn epm-btn-primary epm-reconnect-btn">
                Reconnect Google to Send
              </a>
            )}
          </div>

        </div>
      </div>

      {driveOpen && (
        <DriveFilePicker
          folderId={tx?.drive_folder_id || null}
          selectedFiles={attachments}
          onToggleFile={toggleAttachment}
          onClose={() => setDriveOpen(false)}
        />
      )}
    </>
  )
}
