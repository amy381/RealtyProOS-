// Client-side helpers for Google Drive integration.
// All server calls go through our own API (secrets never touch the browser).

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''

// Documents that route to the "Under Contract" subfolder when it exists.
// All others go to the main transaction folder.
export const CONTRACT_DOCS = new Set([
  'Listing Agreement',
  'Buyer Broker Agreement',
  'Purchase & Sale Agreement',
  'Contingency Removal',
  'Loan Commitment Letter',
  'Final Walkthrough Verification',
  'Closing Disclosure',
])

export function getDriveUrl(folderId) {
  return `https://drive.google.com/drive/folders/${folderId}`
}

// Check whether the server has a valid Google refresh token stored.
export async function checkDriveConnected() {
  try {
    const res  = await fetch(`${API_BASE}/api/google/status`)
    const data = await res.json()
    return data.connected === true
  } catch {
    return false
  }
}

// Create or move the Drive folder for a transaction when its status changes.
// Also called when key fields (address, client name) are first filled in.
export async function syncDriveFolder({
  transactionId,
  newStatus,
  driveFolderId        = null,
  driveUnderContractId = null,
  repType,
  propertyAddress,
  clientLastName,
}) {
  const res = await fetch(`${API_BASE}/api/google/move-folder`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transactionId,
      newStatus,
      driveFolderId,
      driveUnderContractId,
      repType,
      propertyAddress,
      clientLastName,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Drive API error ${res.status}`)
  }
  return res.json() // { drive_folder_id, drive_under_contract_id }
}

// Upload a file directly to Google Drive using a short-lived token from our server.
// folderId is either drive_folder_id or drive_under_contract_id depending on doc type.
export async function uploadToDrive(file, folderId) {
  const tokenRes = await fetch(`${API_BASE}/api/google/token`)
  if (!tokenRes.ok) throw new Error('Could not get Drive access token — is Google Drive connected?')
  const { access_token } = await tokenRes.json()

  // Use multipart upload so metadata (name + parent) and file content are sent together
  const metadata = JSON.stringify({ name: file.name, parents: [folderId] })
  const form = new FormData()
  form.append('metadata', new Blob([metadata], { type: 'application/json' }))
  form.append('file', file)

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true&supportsTeamDrives=true&includeItemsFromAllDrives=true',
    {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${access_token}` },
      body:    form,
    }
  )

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}))
    throw new Error(err.error?.message || 'Drive upload failed')
  }
  return uploadRes.json() // { id, name, webViewLink }
}
