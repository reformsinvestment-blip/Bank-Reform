import { useState, useEffect } from 'react'
import { accountsAPI } from '../services/api'
import { Plus } from 'lucide-react'
import toast from 'react-hot-toast'

const fmt = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)

export default function Accounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [accountType, setAccountType] = useState('savings')
  const [creating, setCreating] = useState(false)

  const load = async () => {
    try {
      const res = await accountsAPI.getAll()
      setAccounts(res.data.data.accounts)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    setCreating(true)
    try {
      await accountsAPI.create({ accountType })
      toast.success('Account created!')
      setShowModal(false)
      load()
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
    finally { setCreating(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-light text-ink-primary">Accounts</h1>
          <p className="text-ink-secondary text-sm mt-1">Manage your bank accounts</p>
        </div>
        <button className="btn-gold" onClick={() => setShowModal(true)}>
          <Plus size={16} /> New Account
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {accounts.length === 0 && (
          <div className="col-span-full bg-noir-700 border border-noir-400 rounded-2xl py-14 text-center text-ink-muted text-sm">
            No accounts found. Create one to get started.
          </div>
        )}
        {accounts.map(acc => (
          <div key={acc.id} className="bg-noir-700 border border-noir-400 border-t-2 border-t-gold rounded-2xl p-6 hover:border-noir-300 transition-colors">
            <div className="flex justify-between items-center mb-5">
              <span className="text-[11px] bg-gold/15 text-gold px-2.5 py-1 rounded-full border border-gold/25 capitalize font-medium">{acc.accountType}</span>
              <span className={`text-[11px] ${acc.status === 'active' ? 'text-sage' : 'text-ink-muted'}`}>● {acc.status}</span>
            </div>
            <div className="font-mono text-xs text-ink-muted mb-4 tracking-widest">{acc.accountNumber}</div>
            <div className="font-display text-4xl font-light text-ink-primary mb-3">{fmt(acc.balance)}</div>
            <div className="flex justify-between text-xs">
              <span className="text-ink-muted">{acc.currency}</span>
              {acc.interestRate && <span className="text-sage font-medium">{acc.interestRate}% APY</span>}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-noir-700 border border-noir-400 rounded-2xl p-8 w-full max-w-sm animate-fade-in" onClick={e => e.stopPropagation()}>
            <h2 className="font-display text-2xl text-ink-primary mb-6">Open New Account</h2>
            <div className="mb-6">
              <label className="field-label">Account Type</label>
              <select className="field-select" value={accountType} onChange={e => setAccountType(e.target.value)}>
                <option value="checking">Checking</option>
                <option value="savings">Savings (3.5% APY)</option>
                <option value="investment">Investment</option>
                <option value="crypto">Crypto Wallet</option>
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-gold" onClick={create} disabled={creating}>{creating ? 'Creating…' : 'Open Account'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
