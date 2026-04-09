import { useState, useRef, useEffect } from 'react'
import { TC_OPTIONS } from '../lib/columnFields'
import './NewTransactionPopup.css'

const SELLER_STAGES = [
  { value: 'pre-listing',       label: 'Pre-Listing'         },
  { value: 'active-listing',    label: 'Active Listing'      },
  { value: 'pending',           label: 'Pending'             },
  { value: 'closed',            label: 'Closed'              },
  { value: 'cancelled-expired', label: 'Cancelled / Expired' },
]

const BUYER_STAGES = [
  { value: 'buyer-broker',      label: 'Buyer-Broker'        },
  { value: 'pending',           label: 'Pending'             },
  { value: 'closed',            label: 'Closed'              },
  { value: 'cancelled-expired', label: 'Cancelled / Expired' },
]

// ─── FUB helpers ──────────────────────────────────────────────────────────────
async function fetchFubContacts(query) {
  try {
    const resp = await fetch(`/api/fub/search?q=${encodeURIComponent(query)}`)
    if (!resp.ok) return []
    const data = await resp.json()
    return data.people || []
  } catch { return [] }
}

async function fetchFubPerson(personId) {
  try {
    const resp = await fetch(`/api/fub/person/${personId}`)
    if (!resp.ok) return null
    return resp.json()
  } catch { return null }
}

