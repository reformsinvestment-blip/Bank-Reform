import { useState, useEffect } from 'react'
import { adminAPI } from '../../services/api'
import toast from 'react-hot-toast'

export default function AdminApprovals() {
  const [pending, setPending] = useState([])

  useEffect(() => { load() }, [])
  const load = async () => {
    const res = await adminAPI.getPendingKYC()
    setPending(res.data.users)
  }

  const approve = async (id) => {
    try {
      await adminAPI.approveKYC(id)
      toast.success("User Approved. Account Created & Email Sent.")
      load()
    } catch { toast.error("Error approving user") }
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-display text-ink-primary mb-6">Pending Registrations</h1>
      <div className="grid gap-4">
        {pending.length === 0 && <div className="text-ink-muted p-10 bg-noir-700 rounded-3xl text-center">No users waiting for approval.</div>}
        {pending.map(u => (
          <div key={u.id} className="bg-noir-700 border border-noir-400 p-6 rounded-3xl flex justify-between items-center">
            <div>
              <div className="text-xl text-ink-primary">{u.firstName} {u.lastName}</div>
              <div className="text-ink-secondary">{u.email}</div>
              <div className="text-xs text-ink-muted mt-2">Joined: {new Date(u.createdAt).toLocaleString()}</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => approve(u.id)} className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-xl transition-colors">Approve & Open Account</button>
              <button className="bg-noir-500 text-ink-primary px-6 py-2 rounded-xl">View Documents</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}