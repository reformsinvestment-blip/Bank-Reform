import { useState, useEffect } from 'react'
import { cardsAPI, accountsAPI } from '../services/api'
import { Snowflake, Zap, Plus } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Cards() {
  const [cards, setCards] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ accountId: '', cardType: 'debit', cardNetwork: 'Visa' })

  const load = async () => {
    setLoading(true)
    
    // 1. Load Accounts (Independent - This fills your dropdown)
    try {
      const aRes = await accountsAPI.getAll()
      const accs = aRes.data.accounts || aRes.data.data?.accounts || []
      setAccounts(accs)
      if (accs.length) setForm(p => ({ ...p, accountId: accs[0].id }))
    } catch (err) {
      console.error("Account Load Error:", err)
    }

    // 2. Load Cards (Independent)
    try {
      const cRes = await cardsAPI.getAll()
      setCards(cRes.data.cards || cRes.data.data?.cards || [])
    } catch (err) {
      console.error("Cards Load Error:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const freeze = async (card) => {
    try {
      card.status === 'frozen' ? await cardsAPI.unfreeze(card.id) : await cardsAPI.freeze(card.id)
      toast.success(card.status === 'frozen' ? 'Card unfrozen' : 'Card frozen')
      load()
    } catch { toast.error('Failed') }
  }

  const createCard = async () => {
    try {
      await cardsAPI.create(form)
      toast.success('Card requested!')
      setShowModal(false)
      load()
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>

  const networkColor = n => n === 'Visa' ? 'text-azure' : 'text-crimson'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-light text-ink-primary">Cards</h1>
          <p className="text-ink-secondary text-sm mt-1">Manage your debit and credit cards</p>
        </div>
        <button className="btn-gold" onClick={() => setShowModal(true)}><Plus size={16} /> New Card</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {cards.length === 0 && (
          <div className="col-span-full bg-noir-700 border border-noir-400 rounded-2xl py-14 text-center text-ink-muted text-sm">
            No cards yet. Request your first card.
          </div>
        )}
        {cards.map(card => (
          <div key={card.id} className="relative bg-gradient-to-br from-noir-600 to-noir-500 border border-noir-400 rounded-2xl p-7 overflow-hidden">
            <div className="flex justify-between items-start mb-8 relative">
              <div>
                <div className="text-[11px] uppercase tracking-widest text-ink-muted capitalize">{card.cardType}</div>
                <div className={`text-sm font-semibold mt-0.5 ${networkColor(card.cardNetwork)}`}>{card.cardNetwork}</div>
              </div>
              <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium
                ${card.status === 'active' ? 'badge-green' : card.status === 'frozen' ? 'badge-blue' : 'badge-muted'}`}>
                {card.status}
              </span>
            </div>
            <div className="font-mono text-lg tracking-[0.2em] text-ink-primary mb-6">{card.cardNumber}</div>
            <div className="flex justify-between items-end">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-ink-muted mb-0.5">Expires</div>
                <div className="font-mono text-sm text-ink-secondary">{card.expiryDate}</div>
              </div>
              <button className="btn-ghost text-xs py-2 px-3" onClick={() => freeze(card)}>
                <Snowflake size={13} /> {card.status === 'frozen' ? 'Unfreeze' : 'Freeze'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-noir-700 border border-noir-400 rounded-2xl p-8 w-full max-w-sm animate-fade-in" onClick={e => e.stopPropagation()}>
            <h2 className="font-display text-2xl text-ink-primary mb-6">Request A New Card</h2>
            <div className="space-y-5">
              <div>
                <label className="field-label">Account</label>
                <select className="field-select" value={form.accountId} onChange={e => setForm(p => ({ ...p, accountId: e.target.value }))}>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.accountType} — {a.accountNumber} (${a.balance})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Card Type</label>
                <select className="field-select" value={form.cardType} onChange={e => setForm(p => ({ ...p, cardType: e.target.value }))}>
                  <option value="debit">Debit</option>
                  <option value="credit">Credit</option>
                </select>
              </div>
              <div>
                <label className="field-label">Network</label>
                <select className="field-select" value={form.cardNetwork} onChange={e => setForm(p => ({ ...p, cardNetwork: e.target.value }))}>
                  <option>Visa</option>
                  <option>Mastercard</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-gold" onClick={createCard}>Request Card</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}