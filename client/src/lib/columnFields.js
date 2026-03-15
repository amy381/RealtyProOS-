export const TC_OPTIONS = ['Justina Morris', 'Victoria Lareau']

// Used in TransactionModal for column-specific edit fields
export const COLUMN_FIELDS = {
  'buyer-broker': [
    { key: 'bba_contract',   label: 'BBA Contract',   type: 'date', noOverdue: true },
    { key: 'bba_expiration', label: 'BBA Expiration', type: 'date', noOverdue: true },
    { key: 'close_of_escrow', label: 'Close of Escrow', type: 'date', noOverdue: true },
  ],
  'pre-listing': [
    { key: 'target_live_date', label: 'Target Live', type: 'date' },
    { key: 'nda_expires',      label: 'NDA Expires', type: 'date' },
    { key: 'photography_date', label: 'Photography', type: 'date' },
  ],
  'active-listing': [
    { key: 'listing_contract',        label: 'Listing Contract',   type: 'date', noOverdue: true },
    { key: 'listing_expiration_date', label: 'Listing Expiration', type: 'date' },
  ],
  'pending': [
    { key: 'contract_acceptance_date', label: 'Contract Acceptance',  type: 'date', noOverdue: true },
    { key: 'ipe_date',                 label: 'Inspection Period End', type: 'date', noOverdue: true },
    { key: 'close_of_escrow',          label: 'Close of Escrow',       type: 'date', noOverdue: true },
    { key: 'lender_name',              label: 'Lender',                type: 'text' },
    { key: 'title_company',            label: 'Title Co.',             type: 'text' },
  ],
  'closed': [
    { key: 'close_of_escrow', label: 'Close of Escrow', type: 'date' },
  ],
  'cancelled-expired': [],
}

// Date fields shown on Buyer cards and in the Buyer panel Key Dates section
export const BUYER_DATE_FIELDS = [
  { key: 'bba_contract',             label: 'BBA Contract',          type: 'date', noOverdue: true },
  { key: 'bba_expiration',           label: 'BBA Expiration',        type: 'date', noOverdue: true },
  { key: 'contract_acceptance_date', label: 'Contract Acceptance',   type: 'date', noOverdue: true },
  { key: 'ipe_date',                 label: 'Inspection Period End', type: 'date', noOverdue: true },
  { key: 'close_of_escrow',          label: 'Close of Escrow',       type: 'date', noOverdue: true },
]

// Date fields shown on Seller cards and in the Seller panel Key Dates section
export const SELLER_DATE_FIELDS = [
  { key: 'listing_contract',         label: 'Listing Contract',      type: 'date', noOverdue: true },
  { key: 'listing_expiration_date',  label: 'Listing Expiration',    type: 'date' },
  { key: 'target_live_date',         label: 'Target Live',           type: 'date' },
  { key: 'contract_acceptance_date', label: 'Contract Acceptance',   type: 'date', noOverdue: true },
  { key: 'ipe_date',                 label: 'Inspection Period End', type: 'date', noOverdue: true },
  { key: 'close_of_escrow',          label: 'Close of Escrow',       type: 'date', noOverdue: true },
]
