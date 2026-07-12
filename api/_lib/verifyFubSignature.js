// Verifies a Follow Up Boss embedded-app request signature.
//
// FUB signs embedded-app requests with HMAC-SHA256 over the RAW (still
// base64-encoded) `context` query value, using the app's embedded-app secret.
// The signature arrives as the `signature` query parameter. See:
// https://docs.followupboss.com/ (Embedded Apps — request signing).
//
// Requires FUB_EMBED_SECRET in the environment. Returns true only when the
// secret is configured AND the provided signature matches; false otherwise.
// Uses a timing-safe comparison.
const crypto = require('crypto')

function verifyFubSignature(context, signature) {
  const secret = process.env.FUB_EMBED_SECRET
  if (!secret) {
    console.error('[verifyFubSignature] FUB_EMBED_SECRET is not set')
    return false
  }
  if (!context || !signature) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(String(context))
    .digest('hex')

  // Both sides must be equal-length Buffers for timingSafeEqual; a length
  // mismatch (or non-hex signature) is simply an invalid signature.
  let a, b
  try {
    a = Buffer.from(expected, 'hex')
    b = Buffer.from(String(signature), 'hex')
  } catch {
    return false
  }
  if (a.length === 0 || a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

module.exports = { verifyFubSignature }
