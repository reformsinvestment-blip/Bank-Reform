import { createContext, useContext, useState, useEffect } from 'react'
import { authAPI } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // ─── FRESH DATA SYNC (The "Truth" from DB) ───
  const refreshUser = async () => {
    try {
      const res = await authAPI.me()
      const freshUser = res.data.user || res.data.data?.user
      
      if (freshUser) {
        setUser(freshUser)
        localStorage.setItem('user', JSON.stringify(freshUser))
        return freshUser
      }
    } catch (err) {
      console.error("Auth sync failed:", err)
      // FIX: Only logout if the server explicitly rejects the token
      if (err.response?.status === 401) {
        logout()
      }
      return null
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')
    
    if (token && savedUser) {
      // Load local data first for speed
      setUser(JSON.parse(savedUser))
      // Then sync with server immediately to check if KYC was approved/submitted
      refreshUser().finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password })
    const resData = res.data.data || res.data
    const userData = resData.user
    const token = resData.token

    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
    return userData // Return the user so Login.jsx can redirect
  }

  const register = async (data) => {
    const res = await authAPI.register(data)
    const resData = res.data.data || res.data
    const userData = resData.user
    const token = resData.token

    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
    return userData
  }

  const logout = () => {
    // Note: We don't await the backend logout to ensure the UI feels instant
    try { authAPI.logout() } catch {}
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  const updateUser = (data) => {
    const updated = { ...user, ...data }
    setUser(updated)
    localStorage.setItem('user', JSON.stringify(updated))
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)