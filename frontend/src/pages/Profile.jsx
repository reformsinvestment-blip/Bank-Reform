import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'
import { ShieldCheck, RefreshCcw, Eye, EyeOff } from 'lucide-react'

export default function Profile() {
  const { user, updateUser } = useAuth()
  const [tab, setTab] = useState('info')
  const [form, setForm] = useState({ firstName: user?.firstName || '', lastName: user?.lastName || '', phone: user?.phone || '', address: user?.address || '', city: user?.city || '', country: user?.country || '' })
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [saving, setSaving] = useState(false)

  // OTP STATES
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')

  const saveProfile = async () => {
    setSaving(true)
    try {
      const res = await authAPI.updateProfile(form)
      updateUser(res.data.data.user)
      toast.success('Profile updated!')
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
    finally { setSaving(false) }
  }

  const requestOTP = async () => {
    if (!pwForm.currentPassword || !pwForm.newPassword) { toast.error("Enter passwords first"); return }
    if (pwForm.newPassword !== pwForm.confirm) { toast.error("Passwords don't match"); return }

    setSaving(true)
    try {
      await authAPI.requestPasswordOTP()
      setOtpSent(true)
      toast.success('Verification code sent to your email!')
    } catch { toast.error('Failed to send code') }
    finally { setSaving(false) }
  }

  const changePassword = async () => {
    setSaving(true)
    try {
      await authAPI.changePassword({ ...pwForm, code: otpCode })
      toast.success('Password changed successfully!')
      setOtpSent(false)
      setOtpCode('')
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' })
    } catch (err) { toast.error(err.response?.data?.message || 'Invalid code or password') }
    finally { setSaving(false) }
  }
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-light text-ink-primary">Profile</h1>
        <p className="text-ink-secondary text-sm mt-1">Manage your personal information and security</p>
      </div>

      {/* Avatar card (Preserved) */}
      <div className="bg-noir-700 border border-noir-400 rounded-2xl p-6 flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-gold/15 border-2 border-gold text-gold flex items-center justify-center text-2xl font-display uppercase">
          {user?.firstName?.[0]}{user?.lastName?.[0]}
        </div>
        <div>
          <div className="font-display text-2xl text-ink-primary">{user?.firstName} {user?.lastName}</div>
          <div className="text-sm text-ink-secondary mt-0.5">{user?.email}</div>
          <div className="flex items-center gap-2 mt-2">
            <span className="badge-green">Verified Account</span>
          </div>
        </div>
      </div>

      <div className="flex gap-1 bg-noir-700 border border-noir-400 rounded-xl p-1 w-fit">
        {[['info', 'Personal Info'], ['security', 'Security']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`tab-item ${tab === key ? 'active' : ''}`}>{label}</button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="bg-noir-700 border border-noir-400 rounded-2xl p-7 space-y-5 animate-fade-in">
          <div className="grid grid-cols-2 gap-4">
            <input className="field-input" placeholder="First Name" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
            <input className="field-input" placeholder="Last Name" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
          </div>
          <input className="field-input" placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <input className="field-input" placeholder="Street Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
          <button className="btn-gold px-10" onClick={saveProfile} disabled={saving}>{saving ? 'Saving...' : 'Update Profile'}</button>
        </div>
      )}

      {tab === 'security' && (
        <div className="bg-noir-700 border border-noir-400 rounded-2xl p-7 space-y-6 animate-fade-in">
          <div className="space-y-4 max-w-md">
            <h3 className="font-display text-xl text-ink-primary">Change Password</h3>

            {/* Current Password */}
            <div className="relative">
              <input
                className="field-input pr-12"
                type={showCurrent ? 'text' : 'password'}
                placeholder="Current Password"
                value={pwForm.currentPassword}
                onChange={e => setPwForm({ ...pwForm, currentPassword: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted hover:text-gold transition-colors"
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* New Password */}
            <div className="relative">
              <input
                className="field-input pr-12"
                type={showNew ? 'text' : 'password'}
                placeholder="New Password"
                value={pwForm.newPassword}
                onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted hover:text-gold transition-colors"
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Confirm Password */}
            <div className="relative">
              <input
                className="field-input pr-12"
                type={showConfirm ? 'text' : 'password'}
                placeholder="Confirm New Password"
                value={pwForm.confirm}
                onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted hover:text-gold transition-colors"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {otpSent ? (
              <div className="space-y-4 pt-4 border-t border-noir-400 animate-slide-up">
                <label className="text-xs text-gold uppercase tracking-widest font-bold">Enter Email Code</label>
                <input className="field-input border-gold/40 text-center text-xl tracking-widest" placeholder="000000" value={otpCode} onChange={e => setOtpCode(e.target.value)} />
                <button className="btn-gold w-full py-4" onClick={changePassword} disabled={saving}>Confirm Change</button>
              </div>
            ) : (
              <button className="btn-gold w-full py-4" onClick={requestOTP} disabled={saving || !pwForm.newPassword}>
                {saving ? 'Sending Code...' : 'Send Verification Code'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}