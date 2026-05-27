// GET /api/sidebar/transactions
// Returns transactions grouped by stage for the Gmail sidebar add-on.
//
// Auth: shared-secret header `x-sidebar-secret` compared to env SIDEBAR_SECRET.
// The sidebar is a Google Apps Script (no user session), so we cannot use the
// Supabase JWT auth flow here.
//
// Single-tenant for now: rows are scoped to Amy's user_id. Revisit when the
// sidebar needs to support multiple agents.

const { getSupabase } = require('../google/_lib')

const SIDEBAR_OWNER_USER_ID = 'a02b464f-dd3e-49de-b893-2825fe8efb3f'

// Status values match what's actually stored in the transactions table
// (kebab-case, written by the app — confirmed against live data on 2026-05-26).
const STATUS_ACTIVE  = 'active-listing'
const STATUS_PENDING = 'pending'
const STATUS_CLOSED  = 'closed'

const FIELDS = [
  'id',
  'property_address',
  'client_name',
  'client_first_name',
  'client_last_name',
  'price',
  'contract_price',
  'close_of_escrow',
  'lender_name',
  'title_contact_name',
  'title_company',
  'drive_folder_id',
  'rep_type',
  'status',
  'mls_number',
].join(',')

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const provided = req.headers['x-sidebar-secret']
  const expected = process.env.SIDEBAR_SECRET
  if (!expected) {
    console.error('[sidebar/transactions] SIDEBAR_SECRET env var is not set')
    return res.status(500).json({ error: 'Server not configured' })
  }
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const supabase  = getSupabase()
    const yearStart = `${new Date().getUTCFullYear()}-01-01`

    const [activeRes, pendingRes, closedRes] = await Promise.all([
      supabase.from('transactions').select(FIELDS)
        .eq('user_id', SIDEBAR_OWNER_USER_ID)
        .eq('status', STATUS_ACTIVE)
        .order('close_of_escrow', { ascending: true, nullsFirst: false }),

      supabase.from('transactions').select(FIELDS)
        .eq('user_id', SIDEBAR_OWNER_USER_ID)
        .eq('status', STATUS_PENDING)
        .order('close_of_escrow', { ascending: true, nullsFirst: false }),

      supabase.from('transactions').select(FIELDS)
        .eq('user_id', SIDEBAR_OWNER_USER_ID)
        .eq('status', STATUS_CLOSED)
        .gte('close_of_escrow', yearStart)
        .order('close_of_escrow', { ascending: false, nullsFirst: false }),
    ])

    for (const r of [activeRes, pendingRes, closedRes]) {
      if (r.error) throw new Error(r.error.message)
    }

    return res.status(200).json({
      active_listing: activeRes.data  || [],
      pending:        pendingRes.data || [],
      closed:         closedRes.data  || [],
    })
  } catch (err) {
    console.error('[sidebar/transactions]', err)
    return res.status(500).json({ error: err.message })
  }
}
