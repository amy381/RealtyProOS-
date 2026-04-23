module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const clientId    = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !redirectUri) {
    return res.status(500).send(
      'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI.'
    )
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    // drive — move files across any folder in the user's Drive / Shared Drive
    // gmail.send — send email as the authenticated user via Gmail API
    // gmail.readonly — read/search Gmail messages (e.g. Supra showing sync)
    scope:         'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
    access_type:   'offline',
    prompt:        'consent', // force refresh_token to be returned every time
  })

  res.setHeader('Location', `https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  res.status(302).end()
}
