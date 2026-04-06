// POST /api/vendor/fill-pdf
// Fetches a fillable PDF from Supabase storage, fills it with transaction + agent data
// using pdf-lib, and returns the result as base64 along with metadata.
//
// Body: { taskId, vendorId }
// Response: { pdfBase64, filename, vendorEmail, vendorName, propertyAddress, missingFields[] }

const { PDFDocument } = require('pdf-lib')
const { getSupabase }  = require('../google/_lib')

// Format a date string (YYYY-MM-DD) as MM/DD/YYYY. Returns '' for falsy input.
function fmtDate(val) {
  if (!val) return ''
  const [y, m, d] = String(val).split('-')
  if (!y || !m || !d) return String(val)
  return `${m}/${d}/${y}`
}

// Build the value map from DB rows.
// seller/buyer are derived from rep_type + client vs opposite_party_name.
function buildValueMap(tx, agent) {
  const clientName = [tx.client_first_name, tx.client_last_name].filter(Boolean).join(' ')
  const isSellerRep = (tx.rep_type || '').toLowerCase() !== 'buyer'

  const sellerName = isSellerRep ? clientName : (tx.opposite_party_name || '')
  const buyerName  = isSellerRep ? (tx.opposite_party_name || '') : clientName

  return {
    realtor_name:       agent.realtor_name      || '',
    company:            agent.company           || '',
    realtor_phone:      agent.realtor_phone     || '',
    realtor_email:      agent.realtor_email     || '',
    property_address:   tx.property_address     || '',
    apn:                tx.apn                  || '',
    bedrooms:           tx.bedrooms != null ? String(tx.bedrooms) : '',
    bathrooms:          tx.bathrooms            || '',
    vacant_or_occupied: tx.vacant_or_occupied   || '',
    year_built:         tx.year_built           || '',
    title_company:      tx.title_company        || '',
    title_contact:      '',                          // no source column — always blank
    title_email:        tx.title_company_email  || '',
    title_phone:        tx.title_company_phone  || '',
    escrow_number:      tx.escrow_number        || '',
    closing_date:       fmtDate(tx.close_of_escrow),
    seller_name:        sellerName,
    buyer_name:         buyerName,
    customer_name:      clientName,
    customer_address:   tx.property_address     || '',
    customer_phone:     tx.client_phone         || '',
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { taskId, vendorId } = req.body || {}
  if (!taskId || !vendorId) {
    return res.status(400).json({ error: 'taskId and vendorId are required' })
  }

  try {
    const supabase = getSupabase()

    // ── Fetch vendor ──────────────────────────────────────────────────────────
    const { data: vendor, error: vendorErr } = await supabase
      .from('vendors')
      .select('id, name, email, pdf_form_url, field_mappings')
      .eq('id', vendorId)
      .single()
    if (vendorErr || !vendor) {
      return res.status(404).json({ error: 'Vendor not found' })
    }
    if (!vendor.pdf_form_url) {
      return res.status(400).json({ error: 'Vendor has no PDF form URL configured' })
    }

    // ── Fetch task → transaction_id ───────────────────────────────────────────
    const { data: task, error: taskErr } = await supabase
      .from('tasks')
      .select('id, transaction_id')
      .eq('id', taskId)
      .single()
    if (taskErr || !task) {
      return res.status(404).json({ error: 'Task not found' })
    }
    if (!task.transaction_id) {
      return res.status(400).json({ error: 'Task is not linked to a transaction' })
    }

    // ── Fetch transaction ─────────────────────────────────────────────────────
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', task.transaction_id)
      .single()
    if (txErr || !tx) {
      return res.status(404).json({ error: 'Transaction not found' })
    }

    // ── Fetch agent settings ──────────────────────────────────────────────────
    const { data: agent } = await supabase
      .from('agent_settings')
      .select('realtor_name, company, realtor_phone, realtor_email')
      .limit(1)
      .single()

    // ── Download PDF ──────────────────────────────────────────────────────────
    const pdfRes = await fetch(vendor.pdf_form_url)
    if (!pdfRes.ok) {
      return res.status(502).json({ error: `Failed to download PDF: ${pdfRes.status} ${pdfRes.statusText}` })
    }
    const pdfBytes = Buffer.from(await pdfRes.arrayBuffer())

    // ── Fill PDF fields ───────────────────────────────────────────────────────
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
    const form   = pdfDoc.getForm()
    const valueMap = buildValueMap(tx, agent || {})

    const missingFields = []   // fields blank due to missing source data
    const notInPdf      = []   // fields not present in this PDF (silently skipped)

    for (const [pdfField, value] of Object.entries(valueMap)) {
      try {
        const field = form.getTextField(pdfField)
        field.setText(value || '')
        if (!value) missingFields.push(pdfField)
      } catch {
        // Field doesn't exist in this PDF — skip silently
        notInPdf.push(pdfField)
      }
    }

    // Flatten is intentionally NOT called — keep fields editable after download
    const filledBytes  = await pdfDoc.save()
    const pdfBase64    = Buffer.from(filledBytes).toString('base64')
    const filename     = `InspectionRequest_${(tx.property_address || 'Property').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`

    return res.status(200).json({
      pdfBase64,
      filename,
      vendorEmail:     vendor.email         || '',
      vendorName:      vendor.name          || '',
      propertyAddress: tx.property_address  || '',
      missingFields,
    })
  } catch (err) {
    console.error('[fill-pdf]', err)
    return res.status(500).json({ error: err.message })
  }
}