// ─── FUB Search input + dropdown ──────────────────────────────────────────────
function FubSearch({ onSelect }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
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
      setOpen(true)
      setLoading(false)
    }, 350)
  }

  const handleSelect = async (person) => {
    setQuery('')
    setResults([])
    setOpen(false)
    if (person._via) {
      onSelect({ _isRelationship: true, client2: { first_name: person.first_name, last_name: person.last_name, phone: person.phone, email: person.email } })
      return
    }
    if (person.id) {
      const full = await fetchFubPerson(person.id)
      if (full) { onSelect(full); return }
    }
    onSelect({ client1: person, related: [] })
  }

  return (
    <div className="ntp-fub-wrap" ref={wrapRef}>
      <div className={`ntp-fub-row${open ? ' focused' : ''}`}>
        <svg className="ntp-fub-icon" viewBox="0 0 16 16" fill="none">
          <circle cx="6.5" cy="6.5" r="4.5" stroke="#aaa" strokeWidth="1.4"/>
          <path d="M10.5 10.5L14 14" stroke="#aaa" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <input
          className="ntp-fub-input"
          placeholder="Search by name in Follow Up Boss…"
          value={query}
          onChange={e => handleChange(e.target.value)}
        />
        {loading && <span className="ntp-fub-spinner">•••</span>}
      </div>
      {open && (
        <div className="ntp-fub-dropdown">
          {results.map(p => (
            <button
              key={p.id || p.relationship_id || p.name}
              className="ntp-fub-result"
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleSelect(p)}
            >
              <span className="ntp-fub-name">{p.name}</span>
              {p._via && <span className="ntp-fub-via">via {p._via.name}</span>}
              {p.email && !p._via && <span className="ntp-fub-email">{p.email}</span>}
            </button>
          ))}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="ntp-fub-empty">No results for "{query}"</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main popup ───────────────────────────────────────────────────────────────
export default function NewTransactionPopup({ onCreate, onClose, prefill = null }) {
  const [repType,  setRepType]  = useState('Seller')
  const [status,   setStatus]   = useState('pre-listing')
  const [propType, setPropType] = useState('')
  const [tc,       setTc]       = useState(TC_OPTIONS[0] || '')
  const [client1,  setClient1]  = useState(null)
  const [client2,  setClient2]  = useState(null)
  const [creating, setCreating] = useState(false)

  // Seller fields
  const [address,         setAddress]         = useState('')
  const [city,            setCity]            = useState('')
  const [zip,             setZip]             = useState('')
  const [price,           setPrice]           = useState('')
  const [listingContract, setListingContract] = useState('')
  const [listingExp,      setListingExp]      = useState('')
  const [targetLive,      setTargetLive]      = useState('')

  // Buyer fields
  const [bbaContract, setBbaContract] = useState('')
  const [bbaExp,      setBbaExp]      = useState('')

  const isSeller = repType === 'Seller'
  const stages   = isSeller ? SELLER_STAGES : BUYER_STAGES

  useEffect(() => {
    if (!prefill) return
    setClient1({
      first_name: prefill.first_name || '',
      last_name:  prefill.last_name  || '',
      email:      prefill.email      || '',
      phone:      '',
      id:         prefill.fubContactId ?? null,
    })
  }, [prefill])

  const handleTypeChange = (t) => {
    setRepType(t)
    setStatus(t === 'Seller' ? 'pre-listing' : 'buyer-broker')
  }

  const handleFubSelect = (result) => {
    if (result._isRelationship) {
      const p = result.client2
      if (!p) return
      setClient2({ first_name: p.first_name || '', last_name: p.last_name || '', phone: p.phone || '', email: p.email || '' })
      return
    }
    const p = result?.client1
    if (!p) return
    setClient1({ first_name: p.first_name || '', last_name: p.last_name || '', phone: p.phone || '', email: p.email || '', id: p.id ?? null })
    if (result.related?.[0]) {
      const r = result.related[0]
      setClient2({ first_name: r.first_name || '', last_name: r.last_name || '', phone: r.phone || '', email: r.email || '' })
    }
  }

  const clientName = (c) => [c.first_name, c.last_name].filter(Boolean).join(' ')

  const handleCreate = async () => {
    setCreating(true)
    const tx = {
      rep_type:     repType,
      status,
      property_type: propType || null,
      assigned_tc:   tc,
    }

    if (client1) {
      tx.client_name       = clientName(client1)
      tx.client_first_name = client1.first_name
      tx.client_last_name  = client1.last_name
      tx.client_phone      = client1.phone
      tx.client_email      = client1.email
      tx.fub_contact_id    = client1.id ?? null
    }
    if (client2) {
      tx.client2_first_name = client2.first_name
      tx.client2_last_name  = client2.last_name
      tx.client2_phone      = client2.phone
      tx.client2_email      = client2.email
    }

    if (isSeller) {
      tx.property_address        = address || null
      tx.city                    = city    || null
      tx.state                   = 'AZ'
      tx.zip                     = zip     || null
      const cleanedPrice = parseFloat(String(price).replace(/,/g, '')) || 0
      tx.price                   = cleanedPrice || null
      tx.listing_contract        = listingContract || null
      tx.listing_expiration_date = listingExp      || null
      tx.target_live_date        = targetLive      || null
    } else {
      tx.bba_contract   = bbaContract || null
      tx.bba_expiration = bbaExp      || null
    }

    await onCreate(tx)
    setCreating(false)
  }

  return (
    <div className="ntp-overlay" onMouseDown={onClose}>
      <div className="ntp-popup" onMouseDown={e => e.stopPropagation()}>

        {/* Header */}
        <div className="ntp-header">
          <span className="ntp-title">New Transaction</span>
          <button className="ntp-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="ntp-body">

          {/* Buyer / Seller toggle */}
          <div className="ntp-toggle">
            {['Seller', 'Buyer'].map(t => (
              <button
                key={t}
                className={`ntp-type-btn${repType === t ? ' active' : ''}`}
                onClick={() => handleTypeChange(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Stage + TC */}
          <div className="ntp-row-2">
            <div className="ntp-field">
              <label>Starting Stage</label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                {stages.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="ntp-field">
              <label>TC</label>
              <select value={tc} onChange={e => setTc(e.target.value)}>
                {TC_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          {/* FUB Contact Search */}
          <div className="ntp-field">
            <label>Client Search <span className="ntp-label-hint">— searches Follow Up Boss</span></label>
            {client1 ? (
              <div className="ntp-clients-selected">
                <div className="ntp-clients-list">
                  <div className="ntp-client-row">
                    <span className="ntp-client-lbl">Client 1</span>
                    <span className="ntp-client-name">{clientName(client1)}</span>
                    {client1.email && <span className="ntp-client-email">{client1.email}</span>}
                  </div>
                  {client2 && (
                    <div className="ntp-client-row">
                      <span className="ntp-client-lbl">Client 2</span>
                      <span className="ntp-client-name">{clientName(client2)}</span>
                    </div>
                  )}
                </div>
                <button className="ntp-clear-btn" onClick={() => { setClient1(null); setClient2(null) }}>Change</button>
              </div>
            ) : (
              <FubSearch onSelect={handleFubSelect} />
            )}
          </div>

          {/* Property Type */}
          <div className="ntp-field ntp-half">
            <label>Property Type</label>
            <select value={propType} onChange={e => setPropType(e.target.value)}>
              <option value="">—</option>
              <option value="Residential">Residential</option>
              <option value="Vacant Land">Vacant Land</option>
            </select>
          </div>

          {/* ── Seller fields ── */}
          {isSeller && (<>
            <div className="ntp-section-divider">Property</div>

            <div className="ntp-field">
              <label>Street Address</label>
              <input type="text" placeholder="123 Main St" value={address} onChange={e => setAddress(e.target.value)} />
            </div>

            <div className="ntp-row-addr">
              <div className="ntp-field">
                <label>City</label>
                <input type="text" placeholder="Kingman" value={city} onChange={e => setCity(e.target.value)} />
              </div>
              <div className="ntp-field ntp-state-field">
                <label>State</label>
                <input type="text" value="AZ" readOnly className="ntp-readonly" />
              </div>
              <div className="ntp-field ntp-zip-field">
                <label>ZIP</label>
                <input type="text" placeholder="86401" value={zip} onChange={e => setZip(e.target.value)} />
              </div>
            </div>

            <div className="ntp-field ntp-half">
              <label>List Price</label>
              <input
                type="text"
                placeholder="e.g. 309900"
                value={price}
                onChange={e => setPrice(e.target.value)}
                onFocus={() => setPrice(String(price).replace(/,/g, ''))}
                onBlur={() => {
                  const cleanedValue = String(price).replace(/,/g, '')
                  if (cleanedValue && !isNaN(cleanedValue)) setPrice(Number(cleanedValue).toLocaleString('en-US'))
                }}
              />
            </div>

            <div className="ntp-row-2">
              <div className="ntp-field">
                <label>Listing Contract</label>
                <input type="date" value={listingContract} onChange={e => setListingContract(e.target.value)} />
              </div>
              <div className="ntp-field">
                <label>Listing Expiration</label>
                <input type="date" value={listingExp} onChange={e => setListingExp(e.target.value)} />
              </div>
            </div>

            <div className="ntp-field ntp-half">
              <label>Target Live</label>
              <input type="date" value={targetLive} onChange={e => setTargetLive(e.target.value)} />
            </div>
          </>)}

          {/* ── Buyer fields ── */}
          {!isSeller && (<>
            <div className="ntp-section-divider">Key Dates</div>
            <div className="ntp-row-2">
              <div className="ntp-field">
                <label>BBA Contract</label>
                <input type="date" value={bbaContract} onChange={e => setBbaContract(e.target.value)} />
              </div>
              <div className="ntp-field">
                <label>BBA Expiration</label>
                <input type="date" value={bbaExp} onChange={e => setBbaExp(e.target.value)} />
              </div>
            </div>
          </>)}

        </div>{/* end ntp-body */}

        {/* Footer */}
        <div className="ntp-footer">
          <button className="ntp-cancel-btn" onClick={onClose}>Cancel</button>
          <button className="ntp-create-btn" disabled={creating} onClick={handleCreate}>
            {creating ? 'Creating…' : `Create ${repType} Transaction`}
          </button>
        </div>

      </div>
    </div>
  )
}
