const {
  getSupabase,
  getValidAccessToken,
  getFolderName,
  getParentFolderIdForStatus,
  createDriveFolder,
} = require('./_lib')

// POST /api/google/create-folder
// Creates a new Drive folder for a transaction that doesn't have one yet.
// Does NOT move existing folders — use /api/google/move-folder for that.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    transactionId,
    status,
    repType,
    propertyAddress,
    clientLastName,
  } = req.body

  if (!transactionId || !status) {
    return res.status(400).json({ error: 'transactionId and status are required' })
  }

  const targetParentId = getParentFolderIdForStatus(status)
  if (!targetParentId) {
    return res.status(400).json({
      error: `No Drive folder configured for status "${status}". Add the env var for this stage.`,
    })
  }

  const tx         = { transactionId, repType, propertyAddress, clientLastName }
  const folderName = getFolderName(tx, status)

  try {
    const accessToken = await getValidAccessToken()
    const supabase    = getSupabase()

    const folder = await createDriveFolder(accessToken, folderName, targetParentId)
    const folderId = folder.id

    let underContractId = null
    if (status === 'pending') {
      const uc = await createDriveFolder(accessToken, 'Under Contract', folderId)
      underContractId = uc.id
    }

    await supabase.from('transactions').update({
      drive_folder_id:         folderId,
      drive_under_contract_id: underContractId,
    }).eq('id', transactionId)

    res.json({ success: true, drive_folder_id: folderId, drive_under_contract_id: underContractId })
  } catch (err) {
    console.error('[create-folder]', transactionId, err.message)
    res.status(500).json({ error: err.message })
  }
}
