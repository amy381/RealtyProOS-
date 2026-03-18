import { useState } from 'react'
import './NewTransactionPopup.css'

const STAGES = [
  { value: 'pre-listing',       label: 'Pre-Listing'         },
  { value: 'buyer-broker',      label: 'Buyer-Broker'        },
  { value: 'active-listing',    label: 'Active Listing'      },
  { value: 'pending',           label: 'Pending'             },
  { value: 'closed',            label: 'Closed'              },
  { value: 'cancelled-expired', label: 'Cancelled / Expired' },
]

export default function NewTransactionPopup({ onCreate, onClose }) {
  const [repType,  setRepType]  = useState('Seller')
  const [status,   setStatus]   = useState('pre-listing')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    await onCreate(repType, status)
    setCreating(false)
  }

  return (
    <div className="ntp-overlay" onMouseDown={onClose}>
      <div className="ntp-popup" onMouseDown={e => e.stopPropagation()}>
        <div className="ntp-title">New Transaction</div>

        <div className="ntp-label">Transaction Type</div>
        <div className="ntp-type-row">
          {['Seller', 'Buyer'].map(t => (
            <button
              key={t}
              className={`ntp-type-btn${repType === t ? ' active' : ''}`}
              onClick={() => setRepType(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="ntp-label">Starting Stage</div>
        <select
          className="ntp-stage-select"
          value={status}
          onChange={e => setStatus(e.target.value)}
        >
          {STAGES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <div className="ntp-actions">
          <button className="ntp-cancel-btn" onClick={onClose}>Cancel</button>
          <button className="ntp-create-btn" disabled={creating} onClick={handleCreate}>
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
