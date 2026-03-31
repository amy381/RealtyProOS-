import express        from 'express'
import { createClient } from '@supabase/supabase-js'

const router = express.Router()

// ─── Supabase (service role for token storage) ────────────────────────────────
function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  console.log('[Drive] Supabase URL:', url ? url.slice(0, 30) + '…' : 'MISSING')
  console.log('[Drive] Service role key:', key && key !== 'your_supabase_service_role_key_here' ? key.slice(0, 10) + '…' : 'MISSING or placeholder — update server/.env!')
  return createClient(url, key)
}

// ─── Token management ─────────────────────────────────────────────────────────
async function getValidAccessToken() {
  console.log('[Drive] getValidAccessToken: querying google_auth table…')
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('google_auth').select('*').limit(1).single()

  if (error) {
    console.error('[Drive] Supabase query error:', error.message)
    throw new Error('Google Drive not connected. Visit /api/google/auth to authorize.')
  }
  if (!data?.refresh_token) {
    console.warn('[Drive] No refresh token found in google_auth table — has OAuth been completed?')
    throw new Error('Google Drive not connected. Visit /api/google/auth to authorize.')
  }
  console.log('[Drive] Refresh token found, access token expires at:', data.expiry_date ? new Date(data.expiry_date).toISOString() : 'unknown')

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
    console.error('[Drive] Token refresh failed:', tokens)
    throw new Error(tokens.error_description || 'Token refresh failed')
  }
  console.log('[Drive] Access token refreshed successfully')

  await supabase.from('google_auth').update({
    access_token: tokens.access_token,
    expiry_date:  Date.now() + tokens.expires_in * 1000,
    updated_at:   new Date().toISOString(),
  }).eq('id', data.id)

  return tokens.access_token
}

// ─── Folder name helpers ──────────────────────────────────────────────────────
function formatAddressForFolder(address) {
  if (!address) return ''
  const m = address.trim().match(/^(\d+(?:-\d+)?)\s+([NSEW]{1,2})\s+(.+)$/i)
  if (m) return `${m[3]}, ${m[1]} ${m[2].toUpperCase()}`
  const m2 = address.trim().match(/^(\d+(?:-\d+)?)\s+(.+)$/)
  if (m2) return `${m2[2]}, ${m2[1]}`
  return address
}

function getFolderName(tx, targetStatus) {
  const addr = formatAddressForFolder(tx.propertyAddress || '')
  const last  = tx.clientLastName || ''
  if (tx.repType === 'Buyer' && targetStatus === 'buyer-broker') {
    return last || `Transaction-${tx.transactionId.slice(0, 8)}`
  }
  if (addr && last) return `${addr} - ${last}`
  return addr || last || `Transaction-${tx.transactionId.slice(0, 8)}`
}

function getParentFolderIdForStatus(status) {
  return {
    'pre-listing':       process.env.GOOGLE_DRIVE_PRELIST_FOLDER_ID,
    'active-listing':    process.env.GOOGLE_DRIVE_ACTIVE_FOLDER_ID,
    'buyer-broker':      process.env.GOOGLE_DRIVE_BUYERS_FOLDER_ID,
    'pending':           process.env.GOOGLE_DRIVE_PENDING_FOLDER_ID,
    'closed':            process.env.GOOGLE_DRIVE_CLOSED_FOLDER_ID,
    'cancelled-expired': process.env.GOOGLE_DRIVE_CANCELLED_FOLDER_ID,
  }[status] || null
}

// ─── Drive REST helpers ───────────────────────────────────────────────────────
async function driveRequest(accessToken, path, options = {}) {
  const sep = path.includes('?') ? '&' : '?'
  // supportsAllDrives + supportsTeamDrives (legacy alias) both required for Shared Drive operations
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
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  })
}

