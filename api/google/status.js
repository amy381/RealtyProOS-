const { getSupabase } = require('./_lib')

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

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
