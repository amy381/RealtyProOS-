import { useState, useEffect } from 'react'
import { COLUMN_FIELDS, TC_OPTIONS } from '../lib/columnFields'
import './TransactionModal.css'

const BASE_EMPTY = {
  property_address: '',
  client_name: '',
  assigned_tc: TC_OPTIONS[0],
  status: 'pre-listing',
  rep_type: '',
  co_op_agent: '',
  notes: '',
}

export default function TransactionModal({ transaction, columns, onSave, onClose }) {
  const [form, setForm] = useState(BASE_EMPTY)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (transaction) {
      setForm({ ...BASE_EMPTY, ...transaction })
    } else {
      setForm(BASE_EMPTY)
    }
  }, [transaction])

  const currentFields = COLUMN_FIELDS[form.status] || []

  const validate = () => {
    const e = {}
    if (!form.property_address.trim()) e.property_address = 'Required'
    if (!form.client_name.trim()) e.client_name = 'Required'
    return e
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    onSave(form)
  }

  const handleChange = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{transaction ? 'Edit Transaction' : 'New Transaction'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          {/* Always-present fields */}
          <div className="form-group">
            <label>Property Address *</label>
            <input
              type="text"
              placeholder="123 Main St, City, TX 78000"
              value={form.property_address}
              onChange={(e) => handleChange('property_address', e.target.value)}
              className={errors.property_address ? 'error' : ''}
            />
            {errors.property_address && <span className="error-msg">{errors.property_address}</span>}
          </div>

          <div className="form-group">
            <label>Client Name *</label>
            <input
              type="text"
              placeholder="John & Jane Doe"
              value={form.client_name}
              onChange={(e) => handleChange('client_name', e.target.value)}
              className={errors.client_name ? 'error' : ''}
            />
            {errors.client_name && <span className="error-msg">{errors.client_name}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Price</label>
              <input
                type="text"
                placeholder="e.g. 309900"
                value={form.price || ''}
                onChange={(e) => handleChange('price', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Rep</label>
              <select
                value={form.rep_type || ''}
                onChange={(e) => handleChange('rep_type', e.target.value)}
              >
                <option value="">—</option>
                <option value="Buyer">Buyer</option>
                <option value="Seller">Seller</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Co-Op Agent</label>
            <input
              type="text"
              placeholder="Agent name"
              value={form.co_op_agent || ''}
              onChange={(e) => handleChange('co_op_agent', e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Assigned TC</label>
              <select
                value={form.assigned_tc}
                onChange={(e) => handleChange('assigned_tc', e.target.value)}
              >
                {TC_OPTIONS.map((tc) => (
                  <option key={tc} value={tc}>{tc}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Status</label>
              <select
                value={form.status}
                onChange={(e) => handleChange('status', e.target.value)}
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Column-specific fields */}
          {currentFields.length > 0 && (
            <div className="form-section-divider">
              <span>{columns.find((c) => c.id === form.status)?.label} Details</span>
            </div>
          )}

          {currentFields.map((field) => (
            <div key={field.key} className="form-group">
              <label>{field.label}</label>
              <input
                type={field.type === 'date' ? 'date' : 'text'}
                value={form[field.key] || ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.type === 'text' ? field.label : undefined}
              />
            </div>
          ))}

          <div className="form-group">
            <label>Notes</label>
            <textarea
              rows={3}
              placeholder="Any notes about this transaction..."
              value={form.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-save">
              {transaction ? 'Save Changes' : 'Add Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
