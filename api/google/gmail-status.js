// GET /api/google/gmail-status
// Returns whether Google is connected and whether the stored token includes the Gmail send scope.
// The frontend uses hasGmailScope: false to prompt the user to re-authenticate.

const { getSupabase } = require('./_lib')

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const { data } = await getSupabase()
      .from('google_auth')
      .select('refresh_token, scopes')
      .limit(1)
      .single()

    const connected     = !!data?.refresh_token
    const hasGmailScope = connected && typeof data.scopes === 'string'
      ? data.scopes.split(' ').includes(GMAIL_SEND_SCOPE)
      : false

    return res.json({ connected, hasGmailScope })
  } catch {
    return res.json({ connected: false, hasGmailScope: false })
  }
}
