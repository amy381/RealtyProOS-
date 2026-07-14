const { getValidAccessToken, classifyAuthError } = require('./_lib')
const { requireAuth } = require('../_lib/requireAuth')

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const user = await requireAuth(req, res)
  if (!user) return

  // Report whether Google will actually accept the token, not just that a row
  // exists. getValidAccessToken() refreshes only when the token is expired and
  // self-heals on success; a revoked refresh token throws and we report why.
  // Never let this throw a 500 — always return a JSON status.
  try {
    await getValidAccessToken()
    res.json({ connected: true })
  } catch (err) {
    res.json({ connected: false, reason: classifyAuthError(err) })
  }
}
