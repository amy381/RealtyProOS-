// Shared server-side auth guard for Vercel api/ functions.
//
// Verifies a Supabase JWT from the Authorization header and enforces a
// server-side email allowlist. Fail-closed: on any missing/invalid token or
// non-allowlisted email it sends a 401 (or 500 if misconfigured) and returns
// null, so the caller can `if (!user) return`.
//
// The underscore-prefixed api/_lib/ directory is ignored by Vercel routing,
// so this file is never itself exposed as an endpoint.
const { createClient } = require('@supabase/supabase-js')

// Server-side allowlist. MUST be set in Vercel as ALLOWED_EMAILS (comma-
// separated), NOT VITE_-prefixed — it must never reach the browser bundle.
// Should mirror the same set of app users as the client VITE_ALLOWED_EMAILS.
function getAllowedEmails() {
  return (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

// Returns the verified Supabase user on success, or null after sending a
// response on failure. Usage:
//   const user = await requireAuth(req, res)
//   if (!user) return
async function requireAuth(req, res) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[requireAuth] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
    res.status(500).json({ error: 'Auth not configured on the server' })
    return null
  }

  const header = req.headers['authorization'] || req.headers['Authorization'] || ''
  const match  = /^Bearer\s+(.+)$/i.exec(String(header).trim())
  if (!match) {
    res.status(401).json({ error: 'Missing bearer token' })
    return null
  }
  const token = match[1].trim()

  try {
    const supabase = createClient(url, key)
    const { data, error } = await supabase.auth.getUser(token)
    const user = data && data.user
    if (error || !user) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return null
    }

    const allowed = getAllowedEmails()
    const email   = (user.email || '').toLowerCase()
    if (allowed.length > 0 && !allowed.includes(email)) {
      res.status(401).json({ error: 'Not authorized' })
      return null
    }
    if (allowed.length === 0) {
      // Fail-closed on the token is still enforced above; warn loudly so a
      // missing allowlist can't silently widen access beyond intent.
      console.warn('[requireAuth] ALLOWED_EMAILS is not set — any authenticated Supabase user is accepted. Set ALLOWED_EMAILS in Vercel.')
    }

    return user
  } catch (err) {
    console.error('[requireAuth]', err.message)
    res.status(401).json({ error: 'Auth verification failed' })
    return null
  }
}

module.exports = { requireAuth }
