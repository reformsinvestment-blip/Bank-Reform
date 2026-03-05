import { useState, useEffect } from 'react'
import { loansAPI, accountsAPI } from '../services/api'
import toast from 'react-hot-toast'

const fmt = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)

export default function Loans() {
  const [loans, setLoans] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [calc, setCalc] = useState(null)
  const [form, setForm] = useState({ loanType: 'personal', amount: '10000', term: '36', purpose: '', accountId: '' })

  const load = async () => {
    try {
      const [lRes, aRes] = await Promise.all([loansAPI.getAll(), accountsAPI.getAll()])
      setLoans(lRes.data.data.loans)
      const accs = aRes.data.data.accounts
      setAccounts(accs)
      if (accs.length) setForm(p => ({ ...p, accountId: accs[0].id }))
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const calculate = async () => {
    try {
      const res = await loansAPI.calculate({ amount: form.amount, term: form.term, loanType: form.loanType })
      setCalc(res.data.data)
    } catch {
      const amount = parseFloat(form.amount), term = parseInt(form.term)
      const rate = 8.5 / 100 / 12
      const mp = (amount * rate * Math.pow(1 + rate, term)) / (Math.pow(1 + rate, term) - 1)
      setCalc({ monthlyPayment: mp, totalPayable: mp * term, totalInterest: mp * term - amount })
    }
  }

  const apply = async () => {
    try {
      await loansAPI.apply({ ...form, amount: parseFloat(form.amount), term: parseInt(form.term) })
      toast.success('Application submitted!')
      setShowModal(false)
      setCalc(null)
      load()
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
  }

  const statusBadge = s => ({ approved: 'badge-green', pending: 'badge-gold', active: 'badge-blue', rejected: 'badge-red' }[s] || 'badge-muted')

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-light text-ink-primary">Loans</h1>
          <p className="text-ink-secondary text-sm mt-1">Apply for and manage your loans</p>
        </div>
        <button className="btn-gold" onClick={() => setShowModal(true)}>Apply for Loan</button>
      </div>

      <div className="bg-noir-700 border border-noir-400 rounded-2xl overflow-hidden">
        {loans.length === 0 ? (
          <div className="py-14 text-center text-ink-muted text-sm">No active loans</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-noir-400">
                {['Type', 'Amount', 'Monthly', 'Term', 'Status', 'Applied'].map(h => (
                  <th key={h} className="text-left text-[11px] uppercase tracking-widest text-ink-muted px-5 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loans.map((l, i) => (
                <tr key={l.id} className={`hover:bg-noir-600 transition-colors ${i < loans.length - 1 ? 'border-b border-noir-400' : ''}`}>
                  <td className="px-5 py-4 text-sm capitalize">{l.loanType}</td>
                  <td className="px-5 py-4 text-sm font-mono">{fmt(l.amount)}</td>
                  <td className="px-5 py-4 text-sm font-mono">{fmt(l.monthlyPayment)}</td>
                  <td className="px-5 py-4 text-sm text-ink-secondary">{l.term} mo</td>
                  <td className="px-5 py-4"><span className={statusBadge(l.status)}>{l.status}</span></td>
                  <td className="px-5 py-4 text-sm text-ink-muted">{new Date(l.appliedDate).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-noir-700 border border-noir-400 rounded-2xl p-8 w-full max-w-lg animate-fade-in overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <h2 className="font-display text-2xl text-ink-primary mb-6">Loan Application</h2>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Loan Type</label>
                  <select className="field-select" value={form.loanType} onChange={e => setForm(p => ({ ...p, loanType: e.target.value }))}>
                    {['personal', 'mortgage', 'auto', 'business', 'student'].map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Deposit Account</label>
                  <select className="field-select" value={form.accountId} onChange={e => setForm(p => ({ ...p, accountId: e.target.value }))}>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.accountType} {a.accountNumber}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Amount ($)</label>
                  <input className="field-input" type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="10000" />
                </div>
                <div>
                  <label className="field-label">Term</label>
                  <select className="field-select" value={form.term} onChange={e => setForm(p => ({ ...p, term: e.target.value }))}>
                    {[12, 24, 36, 48, 60, 84, 120].map(t => <option key={t} value={t}>{t} months</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="field-label">Purpose</label>
                <input className="field-input" value={form.purpose} onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))} placeholder="Reason for loan" />
              </div>
              <button className="btn-ghost w-full justify-center" onClick={calculate} type="button">Calculate Payments</button>
              {calc && (
                <div className="bg-noir-600 rounded-xl p-4 space-y-2.5">
                  {[['Monthly Payment', calc.monthlyPayment], ['Total Interest', calc.totalInterest], ['Total Payable', calc.totalPayable]].map(([l, v]) => (
                    <div key={l} className="flex justify-between text-sm">
                      <span className="text-ink-secondary">{l}</span>
                      <span className="font-mono font-medium text-gold">{fmt(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button className="btn-ghost" onClick={() => { setShowModal(false); setCalc(null) }}>Cancel</button>
              <button className="btn-gold" onClick={apply}>Submit Application</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
