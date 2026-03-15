import { Router } from 'express'
import dotenv from 'dotenv'

dotenv.config()

const router = Router()

const FUB_BASE = 'https://api.followupboss.com/v1'

function authHeaders() {
  const apiKey = process.env.FUB_API_KEY
  if (!apiKey) throw new Error('FUB_API_KEY is not set in server/.env')
  return {
    'Authorization': 'Basic ' + Buffer.from(apiKey + ':').toString('base64'),
    'Content-Type': 'application/json',
  }
}

function getPrimary(arr = []) {
  if (!arr.length) return ''
  const primary = arr.find(x => x.isPrimary) || arr[0]
  return primary.value || ''
}

function normalizePerson(p) {
  return {
    id:         p.id,
    name:       p.name || [p.firstName, p.lastName].filter(Boolean).join(' '),
    first_name: p.firstName || '',
    last_name:  p.lastName  || '',
    phone:      getPrimary(p.phones),
    email:      getPrimary(p.emails),
  }
}

// Normalize a relationship record (sub-contact, not a standalone FUB person)
function normalizeRelationship(r, primaryPerson) {
  const name = r.name || [r.firstName, r.lastName].filter(Boolean).join(' ')
  return {
    id:              null,   // no standalone FUB person ID
    relationship_id: r.id,
    name,
    first_name:      r.firstName || '',
    last_name:       r.lastName  || '',
    phone:           getPrimary(r.phones),
    email:           getPrimary(r.emails),
    _via:            primaryPerson ? normalizePerson(primaryPerson) : null,
  }
}

// GET /api/fub/search?q=John+Smith
// Returns primary contacts AND their relationship contacts whose name contains the query.
// Note: FUB's people search only matches primary contact data, so a relationship contact
// (e.g. "Mark Thompson") is surfaced here only when the primary person (e.g. "Loni Howerton")
// appears in the results AND Mark's name matches the query.
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim()
  console.log('[FUB] route hit with query:', JSON.stringify(q))

  if (q.length < 2) return res.json({ people: [] })

  const apiKey = process.env.FUB_API_KEY
  if (!apiKey) {
    console.error('[FUB] ERROR: FUB_API_KEY not found in environment')
    return res.status(500).json({ error: 'FUB_API_KEY is not set in server/.env' })
  }
  console.log('[FUB] using key starting with:', apiKey.slice(0, 4) + '...')

  // Request all fields we need plus relationships inline
  const fields = 'id,name,firstName,lastName,emails,phones,relationships'
  const url = `${FUB_BASE}/people?q=${encodeURIComponent(q)}&fields=${fields}&limit=10`
  console.log('[FUB search] GET', url)

  // Auth: Basic auth with API key as username, blank password → base64("key:")
  const authHeader = 'Basic ' + Buffer.from(apiKey + ':').toString('base64')
  console.log('[FUB search] Authorization header prefix:', authHeader.slice(0, 15) + '...')

  try {
    const response = await fetch(url, { headers: authHeaders() })
    const text = await response.text()
    console.log('[FUB search] response status:', response.status)
    console.log('[FUB search] full response body:', text)

    if (!response.ok) return res.status(response.status).json({ error: `FUB ${response.status}: ${text}` })

    const data = JSON.parse(text)
    const qLower = q.toLowerCase()
    const people = []

    for (const p of (data.people || [])) {
      people.push(normalizePerson(p))

      // Expose matching relationship contacts as separate selectable results
      for (const r of (p.relationships || [])) {
        const relName = (r.name || [r.firstName, r.lastName].filter(Boolean).join(' ')).toLowerCase()
        if (relName.includes(qLower)) {
          people.push(normalizeRelationship(r, p))
        }
      }
    }

    res.json({ people })
  } catch (err) {
    console.error('[FUB search] error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/fub/person/:id — fetch person with inline relationships
router.get('/person/:id', async (req, res) => {
  const { id } = req.params
  const apiKey = process.env.FUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FUB_API_KEY is not set in server/.env' })

  try {
    const fields = 'id,name,firstName,lastName,emails,phones,relationships'
    const url = `${FUB_BASE}/people/${id}?fields=${fields}`
    console.log('[FUB person] GET', url)

    const resp = await fetch(url, { headers: authHeaders() })
    const text = await resp.text()
    console.log('[FUB person] status:', resp.status)
    console.log('[FUB person] body:', text)

    if (!resp.ok) return res.status(resp.status).json({ error: `FUB ${resp.status}: ${text}` })

    const p = JSON.parse(text)
    const client1 = normalizePerson(p)

    const related = (p.relationships || []).map(r => normalizeRelationship(r, null))
    console.log('[FUB person] relationships found:', related.length, related.map(r => r.name))

    res.json({ client1, related })
  } catch (err) {
    console.error('[FUB person] error:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
