import { useState, useRef } from 'react'
import { getAssigneeOptions, firstName } from '../lib/people'
import { wrapEmailBody } from '../lib/emailWrapper'
import './TaskCommentPanel.css'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractMentions(text) {
  const m = text.match(/@\w+/g) || []
  return [...new Set(m)]
}

function renderCommentText(text) {
  if (!text) return null
  return text.split(/(@\w+)/g).map((part, i) =>
    /^@\w+$/.test(part)
      ? <span key={i} className="tc-mention">{part}</span>
      : part
  )
}

function buildMentionPeople(tcSettings = []) {
  return tcSettings
    .filter(tc => tc.name && tc.name !== 'Me')
    .map(tc => ({
      handle: '@' + (firstName(tc.name) || tc.name),
      email:  tc.email || null,
      name:   tc.name,
    }))
}

// Send a task-comment @mention notification to each mentioned TC via the Gmail
// API. Recipients come from live tcSettings only; failures are logged, never
// thrown, so comment creation is never blocked by a bad send.
async function sendMentionEmails(mentions, body, transactionAddr, tcSettings = [], transactionId = null) {
  const people   = buildMentionPeople(tcSettings)
  const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''
  const escHtml  = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const addr     = transactionAddr || '(No address)'
  const app_url  = transactionId
    ? `https://app.desert-legacy.com/?tab=board&tx=${transactionId}`
    : 'https://app.desert-legacy.com/?tab=board'

  for (const handle of mentions) {
    const person = people.find(p => p.handle.toLowerCase() === handle.toLowerCase())
    if (!person?.email) continue
    const htmlBody = wrapEmailBody(
      `<p style="font-size:13px;">You were mentioned in a task comment on <strong>${escHtml(addr)}</strong>.</p>` +
      `<pre style="font-family:monospace;font-size:13px;white-space:pre-wrap;line-height:1.5;">${escHtml(body)}</pre>` +
      `<p style="font-size:13px;"><a href="${app_url}">Open in LegacyOS</a></p>`
    )
    try {
      const res = await fetch(`${API_BASE}/api/google/gmail-send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:            person.email,
          subject:       `You were mentioned in a task comment — ${addr}`,
          body:          htmlBody,
          transactionId: transactionId || undefined,
        }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(result.error || `Gmail send failed (${res.status})`)
    } catch (err) {
      console.warn('[TaskComment] mention email failed:', err.message)
    }
  }
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function TaskCommentPanel({
  taskTitle,
  comments,
  onAdd,
  onDelete,
  onClose,
  tcSettings = [],
  agentName = '',
  transactionAddr = '',
  transactionId = null,
}) {
  const authorOptions = getAssigneeOptions(tcSettings, agentName)
  const [text,          setText]          = useState('')
  const [author,        setAuthor]        = useState('Me')
  const [mentionOpen,   setMentionOpen]   = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const inputRef = useRef(null)

  const mentionPeople   = buildMentionPeople(tcSettings)
  const visibleMentions = mentionPeople.filter(p =>
    p.handle.slice(1).toLowerCase().startsWith(mentionFilter)
  )

  const handleInputChange = (e) => {
    const val    = e.target.value
    const cursor = e.target.selectionStart
    setText(val)
    const atMatch = val.slice(0, cursor).match(/@(\w*)$/)
    if (atMatch) { setMentionOpen(true); setMentionFilter(atMatch[1].toLowerCase()) }
    else setMentionOpen(false)
  }

  const insertMention = (handle) => {
    const cursor = inputRef.current?.selectionStart ?? text.length
    const before = text.slice(0, text.slice(0, cursor).lastIndexOf('@'))
    const after  = text.slice(cursor)
    const next   = before + handle + ' ' + after
    setText(next)
    setMentionOpen(false)
    setMentionFilter('')
    requestAnimationFrame(() => {
      if (inputRef.current) {
        const pos = (before + handle + ' ').length
        inputRef.current.focus()
        inputRef.current.setSelectionRange(pos, pos)
      }
    })
  }

  const handleSubmit = () => {
    const body = text.trim()
    if (!body) return
    const mentions = extractMentions(body)
    onAdd(author, body)
    setText('')
    setMentionOpen(false)
    inputRef.current?.focus()
    if (mentions.length > 0) sendMentionEmails(mentions, body, transactionAddr, tcSettings, transactionId)
  }

  return (
    <div className="tc-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tc-panel">

        <div className="tc-header">
          <div>
            <div className="tc-title">Comments</div>
            {taskTitle && <div className="tc-subtitle">{taskTitle}</div>}
          </div>
          <button className="tc-close" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="tc-list">
          {comments.length === 0 && (
            <div className="tc-empty">No comments yet.</div>
          )}
          {comments.map(c => (
            <div key={c.id} className="tc-comment">
              <div className="tc-comment-top">
                <span className="tc-comment-author">{c.author}</span>
                <button className="tc-comment-del" onClick={() => onDelete(c.id)} title="Delete">✕</button>
              </div>
              <div className="tc-comment-body">{renderCommentText(c.body)}</div>
            </div>
          ))}
        </div>

        <div className="tc-compose">
          <select className="tc-author-sel" value={author} onChange={e => setAuthor(e.target.value)}>
            {authorOptions.map(a => <option key={a}>{a}</option>)}
          </select>
          <div className="tc-input-wrap">
            <input
              ref={inputRef}
              className="tc-input"
              placeholder="Add a comment… use @ to mention"
              value={text}
              autoFocus
              onChange={handleInputChange}
              onKeyDown={e => {
                if (e.key === 'Enter' && !mentionOpen) { e.preventDefault(); handleSubmit() }
                if (e.key === 'Escape') { if (mentionOpen) setMentionOpen(false); else onClose() }
              }}
            />
            {mentionOpen && visibleMentions.length > 0 && (
              <div className="tc-mention-dropdown">
                {visibleMentions.map(p => (
                  <button
                    key={p.handle}
                    className="tc-mention-option"
                    onMouseDown={e => { e.preventDefault(); insertMention(p.handle) }}
                  >
                    {p.handle}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="tc-submit" onClick={handleSubmit} disabled={!text.trim()}>Post</button>
        </div>

      </div>
    </div>
  )
}
