import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { accountsAPI, transactionsAPI } from '../services/api'
import { ArrowUpRight, ArrowDownLeft, TrendingUp, TrendingDown } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const fmt = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)
const fmtDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const typeColors = {
  checking: 'from-noir-600 to-noir-500',
  savings: 'from-sage/20 to-noir-600',
  investment: 'from-azure/20 to-noir-600',
  crypto: 'from-gold/20 to-noir-600',
}

export default function Dashboard() {
  const { user } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [monthlyData, setMonthlyData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      accountsAPI.getAll(),
      transactionsAPI.getAll({ limit: 8 }),
      transactionsAPI.getMonthly(6)
    ]).then(([a, t, m]) => {
      setAccounts(a.data.data.accounts)
      setTransactions(t.data.data.transactions)
      setMonthlyData(m.data.data.monthly.reverse())
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

const total = accounts.reduce((acc, curr) => acc + (Number(curr.balance) || 0), 0)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="spinner" />
    </div>
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-4xl font-light text-ink-primary">
          Good {getGreeting()}, <span className="text-gold">{user?.firstName}</span>
        </h1>
        <p className="text-ink-secondary text-sm mt-1">Here's your financial overview</p>
      </div>

      {/* Balance Hero */}
      <div className="relative bg-gradient-to-br from-noir-700 via-noir-600 to-noir-700
                      border border-noir-400 border-t-2 border-t-gold rounded-2xl p-8 overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full
                        bg-radial-gradient from-gold/10 to-transparent blur-2xl pointer-events-none" />
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full border border-gold/10" />
        <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full border border-gold/10" />
        <p className="text-[11px] uppercase tracking-widest text-ink-muted mb-2">Total Net Worth</p>
        <div className="font-display text-6xl font-light text-gold mb-2 tracking-tight">{fmt(totalBalance)}</div>
        <p className="text-sm text-ink-secondary">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Accounts */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-ink-muted mb-3">Accounts</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(acc => (
            <div key={acc.id} className={`bg-gradient-to-br ${typeColors[acc.accountType] || 'from-noir-600 to-noir-700'}
                                         border border-noir-400 rounded-2xl p-5 hover:border-noir-300 transition-colors`}>
              <div className="flex justify-between items-center mb-4">
                <span className="text-[11px] bg-gold/15 text-gold px-2.5 py-0.5 rounded-full border border-gold/20 capitalize">
                  {acc.accountType}
                </span>
                <span className={`text-[11px] ${acc.status === 'active' ? 'text-sage' : 'text-ink-muted'}`}>
                  ● {acc.status}
                </span>
              </div>
              <div className="font-mono text-xs text-ink-muted mb-3 tracking-wider">{acc.accountNumber}</div>
              <div className="font-display text-3xl font-light text-ink-primary mb-1">{fmt(acc.balance)}</div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-ink-muted">{acc.currency}</span>
                {acc.interestRate && <span className="text-xs text-sage">{acc.interestRate}% APY</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      {monthlyData.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-widest text-ink-muted mb-3">Income vs Expenses — 6 months</p>
          <div className="bg-noir-700 border border-noir-400 rounded-2xl p-6">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4caf82" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4caf82" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e05c5c" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#e05c5c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a38" />
                <XAxis dataKey="month" stroke="#5a5868" tick={{ fontSize: 12, fill: '#5a5868' }} />
                <YAxis stroke="#5a5868" tick={{ fontSize: 12, fill: '#5a5868' }} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
                <Tooltip contentStyle={{ background: '#1c1c24', border: '1px solid #2a2a38', borderRadius: '10px', color: '#f0ede8', fontFamily: 'DM Sans' }} formatter={v => fmt(v)} />
                <Area type="monotone" dataKey="income" stroke="#4caf82" fill="url(#gi)" strokeWidth={2} name="Income" />
                <Area type="monotone" dataKey="expenses" stroke="#e05c5c" fill="url(#ge)" strokeWidth={2} name="Expenses" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-ink-muted mb-3">Recent Transactions</p>
        <div className="bg-noir-700 border border-noir-400 rounded-2xl overflow-hidden">
          {transactions.length === 0 && (
            <div className="py-12 text-center text-ink-muted text-sm">No transactions yet</div>
          )}
          {transactions.map((tx, i) => (
            <div key={tx.id}
              className={`flex items-center gap-4 px-5 py-4 hover:bg-noir-600 transition-colors
                          ${i < transactions.length - 1 ? 'border-b border-noir-400' : ''}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0
                              ${tx.amount > 0 ? 'tx-in' : 'tx-out'}`}>
                {tx.amount > 0 ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-primary truncate">{tx.description || tx.type}</div>
                <div className="text-xs text-ink-muted mt-0.5">{fmtDate(tx.date)} · <span className="capitalize">{tx.category || tx.type}</span></div>
              </div>
              <div className={`text-sm font-mono font-medium ${tx.amount > 0 ? 'text-sage' : 'text-ink-primary'}`}>
                {tx.amount > 0 ? '+' : ''}{fmt(tx.amount)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}
