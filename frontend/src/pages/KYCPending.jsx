import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { CheckCircle, RefreshCcw } from 'lucide-react'

export default function KYCPending() {
  const { user, refreshUser } = useAuth()

  // If the user is somehow approved while on this page, refresh will catch it
  useEffect(() => { refreshUser() }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fade-in px-4">
      <div className="bg-noir-700 border border-noir-400 p-12 rounded-[40px] text-center max-w-md shadow-2xl">
        <div className="relative mb-8">
          <CheckCircle size={80} className="text-gold mx-auto animate-pulse" />
          <div className="absolute inset-0 bg-gold/20 blur-3xl rounded-full" />
        </div>
        <h2 className="text-3xl font-display text-ink-primary mb-4">Under Review</h2>
        <p className="text-ink-secondary leading-relaxed mb-8">
          Documents received. Our compliance team is verifying your identity. 
          This typically takes 1 to 12 hours.
        </p>
        <div className="bg-noir-800 p-4 rounded-2xl border border-noir-400 mb-8 text-left">
           <span className="text-[10px] uppercase tracking-widest text-ink-muted block mb-1">Status</span>
           <span className="text-gold font-medium flex items-center gap-2">
             <RefreshCcw size={14} className="animate-spin" /> Pending Review
           </span>
        </div>
        <button className="btn-gold w-full py-4 rounded-xl flex items-center justify-center gap-2" 
          onClick={() => refreshUser()}>
          <RefreshCcw size={18} /> REFRESH STATUS
        </button>
      </div>
    </div>
  )
}