// GET /api/google/gmail-status
// Returns whether Google is connected and whether the stored token includes the Gmail send scope.
// The frontend uses hasGmailScope: false to prompt the user to re-authenticate.

const { getSupabase, getValidAccessToken, classifyAuthError } = require('./_lib')
const { requireAuth } = require('../_lib/requireAuth')

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const user = await requireAuth(req, res)
  if (!user) return

  // Report whether Google will actually accept the token (via the same refresh
  // path a send takes), plus whether the gmail.send scope was granted. Never
  // throw a 500 — always return a JSON status.
  try {
    const { data } = await getSupabase()
      .from('google_auth')
      .select('refresh_token, scopes')
      .limit(1)
      .single()

    if (!data?.refresh_token) {
      return res.json({ connected: false, hasGmailScope: false, reason: 'not_connected' })
    }

    const hasGmailScope = typeof data.scopes === 'string'
      && data.scopes.split(' ').includes(GMAIL_SEND_SCOPE)

    try {
      await getValidAccessToken()
      return res.json({ connected: true, hasGmailScope })
    } catch (err) {
      // Row exists but the token no longer works (e.g. revoked). Keep the scope
      // signal so the UI can still explain, but report the connection as broken.
      return res.json({ connected: false, hasGmailScope, reason: classifyAuthError(err) })
    }
  } catch {
    return res.json({ connected: false, hasGmailScope: false, reason: 'error' })
  }
}
