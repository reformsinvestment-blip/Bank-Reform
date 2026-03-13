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
            {users.map(u => (
              <tr key={u.id}>
                <td className="p-4">
                  <div className="text-ink-primary font-medium">{u.firstName} {u.lastName}</div>
                  <div className="text-xs text-ink-muted">{u.email}</div>
                </td>
                <td className="p-4">
                  <span className={u.isActive ? "text-green-500" : "text-crimson"}>{u.isActive ? 'Active' : 'Disabled'}</span>
                </td>
                <td className="p-4 capitalize">{u.kycStatus || 'None'}</td>
                <td className="p-4 text-right">
                  <button onClick={() => handleFund(u.id)} className="btn-gold text-xs py-1 px-3">Fund</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}