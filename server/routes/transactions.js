import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const router = Router()

function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || url.startsWith('your_') || !key || key.startsWith('your_')) {
    return null
  }
  try {
    return createClient(url, key)
  } catch (e) {
    console.error('[Supabase] createClient failed:', e.message)
    return null
  }
}

function requireSupabase(res) {
  const db = getSupabase()
  if (!db) {
    res.status(503).json({ error: 'Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env' })
    return null
  }
  return db
}

// GET /api/transactions
router.get('/', async (req, res) => {
  const db = requireSupabase(res); if (!db) return
  const { data, error } = await db.from('transactions').select('*').order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/transactions
router.post('/', async (req, res) => {
  const db = requireSupabase(res); if (!db) return
  console.log('[POST /transactions] body:', JSON.stringify(req.body))
  const { data, error } = await db.from('transactions').insert([req.body]).select().single()
  if (error) {
    console.error('[POST /transactions] Supabase error:', error.message, error.details, error.hint)
    return res.status(500).json({ error: error.message, details: error.details, hint: error.hint })
  }
  res.status(201).json(data)
})

// PATCH /api/transactions/:id
router.patch('/:id', async (req, res) => {
  const db = requireSupabase(res); if (!db) return
  const { id } = req.params
  const updates = req.body
  const { data, error } = await db.from('transactions').update(updates).eq('id', id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/transactions/:id
router.delete('/:id', async (req, res) => {
  const db = requireSupabase(res); if (!db) return
  const { id } = req.params
  const { error } = await db.from('transactions').delete().eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

export default router
