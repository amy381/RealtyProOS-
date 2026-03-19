// Temporary debug endpoint — DELETE after fixing env var issue
module.exports = async function handler(req, res) {
  res.json({
    SUPABASE_URL:              process.env.SUPABASE_URL ? process.env.SUPABASE_URL.slice(0, 30) + '…' : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET (starts: ' + process.env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 10) + '…)' : 'MISSING',
    GOOGLE_CLIENT_ID:          process.env.GOOGLE_CLIENT_ID          ? 'SET' : 'MISSING',
    GOOGLE_CLIENT_SECRET:      process.env.GOOGLE_CLIENT_SECRET      ? 'SET' : 'MISSING',
    GOOGLE_REDIRECT_URI:       process.env.GOOGLE_REDIRECT_URI       || 'MISSING',
    GOOGLE_DRIVE_PRELIST:      process.env.GOOGLE_DRIVE_PRELIST_FOLDER_ID   ? 'SET' : 'MISSING',
    GOOGLE_DRIVE_ACTIVE:       process.env.GOOGLE_DRIVE_ACTIVE_FOLDER_ID    ? 'SET' : 'MISSING',
    GOOGLE_DRIVE_BUYERS:       process.env.GOOGLE_DRIVE_BUYERS_FOLDER_ID    ? 'SET' : 'MISSING',
    GOOGLE_DRIVE_PENDING:      process.env.GOOGLE_DRIVE_PENDING_FOLDER_ID   ? 'SET' : 'MISSING',
    GOOGLE_DRIVE_CLOSED:       process.env.GOOGLE_DRIVE_CLOSED_FOLDER_ID    ? 'SET' : 'MISSING',
    GOOGLE_DRIVE_CANCELLED:    process.env.GOOGLE_DRIVE_CANCELLED_FOLDER_ID ? 'SET' : 'MISSING',
  })
}
