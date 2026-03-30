import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from 'react-hot-toast'
import { formatPhone } from '../lib/formatters'
import './CollaboratorsTab.css'

const CATEGORIES = [
  { id: 'title-escrow',    label: 'Title / Escrow',  companyLabel: 'Company',   hasType: false },
  { id: 'lenders',         label: 'Lenders',          companyLabel: 'Company',   hasType: false },
  { id: 'home-inspectors', label: 'Home Inspectors',  companyLabel: 'Company',   hasType: false },
  { id: 'coop-agents',     label: 'Co-op Agents',     companyLabel: 'Brokerage', hasType: false },
  { id: 'other-vendors',   label: 'Other Vendors',    companyLabel: 'Company',   hasType: true  },
]

const BLANK_FORM = { first_name: '', last_name: '', company: '', phone: '', email: '', type: '', address: '' }

export default function CollaboratorsTab() {
  const [activeCat, setActiveCat]   = useState(CATEGORIES[0].id)
  const [records, setRecords]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editing, setEditing]       = useState(null)   // null = new, object = existing
  const [form, setForm]             = useState(BLANK_FORM)

  useEffect(() => {
    supabase.from('collaborators').select('*').order('last_name').order('first_name')
      .then(({ data, error }) => {
        if (error) console.warn('[Collaborators] load error:', error.message)
        else setRecords(data || [])
        setLoading(false)
      })
  }, [])

  const cat = CATEGORIES.find(c => c.id === activeCat)
  const visible = records.filter(r => r.category === activeCat)

  const openNew = () => {
    setEditing(null)
    setForm(BLANK_FORM)
    setModalOpen(true)
  }

  const openEdit = (record) => {
    setEditing(record)
    setForm({
      first_name: record.first_name || '',
      last_name:  record.last_name  || '',
      company:    record.company    || '',
      phone:      record.phone      || '',
      email:      record.email      || '',
      type:       record.type       || '',
      address:    record.address    || '',
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    const payload = { ...form, category: activeCat }

    if (editing) {
      const { data, error } = await supabase
        .from('collaborators').update(payload).eq('id', editing.id).select().single()
      if (error) { toast.error('Failed to save'); return }
      setRecords(prev => prev.map(r => r.id === editing.id ? data : r))
      toast.success('Saved')
    } else {
      const { data, error } = await supabase
        .from('collaborators').insert(payload).select().single()
      if (error) {
        console.error('[CollaboratorsTab] insert error:', error.code, error.message, error.hint)
        toast.error(`Failed to add: ${error.message}`)
        return
      }
      setRecords(prev => [...prev, data])
      toast.success('Added')
    }
    setModalOpen(false)
  }

  const handleDelete = async (record) => {
    if (!window.confirm(`Delete ${record.first_name} ${record.last_name}?`)) return
    const { error } = await supabase.from('collaborators').delete().eq('id', record.id)
    if (error) { toast.error('Failed to delete'); return }
    setRecords(prev => prev.filter(r => r.id !== record.id))
    toast.success('Deleted')
  }

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  return (
    <div className="collab-tab">

      {/* Sidebar */}
      <aside className="collab-sidebar">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            className={`collab-nav-item${activeCat === c.id ? ' active' : ''}`}
            onClick={() => setActiveCat(c.id)}
          >
            {c.label}
          </button>
        ))}
      </aside>

      {/* Main content */}
      <div className="collab-body">
        <div className="collab-toolbar">
          <span className="collab-count">
            {visible.length} {visible.length === 1 ? 'contact' : 'contacts'}
          </span>
          <button className="collab-add-btn" onClick={openNew}>+ Add {cat.label}</button>
        </div>

        {loading ? (
          <div className="collab-empty">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="collab-empty">No {cat.label.toLowerCase()} yet. Click "+ Add" to get started.</div>
        ) : (
          <table className="collab-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>{cat.companyLabel}</th>
                {cat.hasType && <th>Type</th>}
                {activeCat === 'title-escrow' && <th>Address</th>}
                <th>Phone</th>
                <th>Email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id}>
                  <td className="collab-name">{[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}</td>
                  <td>{r.company || '—'}</td>
                  {cat.hasType && <td>{r.type || '—'}</td>}
                  {activeCat === 'title-escrow' && <td>{r.address || '—'}</td>}
                  <td>{r.phone || '—'}</td>
                  <td>{r.email || '—'}</td>
                  <td className="collab-actions">
                    <button className="collab-edit-btn" onClick={() => openEdit(r)}>Edit</button>
                    <button className="collab-del-btn"  onClick={() => handleDelete(r)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="collab-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="collab-modal">
            <div className="collab-modal-header">
              <h2>{editing ? 'Edit' : 'Add'} {cat.label}</h2>
              <button className="collab-modal-close" onClick={() => setModalOpen(false)}>✕</button>
            </div>

            <div className="collab-modal-body">
              <div className="collab-form-row">
                <label>First Name
                  <input value={form.first_name} onChange={set('first_name')} placeholder="First name" />
                </label>
                <label>Last Name
                  <input value={form.last_name} onChange={set('last_name')} placeholder="Last name" />
                </label>
              </div>

              <label>{cat.companyLabel}
                <input value={form.company} onChange={set('company')} placeholder={cat.companyLabel} />
              </label>

              {cat.hasType && (
                <label>Type
                  <input value={form.type} onChange={set('type')} placeholder="e.g. Photographer, Stager, Cleaner…" />
                </label>
              )}

              {activeCat === 'title-escrow' && (
                <label>Address
                  <input value={form.address} onChange={set('address')} placeholder="Street address" />
                </label>
              )}

              <div className="collab-form-row">
                <label>Phone
                  <input value={form.phone} onChange={set('phone')} onBlur={() => setForm(p => ({ ...p, phone: formatPhone(p.phone) }))} placeholder="(555) 000-0000" type="tel" />
                </label>
                <label>Email
                  <input value={form.email} onChange={set('email')} placeholder="email@example.com" type="email" />
                </label>
              </div>
            </div>

            <div className="collab-modal-footer">
              <button className="collab-cancel-btn" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="collab-save-btn"   onClick={handleSave}>
                {editing ? 'Save Changes' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
