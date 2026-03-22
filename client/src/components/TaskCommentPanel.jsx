import { useState, useRef } from 'react'
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
    .filter(tc => tc.name !== 'Me')
    .map(tc => ({
      handle: '@' + tc.name.split(' ')[0],
      email:  tc.email || null,
      name:   tc.name,
    }))
}

async function sendMentionEmails(mentions, body, transactionAddr, tcSettings = []) {
  const SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID
  const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
  const PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) return
  const people = buildMentionPeople(tcSettings)
  try {
    const { default: emailjs } = await import('@emailjs/browser')
    for (const handle of mentions) {
      const person = people.find(p => p.handle.toLowerCase() === handle.toLowerCase())
      if (!person?.email) continue
      await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
        to_email:         person.email,
        to_name:          person.name,
        transaction_addr: transactionAddr || '(No address)',
        mention_notes:    body,
        task_title:       'You were mentioned in a task comment',
        app_url:          window.location.origin,
      }, PUBLIC_KEY)
    }
  } catch (err) {
    console.warn('[TaskComment] mention email failed:', err.message)
  }
}

const COMMENT_AUTHORS = ['Me', 'Justina Morris', 'Victoria Lareau']

// ─── Main Component ────────────────────────────────────────────────────────────
export default function TaskCommentPanel({
  taskTitle,
  comments,
  onAdd,
  onDelete,
  onClose,
  tcSettings = [],
  transactionAddr = '',
}) {
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
    if (mentions.length > 0) sendMentionEmails(mentions, body, transactionAddr, tcSettings)
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
            {COMMENT_AUTHORS.map(a => <option key={a}>{a}</option>)}
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
