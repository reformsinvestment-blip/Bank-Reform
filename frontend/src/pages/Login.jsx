import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!form.email || !form.password) { 
      toast.error('Please fill in all fields')
      return 
    }
    
    setLoading(true)
    try {
      // login function from AuthContext should return the user data
      const userData = await login(form.email, form.password)
      
      toast.success('Welcome back!')

      // ── ROLE-BASED REDIRECTION ──
      if (userData.role === 'admin') {
        // If Admin, go straight to Admin Dashboard
        navigate('/admin')
      } else if (userData.status !== 'active') {
        // If User is not verified, force to KYC
        navigate('/kyc')
      } else {
        // If User is active, go to standard Dashboard
        navigate('/dashboard')
      }

    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || 'Invalid email or password'
      toast.error(msg)
    } finally { 
      setLoading(false) 
    }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    if (!forgotEmail) { toast.error('Enter your email address'); return }
    setForgotLoading(true)
    try {
      await authAPI.forgotPassword({ email: forgotEmail })
      toast.success('Reset link sent — check your inbox!')
      setForgotMode(false)
      setForgotEmail('')
    } catch {
      // Security practice: don't confirm if email exists or not
      toast.success('If an account exists, a reset link has been sent.')
      setForgotMode(false)
    } finally { setForgotLoading(false) }
  }

  return (
    <div className="min-h-screen bg-noir-900 flex overflow-hidden">
      {/* Left panel — branding (Preserved exactly) */}
      <div className="hidden lg:flex flex-col justify-between w-2/5 bg-noir-800 border-r border-noir-400 p-12 relative overflow-hidden">
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full border border-gold/10" />
        <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full border border-gold/10" />
        <div className="absolute top-1/3 -right-24 w-64 h-64 bg-gold/5 rounded-full blur-3xl" />

        <Link to="/" className="flex items-center gap-2 group">
          <img 
            src="/logo.jpeg" 
            alt="BIFRC Logo" 
            className="h-14 w-auto object-contain rounded-full" 
          />
          <span className="font-display text-2xl tracking-widest text-ink-primary">
            BIFRC
          </span>
          <span className="text-gold text-[10px] align-super">®</span>
        </Link>
        
        <div>
          <h2 className="font-display text-5xl font-light text-ink-primary mb-4 leading-tight">
            Your finances,<br /><span className="text-gold italic">secured.</span>
          </h2>
          <p className="text-ink-secondary leading-relaxed">
            Access your accounts, send money globally, and grow your wealth — all from one secure dashboard.
          </p>
          <div className="mt-8 space-y-3">
            {['End-to-end encryption', 'Real-time fraud alerts', 'Global wire transfers', 'Crypto trading built-in'].map(f => (
              <div key={f} className="flex items-center gap-3 text-sm text-ink-secondary">
                <div className="w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-ink-muted">© {new Date().getFullYear()} BIFRC. Secure Banking.</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        <div className="absolute inset-0 pointer-events-none opacity-20">
          {[25, 50, 75].map(p => (
            <div key={p} className="absolute w-px h-full bg-gradient-to-b from-transparent via-noir-400 to-transparent" style={{ left: `${p}%` }} />
          ))}
        </div>

        <div className="w-full max-w-md relative">
          <Link to="/" className="lg:hidden inline-flex items-center gap-2 text-sm text-ink-secondary hover:text-ink-primary transition-colors mb-8">
            <ArrowLeft size={15} /> Back to home
          </Link>

          {!forgotMode ? (
            <>
              <div className="mb-8">
                <h1 className="font-display text-4xl font-light text-ink-primary mb-2">Welcome back</h1>
                <p className="text-ink-secondary text-sm">Sign in to your SecureBank account</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-widest mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
                    <input
                      className="w-full bg-noir-700 border border-noir-400 rounded-xl pl-11 pr-4 py-3.5 text-ink-primary text-sm
                                 outline-none focus:border-gold focus:bg-noir-600 placeholder:text-ink-muted transition-colors"
                      type="email" placeholder="you@example.com"
                      value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                      autoComplete="email" required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-widest">Password</label>
                    <button type="button" onClick={() => setForgotMode(true)}
                      className="text-xs text-gold hover:underline transition-colors">Forgot password?</button>
                  </div>
                  <div className="relative">
                    <Lock size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
                    <input
                      className="w-full bg-noir-700 border border-noir-400 rounded-xl pl-11 pr-12 py-3.5 text-ink-primary text-sm
                                 outline-none focus:border-gold focus:bg-noir-600 placeholder:text-ink-muted transition-colors"
                      type={showPw ? 'text' : 'password'} placeholder="••••••••"
                      value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                      autoComplete="current-password" required
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-primary transition-colors">
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-3.5 bg-gold text-noir-900 font-semibold rounded-xl text-sm
                             hover:bg-gold-light transition-all duration-150 hover:-translate-y-px
                             disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none mt-2">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-noir-900/30 border-t-noir-900 animate-spin" />
                      Authenticating…
                    </span>
                  ) : 'Sign In'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-ink-secondary">
                  Don't have an account?{' '}
                  <Link to="/register" className="text-gold font-medium hover:underline">Create one free</Link>
                </p>
              </div>
            </>
          ) : (
            <>
              <button onClick={() => setForgotMode(false)}
                className="inline-flex items-center gap-2 text-sm text-ink-secondary hover:text-ink-primary transition-colors mb-8">
                <ArrowLeft size={15} /> Back to sign in
              </button>
              <div className="mb-8">
                <h1 className="font-display text-4xl font-light text-ink-primary mb-2">Reset password</h1>
                <p className="text-ink-secondary text-sm">We'll send a reset link to your email.</p>
              </div>
              <form onSubmit={handleForgot} className="space-y-5">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-widest mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
                    <input
                      className="w-full bg-noir-700 border border-noir-400 rounded-xl pl-11 pr-4 py-3.5 text-ink-primary text-sm
                                 outline-none focus:border-gold focus:bg-noir-600 placeholder:text-ink-muted transition-colors"
                      type="email" placeholder="you@example.com"
                      value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required
                    />
                  </div>
                </div>
                <button type="submit" disabled={forgotLoading}
                  className="w-full py-3.5 bg-gold text-noir-900 font-semibold rounded-xl text-sm
                             hover:bg-gold-light transition-all duration-150 disabled:opacity-50">
                  {forgotLoading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}