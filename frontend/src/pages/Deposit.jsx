import { useState, useEffect } from 'react'
import { accountsAPI } from '../services/api'
import axios from 'axios'
import toast from 'react-hot-toast'

const depositAPI = {
  deposit: payload => axios.post('/api/funds/deposit', payload)
}

const DEPOSIT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Debit / Credit Card' },
  { value: 'cash', label: 'Cash Deposit' }
]

export default function Deposit() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    accountId: '',
    amount: '',
    method: 'bank_transfer',
    description: ''
  })

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await accountsAPI.getAll()
        const accs = res.data.data.accounts
        setAccounts(accs)
        if (accs.length) setForm(p => ({ ...p, accountId: accs[0].id }))
        else toast.error('No accounts found. Please contact support.')
      } catch (e) {
        console.error('Failed to load accounts:', e)
        toast.error('Failed to load your accounts. Please refresh the page.')
      }
    }
    fetchAccounts()
  }, [])

  const setField = k => e => setForm(p => ({ ...p, [k]: e.target.value }))
  const sanitizeAmount = val => parseFloat(String(val).replace(/,/g, '').trim()) || 0
  const selectedAccount = accounts.find(a => a.id === form.accountId)
  const previewBalance =
    selectedAccount && sanitizeAmount(form.amount) > 0
      ? selectedAccount.balance + sanitizeAmount(form.amount)
      : null

  const submit = async () => {
    if (!form.accountId) {
      toast.error('No account selected. Please refresh the page.')
      return
    }
    const parsedAmount = sanitizeAmount(form.amount)
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error('Please enter a valid amount greater than 0')
      return
    }

    setLoading(true)
    try {
      const res = await depositAPI.deposit({
        accountId: form.accountId,
        amount: parsedAmount,
        method: form.method,
        description: form.description.trim() || undefined
      })

      toast.success(res.data.message || 'Deposit successful!')

      if (res.data.data?.newBalance !== undefined) {
        setAccounts(prev =>
          prev.map(a =>
            a.id === form.accountId ? { ...a, balance: res.data.data.newBalance } : a
          )
        )
      }

      setForm(p => ({ ...p, amount: '', description: '' }))
    } catch (err) {
      console.error(err.response?.data)
      const msg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0]?.msg ||
        'Deposit failed. Please try again.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-light text-ink-primary">Deposit</h1>
        <p className="text-ink-secondary text-sm mt-1">Add funds to your account</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form */}
        <div className="lg:col-span-3 bg-noir-700 border border-noir-400 rounded-2xl p-7 space-y-5">

          {accounts.length === 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
              No accounts loaded. Please refresh the page or contact support.
            </div>
          )}

          {/* Account selector */}
          <div>
            <label className="field-label">Deposit To</label>
            <select
              className="field-select"
              value={form.accountId}
              onChange={setField('accountId')}
              autoComplete="off"
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.accountType} — {a.accountNumber} (${a.balance?.toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          {/* Current balance */}
          {selectedAccount && (
            <div className="flex items-center gap-2 bg-noir-600 border border-noir-400 rounded-xl px-4 py-3">
              <span className="text-xs uppercase tracking-widest text-ink-muted">Current Balance</span>
              <span className="ml-auto text-lg font-semibold text-ink-primary">
                ${selectedAccount.balance?.toFixed(2)}
              </span>
            </div>
          )}

          {/* Method */}
          <div>
            <label className="field-label">Deposit Method</label>
            <select
              className="field-select"
              value={form.method}
              onChange={setField('method')}
              autoComplete="off"
            >
              {DEPOSIT_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="field-label">Amount (USD)</label>
            <input
              className="field-input"
              type="text"
              placeholder="0.00"
              value={form.amount}
              onChange={setField('amount')}
              autoComplete="off"
            />
          </div>

          {/* Balance preview */}
          {previewBalance !== null && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-sm text-emerald-400">
              Balance after deposit: <span className="font-semibold">${previewBalance.toFixed(2)}</span>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="field-label">Description (optional)</label>
            <input
              className="field-input"
              type="text"
              placeholder="Reference note…"
              value={form.description}
              onChange={setField('description')}
              autoComplete="off"
            />
          </div>

          <button
            className="btn-gold w-full justify-center"
            onClick={submit}
            disabled={loading || !form.amount || !form.accountId}
          >
            {loading ? 'Processing…' : 'Deposit Funds'}
          </button>
        </div>

        {/* Info panel */}
        <div className="lg:col-span-2 space-y-4">
          <p className="text-[11px] uppercase tracking-widest text-ink-muted mb-3">Deposit Info</p>
          <div className="bg-noir-700 border border-noir-400 rounded-2xl p-5 space-y-4 text-sm text-ink-secondary">
            <div>
              <p className="text-ink-primary font-medium mb-1">Bank Transfer</p>
              <p>Funds arrive within 1–2 business days.</p>
            </div>
            <div className="border-t border-noir-400 pt-4">
              <p className="text-ink-primary font-medium mb-1">Debit / Credit Card</p>
              <p>Instant deposit. A 1.5% processing fee may apply.</p>
            </div>
            <div className="border-t border-noir-400 pt-4">
              <p className="text-ink-primary font-medium mb-1">Cash Deposit</p>
              <p>Visit a branch. Available same business day.</p>
            </div>
          </div>

          {/* Accounts summary */}
          {accounts.length > 0 && (
            <>
              <p className="text-[11px] uppercase tracking-widest text-ink-muted mt-6 mb-3">Your Accounts</p>
              <div className="bg-noir-700 border border-noir-400 rounded-2xl overflow-hidden">
                {accounts.map((a, i) => (
                  <div
                    key={a.id}
                    className={`px-4 py-3.5 flex items-center justify-between ${
                      i < accounts.length - 1 ? 'border-b border-noir-400' : ''
                    } ${a.id === form.accountId ? 'bg-noir-600' : ''}`}
                  >
                    <div>
                      <div className="text-sm font-medium text-ink-primary">{a.accountType}</div>
                      <div className="text-xs text-ink-muted mt-0.5">{a.accountNumber}</div>
                    </div>
                    <div className="text-sm font-semibold text-ink-primary">${a.balance?.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}