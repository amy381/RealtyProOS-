const { getSupabase } = require('./_lib')

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { code, error } = req.query
  if (error) return res.status(400).send(`Google OAuth error: ${error}`)
  if (!code)  return res.status(400).send('No authorization code received.')

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  process.env.GOOGLE_REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    })

    const tokens = await tokenRes.json()
    if (!tokenRes.ok) {
      throw new Error(tokens.error_description || tokens.error || 'Token exchange failed')
    }
    if (!tokens.refresh_token) {
      throw new Error(
        'No refresh token returned. Revoke app access at myaccount.google.com/permissions and try again.'
      )
    }

    const supabase = getSupabase()
    // Single-user app: replace any existing auth record
    await supabase.from('google_auth').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    const { error: dbErr } = await supabase.from('google_auth').insert({
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date:   tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
      scopes:        tokens.scope ?? null,
    })
    if (dbErr) throw new Error('Failed to save tokens: ' + dbErr.message)

    const appUrl = process.env.APP_URL || 'http://localhost:5173'
    res.setHeader('Location', appUrl + '?drive_connected=1')
    res.status(302).end()
  } catch (err) {
    console.error('[Google OAuth callback]', err)
    res.status(500).send('OAuth failed: ' + err.message)
  }
}
