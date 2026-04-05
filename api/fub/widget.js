// GET /api/fub/widget
// FUB Embedded App widget — returns a complete HTML page for display in an iframe.
// FUB passes a base64-encoded JSON `context` query parameter containing the contact's info.

const { createClient } = require('@supabase/supabase-js')

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

const STAGE_LABELS = {
  'pre-listing':       'Pre-Listing',
  'active-listing':    'Active Listing',
  'buyer-broker':      'Buyer-Broker',
  'pending':           'Pending',
  'closed':            'Closed',
  'cancelled-expired': 'Cancelled/Expired',
}

function fmtDate(str) {
  if (!str) return '—'
  try {
    const d = new Date(str + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return '—' }
}

function fmtPrice(val) {
  if (val == null || val === '') return '—'
  return '$' + Number(val).toLocaleString()
}

function row(label, value) {
  return `<div class="row"><span class="lbl">${label}</span><span class="val">${value}</span></div>`
}

function buildCard(tx) {
  const { status, property_address, id } = tx
  const label  = STAGE_LABELS[status] || status
  const appUrl = `https://realty-pro-os.vercel.app/?tx=${id}`

  const addrHtml = property_address
    ? `<a class="addr" href="${appUrl}" target="_blank" rel="noopener noreferrer">${property_address}</a>`
    : ''

  let rows = ''
  if (status === 'pre-listing' || status === 'active-listing') {
    rows = [
      row('List Price', fmtPrice(tx.price)),
      row('Listed',     fmtDate(tx.listing_contract)),
      row('Expires',    fmtDate(tx.listing_expiration_date)),
    ].join('')
  } else if (status === 'buyer-broker') {
    rows = [
      row('BBA Signed',  fmtDate(tx.bba_contract)),
      row('BBA Expires', fmtDate(tx.bba_expiration)),
    ].join('')
  } else if (status === 'pending') {
    rows = [
      row('Purchase Price', fmtPrice(tx.price)),
      row('Accepted',       fmtDate(tx.contract_acceptance_date)),
      row('COE',            fmtDate(tx.close_of_escrow)),
    ].join('')
  } else if (status === 'closed') {
    rows = [
      row('Purchase Price', fmtPrice(tx.price)),
      row('COE',            fmtDate(tx.close_of_escrow)),
    ].join('')
  }

  return `<div class="card">${addrHtml}<span class="stage">${label}</span>${rows}</div>`
}

const HTML_SHELL_OPEN = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LegacyOS</title>
  <script type="text/javascript" src="https://eia.followupboss.com/v1.0.1.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      background: #ffffff;
      color: #333333;
      padding: 12px;
    }
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 10px;
    }
    a.addr {
      display: block;
      color: #4A6FA5;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      margin-bottom: 6px;
    }
    a.addr:hover { text-decoration: underline; }
    .stage {
      display: inline-block;
      background: #f0f4fb;
      color: #2C3E5C;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
      margin-bottom: 8px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 3px 0;
    }
    .lbl {
      color: #697175;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .val {
      color: #2C3E5C;
      font-weight: 500;
      font-size: 13px;
    }
    .empty {
      color: #697175;
      text-align: center;
      padding: 20px 0 12px;
    }
    .msg {
      color: #697175;
      text-align: center;
      padding: 20px 0;
      font-size: 13px;
    }
    .err {
      color: #c0392b;
      padding: 16px 0;
      font-size: 13px;
    }
    .btn-new {
      display: block;
      width: 100%;
      margin-top: 4px;
      padding: 9px 12px;
      background: #2C3E5C;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
    }
    .btn-new:hover { background: #3a5070; }
  </style>
</head>
<body>`

const HTML_SHELL_CLOSE = `</body>
</html>`

function buildPage(transactions, person) {
  const newTxUrl = `https://realty-pro-os.vercel.app/?newTransaction=true` +
    `&fubContactId=${encodeURIComponent(person.id)}` +
    `&name=${encodeURIComponent(person.name || '')}` +
    `&email=${encodeURIComponent(person.email || '')}`

  const bodyHtml = transactions.length > 0
    ? transactions.map(buildCard).join('')
    : `<p class="empty">No active transaction found.</p>`

  return HTML_SHELL_OPEN +
    `\n  ${bodyHtml}\n  <a class="btn-new" href="${newTxUrl}" target="_blank" rel="noopener noreferrer">+ New Transaction</a>\n` +
    HTML_SHELL_CLOSE
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method not allowed')

  // Allow FUB to load this page in an iframe
  res.removeHeader('X-Frame-Options')
  res.setHeader('Content-Security-Policy', 'frame-ancestors *')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')

  // Decode FUB context
  let person = null
  try {
    const raw = req.query.context ? Buffer.from(req.query.context, 'base64').toString('utf-8') : ''
    if (raw) {
      const ctx = JSON.parse(raw)
      person = {
        id:    ctx?.person?.id   || null,
        name:  ctx?.person?.name || '',
        email: ctx?.person?.emails?.[0]?.value || '',
      }
      if (!person.id) person = null
    }
  } catch { person = null }

  if (!person) {
    return res.status(200).end(
      HTML_SHELL_OPEN +
      `\n  <p class="msg">Open a contact in Follow Up Boss to view their transactions.</p>\n` +
      HTML_SHELL_CLOSE
    )
  }

  // Query Supabase
  let transactions = []
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('transactions')
      .select('id, status, property_address, price, listing_contract, listing_expiration_date, bba_contract, bba_expiration, contract_acceptance_date, close_of_escrow')
      .eq('fub_contact_id', person.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    transactions = data || []
  } catch (err) {
    return res.status(200).end(
      HTML_SHELL_OPEN +
      `\n  <p class="err">Database error: ${err.message}</p>\n` +
      HTML_SHELL_CLOSE
    )
  }

  return res.status(200).end(buildPage(transactions, person))
}
