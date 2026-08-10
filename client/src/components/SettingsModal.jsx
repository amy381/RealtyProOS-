import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/apiClient'
import './SettingsModal.css'

// Single-tenant owner scope — mirrors LEGACY_OS_OWNER_USER_ID in
// api/digest/send.js (not shared: api/ and client/ are separate bundles).
// This app shows one agent's brand/identity regardless of which TC is
// logged in, so agent_settings reads are scoped to the owner, not
// auth.uid() — a TC session can also see the owner's row via RLS
// (is_owner_or_team_member), and without this filter a `.single()` read
// could non-deterministically return the wrong row.
const LEGACY_OS_OWNER_USER_ID = 'a02b464f-dd3e-49de-b893-2825fe8efb3f'

export default function SettingsModal({ tcSettings, userSettings, onSave, onClose }) {
  const [draft, setDraft]           = useState(tcSettings.map(t => ({ ...t })))
  const [digestDraft, setDigestDraft] = useState(
    tcSettings.map(tc => ({
      email:                 tc.email || '',
      daily_digest_enabled:  userSettings[tc.email]?.daily_digest_enabled ?? true,
    }))
  )

  const [agentDraft, setAgentDraft] = useState({
    realtor_name: '', company: '', realtor_phone: '', realtor_email: ''
  })
  const [agentId, setAgentId] = useState(null)

  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleReason,    setGoogleReason]    = useState(null)
  const [googleLoading,   setGoogleLoading]   = useState(true)

  useEffect(() => {
    supabase
      .from('agent_settings')
      .select('*')
      .eq('user_id', LEGACY_OS_OWNER_USER_ID)
      .single()
      .then(({ data }) => {
        if (data) {
          setAgentId(data.id)
          setAgentDraft({
            realtor_name:  data.realtor_name  || '',
            company:       data.company       || '',
            realtor_phone: data.realtor_phone || '',
            realtor_email: data.realtor_email || '',
          })
        }
      })
  }, [])

  useEffect(() => {
    // Ask the status endpoint whether Google will actually accept the token,
    // not just whether a row exists — otherwise a revoked token still shows
    // "Connected". reason distinguishes "never connected" from "broken".
    apiFetch('/api/google/gmail-status')
      .then(res => res.json())
      .then(({ connected = false, reason = null }) => {
        setGoogleConnected(connected)
        setGoogleReason(connected ? null : reason)
        setGoogleLoading(false)
      })
      .catch(() => {
        setGoogleConnected(false)
        setGoogleReason('error')
        setGoogleLoading(false)
      })
  }, [])

  const googleBroken = !googleConnected && (googleReason === 'revoked' || googleReason === 'error')

  const handleGoogleDisconnect = async () => {
    await supabase.from('google_auth').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    setGoogleConnected(false)
    setGoogleReason('not_connected')
  }

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

  const handleSave = async () => {
    if (agentId) {
      await supabase
        .from('agent_settings')
        .update({ ...agentDraft, updated_at: new Date().toISOString() })
        .eq('id', agentId)
    }
    onSave(draft, digestDraft)
    onClose()
  }

  return (
    <div className="settings-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="settings-modal">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          <div className="settings-section-label">Agent Information</div>

          <div className="settings-fields">
            {[
              { label: 'Realtor Name', key: 'realtor_name', type: 'text',  placeholder: 'Your name' },
              { label: 'Company',      key: 'company',      type: 'text',  placeholder: 'Brokerage name' },
              { label: 'Phone',        key: 'realtor_phone',type: 'tel',   placeholder: '555-555-5555' },
              { label: 'Email',        key: 'realtor_email',type: 'email', placeholder: 'you@email.com' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key} className="settings-field-row">
                <span className="settings-tc-name">{label}</span>
                <input
                  type={type}
                  className="settings-email-input"
                  placeholder={placeholder}
                  value={agentDraft[key]}
                  onChange={e => setAgentDraft(prev => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <div className="settings-section-label">Team Member Email Addresses</div>
          <p className="settings-hint">
            Used for @mention notifications in task notes. Type @Amy, @Justina, or @Victoria in a task note to send an email alert.
          </p>

          <div className="settings-fields">
            {draft.map((tc, i) => (
              <div key={tc.id || tc.name} className="settings-field-row">
                <span className="settings-tc-name">{tc.name}</span>
                <input
                  type="email"
                  className="settings-email-input"
                  placeholder={`${tc.name.split(' ')[0].toLowerCase()}@email.com`}
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
                <span className="settings-tc-name">{tc.name}</span>
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

          <div className="settings-section-label" style={{ marginTop: 6 }}>Google Account</div>

          {googleBroken && (
            <div className="sq-reconnect-banner">
              Google connection expired —{' '}
              <a href="/api/google/auth" className="sq-reconnect-link">Reconnect Google</a>
              {' '}to send email.
            </div>
          )}

          <div className="settings-google-row">
            {googleLoading ? (
              <span className="settings-google-status">Checking…</span>
            ) : googleConnected ? (
              <>
                <span className="settings-google-status">
                  <span className="settings-google-dot settings-google-dot--connected" />
                  Connected as amy@desert-legacy.com
                </span>
                <div className="settings-google-actions">
                  <button className="settings-google-btn settings-google-btn--disconnect" onClick={handleGoogleDisconnect}>
                    Disconnect
                  </button>
                  <a className="settings-google-btn settings-google-btn--reconnect" href="/api/google/auth">
                    Reconnect
                  </a>
                </div>
              </>
            ) : googleBroken ? (
              <>
                <span className="settings-google-status">
                  <span className="settings-google-dot settings-google-dot--disconnected" />
                  Connection expired — reconnect required
                </span>
                <div className="settings-google-actions">
                  <button className="settings-google-btn settings-google-btn--disconnect" onClick={handleGoogleDisconnect}>
                    Disconnect
                  </button>
                  <a className="settings-google-btn settings-google-btn--reconnect" href="/api/google/auth">
                    Reconnect
                  </a>
                </div>
              </>
            ) : (
              <>
                <span className="settings-google-status">
                  <span className="settings-google-dot settings-google-dot--disconnected" />
                  Not connected
                </span>
                <a className="settings-google-btn settings-google-btn--connect" href="/api/google/auth">
                  Connect Google Account
                </a>
              </>
            )}
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
