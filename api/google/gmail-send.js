// POST /api/google/gmail-send
// Sends email via the authenticated user's Gmail account using stored OAuth tokens.
// Supports To/CC/BCC, HTML body, Reply-To, and base64-encoded PDF attachments.
// No external MIME or Gmail libraries — native fetch + string construction only.

const { getSupabase, buildMimeMessage, gmailSendRaw, toBase64Url } = require('./_lib')
const { requireAuth } = require('../_lib/requireAuth')

// Single-tenant assumption for Phase A — audit log row has no JWT context.
// Phase B will derive this from the caller's verified JWT.
const LEGACY_OS_OWNER_USER_ID = 'a02b464f-dd3e-49de-b893-2825fe8efb3f'

// ── Token management ──────────────────────────────────────────────────────────

async function getTokenRow() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('google_auth')
    .select('*')
    .limit(1)
    .single()

  if (error || !data?.refresh_token) {
    throw new Error('Google not connected. Visit /api/google/auth to authorize.')
  }
  return data
}

// Forces a token refresh regardless of expiry — used on 401 retry.
async function refreshAccessToken(tokenRow) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: tokenRow.refresh_token,
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type:    'refresh_token',
    }),
  })

  const tokens = await res.json()
  if (!res.ok) {
    // Surface the actual Google error instead of failing silently. No token values.
    const code = tokens.error || 'unknown_error'
    const desc = tokens.error_description || 'Token refresh failed'
    console.error(`[google_auth] token refresh failed: ${res.status} ${code} — ${desc}`)
    const err = new Error(`${code}: ${desc}`)
    err.googleError = code
    throw err
  }

  const supabase = getSupabase()
  const { error: updErr } = await supabase.from('google_auth').update({
    access_token: tokens.access_token,
    expiry_date:  Date.now() + tokens.expires_in * 1000,
    updated_at:   new Date().toISOString(),
  }).eq('id', tokenRow.id)
  if (updErr) console.error(`[google_auth] persist failed after refresh: ${updErr.message}`)

  return tokens.access_token
}

// Returns a valid access token, proactively refreshing if within 5 minutes of expiry.
async function getAccessToken(tokenRow) {
  const needsRefresh =
    !tokenRow.access_token ||
    (tokenRow.expiry_date && Date.now() > tokenRow.expiry_date - 300_000)

  if (!needsRefresh) return tokenRow.access_token
  return refreshAccessToken(tokenRow)
}

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const user = await requireAuth(req, res)
  if (!user) return

  const {
    to,
    cc,
    bcc,
    subject,
    body,
    replyTo,
    attachments   = [],
    storagePaths  = [],
    transactionId = null,
  } = req.body

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, body' })
  }

  try {
    const tokenRow    = await getTokenRow()
    let   accessToken = await getAccessToken(tokenRow)

    // Download files that were pre-uploaded to Supabase storage (bypasses Vercel's 4.5 MB body limit)
    let allAttachments = [...attachments]
    if (storagePaths.length > 0) {
      const storageClient = getSupabase()
      const storageItems  = await Promise.all(
        storagePaths.map(async ({ path, filename, contentType }) => {
          const { data, error } = await storageClient.storage
            .from('email-attachments')
            .download(path)
          if (error) throw new Error(`Could not download attachment ${filename}: ${error.message}`)
          const buffer = Buffer.from(await data.arrayBuffer())
          return {
            filename,
            contentType: contentType || 'application/octet-stream',
            data:        buffer.toString('base64'),
          }
        })
      )
      allAttachments = [...allAttachments, ...storageItems]
    }

    const rawMessage = buildMimeMessage({ to, cc, bcc, subject, body, replyTo, attachments: allAttachments })
    const encoded    = toBase64Url(rawMessage)

    let gmailRes = await gmailSendRaw(accessToken, encoded)

    // 401 → force a fresh token and retry exactly once before failing
    if (gmailRes.status === 401) {
      accessToken = await refreshAccessToken(tokenRow)
      gmailRes    = await gmailSendRaw(accessToken, encoded)

      if (gmailRes.status === 401) {
        return res.status(401).json({
          error: 'Gmail authorization failed. Please reconnect Google at /api/google/auth.',
        })
      }
    }

    if (!gmailRes.ok) {
      const errBody = await gmailRes.json()
      return res.status(gmailRes.status).json({
        error:   errBody.error?.message || `Gmail API error ${gmailRes.status}`,
        details: errBody.error ?? null,
      })
    }

    const gmailData = await gmailRes.json()

    // Remove temp storage files — best-effort, don't fail the response
    if (storagePaths.length > 0) {
      getSupabase().storage.from('email-attachments')
        .remove(storagePaths.map(p => p.path))
        .then(({ error }) => {
          if (error) console.error('[gmail-send] Failed to remove temp attachments:', error.message)
        })
    }

    // Persist audit record
    const supabase = getSupabase()
    const toStr    = [].concat(to).join(', ')
    const ccStr    = [].concat(cc || []).join(', ')

    const { error: logErr } = await supabase.from('email_sent_log').insert({
      to_email:         toStr,
      to_name:          '',
      subject,
      body,
      cc:               ccStr,
      sent_by:          'Amy Casanova',
      sent_via:         'gmail',
      gmail_message_id: gmailData.id,
      user_id:          LEGACY_OS_OWNER_USER_ID,
      ...(transactionId ? { transaction_id: transactionId } : {}),
    })

    if (logErr) {
      // Log the error but don't fail the request — email was sent successfully
      console.error('[gmail-send] Failed to write sent log:', logErr.message)
    }

    return res.status(200).json({
      messageId: gmailData.id,
      threadId:  gmailData.threadId,
    })
  } catch (err) {
    console.error('[gmail-send]', err)
    return res.status(500).json({ error: err.message })
  }
}
