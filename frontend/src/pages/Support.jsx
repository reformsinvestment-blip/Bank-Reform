import { useState, useEffect } from 'react'
import { supportAPI } from '../services/api'
import toast from 'react-hot-toast'

export default function Support() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ subject: '', category: 'general', priority: 'medium', message: '' })
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    try {
      const res = await supportAPI.getAll()
      setTickets(res.data.data?.tickets || res.data.tickets || [])
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const submit = async () => {
    setSubmitting(true)
    try {
      await supportAPI.create(form)
      toast.success('Support ticket created!')
      setForm({ subject: '', category: 'general', priority: 'medium', message: '' })
      load()
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
    finally { setSubmitting(false) }
  }

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))
  const statusBadge = s => ({ open: 'badge-gold', resolved: 'badge-green', closed: 'badge-muted' }[s] || 'badge-muted')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-light text-ink-primary">Support</h1>
        <p className="text-ink-secondary text-sm mt-1">Get help from our team</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* New Ticket */}
        <div>
          <p className="text-[11px] uppercase tracking-widest text-ink-muted mb-3">New Ticket</p>
          <div className="bg-noir-700 border border-noir-400 rounded-2xl p-7 space-y-5">
            <div>
              <label className="field-label">Subject</label>
              <input className="field-input" value={form.subject} onChange={set('subject')} placeholder="Brief description of the issue" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">Category</label>
                <select className="field-select" value={form.category} onChange={set('category')}>
                  {['general', 'transaction', 'account', 'card', 'technical', 'fraud'].map(c => (
                    <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Priority</label>
                <select className="field-select" value={form.priority} onChange={set('priority')}>
                  {['low', 'medium', 'high', 'urgent'].map(p => (
                    <option key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="field-label">Message</label>
              <textarea
                className="field-input resize-y min-h-[120px]"
                value={form.message}
                onChange={set('message')}
                placeholder="Describe your issue in detail…"
                rows={5}
              />
            </div>
            <button className="btn-gold w-full justify-center" onClick={submit}
              disabled={submitting || !form.subject || !form.message}>
              {submitting ? 'Submitting…' : 'Submit Ticket'}
            </button>
          </div>
        </div>

        {/* History */}
        <div>
          <p className="text-[11px] uppercase tracking-widest text-ink-muted mb-3">My Tickets</p>
          <div className="bg-noir-700 border border-noir-400 rounded-2xl overflow-hidden">
            {loading && <div className="py-12 flex justify-center"><div className="spinner" /></div>}
            {!loading && tickets.length === 0 && (
              <div className="py-12 text-center text-ink-muted text-sm">No tickets yet</div>
            )}
            {tickets.map((t, i) => (
              <div key={t.id}
                className={`px-5 py-4 hover:bg-noir-600 transition-colors ${i < tickets.length - 1 ? 'border-b border-noir-400' : ''}`}>
                <div className="flex justify-between items-start gap-3 mb-1.5">
                  <div className="text-sm font-medium text-ink-primary">{t.subject}</div>
                  <span className={statusBadge(t.status)}>{t.status}</span>
                </div>
                <div className="text-xs text-ink-muted capitalize">
                  {t.category} · {t.priority} priority · {new Date(t.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