async function moveDriveFolder(accessToken, fileId, newParentId, newName) {
  console.log('[Drive] moveDriveFolder — fileId:', fileId, '| newParentId:', newParentId, '| newName:', newName)

  // Fetch the file's current parent(s) so we can remove them during the move
  const current = await driveRequest(accessToken, `/files/${fileId}?fields=id,name,parents`)
  console.log('[Drive] Current folder metadata:', JSON.stringify(current))

  const currentParents = current.parents || []
  if (currentParents.length === 0) {
    console.warn('[Drive] WARNING: no parents returned for file', fileId, '— move may leave folder in multiple locations')
  }

  const removeParam = currentParents.join(',')
  const removeClause = removeParam ? `&removeParents=${removeParam}` : ''
  console.log('[Drive] removeParents:', removeParam || '(none)', '| addParents:', newParentId)

  const result = await driveRequest(
    accessToken,
    `/files/${fileId}?addParents=${newParentId}${removeClause}&fields=id,name,parents`,
    { method: 'PATCH', body: JSON.stringify(newName ? { name: newName } : {}) }
  )
  console.log('[Drive] Move result:', JSON.stringify(result))
  return result
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/google/auth — redirect to Google OAuth consent screen
router.get('/auth', (req, res) => {
  const clientId    = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !redirectUri) {
    return res.status(500).send('Set GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI in server/.env')
  }
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.send',
    access_type:   'offline',
    prompt:        'consent',
  })
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
})

// GET /api/google/callback — handle OAuth callback, store tokens
router.get('/callback', async (req, res) => {
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
    if (!tokenRes.ok) throw new Error(tokens.error_description || 'Token exchange failed')
    if (!tokens.refresh_token) {
      throw new Error(
        'No refresh token returned. Revoke app access at myaccount.google.com/permissions and try again.'
      )
    }

    const supabase = getSupabase()
    await supabase.from('google_auth').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    const { error: insertErr } = await supabase.from('google_auth').insert({
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date:   tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
      scopes:        tokens.scope ?? null,
    })
    if (insertErr) {
      console.error('[Drive] Failed to store tokens in Supabase:', insertErr.message)
      throw new Error('Token storage failed: ' + insertErr.message)
    }
    console.log('[Drive] OAuth complete — tokens stored in Supabase successfully')

    res.redirect((process.env.APP_URL || 'http://localhost:5173') + '?drive_connected=1')
  } catch (err) {
    console.error('[Google callback]', err)
    res.status(500).send('OAuth failed: ' + err.message)
  }
})

// GET /api/google/status — is Drive connected?
router.get('/status', async (req, res) => {
  try {
    const { data } = await getSupabase()
      .from('google_auth').select('refresh_token').limit(1).single()
    res.json({ connected: !!data?.refresh_token })
  } catch {
    res.json({ connected: false })
  }
})

// GET /api/google/gmail-status — is Gmail send scope authorized?
router.get('/gmail-status', async (req, res) => {
  try {
    const { data } = await getSupabase()
      .from('google_auth').select('refresh_token, scopes').limit(1).single()
    const connected     = !!data?.refresh_token
    const hasGmailScope = connected && typeof data.scopes === 'string'
      ? data.scopes.split(' ').includes('https://www.googleapis.com/auth/gmail.send')
      : false
    res.json({ connected, hasGmailScope })
  } catch {
    res.json({ connected: false, hasGmailScope: false })
  }
})

// ─── Gmail send helpers ───────────────────────────────────────────────────────

function toBase64Url(input) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function encodeSubject(text) {
  return `=?UTF-8?B?${Buffer.from(text).toString('base64')}?=`
}

function chunkBase64(b64) {
  return b64.replace(/(.{76})/g, '$1\r\n').replace(/\r\n$/, '')
}

