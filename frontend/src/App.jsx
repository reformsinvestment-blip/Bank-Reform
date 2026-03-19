import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'

// --- Pages ---
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
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
import KYCPending from './pages/KYCPending' 

// --- Admin ---
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminUsers from './pages/admin/AdminUsers'
import AdminApprovals from './pages/admin/AdminApprovals'
import AdminReview from './pages/admin/AdminReview'

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

function PublicOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <SplashLoader />
  if (user) {
    if (user.role === 'admin') return <Navigate to="/admin" replace />
    const isPending = user.status === 'pending_review' || user.kycStatus === 'pending_review';
    return <Navigate to={user.status === 'active' ? "/dashboard" : (isPending ? "/kyc-pending" : "/kyc")} replace />
  }
  return children
}

/**
 * THE FIX: Updated PrivateLayout to allow /kyc-pending
 */
function PrivateLayout() {
  const { user, loading } = useAuth()
  const path = window.location.pathname

  if (loading) return <SplashLoader />
  if (!user) return <Navigate to="/login" replace />

  if (user.role !== 'admin') {
    const isPending = user.status === 'pending_review' || user.kycStatus === 'pending_review';
    
    // 1. If Active: Block KYC pages
    if (user.status === 'active' && (path === '/kyc' || path === '/kyc-pending')) {
      return <Navigate to="/dashboard" replace />
    }

    // 2. If Not Active: Only allow KYC flow and basic settings
    // ADDED '/kyc-pending' TO THE ALLOWED LIST BELOW
    const allowed = ['/kyc', '/kyc-pending', '/profile', '/support', '/notifications'];
    if (user.status !== 'active' && !allowed.includes(path)) {
      // Direct them to the correct step based on status
      return <Navigate to={isPending ? "/kyc-pending" : "/kyc"} replace />
    }

    // 3. If Pending and trying to see the form: Push to pending screen
    if (isPending && path === '/kyc') {
      return <Navigate to="/kyc-pending" replace />
    }
  }

  return <Layout />
}

function AdminGuard({ children }) {
  const { user } = useAuth()
  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />

          <Route element={<PrivateLayout />}>
            <Route path="/kyc" element={<KYC />} />
            <Route path="/kyc-pending" element={<KYCPending />} />
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

            <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
            <Route path="/admin/users" element={<AdminGuard><AdminUsers /></AdminGuard>} />
            <Route path="/admin/kyc" element={<AdminGuard><AdminApprovals /></AdminGuard>} />
            <Route path="/admin/review" element={<AdminGuard><AdminReview /></AdminGuard>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}