import { useState, useEffect } from 'react'
import { cryptoAPI, accountsAPI } from '../services/api'
import { TrendingUp, TrendingDown } from 'lucide-react'
import toast from 'react-hot-toast'

const fmt = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)

export default function Crypto() {
  const [prices, setPrices] = useState({})
  const [holdings, setHoldings] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ accountId: '', symbol: 'BTC', quantity: '' })

  const load = async () => {
    try {
      const [pRes, hRes, aRes] = await Promise.all([cryptoAPI.getPrices(), cryptoAPI.getHoldings(), accountsAPI.getAll()])
      setPrices(pRes.data.data.prices)
      setHoldings(hRes.data.data.holdings)
      const accs = aRes.data.data.accounts
      setAccounts(accs)
      if (accs.length) setForm(p => ({ ...p, accountId: accs[0].id }))
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const trade = async () => {
    try {
      modal === 'buy'
        ? await cryptoAPI.buy({ ...form, quantity: parseFloat(form.quantity) })
        : await cryptoAPI.sell({ ...form, quantity: parseFloat(form.quantity) })
      toast.success(`${modal === 'buy' ? 'Purchased' : 'Sold'} ${form.quantity} ${form.symbol}!`)
      setModal(null)
      setForm(p => ({ ...p, quantity: '' }))
      load()
    } catch (err) { toast.error(err.response?.data?.message || 'Trade failed') }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>

  const totalHoldings = holdings.reduce((s, h) => s + (h.totalValue || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-light text-ink-primary">Crypto</h1>
          <p className="text-ink-secondary text-sm mt-1">
            Portfolio value: <span className="text-gold font-medium font-mono">{fmt(totalHoldings)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-gold" onClick={() => setModal('buy')}>Buy</button>
          <button className="btn-ghost" onClick={() => setModal('sell')}>Sell</button>
        </div>
      </div>

      {/* Market Prices */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-ink-muted mb-3">Market Prices</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Object.entries(prices).map(([sym, data]) => (
            <div key={sym} className="bg-noir-700 border border-noir-400 rounded-2xl p-5 hover:border-noir-300 transition-colors">
              <div className="flex justify-between items-center mb-3">
                <span className="text-base font-bold text-ink-primary">{sym}</span>
                <span className={`flex items-center gap-1 text-xs font-medium ${data.change24h >= 0 ? 'text-sage' : 'text-crimson'}`}>
                  {data.change24h >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {data.change24h > 0 ? '+' : ''}{data.change24h}%
                </span>
              </div>
              <div className="font-mono text-lg font-semibold text-ink-primary">{fmt(data.price)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Holdings */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-ink-muted mb-3">My Holdings</p>
        <div className="bg-noir-700 border border-noir-400 rounded-2xl overflow-hidden">
          {holdings.length === 0 ? (
            <div className="py-12 text-center text-ink-muted text-sm">No crypto holdings yet</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-noir-400">
                  {['Asset', 'Quantity', 'Avg Cost', 'Current', 'Value', 'P&L'].map(h => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-widest text-ink-muted px-5 py-3.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holdings.map((h, i) => (
                  <tr key={h.id} className={`hover:bg-noir-600 transition-colors ${i < holdings.length - 1 ? 'border-b border-noir-400' : ''}`}>
                    <td className="px-5 py-4 text-sm font-bold">{h.symbol}</td>
                    <td className="px-5 py-4 text-sm font-mono">{h.quantity}</td>
                    <td className="px-5 py-4 text-sm font-mono text-ink-secondary">{fmt(h.purchasePrice)}</td>
                    <td className="px-5 py-4 text-sm font-mono">{fmt(h.currentPrice)}</td>
                    <td className="px-5 py-4 text-sm font-mono font-medium">{fmt(h.totalValue)}</td>
                    <td className={`px-5 py-4 text-sm font-mono font-medium ${h.profitLoss >= 0 ? 'text-sage' : 'text-crimson'}`}>
                      {h.profitLoss >= 0 ? '+' : ''}{fmt(h.profitLoss)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-noir-700 border border-noir-400 rounded-2xl p-8 w-full max-w-sm animate-fade-in" onClick={e => e.stopPropagation()}>
            <h2 className="font-display text-2xl text-ink-primary mb-6">{modal === 'buy' ? 'Buy' : 'Sell'} Crypto</h2>
            <div className="space-y-5">
              <div>
                <label className="field-label">Account</label>
                <select className="field-select" value={form.accountId} onChange={e => setForm(p => ({ ...p, accountId: e.target.value }))}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.accountType} — ${a.balance?.toFixed(2)}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Asset</label>
                <select className="field-select" value={form.symbol} onChange={e => setForm(p => ({ ...p, symbol: e.target.value }))}>
                  {Object.keys(prices).map(s => <option key={s} value={s}>{s} — {fmt(prices[s].price)}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Quantity</label>
                <input className="field-input" type="number" step="0.0001" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} placeholder="0.00" />
              </div>
              {form.quantity && prices[form.symbol] && (
                <div className="bg-noir-600 rounded-xl px-4 py-3 text-sm">
                  <span className="text-ink-secondary">Estimated total: </span>
                  <span className="text-gold font-mono font-semibold">{fmt(parseFloat(form.quantity) * prices[form.symbol].price)}</span>
                </div>
              )}
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-gold" onClick={trade} disabled={!form.quantity}>{modal === 'buy' ? 'Buy' : 'Sell'} Now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
