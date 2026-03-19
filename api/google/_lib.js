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
  if (!tokenRes.ok) throw new Error(tokens.error_description || 'Token refresh failed')

  await supabase.from('google_auth').update({
    access_token: tokens.access_token,
    expiry_date:  Date.now() + tokens.expires_in * 1000,
    updated_at:   new Date().toISOString(),
  }).eq('id', data.id)

  return tokens.access_token
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

module.exports = {
  getSupabase,
  getValidAccessToken,
  getFolderName,
  getParentFolderIdForStatus,
  createDriveFolder,
  moveDriveFolder,
  driveRequest,
}
