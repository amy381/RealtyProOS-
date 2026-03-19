const {
  getSupabase,
  getValidAccessToken,
  getFolderName,
  getParentFolderIdForStatus,
  createDriveFolder,
  moveDriveFolder,
} = require('./_lib')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    transactionId,
    newStatus,
    driveFolderId        = null,
    driveUnderContractId = null,
    repType,
    propertyAddress,
    clientLastName,
  } = req.body

  if (!transactionId || !newStatus) {
    return res.status(400).json({ error: 'transactionId and newStatus are required' })
  }

  const targetParentId = getParentFolderIdForStatus(newStatus)
  if (!targetParentId) {
    return res.status(400).json({
      error: `No Drive folder configured for status "${newStatus}". Add the env var for this stage.`,
    })
  }

  const tx           = { transactionId, repType, propertyAddress, clientLastName }
  const newFolderName = getFolderName(tx, newStatus)

  try {
    const accessToken = await getValidAccessToken()
    const supabase    = getSupabase()

    let folderId        = driveFolderId
    let underContractId = driveUnderContractId || null

    if (!folderId) {
      // No folder yet — create it in the target location
      const folder = await createDriveFolder(accessToken, newFolderName, targetParentId)
      folderId = folder.id
    } else {
      // Existing folder — move it (and rename if the name convention changed)
      await moveDriveFolder(accessToken, folderId, targetParentId, newFolderName)
    }

    // Create the "Under Contract" subfolder when first entering Pending
    if (newStatus === 'pending' && !underContractId) {
      const uc    = await createDriveFolder(accessToken, 'Under Contract', folderId)
      underContractId = uc.id
    }

    // Persist Drive folder IDs back to the transaction record
    const updates = {
      drive_folder_id:         folderId,
      drive_under_contract_id: underContractId,
    }
    await supabase.from('transactions').update(updates).eq('id', transactionId)

    res.json({ success: true, drive_folder_id: folderId, drive_under_contract_id: underContractId })
  } catch (err) {
    console.error('[move-folder]', transactionId, err.message)
    res.status(500).json({ error: err.message })
  }
}
