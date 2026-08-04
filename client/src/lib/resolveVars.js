export function resolveVars(text, tx, tcSettings = [], commissions = {}, collaborators = {}) {
  if (text == null) return ''
  const str = typeof text === 'string' ? text : String(text)
  if (!str) return ''
  if (!tx)  return str.replace(/\{\{(\w+)\}\}/g, '')  // no transaction → all blanks

  // Merge the transaction's commission record so commission fields resolve.
  const c      = (tx && commissions[tx.id]) || {}
  const merged = { ...c, ...tx }   // tx wins on id/user_id/timestamps

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
  // rep_type-aware name vars — reuse client_full_names verbatim, gated on rep_type
  const seller_names = merged.rep_type === 'Seller' ? client_full_names : ''
  const buyer_names  = merged.rep_type === 'Buyer'  ? client_full_names : ''

  // commission_rate: rep_type-aware, sourced from the merged commission record
  const sellerComp   = merged.seller_concession_percent  // the "Seller Compensation" field
  const buyerContrib = merged.buyer_contribution_percent
  const sc = (sellerComp   == null || sellerComp   === '') ? 0 : sellerComp
  const bc = (buyerContrib  == null || buyerContrib === '') ? 0 : buyerContrib
  const commission_rate = merged.rep_type === 'Buyer'
    ? `Seller Compensation: ${sc}%, Buyer Contribution: ${bc}%`
    : (sellerComp != null && sellerComp !== '') ? `${sellerComp}%` : ''

  // Block variables — lines joined with <br> for HTML email bodies
  const titleCollab = (tx.title_collaborator_id && collaborators[tx.title_collaborator_id]) || {}
  const titleParts  = [
    tx.title_company,
    merged.title_contact_name,   // FIX: was tx.escrow_officer (not a real column)
    titleCollab.address,         // NEW — from collaborators[title_collaborator_id]
    tx.title_company_phone,
    tx.title_company_email,
  ].filter(Boolean)
  const lenderCollab = (tx.lender_collaborator_id && collaborators[tx.lender_collaborator_id]) || {}
  const lenderParts  = [
    lenderCollab.company,
    [lenderCollab.first_name, lenderCollab.last_name].filter(Boolean).join(' '),
    lenderCollab.phone,
    lenderCollab.email,
  ].filter(Boolean)
  const title_block  = titleParts.join('<br>')
  const lender_block = lenderParts.join('<br>')

  const map = {
    // Smart combos
    client_greeting,
    client_full_name,
    client_full_names,
    seller_names,
    buyer_names,
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
    co_agent:              (tx.co_op_agent || '').split(' ')[0],
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
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => map[k] ?? '')
}
