const { getValidAccessToken } = require('./_lib')

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const access_token = await getValidAccessToken()
    res.json({ access_token })
  } catch (err) {
    res.status(401).json({ error: err.message })
  }
}
