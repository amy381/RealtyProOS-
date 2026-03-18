function addDays(dateStr, days) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const TC_ASSIGNEES = ['Me', 'Justina Morris', 'Victoria Lareau']

const TEMPLATES = {
  'pre-listing-seller': [
    { title: 'Order Photos' },
    { title: 'Order Insurance History Report (IHR)' },
    { title: "Order Seller's Property Disclosure Statement (SPDS)" },
  ],

  'pending-seller': [
    { title: 'Mark PENDING in MLS' },
    { title: "Send Open Escrow Email — send SPDS & IHR to Buyer's Agent" },
    { title: 'Notify Seller of Home Inspection Date & Time' },
    { title: 'Has Earnest Money been received?' },
    { title: 'Have Straps been ordered? (Manufactured Homes and FHA loans)' },
    { title: 'Order Septic Inspection' },
    { title: 'Has Appraisal been ordered?' },
    { title: 'Loan Status Update Due' },
    { title: 'Upload Commission Instructions',  getDueDate: tx => addDays(tx.close_of_escrow, -10) },
    { title: 'Has Appraisal been received?',    getDueDate: tx => addDays(tx.close_of_escrow, -10) },
    { title: 'Order Home Warranty',             getDueDate: tx => addDays(tx.close_of_escrow, -10) },
    { title: 'Send Utility Email to Seller',    getDueDate: tx => addDays(tx.close_of_escrow, -3)  },
    { title: 'Copy of the PCWT',               getDueDate: tx => addDays(tx.close_of_escrow, -3)  },
  ],

  'closed-seller': [
    { title: 'Change MLS to SOLD' },
    { title: 'Remove Sign & Lockbox' },
    { title: 'Send New Contact Info Email' },
    { title: 'Send Thank You card' },
    { title: "Update Seller's Contact Info" },
    { title: 'Send Google Reviews Email' },
  ],

  'pending-buyer': [
    { title: 'Send Open Escrow Email — Buyer' },
    { title: 'Send Open Escrow Email — Escrow' },
    { title: 'Check Status of Pending in MLS' },
    { title: 'Send Contract to Lender' },
    { title: 'Order Home/Termite Inspection' },
    { title: 'Confirm Home Inspection with Listing Agent' },
    { title: 'Add Home Inspection Date to Calendar' },
    { title: 'Check for missing Addendums: HOA, LBP, DWWA' },
    { title: 'Buyer Contingency Addendum' },
    { title: 'Send SPDS to Buyer',                                      getDueDate: tx => addDays(tx.contract_acceptance_date, 3)  },
    { title: 'Send IHR to Buyer',                                       getDueDate: tx => addDays(tx.contract_acceptance_date, 5)  },
    { title: 'Has Earnest Deposit been received?',                      getDueDate: tx => addDays(tx.contract_acceptance_date, 5)  },
    { title: 'Preliminary Title Report received?',                      getDueDate: tx => addDays(tx.contract_acceptance_date, 5)  },
    { title: 'Have Straps been ordered? (Manufactured Home/FHA loans)', getDueDate: tx => addDays(tx.contract_acceptance_date, 5)  },
    { title: 'Order Permits from City of Kingman or Mohave County',     getDueDate: tx => addDays(tx.contract_acceptance_date, 5)  },
    { title: 'Have buyer(s) sign BINSR',                                getDueDate: tx => tx.ipe_date || null },
    { title: 'Water Test ordered? (VA and Water Haul Only)',            getDueDate: tx => tx.ipe_date || null },
    { title: 'Appraisal ordered — note expected return date',           getDueDate: tx => tx.ipe_date || null },
    { title: 'Buyer signs SPDS & IHR',                                  getDueDate: tx => tx.ipe_date || null },
    { title: 'Send BINSR to Listing Agent',                             getDueDate: tx => tx.ipe_date || null },
    { title: 'Loan Status Update Due',                                  getDueDate: tx => addDays(tx.contract_acceptance_date, 10) },
    { title: 'Has Septic Inspection been ordered?',                     getDueDate: tx => tx.ipe_date || null },
    { title: 'Upload Commission Instructions',                          getDueDate: tx => addDays(tx.close_of_escrow, -10) },
    { title: 'Schedule PCWT',                                           getDueDate: tx => addDays(tx.close_of_escrow, -10) },
    { title: 'Send Buyers Utility Reminder Email',                      getDueDate: tx => addDays(tx.close_of_escrow, -10) },
    { title: 'Has Appraisal been received?',                            getDueDate: tx => addDays(tx.close_of_escrow, -10) },
    { title: 'Order Home Warranty',                                     getDueDate: tx => addDays(tx.close_of_escrow, -10) },
    { title: 'Septic Inspection Due',                                   getDueDate: tx => addDays(tx.close_of_escrow, -10) },
  ],

  'closed-buyer': [
    { title: 'Send Google Reviews Email' },
    { title: 'Send Thank You card' },
  ],
}

export function getTemplateKey(status, repType) {
  return `${status}-${(repType || '').toLowerCase()}`
}

export function hasTemplate(status, repType) {
  return !!TEMPLATES[getTemplateKey(status, repType)]
}

export function buildTemplateTasks(status, repType, transaction) {
  const key = getTemplateKey(status, repType)
  const tpl = TEMPLATES[key]
  if (!tpl) return []
  return tpl.map((t, i) => ({
    title:             t.title,
    due_date:          t.getDueDate ? t.getDueDate(transaction) : null,
    assigned_to:       'Me',
    status:            'open',
    notes:             '',
    sort_order:        i,
    template_key:      key,
    notified_mentions: [],
  }))
}
