import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard,
  CreditCard,
  ArrowLeftRight,
  Landmark,
  Receipt,
  Bell,
  User,
  LifeBuoy, 
  Bitcoin,
  PiggyBank,
  LogOut,  
  Menu,
  FileText,
  ArrowUpCircle,
  ArrowDownCircle,
  X,
  Lock // Added Lock icon
} from 'lucide-react';

// Added "restricted" property to identify banking features
const nav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', restricted: true },
  { to: '/accounts', icon: Landmark, label: 'Accounts', restricted: true },
  { to: '/transactions', icon: FileText, label: 'Transactions', restricted: true },
  { to: '/transfers', icon: ArrowLeftRight, label: 'Transfers', restricted: true },
  { to: '/cards', icon: CreditCard, label: 'Cards', restricted: true },
  { to: '/loans', icon: PiggyBank, label: 'Loans', restricted: true },
  { to: '/bills', icon: Receipt, label: 'Bills', restricted: true },
  { to: '/crypto', icon: Bitcoin, label: 'Crypto', restricted: true },
  { to: '/deposits', icon: ArrowDownCircle, label: 'Deposit', restricted: true },
  { to: '/withdraw', icon: ArrowUpCircle, label: 'Withdraw', restricted: true },
];

const bottomNav = [
  { to: '/notifications', icon: Bell, label: 'Notifications', restricted: false },
  { to: '/profile', icon: User, label: 'Profile', restricted: false },
  { to: '/support', icon: LifeBuoy, label: 'Support', restricted: false },
]

function NavItem({ to, icon: Icon, label, onClick, disabled }) {
  return (
    <NavLink
      to={disabled ? "#" : to}
      onClick={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        onClick();
      }}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] transition-all duration-150 relative
        ${disabled 
          ? 'opacity-30 grayscale cursor-not-allowed text-ink-muted' 
          : isActive
            ? 'bg-gold/15 text-gold font-medium border border-gold/20'
            : 'text-ink-secondary hover:text-ink-primary hover:bg-noir-600'
        }`
      }
    >
      <Icon size={17} />
      <span>{label}</span>
      {disabled && <Lock size={12} className="ml-auto text-gold/40" />}
    </NavLink>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Logic: Only "active" users can use banking features. 
  // Admins always have access.
  const isVerified = user?.status === 'active' || user?.role === 'admin';

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`

  return (
    <div className="flex h-screen overflow-hidden bg-noir-900">

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:relative top-0 bottom-0 left-0 z-50 w-60 min-w-60
        flex flex-col bg-noir-800 border-r border-noir-400
        transition-transform duration-250 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="px-6 py-7 border-b border-noir-400 flex items-center gap-2">
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

        {/* Main nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
          {nav.map(item => (
            <NavItem 
              key={item.to} 
              {...item} 
              disabled={item.restricted && !isVerified} // APPLY LOCK HERE
              onClick={() => setMobileOpen(false)} 
            />
          ))}
        </nav>

        {/* Bottom nav */}
        <div className="px-3 pb-2 flex flex-col gap-0.5">
          <div className="h-px bg-noir-400 mb-2" />
          {bottomNav.map(item => (
            <NavItem 
              key={item.to} 
              {...item} 
              disabled={item.restricted && !isVerified}
              onClick={() => setMobileOpen(false)} 
            />
          ))}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px]
                       text-crimson hover:bg-crimson/10 transition-all duration-150 w-full text-left"
          >
            <LogOut size={17} />
            <span>Sign Out</span>
          </button>
        </div>

        {/* User pill */}
        <div className="mx-3 mb-4 mt-1 p-3 rounded-xl bg-noir-600 border border-noir-400 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gold/15 border border-gold text-gold
                          flex items-center justify-center text-xs font-semibold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate">{user?.firstName} {user?.lastName}</div>
            <div className={`text-[10px] font-bold uppercase tracking-tighter ${isVerified ? 'text-green-500' : 'text-gold'}`}>
              {isVerified ? 'Verified Account' : 'Verification Required'}
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="md:hidden h-14 bg-noir-800 border-b border-noir-400
                            flex items-center px-5 gap-4 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-ink-primary p-1 rounded-lg hover:bg-noir-600 transition-colors"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="font-display text-xl text-gold tracking-widest">BIFRC</span>
        </header>

        <div className="flex-1 overflow-y-auto p-8 md:p-10">
          <div className="max-w-5xl mx-auto animate-fade-in">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}