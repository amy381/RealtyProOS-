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

// Calculate due date from a timing_type + timing_days + transaction fields.
// Day counting rules: day of trigger does NOT count as day 1; counting starts the next day.
// "X days before Y" = Y minus X full days.
export function calcDueDate(timingType, timingDays, tx) {
  const days = Number(timingDays) || 0
  switch (timingType) {
    // Stage-triggered — no calculated date, task becomes due at the transition
    case 'at_stage_change':          // legacy
    case 'stage_pre_listing':
    case 'stage_active_listing':
    case 'stage_buyer_broker':
    case 'stage_pending':
    case 'stage_closed':
    case 'stage_cancelled_expired':  return null
    case 'days_after_contract':        return addDays(tx.contract_acceptance_date, days)
    case 'days_before_coe':            return addDays(tx.close_of_escrow, -days)
    case 'days_after_coe':             return addDays(tx.close_of_escrow, days)
    case 'days_after_listing_contract': return addDays(tx.listing_contract, days)
    case 'days_after_bba':             return addDays(tx.bba_contract, days)
    case 'days_before_ipe':            return addDays(tx.ipe_date, -days)
    case 'days_after_ipe':             return addDays(tx.ipe_date, days)
    case 'days_after_binsr':           return addDays(tx.binsr_submitted_date, days)
    case 'days_after_home_inspection': return addDays(tx.home_inspection_date, days)
    case 'specific_date':              return null
    default:                           return null
  }
}

// Build task records from DB template_task rows for a given transaction.
export function buildTemplateTasksFromDB(templateTaskRows, transaction) {
  return [...templateTaskRows]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t, i) => ({
      title:                  t.title,
      task_type:              t.task_type || 'Task',
      due_date:               calcDueDate(t.timing_type, t.timing_days, transaction),
      assigned_to:            (t.task_type === 'Critical Date') ? null : (t.auto_assign_to || 'Me'),
      status:                 'open',
      notes:                  '',
      sort_order:             i,
      template_key:           t.template_id,
      notified_mentions:      [],
      // resolves_critical_date holds the template_task id at build time;
      // App.jsx resolves it to the actual task id after insert.
      resolves_critical_date: t.resolves_critical_date || null,
      has_progress_tracking:  t.has_progress_tracking  || false,
      email_template_id:      t.email_template_id      || null,
      // Internal mapping field — stripped before DB insert.
      _template_task_id:      t.id,
    }))
}

// ── Hardcoded fallback templates (used when DB templates not yet loaded) ──────

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
