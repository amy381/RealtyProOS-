export function resolveVars(text, tx, tcSettings = []) {
  if (!text) return ''
  if (!tx)   return text.replace(/\{\{(\w+)\}\}/g, '')  // no transaction → all blanks

  const tc  = tcSettings.find(t => t.name === tx.assigned_tc)
  const fmt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

  // Raw client fields
  const f1 = (tx.client_first_name  || '').trim()
  const l1 = (tx.client_last_name   || '').trim()
  const f2 = (tx.client2_first_name || '').trim()
  const l2 = (tx.client2_last_name  || '').trim()

  // Smart combo variables
  const client_greeting   = f2 ? `${f1} and ${f2}` : f1
  const client_full_name  = [f1, l1].filter(Boolean).join(' ')
  const client2_full_name = f2 ? [f2, l2].filter(Boolean).join(' ') : ''
  const client_full_names = client2_full_name
    ? `${client_full_name} and ${client2_full_name}`
    : client_full_name

  // commission_rate: derive from new split fields if present on tx (populated via joined query)
  const commission_rate = tx.seller_concession_flat != null && tx.seller_concession_flat !== ''
    ? `$${Number(tx.seller_concession_flat).toLocaleString()}`
    : tx.seller_concession_percent != null && tx.seller_concession_percent !== ''
      ? `${tx.seller_concession_percent}%`
      : ''

  // Block variables — lines joined with <br> for HTML email bodies
  const titleParts  = [tx.title_company, tx.escrow_officer, tx.title_company_phone, tx.title_company_email].filter(Boolean)
  const lenderParts = [tx.lender_name,   tx.lender_phone,   tx.lender_email].filter(Boolean)
  const title_block  = titleParts.join('<br>')
  const lender_block = lenderParts.join('<br>')

  const map = {
    // Smart combos
    client_greeting,
    client_full_name,
    client_full_names,
    client2_full_name,
    // Individual client fields
    client_first_name:     f1,
    client_last_name:      l1,
    client_phone:          tx.client_phone            || '',
    client_email:          tx.client_email            || '',
    client2_first_name:    f2,
    client2_last_name:     l2,
    client2_phone:         tx.client2_phone           || '',
    client2_email:         tx.client2_email           || '',
    // Property
    property_address:      tx.property_address        || '',
    city:                  tx.city                    || '',
    zip:                   tx.zip                     || '',
    apn:                   tx.apn                     || '',
    occupancy:             tx.vacant_or_occupied      || '',
    year_built:            tx.year_built ? String(tx.year_built) : '',
    square_ft:             tx.square_ft  ? String(tx.square_ft)  : '',
    // Price
    list_price:            tx.price ? `$${Number(tx.price).toLocaleString()}` : '',
    purchase_price:        tx.price ? `$${Number(tx.price).toLocaleString()}` : '',
    commission_rate,
    // Listing dates
    listing_contract:      fmt(tx.listing_contract),
    listing_expiration:    fmt(tx.listing_expiration_date),
    target_live:           fmt(tx.target_live_date),
    // Contract dates
    contract_acceptance:   fmt(tx.contract_acceptance_date),
    inspection_period_end: fmt(tx.ipe_date),
    close_of_escrow:       fmt(tx.close_of_escrow),
    // Contract details
    co_agent:              tx.co_op_agent             || '',
    home_inspection_date:  fmt(tx.home_inspection_date),
    home_inspector:        tx.home_inspector          || '',
    // Parties
    lender_name:           tx.lender_name             || '',
    title_company:         tx.title_company           || '',
    escrow_officer:        tx.escrow_officer          || '',
    tc_name:               tx.assigned_tc             || '',
    tc_email:              tc?.email                  || '',
    agent_name:            tx.agent_name              || '',
    // Blocks
    title_block,
    lender_block,
  }

  // Any unrecognised key resolves to '' — never shows raw {{variable}} text
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => map[k] ?? '')
}
