import { useState, useRef, useEffect } from 'react'
import { TC_OPTIONS } from '../lib/columnFields'
import DateInput from './DateInput'
import './IntakeModal.css'

const COLUMN_OPTIONS = [
  { value: 'buyer-broker',      label: 'Buyer-Broker' },
  { value: 'pre-listing',       label: 'Pre-Listing' },
  { value: 'active-listing',    label: 'Active Listing' },
  { value: 'pending',           label: 'Pending' },
  { value: 'closed',            label: 'Closed' },
  { value: 'cancelled-expired', label: 'Cancelled / Expired' },
]

const EMPTY_CLIENT = { first_name: '', last_name: '', phone: '', email: '', fub_id: null }

// ── FUB search ─────────────────────────────────────────────
async function fetchFubContacts(query) {
  try {
    const resp = await fetch(`/api/fub/search?q=${encodeURIComponent(query)}`)
    const text = await resp.text()
    console.log('[FUB search] status:', resp.status, 'body:', text)
    if (!resp.ok) return []
    const data = JSON.parse(text)
    return data.people || []
  } catch (err) {
    console.error('[FUB search] fetch error:', err)
    return []
  }
}

// Returns { client1, related } or null
async function fetchFubPerson(personId) {
  try {
    const resp = await fetch(`/api/fub/person/${personId}`)
    const text = await resp.text()
    console.log('[FUB person] status:', resp.status, 'body:', text)
    if (!resp.ok) return null
    return JSON.parse(text)
  } catch (err) {
    console.error('[FUB person] fetch error:', err)
    return null
  }
}

const DROPDOWN_STYLE = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  right: 0,
  backgroundColor: '#ffffff',
  color: '#1a1a1a',
  border: '1px solid #cccccc',
  borderRadius: '8px',
  boxShadow: '0 6px 20px rgba(44,59,45,0.18)',
  zIndex: 9999,
  overflow: 'hidden',
  maxHeight: '220px',
  overflowY: 'auto',
}


