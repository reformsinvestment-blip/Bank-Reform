import { Link } from 'react-router-dom'
import {
  Shield, Zap, Globe, TrendingUp, CreditCard, Bitcoin,
  ArrowRight, ChevronRight, Lock, Smartphone, BarChart3,
  CheckCircle2, Star, Users, DollarSign
} from 'lucide-react'

const features = [
  { icon: Shield, title: 'Bank-Grade Security', desc: 'End-to-end encryption, 2FA, and real-time fraud monitoring protect every transaction.' },
  { icon: Globe, title: 'Global Transfers', desc: 'Send money worldwide via local, international, or SWIFT wire transfers in minutes.' },
  { icon: TrendingUp, title: 'Smart Investments', desc: 'Grow your wealth with savings accounts, crypto trading, and investment portfolios.' },
  { icon: CreditCard, title: 'Virtual & Physical Cards', desc: 'Instant card controls — freeze, unfreeze, and set spending limits from your phone.' },
  { icon: Bitcoin, title: 'Crypto Trading', desc: 'Buy and sell BTC, ETH, SOL, and more directly from your bank account.' },
  { icon: BarChart3, title: 'Spending Insights', desc: 'Visualize your spending patterns with monthly breakdowns and category analytics.' },
]

const stats = [
  { icon: Users, value: '2M+', label: 'Active Users' },
  { icon: DollarSign, value: '$50B+', label: 'Processed Monthly' },
  { icon: Globe, value: '180+', label: 'Countries Supported' },
  { icon: Star, value: '4.9/5', label: 'App Store Rating' },
]

const steps = [
  { n: '01', title: 'Create Your Account', desc: 'Sign up in under 2 minutes with just your name and email.' },
  { n: '02', title: 'Verify Your Identity', desc: 'Quick identity verification to keep your account secure.' },
  { n: '03', title: 'Fund Your Account', desc: 'Add funds via bank transfer or deposit to start banking.' },
  { n: '04', title: 'Start Banking', desc: 'Send money, pay bills, invest, and manage your finances.' },
]

