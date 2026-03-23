import { useState } from 'react'
import { supabase } from '../lib/supabase'
import './SettingsModal.css'

export default function SettingsModal({ tcSettings, userSettings, onSave, onClose }) {
  const [draft, setDraft]           = useState(tcSettings.map(t => ({ ...t })))
  const [digestDraft, setDigestDraft] = useState(
    tcSettings.map(tc => ({
      email:                 tc.email || '',
      daily_digest_enabled:  userSettings[tc.email]?.daily_digest_enabled ?? true,
    }))
  )

  const setEmail = (idx, email) => {
    setDraft(prev => prev.map((t, i) => i === idx ? { ...t, email } : t))
    // keep digestDraft email in sync
    setDigestDraft(prev => prev.map((d, i) => i === idx ? { ...d, email } : d))
  }

  const toggleDigest = (idx) => {
    setDigestDraft(prev => prev.map((d, i) =>
      i === idx ? { ...d, daily_digest_enabled: !d.daily_digest_enabled } : d
    ))
  }

  const handleSave = () => {
    onSave(draft, digestDraft)
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

          <div className="settings-section-label" style={{ marginTop: 6 }}>Daily Digest Email</div>
          <p className="settings-hint">
            Sent every morning at 8am Arizona time with overdue tasks, today's tasks, and key dates.
          </p>

          <div className="settings-fields">
            {draft.map((tc, i) => (
              <div key={tc.id || tc.name} className="settings-field-row">
                <span className="settings-tc-name">{tc.name === 'Me' ? 'Amy (Me)' : tc.name}</span>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={digestDraft[i]?.daily_digest_enabled ?? true}
                    onChange={() => toggleDigest(i)}
                  />
                  <span className="settings-toggle-track">
                    <span className="settings-toggle-thumb" />
                  </span>
                  <span className="settings-toggle-label">
                    {digestDraft[i]?.daily_digest_enabled !== false ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
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
