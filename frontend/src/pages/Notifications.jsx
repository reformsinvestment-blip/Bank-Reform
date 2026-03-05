import { useState, useEffect } from 'react'
import { notificationsAPI } from '../services/api'
import { Check } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const res = await notificationsAPI.getAll({ limit: 50 })
      setNotifications(res.data.notifications || res.data.data?.notifications || [])
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const markRead = async (id) => {
    try {
      await notificationsAPI.markRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: 1 } : n))
    } catch {}
  }

  const markAllRead = async () => {
    try {
      await notificationsAPI.markAllRead()
      setNotifications(prev => prev.map(n => ({ ...n, isRead: 1 })))
      toast.success('All marked as read')
    } catch {}
  }

  const unreadCount = notifications.filter(n => !n.isRead).length

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-light text-ink-primary">Notifications</h1>
          <p className="text-ink-secondary text-sm mt-1">
            {unreadCount > 0 ? <span className="text-gold">{unreadCount} unread</span> : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button className="btn-ghost" onClick={markAllRead}><Check size={15} /> Mark all read</button>
        )}
      </div>

      <div className="bg-noir-700 border border-noir-400 rounded-2xl overflow-hidden">
        {notifications.length === 0 && (
          <div className="py-14 text-center text-ink-muted text-sm">No notifications</div>
        )}
        {notifications.map((n, i) => (
          <div key={n.id}
            onClick={() => !n.isRead && markRead(n.id)}
            className={`flex items-start gap-4 px-5 py-4 transition-colors
                        ${!n.isRead ? 'hover:bg-gold/5 cursor-pointer' : 'opacity-70'}
                        ${i < notifications.length - 1 ? 'border-b border-noir-400' : ''}`}>
            <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${!n.isRead ? 'bg-gold' : 'bg-noir-400'}`} />
            <div className="flex-1 min-w-0">
              <div className={`text-sm ${!n.isRead ? 'font-medium text-ink-primary' : 'text-ink-secondary'}`}>
                {n.title || n.message}
              </div>
              {n.title && <div className="text-xs text-ink-secondary mt-0.5">{n.message}</div>}
              <div className="text-[11px] text-ink-muted mt-1">{new Date(n.createdAt).toLocaleString()}</div>
            </div>
            {!n.isRead && <div className="w-1.5 h-1.5 rounded-full bg-gold mt-2 flex-shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  )
}
