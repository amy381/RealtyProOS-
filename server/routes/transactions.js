import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const router = Router()

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// GET /api/transactions
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/transactions
router.post('/', async (req, res) => {
  const { property_address, client_name, closing_date, assigned_tc, status } = req.body
  const { data, error } = await supabase
    .from('transactions')
    .insert([{ property_address, client_name, closing_date, assigned_tc, status }])
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PATCH /api/transactions/:id
router.patch('/:id', async (req, res) => {
  const { id } = req.params
  const updates = req.body
  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/transactions/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

export default router
