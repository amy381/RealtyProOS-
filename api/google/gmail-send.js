// POST /api/google/gmail-send
// Sends email via the authenticated user's Gmail account using stored OAuth tokens.
// Supports To/CC/BCC, HTML body, Reply-To, and base64-encoded PDF attachments.
// No external MIME or Gmail libraries — native fetch + string construction only.

const { getSupabase } = require('./_lib')

// ── MIME construction ─────────────────────────────────────────────────────────

// RFC 4648 §5 base64url — required by Gmail API for the raw message
function toBase64Url(input) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// RFC 2047 encoded-word so non-ASCII subjects survive email headers
function encodeSubject(text) {
  return `=?UTF-8?B?${Buffer.from(text).toString('base64')}?=`
}

// Splits a base64 string into 76-character lines per RFC 2822 §2.1.1
function chunkBase64(b64) {
  return b64.replace(/(.{76})/g, '$1\r\n').replace(/\r\n$/, '')
}

function buildMimeMessage({ to, cc, bcc, subject, body, replyTo, attachments }) {
  const toStr  = [].concat(to  || []).join(', ')
  const ccStr  = [].concat(cc  || []).join(', ')
  const bccStr = [].concat(bcc || []).join(', ')

  const headers = [
    `To: ${toStr}`,
    ccStr   ? `Cc: ${ccStr}`        : null,
    bccStr  ? `Bcc: ${bccStr}`      : null,
    replyTo ? `Reply-To: ${replyTo}` : null,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
  ].filter(Boolean)

  const bodyB64 = chunkBase64(Buffer.from(body).toString('base64'))

  // ── Simple text/html — no attachments ────────────────────────────────────
  if (!attachments || attachments.length === 0) {
    return [
      ...headers,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      bodyB64,
    ].join('\r\n')
  }

  // ── multipart/mixed — HTML body + one or more attachments ─────────────────
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`

  const lines = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    bodyB64,
  ]

  for (const att of attachments) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${att.contentType}; name="${att.filename}"`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      chunkBase64(att.data),
    )
  }

  lines.push(`--${boundary}--`)
  return lines.join('\r\n')
}

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
  if (!res.ok) throw new Error(tokens.error_description || 'Token refresh failed')

  const supabase = getSupabase()
  await supabase.from('google_auth').update({
    access_token: tokens.access_token,
    expiry_date:  Date.now() + tokens.expires_in * 1000,
    updated_at:   new Date().toISOString(),
  }).eq('id', tokenRow.id)

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

// ── Gmail API call ────────────────────────────────────────────────────────────

function gmailSend(accessToken, encodedMessage) {
  return fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ raw: encodedMessage }),
  })
}

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    to,
    cc,
    bcc,
    subject,
    body,
    replyTo,
    attachments   = [],
    transactionId = null,
  } = req.body

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, body' })
  }

  try {
    const tokenRow    = await getTokenRow()
    let   accessToken = await getAccessToken(tokenRow)

    const rawMessage = buildMimeMessage({ to, cc, bcc, subject, body, replyTo, attachments })
    const encoded    = toBase64Url(rawMessage)

    let gmailRes = await gmailSend(accessToken, encoded)

    // 401 → force a fresh token and retry exactly once before failing
    if (gmailRes.status === 401) {
      accessToken = await refreshAccessToken(tokenRow)
      gmailRes    = await gmailSend(accessToken, encoded)

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
      sent_by:          'Me',
      sent_via:         'gmail',
      gmail_message_id: gmailData.id,
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
