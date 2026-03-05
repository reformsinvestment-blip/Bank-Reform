import { useState, useEffect } from 'react'
import { transactionsAPI, accountsAPI } from '../services/api'
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react'

const fmt = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)
const fmtDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const filterStyle = `bg-noir-700 border border-noir-400 rounded-xl px-3.5 py-2.5 text-ink-primary text-sm
  outline-none focus:border-gold transition-colors cursor-pointer`

export default function Transactions() {
  const [transactions, setTransactions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ accountId: '', type: '', startDate: '', endDate: '' })
  const [pagination, setPagination] = useState({ total: 0, offset: 0, limit: 20, hasMore: false })

  const load = async (offset = 0) => {
    setLoading(true)
    try {
      const params = { limit: 20, offset, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }
      const res = await transactionsAPI.getAll(params)
      setTransactions(res.data.data.transactions)
      setPagination(p => ({ ...p, ...res.data.data.pagination, offset }))
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { accountsAPI.getAll().then(r => setAccounts(r.data.data.accounts)).catch(() => {}) }, [])
  useEffect(() => { load(0) }, [filters])

  const set = k => e => setFilters(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-light text-ink-primary">Transactions</h1>
        <p className="text-ink-secondary text-sm mt-1">{pagination.total} total transactions</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select className={filterStyle} value={filters.accountId} onChange={set('accountId')}>
          <option value="">All Accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.accountType} — {a.accountNumber}</option>)}
        </select>
        <select className={filterStyle} value={filters.type} onChange={set('type')}>
          <option value="">All Types</option>
          <option value="wire_transfer">Wire Transfer</option>
          <option value="local_transfer">Local Transfer</option>
          <option value="international_transfer">International</option>
          <option value="deposit">Deposit</option>
        </select>
        <input type="date" className={filterStyle} value={filters.startDate} onChange={set('startDate')} />
        <input type="date" className={filterStyle} value={filters.endDate} onChange={set('endDate')} />
      </div>

      {/* List */}
      <div className="bg-noir-700 border border-noir-400 rounded-2xl overflow-hidden">
        {loading && <div className="py-12 flex justify-center"><div className="spinner" /></div>}
        {!loading && transactions.length === 0 && (
          <div className="py-12 text-center text-ink-muted text-sm">No transactions found</div>
        )}
        {!loading && transactions.map((tx, i) => (
          <div key={tx.id}
            className={`flex items-center gap-4 px-5 py-4 hover:bg-noir-600 transition-colors
                        ${i < transactions.length - 1 ? 'border-b border-noir-400' : ''}`}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0
                            ${tx.amount > 0 ? 'tx-in' : 'tx-out'}`}>
              {tx.amount > 0 ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-ink-primary truncate">{tx.description || tx.type}</div>
              <div className="text-xs text-ink-muted mt-0.5 font-mono">{fmtDate(tx.date)} · {tx.reference}</div>
            </div>
            <div className="text-right">
              <div className={`text-sm font-mono font-medium ${tx.amount > 0 ? 'text-sage' : 'text-ink-primary'}`}>
                {tx.amount > 0 ? '+' : ''}{fmt(tx.amount)}
              </div>
              <div className="text-[11px] text-ink-muted mt-0.5 capitalize">{tx.status}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div className="flex items-center justify-center gap-3">
          <button className="btn-ghost" disabled={pagination.offset === 0}
            onClick={() => load(Math.max(0, pagination.offset - pagination.limit))}>Previous</button>
          <span className="text-sm text-ink-secondary px-2">
            {pagination.offset + 1}–{Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
          </span>
          <button className="btn-ghost" disabled={!pagination.hasMore}
            onClick={() => load(pagination.offset + pagination.limit)}>Next</button>
        </div>
      )}
    </div>
  )
}
