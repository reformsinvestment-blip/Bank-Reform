import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
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

// Redirect authenticated users away from public routes
function PublicOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <SplashLoader />
  if (user) return <Navigate to="/dashboard" replace />
  return children
}

// Redirect unauthenticated users to login
function PrivateLayout() {
  const { user, loading } = useAuth()
  if (loading) return <SplashLoader />
  if (!user) return <Navigate to="/login" replace />
  return <Layout />
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

          {/* ── Protected app ── */}
          <Route element={<PrivateLayout />}>
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
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
