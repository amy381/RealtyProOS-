const { getValidAccessToken } = require('./_lib')
const { requireAuth } = require('../_lib/requireAuth')

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const user = await requireAuth(req, res)
  if (!user) return

  try {
    const access_token = await getValidAccessToken()
    res.json({ access_token })
  } catch (err) {
    res.status(401).json({ error: err.message })
  }
}
