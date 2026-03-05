import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'

export default function Profile() {
  const { user, updateUser } = useAuth()
  const [tab, setTab] = useState('info')
  const [form, setForm] = useState({ firstName: user?.firstName || '', lastName: user?.lastName || '', phone: user?.phone || '', address: user?.address || '', city: user?.city || '', country: user?.country || '' })
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [saving, setSaving] = useState(false)

  const saveProfile = async () => {
    setSaving(true)
    try {
      const res = await authAPI.updateProfile(form)
      updateUser(res.data.data.user)
      toast.success('Profile updated!')
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
    finally { setSaving(false) }
  }

  const changePassword = async () => {
    if (pwForm.newPassword !== pwForm.confirm) { toast.error('Passwords do not match'); return }
    setSaving(true)
    try {
      await authAPI.changePassword({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword })
      toast.success('Password changed!')
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' })
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-light text-ink-primary">Profile</h1>
        <p className="text-ink-secondary text-sm mt-1">Manage your personal information</p>
      </div>

      {/* Avatar card */}
      <div className="bg-noir-700 border border-noir-400 rounded-2xl p-6 flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-gold/15 border-2 border-gold text-gold
                        flex items-center justify-center text-2xl font-display flex-shrink-0">
          {user?.firstName?.[0]}{user?.lastName?.[0]}
        </div>
        <div>
          <div className="font-display text-2xl text-ink-primary">{user?.firstName} {user?.lastName}</div>
          <div className="text-sm text-ink-secondary mt-0.5">{user?.email}</div>
          <div className="flex items-center gap-3 mt-1.5">
            {user?.role === 'admin' && <span className="badge-gold">Administrator</span>}
            {user?.isVerified && <span className="badge-green">✓ Verified</span>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-noir-700 border border-noir-400 rounded-xl p-1 w-fit">
        {[['info', 'Personal Info'], ['security', 'Security']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`tab-item ${tab === key ? 'active' : ''}`}>{label}</button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="bg-noir-700 border border-noir-400 rounded-2xl p-7 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">First Name</label>
              <input className="field-input" value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Last Name</label>
              <input className="field-input" value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="field-label">Phone</label>
            <input className="field-input" type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+1 555 000 0000" />
          </div>
          <div>
            <label className="field-label">Address</label>
            <input className="field-input" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Street address" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">City</label>
              <input className="field-input" value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="City" />
            </div>
            <div>
              <label className="field-label">Country</label>
              <input className="field-input" value={form.country} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} placeholder="Country" />
            </div>
          </div>
          <button className="btn-gold" onClick={saveProfile} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      )}

      {tab === 'security' && (
        <div className="bg-noir-700 border border-noir-400 rounded-2xl p-7 space-y-5">
          <h3 className="font-display text-xl text-ink-primary">Change Password</h3>
          <div>
            <label className="field-label">Current Password</label>
            <input className="field-input" type="password" value={pwForm.currentPassword} onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))} />
          </div>
          <div>
            <label className="field-label">New Password</label>
            <input className="field-input" type="password" value={pwForm.newPassword} onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))} placeholder="Min 6 characters" />
          </div>
          <div>
            <label className="field-label">Confirm Password</label>
            <input className="field-input" type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} />
          </div>
          <button className="btn-gold" onClick={changePassword} disabled={saving || !pwForm.currentPassword || !pwForm.newPassword}>
            {saving ? 'Saving…' : 'Update Password'}
          </button>
        </div>
      )}
    </div>
  )
}
