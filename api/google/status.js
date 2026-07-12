const { getSupabase } = require('./_lib')
const { requireAuth } = require('../_lib/requireAuth')

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const user = await requireAuth(req, res)
  if (!user) return

  try {
    const { data } = await getSupabase()
      .from('google_auth')
      .select('refresh_token')
      .limit(1)
      .single()
    res.json({ connected: !!data?.refresh_token })
  } catch {
    res.json({ connected: false })
  }
}
