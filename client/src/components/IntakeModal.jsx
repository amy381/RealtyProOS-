import { useState } from 'react'
import { TC_OPTIONS } from '../lib/columnFields'
import './IntakeModal.css'

const COLUMN_OPTIONS = [
  { value: 'buyer-broker',      label: 'Buyer-Broker' },
  { value: 'pre-listing',       label: 'Pre-Listing' },
  { value: 'active-listing',    label: 'Active Listing' },
  { value: 'pending',           label: 'Pending' },
  { value: 'closed',            label: 'Closed' },
  { value: 'cancelled-expired', label: 'Cancelled / Expired' },
]

const EMPTY_CLIENT = { first_name: '', last_name: '', phone: '', email: '' }

function ClientBlock({ prefix, label, data, onChange, errors }) {
  return (
    <div className="client-block">
      <div className="client-block-label">{label}</div>
      <div className="intake-row">
        <div className="intake-group">
          <label>First Name</label>
          <input
            type="text"
            value={data.first_name}
            onChange={e => onChange('first_name', e.target.value)}
            className={errors?.[`${prefix}_first_name`] ? 'error' : ''}
          />
          {errors?.[`${prefix}_first_name`] && <span className="intake-error">{errors[`${prefix}_first_name`]}</span>}
        </div>
        <div className="intake-group">
          <label>Last Name</label>
          <input
            type="text"
            value={data.last_name}
            onChange={e => onChange('last_name', e.target.value)}
          />
        </div>
      </div>
      <div className="intake-row">
        <div className="intake-group">
          <label>Phone</label>
          <input
            type="tel"
            placeholder="(555) 000-0000"
            value={data.phone}
            onChange={e => onChange('phone', e.target.value)}
          />
        </div>
        <div className="intake-group">
          <label>Email</label>
          <input
            type="email"
            placeholder="name@email.com"
            value={data.email}
            onChange={e => onChange('email', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}

export default function IntakeModal({ onSave, onClose }) {
  const [type, setType] = useState('seller')
  const [form, setForm] = useState({
    status:                   'pre-listing',
    property_address:         '',
    city:                     '',
    state:                    '',
    zip:                      '',
    price:                    '',
    listing_contract:         '',
    listing_expiration_date:  '',
    target_live_date:         '',
    assigned_tc:              TC_OPTIONS[0],
    has_septic:               false,
    has_solar:                false,
    has_well:                 false,
    has_contingency:          false,
    contingency_fulfilled_date: '',
  })
  const [client1, setClient1] = useState({ ...EMPTY_CLIENT })
  const [client2, setClient2] = useState({ ...EMPTY_CLIENT })
  const [showSecond, setShowSecond] = useState(false)
  const [errors, setErrors] = useState({})

  const setField = (key, val) => {
    setForm(f => ({ ...f, [key]: val }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
  }

  const handleTypeChange = (t) => {
    setType(t)
    setForm(f => ({ ...f, status: t === 'seller' ? 'pre-listing' : 'buyer-broker' }))
  }

  const setClient1Field = (key, val) => {
    setClient1(c => ({ ...c, [key]: val }))
    if (errors[`c1_${key}`]) setErrors(e => ({ ...e, [`c1_${key}`]: undefined }))
  }

  const validate = () => {
    const e = {}
    if (!client1.first_name.trim() && !client1.last_name.trim()) e.c1_first_name = 'Enter at least a first or last name'
    return e
  }

  const handleSubmit = (ev) => {
    ev.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    const clientName = [client1.first_name, client1.last_name].filter(Boolean).join(' ')

    const tx = {
      status:            form.status,
      assigned_tc:       form.assigned_tc,
      client_name:       clientName,
      client_first_name: client1.first_name,
      client_last_name:  client1.last_name,
      client_phone:      client1.phone,
      client_email:      client1.email,
      rep_type:          type === 'seller' ? 'Seller' : 'Buyer',
      property_address:  form.property_address,
      city:              form.city,
      state:             form.state,
      zip:               form.zip,
      has_septic:        form.has_septic,
      has_solar:         form.has_solar,
      has_well:          form.has_well,
      has_contingency:   form.has_contingency,
      contingency_fulfilled_date: form.contingency_fulfilled_date,
    }

    if (type === 'seller') {
      tx.price                   = form.price
      tx.listing_contract        = form.listing_contract
      tx.listing_expiration_date = form.listing_expiration_date
      tx.target_live_date        = form.target_live_date
    }

    if (showSecond && (client2.first_name || client2.last_name)) {
      tx.client2_first_name = client2.first_name
      tx.client2_last_name  = client2.last_name
      tx.client2_phone      = client2.phone
      tx.client2_email      = client2.email
    }

    onSave(tx)
  }

  return (
    <div className="intake-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="intake-modal">

        <div className="intake-header">
          <h2>New Transaction</h2>
          <button className="intake-close" onClick={onClose}>✕</button>
        </div>

        <form className="intake-form" onSubmit={handleSubmit}>

          {/* Status */}
          <div className="intake-group">
            <label>Status</label>
            <select value={form.status} onChange={e => setField('status', e.target.value)}>
              {COLUMN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Rep type toggle */}
          <div className="intake-toggle">
            <button type="button" className={`toggle-opt ${type === 'seller' ? 'active' : ''}`} onClick={() => handleTypeChange('seller')}>
              🏡 Seller
            </button>
            <button type="button" className={`toggle-opt ${type === 'buyer' ? 'active' : ''}`} onClick={() => handleTypeChange('buyer')}>
              🔑 Buyer
            </button>
          </div>

          {/* Property */}
          <div className="intake-section-label">Property</div>

          <div className="intake-group">
            <label>Street Address</label>
            <input
              type="text"
              placeholder="123 Main St"
              value={form.property_address}
              onChange={e => setField('property_address', e.target.value)}
              className={errors.property_address ? 'error' : ''}
            />
            {errors.property_address && <span className="intake-error">{errors.property_address}</span>}
          </div>

          <div className="intake-row intake-row-addr">
            <div className="intake-group">
              <label>City</label>
              <input type="text" placeholder="Kingman" value={form.city} onChange={e => setField('city', e.target.value)} />
            </div>
            <div className="intake-group intake-group-state">
              <label>State</label>
              <input type="text" placeholder="AZ" value={form.state} onChange={e => setField('state', e.target.value)} />
            </div>
            <div className="intake-group intake-group-zip">
              <label>ZIP</label>
              <input type="text" placeholder="86401" value={form.zip} onChange={e => setField('zip', e.target.value)} />
            </div>
          </div>

          {/* Seller-specific: price + dates */}
          {type === 'seller' && (
            <>
              <div className="intake-group half">
                <label>List Price</label>
                <input type="text" placeholder="e.g. 309900" value={form.price} onChange={e => setField('price', e.target.value)} />
              </div>

              <div className="intake-row">
                <div className="intake-group">
                  <label>Listing Contract</label>
                  <input type="date" value={form.listing_contract} onChange={e => setField('listing_contract', e.target.value)} />
                </div>
                <div className="intake-group">
                  <label>Listing Expiration</label>
                  <input type="date" value={form.listing_expiration_date} onChange={e => setField('listing_expiration_date', e.target.value)} />
                </div>
              </div>

              <div className="intake-group half">
                <label>Target Live</label>
                <input type="date" value={form.target_live_date} onChange={e => setField('target_live_date', e.target.value)} />
              </div>
            </>
          )}

          {/* Property Details — checkboxes */}
          <div className="intake-section-label">Property Details</div>
          <div className="intake-checkboxes">
            <label className="intake-check-label">
              <input type="checkbox" checked={form.has_septic} onChange={e => setField('has_septic', e.target.checked)} />
              Septic
            </label>
            <label className="intake-check-label">
              <input type="checkbox" checked={form.has_solar} onChange={e => setField('has_solar', e.target.checked)} />
              Solar
            </label>
            <label className="intake-check-label">
              <input type="checkbox" checked={form.has_well} onChange={e => setField('has_well', e.target.checked)} />
              Well
            </label>
          </div>

          {/* Contingency */}
          <div className="intake-contingency-wrap">
            <label className="intake-check-label">
              <input type="checkbox" checked={form.has_contingency} onChange={e => setField('has_contingency', e.target.checked)} />
              Contingency
            </label>
            {form.has_contingency && (
              <div className="intake-group intake-contingency-date">
                <label>Contingency Fulfilled Date</label>
                <input type="date" value={form.contingency_fulfilled_date} onChange={e => setField('contingency_fulfilled_date', e.target.value)} />
              </div>
            )}
          </div>

          {/* Client Details */}
          <div className="intake-section-label">Client Details</div>

          <ClientBlock prefix="c1" label="Primary Client" data={client1} onChange={setClient1Field} errors={errors} />

          {showSecond && (
            <ClientBlock prefix="c2" label="Second Client" data={client2} onChange={(key, val) => setClient2(c => ({ ...c, [key]: val }))} />
          )}

          {!showSecond && (
            <button type="button" className="add-client-btn" onClick={() => setShowSecond(true)}>
              + Add Second Client
            </button>
          )}

          {/* TC */}
          <div className="intake-group half">
            <label>TC</label>
            <select value={form.assigned_tc} onChange={e => setField('assigned_tc', e.target.value)}>
              {TC_OPTIONS.map(tc => <option key={tc} value={tc}>{tc}</option>)}
            </select>
          </div>

          <div className="intake-actions">
            <button type="button" className="intake-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="intake-submit">
              Create {type === 'seller' ? 'Seller' : 'Buyer'} Transaction
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
