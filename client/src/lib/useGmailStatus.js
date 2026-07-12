import { useEffect, useState } from 'react'
import { apiFetch } from './apiClient'

/**
 * useGmailStatus
 * Fetches /api/google/gmail-status on mount and returns the current Gmail
 * authorization state. Use this to conditionally enable the Gmail send button
 * or show a "Reconnect Google" prompt when the gmail.send scope is missing.
 *
 * @returns {{ connected: boolean, hasGmailScope: boolean, loading: boolean }}
 */
export function useGmailStatus() {
  const [state, setState] = useState({ connected: false, hasGmailScope: false, loading: true })

  useEffect(() => {
    let cancelled = false

    apiFetch('/api/google/gmail-status')
      .then(res => res.json())
      .then(({ connected = false, hasGmailScope = false }) => {
        if (!cancelled) setState({ connected, hasGmailScope, loading: false })
      })
      .catch(() => {
        if (!cancelled) setState({ connected: false, hasGmailScope: false, loading: false })
      })

    return () => { cancelled = true }
  }, [])

  return state
}