function buildMimeMessage({ to, cc, bcc, subject, body, replyTo, attachments }) {
  const toStr  = [].concat(to  || []).join(', ')
  const ccStr  = [].concat(cc  || []).join(', ')
  const bccStr = [].concat(bcc || []).join(', ')

  const headers = [
    `To: ${toStr}`,
    ccStr   ? `Cc: ${ccStr}`         : null,
    bccStr  ? `Bcc: ${bccStr}`       : null,
    replyTo ? `Reply-To: ${replyTo}` : null,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
  ].filter(Boolean)

  const bodyB64 = chunkBase64(Buffer.from(body).toString('base64'))

  if (!attachments || attachments.length === 0) {
    return [
      ...headers,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      bodyB64,
    ].join('\r\n')
  }

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

// POST /api/google/gmail-send — send email via Gmail API
router.post('/gmail-send', async (req, res) => {
  const { to, cc, bcc, subject, body, replyTo, attachments = [], transactionId = null } = req.body
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, body' })
  }

  try {
    let accessToken = await getValidAccessToken()

    const rawMessage = buildMimeMessage({ to, cc, bcc, subject, body, replyTo, attachments })
    const encoded    = toBase64Url(rawMessage)

    let gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded }),
    })

    if (!gmailRes.ok) {
      const errBody = await gmailRes.json()
      return res.status(gmailRes.status).json({
        error:   errBody.error?.message || `Gmail API error ${gmailRes.status}`,
        details: errBody.error ?? null,
      })
    }

    const gmailData = await gmailRes.json()
    const supabase  = getSupabase()
    const toStr     = [].concat(to).join(', ')
    const ccStr2    = [].concat(cc || []).join(', ')

    const { error: logErr } = await supabase.from('email_sent_log').insert({
      to_email:         toStr,
      to_name:          '',
      subject,
      body,
      cc:               ccStr2,
      sent_by:          'Me',
      sent_via:         'gmail',
      gmail_message_id: gmailData.id,
      ...(transactionId ? { transaction_id: transactionId } : {}),
    })
    if (logErr) console.error('[gmail-send] Failed to write sent log:', logErr.message)

    return res.status(200).json({ messageId: gmailData.id, threadId: gmailData.threadId })
  } catch (err) {
    console.error('[gmail-send]', err)
    return res.status(500).json({ error: err.message })
  }
})

// GET /api/google/token — short-lived access token for client-side Drive uploads
router.get('/token', async (req, res) => {
  try {
    const access_token = await getValidAccessToken()
    res.json({ access_token })
  } catch (err) {
    res.status(401).json({ error: err.message })
  }
})

// POST /api/google/move-folder — create or move the transaction's Drive folder
router.post('/move-folder', async (req, res) => {
  const {
    transactionId,
    newStatus,
    driveFolderId        = null,
    driveUnderContractId = null,
    repType,
    propertyAddress,
    clientLastName,
  } = req.body

  console.log('[Drive] /move-folder called:', { transactionId, newStatus, repType, propertyAddress, clientLastName, driveFolderId })

  if (!transactionId || !newStatus) {
    return res.status(400).json({ error: 'transactionId and newStatus are required' })
  }

  const targetParentId = getParentFolderIdForStatus(newStatus)
  console.log('[Drive] Target parent folder ID for status', newStatus, ':', targetParentId || 'MISSING — check env vars')
  if (!targetParentId) {
    return res.status(400).json({
      error: `No Drive folder configured for status "${newStatus}". Add the env var for this stage.`,
    })
  }

  const tx            = { transactionId, repType, propertyAddress, clientLastName }
  const newFolderName = getFolderName(tx, newStatus)
  console.log('[Drive] Folder name will be:', newFolderName)

  try {
    const accessToken = await getValidAccessToken()
    const supabase    = getSupabase()

    let folderId        = driveFolderId
    let underContractId = driveUnderContractId || null

    if (!folderId) {
      console.log('[Drive] Creating new folder in parent:', targetParentId)
      const folder = await createDriveFolder(accessToken, newFolderName, targetParentId)
      folderId = folder.id
      console.log('[Drive] Folder created, ID:', folderId)
    } else {
      console.log('[Drive] Moving existing folder', folderId, 'to parent:', targetParentId)
      await moveDriveFolder(accessToken, folderId, targetParentId, newFolderName)
      console.log('[Drive] Folder moved/renamed successfully')
    }

    if (newStatus === 'pending' && !underContractId) {
      console.log('[Drive] Creating Under Contract subfolder…')
      const uc    = await createDriveFolder(accessToken, 'Under Contract', folderId)
      underContractId = uc.id
      console.log('[Drive] Under Contract folder created, ID:', underContractId)
    }

    const updates = {
      drive_folder_id:         folderId,
      drive_under_contract_id: underContractId,
    }
    const { error: dbErr } = await supabase.from('transactions').update(updates).eq('id', transactionId)
    if (dbErr) console.error('[Drive] Failed to save folder IDs to transaction:', dbErr.message)
    else console.log('[Drive] Folder IDs saved to transaction', transactionId)

    res.json({ success: true, drive_folder_id: folderId, drive_under_contract_id: underContractId })
  } catch (err) {
    console.error('[Drive] /move-folder ERROR:', err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router
