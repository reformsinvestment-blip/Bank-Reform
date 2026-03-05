import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const authAPI = {
  register: data => api.post('/auth/register', data),
  login: data => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  updateProfile: data => api.put('/auth/profile', data),
  changePassword: data => api.put('/auth/change-password', data),
  forgotPassword: data => api.post('/auth/forgot-password', data),
  logout: () => api.post('/auth/logout'),
}

export const accountsAPI = {
  getAll: () => api.get('/accounts'),
  getOne: id => api.get('/accounts/' + id),
  create: data => api.post('/accounts', data),
  getBalance: id => api.get('/accounts/' + id + '/balance'),
  getStats: (id, period) => api.get('/accounts/' + id + '/stats', { params: { period } }),
}

export const transactionsAPI = {
  getAll: params => api.get('/transactions', { params }),
  getOne: id => api.get('/transactions/' + id),
  getCategories: period => api.get('/transactions/stats/categories', { params: { period } }),
  getMonthly: months => api.get('/transactions/stats/monthly', { params: { months } }),
}

export const transfersAPI = {
  wire: data => api.post('/transfers/wire', data),
  local: data => api.post('/transfers/local', data),
  international: data => api.post('/transfers/international', data),
  verifyCodes: params => api.get('/transfers/codes/verify', { params }),
  getBeneficiaries: () => api.get('/transfers/beneficiaries'),
  addBeneficiary: data => api.post('/transfers/beneficiaries', data),
  deleteBeneficiary: id => api.delete('/transfers/beneficiaries/' + id),
}

export const cardsAPI = {
  getAll: () => api.get('/cards'),
  getOne: id => api.get('/cards/' + id),
  create: data => api.post('/cards', data),
  freeze: id => api.patch('/cards/' + id + '/freeze'),
  unfreeze: id => api.patch('/cards/' + id + '/unfreeze'),
  setLimit: (id, data) => api.patch('/cards/' + id + '/limit', data),
}

export const loansAPI = {
  getAll: () => api.get('/loans'),
  getOne: id => api.get('/loans/' + id),
  apply: data => api.post('/loans/apply', data),
  calculate: params => api.get('/loans/calculate', { params }),
}

export const billsAPI = {
  getProviders: () => api.get('/bills/providers'),
  getAll: () => api.get('/bills'),
  pay: data => api.post('/bills/pay', data),
}

export const cryptoAPI = {
  getPrices: () => api.get('/crypto/prices'),
  getHoldings: () => api.get('/crypto/holdings'),
  buy: data => api.post('/crypto/buy', data),
  sell: data => api.post('/crypto/sell', data),
}

export const depositsAPI = {
  getAll: () => api.get('/deposits'),
  create: data => api.post('/deposits', data),
}

export const notificationsAPI = {
  getAll: params => api.get('/notifications', { params }),
  markRead: id => api.patch('/notifications/' + id + '/read'),
  markAllRead: () => api.patch('/notifications/read-all'),
}

export const statementsAPI = {
  getAll: params => api.get('/statements', { params }),
}

export const supportAPI = {
  create: data => api.post('/support', data),
  getAll: () => api.get('/support'),
}

export default api
