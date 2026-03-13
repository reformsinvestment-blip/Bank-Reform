import { useState, useEffect } from 'react'
import { adminAPI } from '../../services/api'
import toast from 'react-hot-toast'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])
  const load = async () => {
    const res = await adminAPI.getUsers({ search })
    setUsers(res.data.data.users)
  }

  const handleFund = async (userId) => {
    const amount = prompt("Enter amount to fund (USD):")
    if (!amount) return
    try {
      // Find the user's account ID first (logic simplified for brevity)
      const details = await adminAPI.getUserDetails(userId)
      const accountId = details.data.data.accounts[0]?.id
      if (!accountId) return toast.error("User has no active account")
      
      await adminAPI.fundAccount({ accountId, amount: parseFloat(amount), description: 'Admin Credit' })
      toast.success("Account Funded!")
      load()
    } catch { toast.error("Funding failed") }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-display text-ink-primary">User Management</h1>
        <input 
          className="field-input max-w-xs" 
          placeholder="Search name or email..." 
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
      </div>

      <div className="bg-noir-700 border border-noir-400 rounded-3xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-noir-800 text-ink-muted text-xs uppercase p-4">
            <tr>
              <th className="p-4">User</th>
              <th className="p-4">Status</th>
              <th className="p-4">KYC</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-noir-400 text-ink-secondary">
  {users.map(u => {
    // LOGIC: A user is only truly "Active" if account is enabled AND KYC is approved
    const isFullyActive = u.isActive && u.kycStatus === 'approved';
    const isPending = u.kycStatus === 'pending_review';
    
    return (
      <tr key={u.id} className="hover:bg-noir-600/20 transition-colors">
        <td className="p-4">
          <div className="text-ink-primary font-medium">{u.firstName} {u.lastName}</div>
          <div className="text-xs text-ink-muted">{u.email}</div>
        </td>
        
        {/* UPDATED STATUS COLUMN */}
        <td className="p-4">
          {isFullyActive ? (
            <span className="flex items-center gap-1.5 text-green-500 text-xs font-bold uppercase tracking-wider">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Active
            </span>
          ) : isPending ? (
            <span className="text-gold text-xs font-bold uppercase tracking-wider">
              Pending KYC
            </span>
          ) : (
            <span className="text-ink-muted text-xs font-bold uppercase tracking-wider">
              Inactive
            </span>
          )}
        </td>

        <td className="p-4">
          <span className={`text-[11px] px-2 py-0.5 rounded-md border 
            ${u.kycStatus === 'approved' ? 'border-green-500/30 text-green-500 bg-green-500/5' : 
              u.kycStatus === 'pending_review' ? 'border-gold/30 text-gold bg-gold/5' : 
              'border-noir-400 text-ink-muted bg-noir-800'}`}>
            {u.kycStatus === 'approved' ? 'Verified' : 
             u.kycStatus === 'pending_review' ? 'In Review' : 'No Documents'}
          </span>
        </td>

        <td className="p-4 text-right">
          {/* Only allow funding if they are verified */}
          <button 
            onClick={() => handleFund(u.id)} 
            disabled={!isFullyActive}
            className={`text-xs py-1.5 px-4 rounded-lg font-semibold transition-all
              ${isFullyActive 
                ? 'bg-gold text-noir-900 hover:bg-gold-light' 
                : 'bg-noir-500 text-ink-muted cursor-not-allowed'}`}
          >
            Fund
          </button>
        </td>
      </tr>
    )
  })}
</tbody>
        </table>
      </div>
    </div>
  )
}