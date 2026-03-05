import { useState, useEffect } from 'react'
import { billsAPI, accountsAPI } from '../services/api'
import toast from 'react-hot-toast'

const fmt = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)
const icons = { electricity: '⚡', water: '💧', gas: '🔥', internet: '🌐', phone: '📱', cable: '📺', insurance: '🛡️' }

export default function Bills() {
  const [bills, setBills] = useState([])
  const [providers, setProviders] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ accountId: '', billType: '', provider: '', accountNumber: '', amount: '', dueDate: '' })

  const load = async () => {
    try {
      const [bRes, pRes, aRes] = await Promise.all([billsAPI.getAll(), billsAPI.getProviders(), accountsAPI.getAll()])
      setBills(bRes.data.data.bills)
      setProviders(pRes.data.data.providers)
      const accs = aRes.data.data.accounts
      setAccounts(accs)
      if (accs.length) setForm(p => ({ ...p, accountId: accs[0].id }))
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const pay = async () => {
    try {
      await billsAPI.pay({ ...form, amount: parseFloat(form.amount) })
      toast.success('Bill paid!')
      setShowModal(false)
      load()
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-light text-ink-primary">Bill Payments</h1>
          <p className="text-ink-secondary text-sm mt-1">Pay and manage your bills</p>
        </div>
        <button className="btn-gold" onClick={() => setShowModal(true)}>Pay a Bill</button>
      </div>

      {/* Providers */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-ink-muted mb-3">Available Providers</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {providers.map(p => (
            <button key={p.id}
              onClick={() => { setForm(prev => ({ ...prev, provider: p.id, billType: p.type })); setShowModal(true) }}
              className="bg-noir-700 border border-noir-400 rounded-2xl p-5 text-center hover:border-gold/40 hover:bg-noir-600
                         transition-all duration-150 group">
              <div className="text-3xl mb-3">{icons[p.type] || '📄'}</div>
              <div className="text-sm font-medium text-ink-primary group-hover:text-gold transition-colors">{p.name}</div>
              <div className="text-[11px] text-ink-muted capitalize mt-1">{p.type}</div>
            </button>
          ))}
        </div>
      </div>

      {/* History */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-ink-muted mb-3">Payment History</p>
        <div className="bg-noir-700 border border-noir-400 rounded-2xl overflow-hidden">
          {bills.length === 0 ? (
            <div className="py-12 text-center text-ink-muted text-sm">No bill payments yet</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-noir-400">
                  {['Provider', 'Type', 'Amount', 'Due Date', 'Status'].map(h => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-widest text-ink-muted px-5 py-3.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bills.map((b, i) => (
                  <tr key={b.id} className={`hover:bg-noir-600 transition-colors ${i < bills.length - 1 ? 'border-b border-noir-400' : ''}`}>
                    <td className="px-5 py-4 text-sm">{b.provider}</td>
                    <td className="px-5 py-4 text-sm text-ink-secondary capitalize">{b.billType}</td>
                    <td className="px-5 py-4 text-sm font-mono">{fmt(b.amount)}</td>
                    <td className="px-5 py-4 text-sm text-ink-secondary">{new Date(b.dueDate).toLocaleDateString()}</td>
                    <td className="px-5 py-4">
                      <span className={b.status === 'paid' ? 'badge-green' : 'badge-gold'}>{b.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-noir-700 border border-noir-400 rounded-2xl p-8 w-full max-w-sm animate-fade-in" onClick={e => e.stopPropagation()}>
            <h2 className="font-display text-2xl text-ink-primary mb-6">Pay Bill</h2>
            <div className="space-y-5">
              <div>
                <label className="field-label">From Account</label>
                <select className="field-select" value={form.accountId} onChange={e => setForm(p => ({ ...p, accountId: e.target.value }))}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.accountType} — {a.accountNumber}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Provider</label>
                <select className="field-select" value={form.provider} onChange={e => {
                  const prov = providers.find(p => p.id === e.target.value)
                  setForm(p => ({ ...p, provider: e.target.value, billType: prov?.type || '' }))
                }}>
                  <option value="">Select provider</option>
                  {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Bill Account Number</label>
                <input className="field-input" value={form.accountNumber} onChange={e => setForm(p => ({ ...p, accountNumber: e.target.value }))} placeholder="Your account with provider" />
              </div>
              <div>
                <label className="field-label">Amount ($)</label>
                <input className="field-input" type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label className="field-label">Due Date</label>
                <input className="field-input" type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-gold" onClick={pay} disabled={!form.provider || !form.amount}>Pay Now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
