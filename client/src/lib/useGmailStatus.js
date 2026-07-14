import { useEffect, useState } from 'react'
import { apiFetch } from './apiClient'

/**
 * useGmailStatus
 * Fetches /api/google/gmail-status on mount and returns the current Gmail
 * authorization state. Use this to conditionally enable the Gmail send button
 * or show a "Reconnect Google" prompt when the gmail.send scope is missing.
 *
 * @returns {{ connected: boolean, hasGmailScope: boolean, reason: string|null, loading: boolean }}
 */
export function useGmailStatus() {
  const [state, setState] = useState({ connected: false, hasGmailScope: false, reason: null, loading: true })

  useEffect(() => {
    let cancelled = false

    apiFetch('/api/google/gmail-status')
      .then(res => res.json())
      .then(({ connected = false, hasGmailScope = false, reason = null }) => {
        if (!cancelled) setState({ connected, hasGmailScope, reason, loading: false })
      })
      .catch(() => {
        if (!cancelled) setState({ connected: false, hasGmailScope: false, reason: 'error', loading: false })
      })

    return () => { cancelled = true }
  }, [])

  return state
}

// True when a token row exists but Google no longer accepts it (revoked/broken)
// — as opposed to never having connected. Drives the "reconnect required" warning.
export function isGmailBroken(status) {
  return !status.loading && !status.connected &&
    (status.reason === 'revoked' || status.reason === 'error')
}
