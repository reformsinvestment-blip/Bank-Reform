import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'

// --- Public Pages ---
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'

// --- User Pages ---
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import Transactions from './pages/Transactions'
import Transfers from './pages/Transfers'
import Cards from './pages/Cards'
import Loans from './pages/Loans'
import Bills from './pages/Bills'
import Crypto from './pages/Crypto'
import Notifications from './pages/Notifications'
import Profile from './pages/Profile'
import Support from './pages/Support'
import Deposit from './pages/Deposit'
import Withdraw from './pages/Withdraw'
import KYC from './pages/KYC' 

// --- Admin Pages ---
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminUsers from './pages/admin/AdminUsers'
import AdminApprovals from './pages/admin/AdminApprovals'

function SplashLoader() {
  return (
    <div className="flex items-center justify-center h-screen bg-noir-900">
      <div className="text-center">
        <div className="font-display text-3xl text-gold tracking-widest mb-5">BIFRC </div>
        <div className="w-8 h-8 rounded-full border-2 border-noir-400 border-t-gold animate-spin mx-auto" />
      </div>
    </div>
  )
}

/**
 * PublicOnly: Prevents logged-in users from seeing Login/Register
 */
function PublicOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <SplashLoader />
  
  if (user) {
    // If Admin, go to admin dashboard, else check KYC status
    if (user.role === 'admin') return <Navigate to="/admin" replace />
    return <Navigate to={user.status === 'active' ? "/dashboard" : "/kyc"} replace />
  }
  return children
}

/**
 * PrivateLayout: The Gatekeeper
 */
function PrivateLayout() {
  const { user, loading } = useAuth()
  const path = window.location.pathname

  if (loading) return <SplashLoader />
  if (!user) return <Navigate to="/login" replace />

  // --- User Gatekeeping ---
  if (user.role !== 'admin') {
    // Force unverified users to KYC page
    if (user.status !== 'active' && path !== '/kyc') {
      return <Navigate to="/kyc" replace />
    }
    // Prevent verified users from seeing KYC page
    if (user.status === 'active' && path === '/kyc') {
      return <Navigate to="/dashboard" replace />
    }
  }

  return <Layout />
}

/**
 * AdminGuard: Extra layer to ensure only admins see admin pages
 */
function AdminGuard({ children }) {
  const { user } = useAuth()
  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1c1c24',
              color: '#f0ede8',
              border: '1px solid #2a2a38',
              fontFamily: '"DM Sans", sans-serif',
              fontSize: '14px',
              borderRadius: '12px',
            },
            success: { iconTheme: { primary: '#4caf82', secondary: '#0a0a0c' } },
            error:   { iconTheme: { primary: '#e05c5c', secondary: '#0a0a0c' } },
          }}
        />
        <Routes>
          {/* ── Public routes ── */}
          <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />

          {/* ── Protected App ── */}
          <Route element={<PrivateLayout />}>
            
            {/* Verification Page */}
            <Route path="/kyc" element={<KYC />} />

            {/* Standard User Routes */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/deposits" element={<Deposit />} />
            <Route path="/withdraw" element={<Withdraw />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/transfers" element={<Transfers />} />
            <Route path="/cards" element={<Cards />} />
            <Route path="/loans" element={<Loans />} />
            <Route path="/bills" element={<Bills />} />
            <Route path="/crypto" element={<Crypto />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/support" element={<Support />} />

            {/* Admin Specific Routes */}
            <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
            <Route path="/admin/users" element={<AdminGuard><AdminUsers /></AdminGuard>} />
            <Route path="/admin/kyc" element={<AdminGuard><AdminApprovals /></AdminGuard>} />
            
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}