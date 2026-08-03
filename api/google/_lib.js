// Shared helpers for Google Drive — underscore prefix prevents Vercel routing this as an endpoint.
// Used by all api/google/* Vercel serverless functions.
const { createClient } = require('@supabase/supabase-js')

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// Returns a valid access token, auto-refreshing via the stored refresh token if near expiry.
async function getValidAccessToken() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('google_auth')
    .select('*')
    .limit(1)
    .single()

  if (error || !data?.refresh_token) {
    throw new Error('Google Drive not connected. Visit /api/google/auth to authorize.')
  }

  // Refresh if expired or within 5 minutes of expiry
  const needsRefresh =
    !data.access_token ||
    (data.expiry_date && Date.now() > data.expiry_date - 300000)

  if (!needsRefresh) return data.access_token

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: data.refresh_token,
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type:    'refresh_token',
    }),
  })

  const tokens = await tokenRes.json()
  if (!tokenRes.ok) {
    // Surface the actual Google error (e.g. invalid_grant / "Token has been
    // expired or revoked") instead of failing silently. Never log token values.
    const code = tokens.error || 'unknown_error'
    const desc = tokens.error_description || 'Token refresh failed'
    console.error(`[google_auth] token refresh failed: ${tokenRes.status} ${code} — ${desc}`)
    const err = new Error(`${code}: ${desc}`)
    err.googleError = code
    throw err
  }

  const { error: updErr } = await supabase.from('google_auth').update({
    access_token: tokens.access_token,
    expiry_date:  Date.now() + tokens.expires_in * 1000,
    updated_at:   new Date().toISOString(),
  }).eq('id', data.id)
  if (updErr) console.error(`[google_auth] persist failed after refresh: ${updErr.message}`)

  return tokens.access_token
}

// Classify a getValidAccessToken() failure into a reason the UI can act on:
//   'not_connected' — no token row / never connected
//   'revoked'       — refresh token rejected by Google (reconnect required)
//   'error'         — anything else (network, config, etc.)
function classifyAuthError(err) {
  const code = err && err.googleError
  const msg  = ((err && err.message) || '').toLowerCase()
  if (code === 'invalid_grant' || /invalid_grant|revoked|expired/.test(msg)) return 'revoked'
  if (/not connected/.test(msg)) return 'not_connected'
  return 'error'
}

// "6490 W Hermit Dr" → "Hermit Dr, 6490 W"
function formatAddressForFolder(address) {
  if (!address) return ''
  // With pre-direction: "6490 W Hermit Dr"
  const m = address.trim().match(/^(\d+(?:-\d+)?)\s+([NSEW]{1,2})\s+(.+)$/i)
  if (m) return `${m[3]}, ${m[1]} ${m[2].toUpperCase()}`
  // Without pre-direction: "123 Main St"
  const m2 = address.trim().match(/^(\d+(?:-\d+)?)\s+(.+)$/)
  if (m2) return `${m2[2]}, ${m2[1]}`
  return address
}

function sellerFolderName(tx) {
  const addr = formatAddressForFolder(tx.propertyAddress || '')
  const last  = tx.clientLastName || ''
  if (addr && last) return `${addr} - ${last}`
  return addr || last || `Transaction-${tx.transactionId.slice(0, 8)}`
}

function buyerFolderName(tx) {
  return tx.clientLastName || `Transaction-${tx.transactionId.slice(0, 8)}`
}

// Returns the correct folder name for the transaction at the given target status.
function getFolderName(tx, targetStatus) {
  if (tx.repType === 'Buyer' && targetStatus === 'buyer-broker') return buyerFolderName(tx)
  return sellerFolderName(tx)
}

// Maps a transaction status to the configured parent Drive folder ID.
function getParentFolderIdForStatus(status) {
  const map = {
    'pre-listing':       process.env.GOOGLE_DRIVE_PRELIST_FOLDER_ID,
    'active-listing':    process.env.GOOGLE_DRIVE_ACTIVE_FOLDER_ID,
    'buyer-broker':      process.env.GOOGLE_DRIVE_BUYERS_FOLDER_ID,
    'pending':           process.env.GOOGLE_DRIVE_PENDING_FOLDER_ID,
    'closed':            process.env.GOOGLE_DRIVE_CLOSED_FOLDER_ID,
    'cancelled-expired': process.env.GOOGLE_DRIVE_CANCELLED_FOLDER_ID,
  }
  return map[status] || null
}

// All Drive REST calls include Shared Drive params on every request.
// supportsAllDrives=true      — enables Shared Drive operations (create, move, get)
// supportsTeamDrives=true     — legacy alias, still required by some Shared Drive implementations
// includeItemsFromAllDrives=true — includes Shared Drive items in list/search results
async function driveRequest(accessToken, path, options = {}) {
  const sep = path.includes('?') ? '&' : '?'
  const url = `https://www.googleapis.com/drive/v3${path}${sep}supportsAllDrives=true&supportsTeamDrives=true&includeItemsFromAllDrives=true`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json',
      ...(options.headers || {}),
    },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `Drive API error ${res.status}`)
  return data
}

async function createDriveFolder(accessToken, name, parentId) {
  return driveRequest(accessToken, '/files', {
    method: 'POST',
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents:  [parentId],
    }),
  })
}

// Moves (and optionally renames) a folder by updating its parents.
async function moveDriveFolder(accessToken, fileId, newParentId, newName) {
  const current        = await driveRequest(accessToken, `/files/${fileId}?fields=id,name,parents`)
  const currentParents = current.parents || []
  const removeParam    = currentParents.join(',')
  const removeClause   = removeParam ? `&removeParents=${removeParam}` : ''
  return driveRequest(
    accessToken,
    `/files/${fileId}?addParents=${newParentId}${removeClause}&fields=id,name,parents`,
    { method: 'PATCH', body: JSON.stringify(newName ? { name: newName } : {}) }
  )
}

// ── Gmail MIME construction + raw send ──────────────────────────────────────
// Shared by the /api/google/gmail-send endpoint and any headless sender
// (e.g. a cron daily-digest job). Moved verbatim from gmail-send.js so the
// endpoint's output is byte-for-byte identical.

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

// Builds an RFC 2822 message (text/html, or multipart/mixed with attachments).
// Object signature preserves To/CC/BCC/Reply-To/attachments exactly as the
// endpoint needs. A simple HTML send (e.g. cron digest) just passes
// { to, cc, subject, body }.
function buildMimeMessage({ to, cc, bcc, subject, body, replyTo, attachments }) {
  const toStr  = [].concat(to  || []).join(', ')
  const ccStr  = (Array.isArray(cc) ? cc : []).map(entry => {
    if (typeof entry === 'object' && entry !== null) return entry.email || entry.value || ''
    return String(entry).trim()
  }).filter(Boolean).join(', ')
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

// Raw Gmail REST send — POSTs a base64url-encoded MIME message. Returns the
// raw fetch Response (caller inspects .status / .ok), same as before.
function gmailSendRaw(accessToken, encodedMessage) {
  return fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ raw: encodedMessage }),
  })
}

module.exports = {
  getSupabase,
  getValidAccessToken,
  classifyAuthError,
  getFolderName,
  getParentFolderIdForStatus,
  createDriveFolder,
  moveDriveFolder,
  driveRequest,
  buildMimeMessage,
  gmailSendRaw,
  toBase64Url,
}
