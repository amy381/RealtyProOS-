import { useState } from 'react'
import { supabase } from '../lib/supabase'
import './SettingsModal.css'

export default function SettingsModal({ tcSettings, onSave, onClose }) {
  const [draft, setDraft] = useState(tcSettings.map(t => ({ ...t })))

  const setEmail = (idx, email) => {
    setDraft(prev => prev.map((t, i) => i === idx ? { ...t, email } : t))
  }

  const handleSave = () => {
    onSave(draft)
    onClose()
  }

  return (
    <div className="settings-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="settings-modal">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          <div className="settings-section-label">Team Member Email Addresses</div>
          <p className="settings-hint">
            Used for @mention notifications in task notes. Type @Justina or @Victoria in a task note to send an email alert.
          </p>

          <div className="settings-fields">
            {draft.map((tc, i) => (
              <div key={tc.id || tc.name} className="settings-field-row">
                <span className="settings-tc-name">{tc.name}</span>
                <input
                  type="email"
                  className="settings-email-input"
                  placeholder={tc.name === 'Me' ? 'your@email.com' : `${tc.name.split(' ')[0].toLowerCase()}@email.com`}
                  value={tc.email || ''}
                  onChange={e => setEmail(i, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="settings-email-note">
            <strong>To enable email notifications:</strong> Sign up at{' '}
            <a href="https://www.emailjs.com" target="_blank" rel="noreferrer">emailjs.com</a>{' '}
            (free), create a service + template, then add these to your Vercel environment variables:
            <code className="settings-env-block">
              VITE_EMAILJS_SERVICE_ID<br />
              VITE_EMAILJS_TEMPLATE_ID<br />
              VITE_EMAILJS_PUBLIC_KEY
            </code>
            Email template variables: <code>to_email</code>, <code>to_name</code>, <code>transaction_addr</code>, <code>task_title</code>, <code>mention_notes</code>
          </div>
        </div>

        <div className="settings-actions">
          <button
            className="settings-signout"
            onClick={() => supabase.auth.signOut()}
          >
            Sign Out
          </button>
          <div className="settings-actions-right">
            <button className="settings-cancel" onClick={onClose}>Cancel</button>
            <button className="settings-save" onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