const testimonials = [
  { name: 'Sarah M.', role: 'Freelance Designer', text: 'SecureBank completely changed how I manage client payments. International transfers that used to take days now happen instantly.' },
  { name: 'James K.', role: 'Small Business Owner', text: 'The crypto integration is seamless. I can diversify my savings without needing a separate exchange account.' },
  { name: 'Priya L.', role: 'Software Engineer', text: 'The spending analytics helped me save 30% more each month. Best banking app I\'ve ever used.' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-noir-900 font-sans text-ink-primary overflow-x-hidden">

      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-noir-400/50 backdrop-blur-md bg-noir-900/80">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
              <img 
                src="/logo.jpeg" 
                alt="BIFRC Logo" 
                className="h-14 w-auto object-contain rounded-full" 
              />
              <span className="font-display text-2xl tracking-widest text-ink-primary">
                BIFRC
              </span>
              <span className="text-gold text-[10px] align-super">®</span>
            </div>
                      <div className="hidden md:flex items-center gap-8 text-sm text-ink-secondary">
            <a href="#features" className="hover:text-ink-primary transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-ink-primary transition-colors">How it Works</a>
            <a href="#testimonials" className="hover:text-ink-primary transition-colors">Reviews</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login"
              className="hidden sm:inline-flex px-4 py-2 text-sm text-ink-secondary hover:text-ink-primary transition-colors">
              Sign In
            </Link>
            <Link to="/register"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gold text-noir-900 text-sm font-semibold rounded-xl
                         hover:bg-gold-light transition-all duration-150 hover:-translate-y-px">
              Get Started <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
        {/* Background grid */}
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="absolute w-px h-full bg-gradient-to-b from-transparent via-noir-400/30 to-transparent"
                 style={{ left: `${(i + 1) * (100 / 7)}%` }} />
          ))}
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="absolute h-px w-full bg-gradient-to-r from-transparent via-noir-400/30 to-transparent"
                 style={{ top: `${(i + 1) * 25}%` }} />
          ))}
        </div>
        {/* Gold glow orbs */}
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-gold/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/4 w-72 h-72 bg-azure/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-6 py-24 grid lg:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <div className="animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gold/30 bg-gold/10 text-gold text-xs font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
              Now with Crypto Trading
            </div>
            <h1 className="font-display text-6xl lg:text-7xl font-light leading-tight mb-6">
              Banking for the
              <span className="block text-gold italic">modern world</span>
            </h1>
            <p className="text-ink-secondary text-lg leading-relaxed mb-10 max-w-lg">
              SecureBank combines traditional banking security with cutting-edge technology.
              Manage accounts, send money globally, trade crypto, and grow your wealth — all in one place.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/register"
                className="inline-flex items-center gap-2 px-7 py-4 bg-gold text-noir-900 font-semibold rounded-xl
                           hover:bg-gold-light transition-all duration-150 hover:-translate-y-px text-base">
                Open Free Account <ArrowRight size={18} />
              </Link>
              <Link to="/login"
                className="inline-flex items-center gap-2 px-7 py-4 border border-noir-400 text-ink-primary rounded-xl
                           hover:border-noir-300 hover:bg-noir-700 transition-all duration-150 text-base">
                Sign In
              </Link>
            </div>
            <div className="flex items-center gap-6 mt-10 pt-10 border-t border-noir-400">
              {[['No monthly fees', true], ['256-bit encryption', true], ['FDIC insured', true]].map(([text]) => (
                <div key={text} className="flex items-center gap-2 text-sm text-ink-secondary">
                  <CheckCircle2 size={15} className="text-sage flex-shrink-0" />
                  {text}
                </div>
              ))}
            </div>
          </div>

          {/* Right — Mock Dashboard Card */}
          <div className="hidden lg:block relative">
            <div className="absolute inset-0 bg-gradient-to-br from-gold/10 to-azure/10 rounded-3xl blur-2xl" />
            <div className="relative bg-noir-700 border border-noir-400 rounded-3xl p-6 shadow-lg">
              {/* Mini dashboard preview */}
              <div className="flex items-center justify-between mb-5">
                <span className="font-display text-lg text-ink-primary">Dashboard</span>
                <div className="flex gap-1.5">
                  {['bg-crimson/60', 'bg-gold/60', 'bg-sage/60'].map(c => (
                    <div key={c} className={`w-2.5 h-2.5 rounded-full ${c}`} />
                  ))}
                </div>
              </div>
              {/* Balance */}
              <div className="bg-noir-600 border border-noir-400 rounded-2xl p-5 mb-4">
                <p className="text-[11px] uppercase tracking-widest text-ink-muted mb-1">Total Balance</p>
                <p className="font-display text-4xl text-gold font-light">$84,230.50</p>
                <p className="text-xs text-sage mt-1.5">↑ 12.4% this month</p>
              </div>
              {/* Mini account cards */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[['Checking', '$12,450', 'text-azure'], ['Savings', '$48,200', 'text-sage'], ['Investment', '$18,580', 'text-gold'], ['Crypto', '$5,000', 'text-crimson']].map(([type, bal, col]) => (
                  <div key={type} className="bg-noir-600 border border-noir-400 rounded-xl p-3">
                    <p className="text-[10px] text-ink-muted capitalize mb-1">{type}</p>
                    <p className={`font-mono text-sm font-semibold ${col}`}>{bal}</p>
                  </div>
                ))}
              </div>
              {/* Mini transactions */}
              {[['Netflix', '-$15.99', 'out'], ['Salary Deposit', '+$4,200', 'in'], ['Transfer', '-$200', 'out']].map(([desc, amt, dir]) => (
                <div key={desc} className="flex justify-between items-center py-2 border-b border-noir-400 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${dir === 'in' ? 'bg-sage/15 text-sage' : 'bg-crimson/15 text-crimson'}`}>
                      {dir === 'in' ? '↓' : '↑'}
                    </div>
                    <span className="text-xs text-ink-secondary">{desc}</span>
                  </div>
                  <span className={`text-xs font-mono font-medium ${dir === 'in' ? 'text-sage' : 'text-ink-primary'}`}>{amt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="border-y border-noir-400 bg-noir-800/50">
        <div className="max-w-6xl mx-auto px-6 py-16 grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map(({ icon: Icon, value, label }) => (
            <div key={label} className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gold/10 border border-gold/20 text-gold mb-3">
                <Icon size={22} />
              </div>
              <div className="font-display text-4xl font-light text-gold mb-1">{value}</div>
              <div className="text-sm text-ink-secondary">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-28 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-gradient-to-b from-transparent via-noir-400/50 to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-[11px] uppercase tracking-widest text-gold mb-3">Why BIFRC</p>
            <h2 className="font-display text-5xl font-light text-ink-primary mb-4">Everything you need,<br />nothing you don't</h2>
            <p className="text-ink-secondary text-lg max-w-xl mx-auto">A complete financial platform built for clarity, speed, and security.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title}
                className="group bg-noir-700 border border-noir-400 rounded-2xl p-7
                           hover:border-gold/40 hover:bg-gradient-to-br hover:from-noir-700 hover:to-noir-600
                           transition-all duration-200 cursor-default">
                <div className="w-11 h-11 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center text-gold mb-5
                                group-hover:bg-gold/20 transition-colors">
                  <Icon size={20} />
                </div>
                <h3 className="font-display text-xl text-ink-primary mb-2">{title}</h3>
                <p className="text-ink-secondary text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="py-28 bg-noir-800/50 border-y border-noir-400">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-[11px] uppercase tracking-widest text-gold mb-3">Get Started</p>
            <h2 className="font-display text-5xl font-light text-ink-primary mb-4">Up and running<br />in minutes</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map(({ n, title, desc }, i) => (
              <div key={n} className="relative">
                {i < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-gold/30 to-transparent -translate-y-1/2 z-0" />
                )}
                <div className="relative z-10">
                  <div className="w-16 h-16 rounded-2xl border border-gold/30 bg-gold/10 flex items-center justify-center
                                  font-mono text-gold text-lg font-medium mb-5">
                    {n}
                  </div>
                  <h3 className="font-display text-xl text-ink-primary mb-2">{title}</h3>
                  <p className="text-ink-secondary text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-14">
            <Link to="/register"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gold text-noir-900 font-semibold rounded-xl
                         hover:bg-gold-light transition-all duration-150 hover:-translate-y-px text-base">
              Create Free Account <ArrowRight size={18} />
            </Link>
            <p className="text-ink-muted text-sm mt-3">No credit card required · Free forever</p>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section id="testimonials" className="py-28">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-[11px] uppercase tracking-widest text-gold mb-3">Testimonials</p>
            <h2 className="font-display text-5xl font-light text-ink-primary mb-4">Trusted by millions</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map(({ name, role, text }) => (
              <div key={name} className="bg-noir-700 border border-noir-400 rounded-2xl p-7 hover:border-noir-300 transition-colors">
                <div className="flex gap-0.5 mb-5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={14} className="fill-gold text-gold" />
                  ))}
                </div>
                <p className="text-ink-secondary text-sm leading-relaxed mb-6 italic">"{text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gold/15 border border-gold/30 text-gold flex items-center justify-center text-sm font-semibold">
                    {name[0]}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink-primary">{name}</div>
                    <div className="text-[11px] text-ink-muted">{role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-28 border-t border-noir-400 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gold/5 via-transparent to-azure/5 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px]
                        bg-gold/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <h2 className="font-display text-6xl font-light text-ink-primary mb-6">
            Ready to take control<br /><span className="text-gold italic">of your finances?</span>
          </h2>
          <p className="text-ink-secondary text-lg mb-10">
            Join over 2 million people who trust SecureBank with their financial future.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link to="/register"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gold text-noir-900 font-semibold rounded-xl
                         hover:bg-gold-light transition-all duration-150 hover:-translate-y-px text-base">
              Open Free Account <ArrowRight size={18} />
            </Link>
            <Link to="/login"
              className="inline-flex items-center gap-2 px-8 py-4 border border-noir-400 text-ink-primary rounded-xl
                         hover:border-gold/40 hover:bg-noir-700 transition-all duration-150 text-base">
              Already have an account? <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-noir-400 bg-noir-800">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img 
                src="/logo.jpeg" 
                alt="BIFRC Logo" 
                className="h-14 w-auto object-contain rounded-full" 
              />
              <span className="font-display text-2xl tracking-widest text-ink-primary">
                BIFRC
              </span>
              <span className="text-gold text-[10px] align-super">®</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <Lock size={12} /> <span>256-bit SSL Encryption</span>
            <span>·</span>
            <Smartphone size={12} /> <span>Available on iOS & Android</span>
            <span>·</span>
            <Shield size={12} /> <span>FDIC Insured</span>
          </div>
          <p className="text-xs text-ink-muted">© {new Date().getFullYear()} SecureBank. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
