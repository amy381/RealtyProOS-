const FUB_BASE = 'https://api.followupboss.com/v1'

function authHeaders() {
  const apiKey = process.env.FUB_API_KEY
  if (!apiKey) throw new Error('FUB_API_KEY is not set')
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

function normalizeRelationship(r, primaryPerson) {
  const name = r.name || [r.firstName, r.lastName].filter(Boolean).join(' ')
  return {
    id:              null,
    relationship_id: r.id,
    name,
    first_name:      r.firstName || '',
    last_name:       r.lastName  || '',
    phone:           getPrimary(r.phones),
    email:           getPrimary(r.emails),
    _via:            primaryPerson ? normalizePerson(primaryPerson) : null,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const q = (req.query.q || '').trim()
  if (q.length < 2) return res.json({ people: [] })

  const apiKey = process.env.FUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FUB_API_KEY is not set in Vercel environment variables' })

  try {
    const fields = 'id,name,firstName,lastName,emails,phones,relationships'
    const url = `${FUB_BASE}/people?q=${encodeURIComponent(q)}&fields=${fields}&limit=10`

    const response = await fetch(url, { headers: authHeaders() })
    const text = await response.text()

    if (!response.ok) return res.status(response.status).json({ error: `FUB ${response.status}: ${text}` })

    const data = JSON.parse(text)
    const qLower = q.toLowerCase()
    const people = []

    for (const p of (data.people || [])) {
      people.push(normalizePerson(p))

      for (const r of (p.relationships || [])) {
        const relName = (r.name || [r.firstName, r.lastName].filter(Boolean).join(' ')).toLowerCase()
        if (relName.includes(qLower)) {
          people.push(normalizeRelationship(r, p))
        }
      }
    }

    res.json({ people })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
