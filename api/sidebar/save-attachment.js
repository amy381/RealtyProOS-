// POST /api/sidebar/save-attachment
// Uploads a single file (base64-encoded) into a Google Drive folder using the
// stored OAuth tokens (Amy's account, via api/google/_lib.getValidAccessToken).
//
// Auth: shared-secret header `x-sidebar-secret`.
//
// Body:
//   {
//     "drive_folder_id": "<drive folder id>",
//     "file_name":       "filename.pdf",
//     "file_content":    "<base64-encoded bytes>",
//     "mime_type":       "application/pdf"
//   }
//
// Response: { success: true, file_id: "...", file_name: "..." }
//
// Uses Drive v3 multipart upload (uploadType=multipart) with native fetch —
// no `googleapis` SDK, matching the style of the other api/google endpoints.

const { getValidAccessToken } = require('../google/_lib')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const provided = req.headers['x-sidebar-secret']
  const expected = process.env.SIDEBAR_SECRET
  if (!expected) {
    console.error('[sidebar/save-attachment] SIDEBAR_SECRET env var is not set')
    return res.status(500).json({ error: 'Server not configured' })
  }
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { drive_folder_id, file_name, file_content, mime_type } = req.body || {}
  const missing = ['drive_folder_id', 'file_name', 'file_content', 'mime_type']
    .filter(k => !req.body || !req.body[k])
  if (missing.length) {
    return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` })
  }

  try {
    const accessToken = await getValidAccessToken()

    // Drive v3 multipart upload — RFC 2387 multipart/related with two parts:
    // (1) JSON metadata (where to put it, what to call it)
    // (2) the file bytes, base64 encoded
    const metadata = { name: file_name, parents: [drive_folder_id] }
    const boundary = `----=_Drive_${Date.now()}_${Math.random().toString(36).slice(2)}`

    const head = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) + `\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mime_type}\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n`
    )
    const tail = Buffer.from(`\r\n--${boundary}--`)
    const body = Buffer.concat([head, Buffer.from(file_content), tail])

    // supportsAllDrives=true keeps this working if the target folder lives in a
    // Shared Drive (matches the convention used by api/google/_lib.driveRequest).
    const url = 'https://www.googleapis.com/upload/drive/v3/files'
      + '?uploadType=multipart&supportsAllDrives=true&fields=id,name'

    const driveRes = await fetch(url, {
      method:  'POST',
      headers: {
        'Authorization':  `Bearer ${accessToken}`,
        'Content-Type':   `multipart/related; boundary="${boundary}"`,
        'Content-Length': String(body.length),
      },
      body,
    })

    const data = await driveRes.json().catch(() => ({}))
    if (!driveRes.ok) {
      const message = data.error?.message || `Drive API error ${driveRes.status}`
      return res.status(driveRes.status).json({ error: message })
    }

    return res.status(200).json({
      success:   true,
      file_id:   data.id,
      file_name: data.name,
    })
  } catch (err) {
    console.error('[sidebar/save-attachment]', err)
    return res.status(500).json({ error: err.message })
  }
}
