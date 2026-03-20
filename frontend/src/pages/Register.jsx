import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'
import { ArrowLeft, Eye, EyeOff, Mail, User, Phone, Lock, ShieldCheck } from 'lucide-react'

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [agreed, setAgreed] = useState(false)
  
  // OTP STATES
  const [otpSent, setOtpSent] = useState(false)
  const [code, setCode] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!agreed && !otpSent) { toast.error('Please agree to the terms'); return }
    
    setLoading(true)
    try {
      if (!otpSent) {
        // STEP 1: Request Registration OTP
        await authAPI.register(form)
        setOtpSent(true)
        toast.success('Verification code sent to your email!')
      } else {
        // STEP 2: Verify OTP and Create Final Account
        const res = await authAPI.registerVerify({ ...form, code })
        const data = res.data.data || res.data
        
        // Save session
        localStorage.setItem('token', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        
        toast.success('Email verified! Welcome to BIFRC.')
        window.location.href = '/kyc' // Direct to Onboarding
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Action failed. Please try again.'
      toast.error(msg)
    } finally { setLoading(false) }
  }

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const inputClass = `w-full bg-noir-700 border border-noir-400 rounded-xl py-3.5 text-ink-primary text-sm
                      outline-none focus:border-gold focus:bg-noir-600 placeholder:text-ink-muted transition-colors`

  return (
    <div className="min-h-screen bg-noir-900 flex overflow-hidden">
      {/* Left — branding (Preserved exactly) */}
      <div className="hidden lg:flex flex-col justify-between w-2/5 bg-noir-800 border-r border-noir-400 p-12 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full border border-gold/10" />
        <div className="absolute bottom-1/3 -left-24 w-64 h-64 bg-gold/5 rounded-full blur-3xl" />
        <Link to="/" className="flex items-center gap-2 group">
          <img src="/logo.jpeg" alt="Logo" className="h-14 w-auto rounded-full" />
          <span className="font-display text-2xl tracking-widest text-ink-primary">BIFRC</span>
        </Link>
        <div>
          <h2 className="font-display text-5xl font-light text-ink-primary mb-4 leading-tight">Start your<br /><span className="text-gold italic">financial journey.</span></h2>
          <p className="text-ink-secondary leading-relaxed">Join millions who trust BIFRC for secure global banking.</p>
        </div>
        <p className="text-xs text-ink-muted">© {new Date().getFullYear()} BIFRC. Secure Banking.</p>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative overflow-y-auto">
        <div className="w-full max-w-md relative">
          <div className="mb-8">
            <h1 className="font-display text-4xl font-light text-ink-primary mb-2">
              {otpSent ? 'Verify Email' : 'Create account'}
            </h1>
            <p className="text-ink-secondary text-sm">
              {otpSent ? `Enter the 6-digit code sent to ${form.email}` : 'Join BIFRC — Secure, global, and reliable.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!otpSent ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">First Name</label>
                    <input className={`${inputClass} px-4`} placeholder="John" value={form.firstName} onChange={set('firstName')} required />
                  </div>
                  <div>
                    <label className="field-label">Last Name</label>
                    <input className={`${inputClass} px-4`} placeholder="Doe" value={form.lastName} onChange={set('lastName')} required />
                  </div>
                </div>
                <div>
                  <label className="field-label">Email Address</label>
                  <input className={`${inputClass} px-4`} type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required />
                </div>
                <div>
                 <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-widest mb-1.5">Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input className={`${inputClass} pl-10 pr-12`} type={showPw ? 'text' : 'password'}
                  placeholder="Min 6 characters" value={form.password} onChange={set('password')}
                  autoComplete="new-password" required minLength={6} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-primary transition-colors">
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {form.password && (
                <div className="mt-1.5 flex gap-1">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                      form.password.length >= i * 2 + 2
                        ? i <= 1 ? 'bg-crimson' : i <= 2 ? 'bg-gold' : 'bg-sage'
                        : 'bg-noir-400'
                    }`} />
                  ))}
                </div>
              )}
            </div>
                <label className="flex items-start gap-3 cursor-pointer mt-4">
                  <input type="checkbox" className="mt-1" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
                  <span className="text-xs text-ink-secondary">I agree to the Terms of Service and Privacy Policy</span>
                </label>
              </>
            ) : (
              <div className="animate-slide-up py-4">
                <div className="relative">
                  <ShieldCheck size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gold" />
                  <input 
                    className={`${inputClass} pl-12 text-center text-2xl tracking-[0.5em] font-bold`}
                    placeholder="000000" maxLength={6} value={code} onChange={e => setCode(e.target.value)} required 
                  />
                </div>
                <button type="button" onClick={() => setOtpSent(false)} className="text-xs text-gold mt-4 hover:underline">Change email address</button>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-gold w-full py-4 mt-6 font-bold">
              {loading ? 'Processing...' : otpSent ? 'Verify & Register' : 'Create Account'}
            </button>
          </form>

          {!otpSent && (
            <div className="mt-6 text-center">
              <p className="text-sm text-ink-secondary">Already have an account? <Link to="/login" className="text-gold font-medium">Sign in</Link></p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}