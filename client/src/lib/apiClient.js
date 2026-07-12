// Single fetch wrapper for all same-origin /api/* calls.
//
// Resolves the dev/prod base URL and attaches the caller's Supabase JWT as a
// Bearer token so server-side requireAuth() can verify identity. Use this for
// OUR endpoints only — never for third-party URLs (e.g. googleapis.com), which
// carry their own tokens.
//
// Intentionally does NOT throw when logged-out: it sends the request without a
// token and lets the server return 401, so callers that swallow failures (e.g.
// @mention notifications) keep working unchanged.
import { supabase } from './supabase'

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''

// path must start with '/api/...'. options mirrors fetch()'s second arg.
export async function apiFetch(path, options = {}) {
  let token = null
  try {
    const { data } = await supabase.auth.getSession()
    token = data?.session?.access_token || null
  } catch {
    // No session available — send unauthenticated; server will 401.
  }

  const headers = { ...(options.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`

  return fetch(`${API_BASE}${path}`, { ...options, headers })
}