function FubSearch({ placeholder, onSelect }) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [open, setOpen]         = useState(false)
  const timer   = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const handleChange = (val) => {
    setQuery(val)
    clearTimeout(timer.current)
    if (val.trim().length < 2) { setResults([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      const people = await fetchFubContacts(val)
      setResults(people)
      setOpen(people.length > 0)
      setLoading(false)
    }, 350)
  }

  const handleSelect = (person) => {
    onSelect(person)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  return (
    <div className="fub-search-wrap" ref={wrapRef}>
      <div className="fub-search-row">
        <span className="fub-icon">🔍</span>
        <input
          className="fub-search-input"
          type="text"
          placeholder={placeholder || 'Search Follow Up Boss…'}
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {loading && <span className="fub-spinner">⏳</span>}
      </div>

      {open && (
        <>
          <style>{`
            .fub-dd-result {
              display: flex !important;
              align-items: center !important;
              width: 100% !important;
              text-align: left !important;
              padding: 10px 14px !important;
              border: none !important;
              border-bottom: 1px solid rgba(155,125,82,0.15) !important;
              background-color: #ffffff !important;
              color: #000000 !important;
              font-weight: 500 !important;
              font-size: 13px !important;
              cursor: pointer !important;
              font-family: inherit !important;
            }
            .fub-dd-result:hover {
              background-color: #e8e8e8 !important;
              color: #000000 !important;
            }
            .fub-dd-result:last-child {
              border-bottom: none !important;
            }
            .fub-dd-result * {
              color: inherit !important;
            }
          `}</style>
          <div style={DROPDOWN_STYLE}>
            {results.map(p => {
              const key = p.id != null ? `person-${p.id}` : `rel-${p.relationship_id}`
              return (
                <button
                  key={key}
                  type="button"
                  className="fub-dd-result"
                  onClick={() => handleSelect(p)}
                >
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  {p._via && (
                    <span style={{ fontSize: '11px', fontWeight: 500, marginLeft: '6px', opacity: 0.7 }}>
                      via {p._via.name}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Client slot ─────────────────────────────────────────────
function ClientSlot({ label, client, onSelect, onClear, error }) {
  const hasContact = !!(client.fub_id || client.first_name || client.last_name)
  const displayName = [client.first_name, client.last_name].filter(Boolean).join(' ')

  return (
    <div className="fub-client-slot">
      <div className="fub-client-slot-label">{label}</div>
      {hasContact ? (
        <div className="fub-selected-contact">
          <span className="fub-selected-name">👤 {displayName}</span>
          <button type="button" className="fub-clear-btn" onClick={onClear}>Change</button>
        </div>
      ) : (
        <FubSearch
          placeholder={`Search ${label} in Follow Up Boss…`}
          onSelect={onSelect}
        />
      )}
      {error && <span className="intake-error">{error}</span>}
    </div>
  )
}

// ── Main modal ─────────────────────────────────────────────
export default function IntakeModal({ onSave, onClose }) {
  const [type, setType] = useState('seller')
  const [form, setForm] = useState({
    status:                   'pre-listing',
    property_address:         '',
    city:                     '',
    state:                    'AZ',
    zip:                      '',
    property_type:            '',
    price:                    '',
    bedrooms:                 '',
    square_ft:                '',
    year_built:               '',
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
  const [showClient2, setShowClient2] = useState(false)
  const [errors, setErrors] = useState({})

  const setField = (key, val) => {
    setForm(f => ({ ...f, [key]: val }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
  }

  const handleTypeChange = (t) => {
    setType(t)
    setForm(f => ({ ...f, status: t === 'seller' ? 'pre-listing' : 'buyer-broker' }))
  }

  // Build a client object from a normalizePerson result (has 'id' field)
  const personToClient = (p) => ({
    first_name: p.first_name,
    last_name:  p.last_name,
    phone:      p.phone,
    email:      p.email,
    fub_id:     p.id ?? null,
  })

  // Build a client object from a normalizeRelationship result (has 'relationship_id', no 'id')
  const relToClient = (r) => ({
    first_name: r.first_name,
    last_name:  r.last_name,
    phone:      r.phone,
    email:      r.email,
    fub_id:     null,  // relationship contacts have no standalone FUB person ID
  })

  const handleSelectClient1 = async (person) => {
    if (person._via) {
      // Relationship result: person is the relationship contact, _via is the primary person.
      // Set Client 1 = relationship contact, Client 2 = primary person.
      setClient1(relToClient(person))
      setClient2(personToClient(person._via))
      setShowClient2(true)
    } else {
      // Primary contact selected: fetch full person + relationships in parallel
      const data = await fetchFubPerson(person.id)
      setClient1(data?.client1 ? personToClient(data.client1) : personToClient(person))

      // Auto-populate Client 2 from the first relationship if present
      if (data?.related?.length > 0) {
        setClient2(relToClient(data.related[0]))
        setShowClient2(true)
      }
    }
    setErrors(e => ({ ...e, client1: undefined }))
  }

  const handleSelectClient2 = async (person) => {
    if (person._via) {
      setClient2(relToClient(person))
    } else {
      const data = await fetchFubPerson(person.id)
      setClient2(data?.client1 ? personToClient(data.client1) : personToClient(person))
    }
  }

  const validate = () => {
    const e = {}
    if (!client1.first_name && !client1.last_name) {
      e.client1 = 'Select a contact from Follow Up Boss'
    }
    return e
  }

  const handleSubmit = (ev) => {
    ev.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    const isVacantLand = form.property_type === 'Vacant Land'

    const tx = {
      status:            form.status,
      assigned_tc:       form.assigned_tc,
      client_name:       [client1.first_name, client1.last_name].filter(Boolean).join(' '),
      client_first_name: client1.first_name,
      client_last_name:  client1.last_name,
      client_phone:      client1.phone,
      client_email:      client1.email,
      fub_contact_id:    client1.fub_id,
      rep_type:          type === 'seller' ? 'Seller' : 'Buyer',
      property_address:  form.property_address,
      city:              form.city,
      state:             form.state,
      zip:               form.zip,
      property_type:     form.property_type || null,
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
      if (!isVacantLand) {
        if (form.bedrooms)  tx.bedrooms  = form.bedrooms
        if (form.square_ft) tx.square_ft = form.square_ft
        if (form.year_built) tx.year_built = form.year_built
      }
    }

    if (showClient2 && (client2.first_name || client2.last_name)) {
      tx.client2_first_name = client2.first_name
      tx.client2_last_name  = client2.last_name
      tx.client2_phone      = client2.phone
      tx.client2_email      = client2.email
      tx.fub_contact_id_2   = client2.fub_id
    }

    onSave(tx)
  }

  return (
    <div className="intake-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
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

          <div className="intake-group half">
            <label>Property Type</label>
            <select value={form.property_type} onChange={e => setField('property_type', e.target.value)}>
              <option value="">—</option>
              <option value="Residential">Residential</option>
              <option value="Vacant Land">Vacant Land</option>
            </select>
          </div>

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
              <input type="text" value={form.state} readOnly className="intake-state-readonly" />
            </div>
            <div className="intake-group intake-group-zip">
              <label>ZIP</label>
              <input type="text" placeholder="86401" value={form.zip} onChange={e => setField('zip', e.target.value)} />
            </div>
          </div>

          {/* Clients — FUB only */}
          <div className="intake-section-label">Client Details</div>

          <ClientSlot
            label="Client 1"
            client={client1}
            onSelect={handleSelectClient1}
            onClear={() => { setClient1({ ...EMPTY_CLIENT }) }}
            error={errors.client1}
          />

          {showClient2 ? (
            <ClientSlot
              label="Client 2"
              client={client2}
              onSelect={handleSelectClient2}
              onClear={() => setClient2({ ...EMPTY_CLIENT })}
            />
          ) : (
            <button type="button" className="add-client-btn" onClick={() => setShowClient2(true)}>
              + Add Second Client
            </button>
          )}

          {/* Seller-specific */}
          {type === 'seller' && (
            <>
              <div className="intake-group half">
                <label>List Price</label>
                <input type="text" placeholder="e.g. 309900" value={form.price} onChange={e => setField('price', e.target.value)} />
              </div>
              {form.property_type !== 'Vacant Land' && (
                <div className="intake-row">
                  <div className="intake-group">
                    <label>Bedrooms</label>
                    <input type="number" placeholder="e.g. 3" value={form.bedrooms} onChange={e => setField('bedrooms', e.target.value)} />
                  </div>
                  <div className="intake-group">
                    <label>Square Ft</label>
                    <input type="number" placeholder="e.g. 1800" value={form.square_ft} onChange={e => setField('square_ft', e.target.value)} />
                  </div>
                  <div className="intake-group">
                    <label>Year Built</label>
                    <input type="number" placeholder="e.g. 1998" value={form.year_built} onChange={e => setField('year_built', e.target.value)} />
                  </div>
                </div>
              )}
              <div className="intake-row">
                <div className="intake-group">
                  <label>Listing Contract</label>
                  <DateInput value={form.listing_contract} onChange={e => setField('listing_contract', e.target.value)} />
                </div>
                <div className="intake-group">
                  <label>Listing Expiration</label>
                  <DateInput value={form.listing_expiration_date} onChange={e => setField('listing_expiration_date', e.target.value)} />
                </div>
              </div>
              <div className="intake-group half">
                <label>Target Live</label>
                <DateInput value={form.target_live_date} onChange={e => setField('target_live_date', e.target.value)} />
              </div>
            </>
          )}

          {/* Property Details */}
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

          {/* Contingency — Buyer only */}
          {type === 'buyer' && (
            <div className="intake-contingency-wrap">
              <label className="intake-check-label">
                <input type="checkbox" checked={form.has_contingency} onChange={e => setField('has_contingency', e.target.checked)} />
                Contingency
              </label>
              {form.has_contingency && (
                <div className="intake-group intake-contingency-date">
                  <label>Contingency Fulfilled Date</label>
                  <DateInput value={form.contingency_fulfilled_date} onChange={e => setField('contingency_fulfilled_date', e.target.value)} />
                </div>
              )}
            </div>
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
