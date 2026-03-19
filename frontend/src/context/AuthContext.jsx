import { createContext, useContext, useState, useEffect } from 'react'
import { authAPI } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // ─── SYNC WITH DATABASE (THE TRUTH) ───
  const refreshUser = async () => {
    try {
      const res = await authAPI.me()
      // SAFE PARSING: Handles both {user: {}} and {data: {user: {}}}
      const freshUser = res.data.user || res.data.data?.user
      
      if (freshUser) {
        setUser(freshUser)
        localStorage.setItem('user', JSON.stringify(freshUser))
        return freshUser
      }
    } catch (err) {
      console.error("Sync failed:", err.message)
      if (err.response?.status === 401) logout()
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')
    
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch (e) {
        localStorage.removeItem('user')
      }
      // Force background sync so status (KYC approval) is updated instantly
      refreshUser().finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password })
    // Use optional chaining and fallback to prevent crashes
    const resData = res.data.data || res.data
    const userData = resData.user
    const token = resData.token

    if (!userData || !token) throw new Error("Invalid server response")

    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
    return userData
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