import { useState, useEffect } from 'react'
import { adminAPI } from '../../services/api'
import { Users, Landmark, AlertCircle, TrendingUp } from 'lucide-react'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminAPI.getStats().then(res => {
      setStats(res.data.data)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="p-10 text-center text-ink-muted">Loading Bank Intelligence...</div>

  const cards = [
    { label: 'Total Users', value: stats.users.totalUsers, icon: <Users/>, color: 'text-azure' },
    { label: 'Total Deposits', value: `$${stats.accounts.totalBalance?.toLocaleString()}`, icon: <Landmark/>, color: 'text-gold' },
    { label: 'Today Transactions', value: stats.transactions.totalTransactions, icon: <TrendingUp/>, color: 'text-green-500' },
    { label: 'Pending Loans', value: stats.pending.loans, icon: <AlertCircle/>, color: 'text-crimson' },
  ]

  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-display text-ink-primary">Command Center</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map(c => (
          <div key={c.label} className="bg-noir-700 border border-noir-400 p-6 rounded-3xl">
            <div className={`${c.color} mb-4`}>{c.icon}</div>
            <div className="text-ink-muted text-sm uppercase tracking-tighter">{c.label}</div>
            <div className="text-3xl text-ink-primary font-medium mt-1">{c.value}</div>
          </div>
        ))}
      </div>
      
      <div className="bg-noir-700 border border-noir-400 rounded-3xl p-8">
        <h2 className="text-xl text-ink-primary mb-6">System Health</h2>
        <p className="text-ink-secondary">All systems operational. Supabase connected via IPv4 Pooler.</p>
      </div>
    </div>
  )
}