import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { ArrowLeft, Eye, EyeOff, Mail, User, Phone, Lock } from 'lucide-react'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [agreed, setAgreed] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!agreed) { toast.error('Please agree to the terms to continue'); return }
    if (form.password.length < 6) { toast.error('Password must be at least 6 characters'); return }
    setLoading(true)
    try {
      await register(form)
      toast.success('Account created! Welcome to SecureBank.')
      navigate('/dashboard')
    } catch (err) {
      const errors = err.response?.data?.errors
      const msg = errors?.length ? errors[0].msg : err.response?.data?.message || 'Registration failed'
      toast.error(msg)
    } finally { setLoading(false) }
  }

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const inputClass = `w-full bg-noir-700 border border-noir-400 rounded-xl py-3.5 text-ink-primary text-sm
                      outline-none focus:border-gold focus:bg-noir-600 placeholder:text-ink-muted transition-colors`

  return (
    <div className="min-h-screen bg-noir-900 flex overflow-hidden">
      {/* Left — branding */}
      <div className="hidden lg:flex flex-col justify-between w-2/5 bg-noir-800 border-r border-noir-400 p-12 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full border border-gold/10" />
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full border border-gold/10" />
        <div className="absolute bottom-1/3 -left-24 w-64 h-64 bg-gold/5 rounded-full blur-3xl" />

        <Link to="/" className="flex items-center gap-2 group">
         <img 
                src="/logo.jpeg" 
                alt="BIFRC Logo" 
                className="h-14 w-auto object-contain rounded-full" 
              />
              <span className="font-display text-2xl tracking-widest text-ink-primary">
                BIFRC
              </span>
        </Link>

        <div>
          <h2 className="font-display text-5xl font-light text-ink-primary mb-4 leading-tight">
            Start your<br /><span className="text-gold italic">financial journey.</span>
          </h2>
          <p className="text-ink-secondary leading-relaxed">
            Join millions of people who trust SecureBank for everyday banking, saving, and investing.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            {[['$0', 'Monthly fee'], ['2 min', 'Setup time'], ['180+', 'Countries'], ['24/7', 'Support']].map(([v, l]) => (
              <div key={l} className="bg-noir-700 border border-noir-400 rounded-xl p-4">
                <div className="font-display text-3xl text-gold font-light">{v}</div>
                <div className="text-xs text-ink-muted mt-0.5">{l}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-ink-muted">© {new Date().getFullYear()} SecureBank. FDIC Insured.</p>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative overflow-y-auto">
        <div className="absolute inset-0 pointer-events-none opacity-20">
          {[25, 50, 75].map(p => (
            <div key={p} className="absolute w-px h-full bg-gradient-to-b from-transparent via-noir-400 to-transparent" style={{ left: `${p}%` }} />
          ))}
        </div>

        <div className="w-full max-w-md relative">
          <Link to="/" className="lg:hidden inline-flex items-center gap-2 text-sm text-ink-secondary hover:text-ink-primary transition-colors mb-8">
            <ArrowLeft size={15} /> Back to home
          </Link>

          <div className="mb-8">
            <h1 className="font-display text-4xl font-light text-ink-primary mb-2">Create account</h1>
            <p className="text-ink-secondary text-sm">Join SecureBank — free forever, no credit card needed</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-widest mb-1.5">First Name</label>
                <div className="relative">
                  <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input className={`${inputClass} pl-10`} placeholder="John" value={form.firstName} onChange={set('firstName')} required />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-widest mb-1.5">Last Name</label>
                <div className="relative">
                  <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input className={`${inputClass} pl-10`} placeholder="Doe" value={form.lastName} onChange={set('lastName')} required />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-widest mb-1.5">Email Address</label>
              <div className="relative">
                <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input className={`${inputClass} pl-10`} type="email" placeholder="you@example.com"
                  value={form.email} onChange={set('email')} autoComplete="email" required />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-widest mb-1.5">Phone <span className="normal-case font-normal text-ink-muted">(optional)</span></label>
              <div className="relative">
                <Phone size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input className={`${inputClass} pl-10`} type="tel" placeholder="+1 555 000 0000"
                  value={form.phone} onChange={set('phone')} />
              </div>
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

            <label className="flex items-start gap-3 cursor-pointer group mt-2">
              <div className="relative mt-0.5">
                <input type="checkbox" className="sr-only" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
                <div className={`w-4 h-4 rounded border transition-colors flex items-center justify-center
                                 ${agreed ? 'bg-gold border-gold' : 'border-noir-300 bg-noir-700 group-hover:border-gold/50'}`}>
                  {agreed && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#0a0a0c" strokeWidth="1.5" strokeLinecap="round" /></svg>}
                </div>
              </div>
              <span className="text-xs text-ink-secondary leading-relaxed">
                I agree to SecureBank's <span className="text-gold">Terms of Service</span> and <span className="text-gold">Privacy Policy</span>
              </span>
            </label>

            <button type="submit" disabled={loading || !agreed}
              className="w-full py-3.5 bg-gold text-noir-900 font-semibold rounded-xl text-sm
                         hover:bg-gold-light transition-all duration-150 hover:-translate-y-px
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none mt-2">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-noir-900/30 border-t-noir-900 animate-spin" />
                  Creating account…
                </span>
              ) : 'Create Free Account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-ink-secondary">
              Already have an account?{' '}
              <Link to="/login" className="text-gold font-medium hover:underline">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
