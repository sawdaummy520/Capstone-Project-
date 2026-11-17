import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

const DISTRICTS = [
  'Dhaka', 'Chattogram', 'Rajshahi', 'Khulna', 'Sylhet', 'Barishal',
  'Rangpur', 'Mymensingh', "Cox's Bazar", 'Gazipur', 'Narayanganj',
  'Tangail', 'Cumilla', 'Bogura', 'Jashore', 'Dinajpur', 'Pabna',
  'Faridpur', 'Noakhali', 'Feni', 'Brahmanbaria', 'Kushtia', 'Jamalpur',
  'Sirajganj', 'Natore', 'Narsingdi', 'Munshiganj', 'Manikganj',
  'Madaripur', 'Gopalganj', 'Shariatpur', 'Rajbari', 'Kishoreganj',
  'Netrokona', 'Sherpur', 'Lalmonirhat', 'Kurigram', 'Gaibandha',
  'Nilphamari', 'Panchagarh', 'Thakurgaon', 'Rangamati', 'Khagrachhari',
  'Bandarban', 'Jhalokati', 'Pirojpur', 'Barguna', 'Bhola',
  'Patuakhali', 'Jhenaidah', 'Magura', 'Narail', 'Satkhira',
  'Bagerhat', 'Chuadanga', 'Meherpur', 'Chapainawabganj', 'Naogaon',
  'Joypurhat', 'Sunamganj', 'Habiganj', 'Moulvibazar',
]

export default function Profile({ user, onUpdate, onLogout }) {
  const [me, setMe] = useState(null)
  const [profileForm, setProfileForm] = useState({ name: '', preferred_district: 'Dhaka' })
  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' })
  const [pwdMsg, setPwdMsg] = useState({ type: '', text: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    api.get('/auth/me')
      .then((r) => {
        setMe(r.data)
        setProfileForm({
          name: r.data.name || '',
          preferred_district: r.data.preferred_district || 'Dhaka',
        })
      })
      .catch(() => {})
  }, [user])

  if (!user) {
    return (
      <div className="page">
        <div className="guest-block">
          <div className="lock-icon">👤</div>
          <h2>Login Required</h2>
          <p>Your profile is available only to logged-in users.</p>
          <Link to="/login" className="btn">Login</Link>
        </div>
      </div>
    )
  }

  const saveProfile = async (e) => {
    e.preventDefault()
    setProfileMsg({ type: '', text: '' })
    setBusy(true)
    try {
      const res = await api.put('/auth/profile', profileForm)
      setMe(res.data)
      onUpdate(res.data)
      setProfileMsg({ type: 'success', text: 'Profile updated successfully' })
    } catch (err) {
      setProfileMsg({ type: 'error', text: err?.response?.data?.detail || 'Failed to update' })
    } finally {
      setBusy(false)
    }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    setPwdMsg({ type: '', text: '' })
    if (pwdForm.new_password !== pwdForm.confirm) {
      setPwdMsg({ type: 'error', text: 'New passwords do not match' })
      return
    }
    if (pwdForm.new_password.length < 6) {
      setPwdMsg({ type: 'error', text: 'Password must be at least 6 characters' })
      return
    }
    setBusy(true)
    try {
      await api.put('/auth/password', {
        current_password: pwdForm.current_password,
        new_password: pwdForm.new_password,
      })
      setPwdMsg({ type: 'success', text: 'Password changed successfully' })
      setPwdForm({ current_password: '', new_password: '', confirm: '' })
    } catch (err) {
      setPwdMsg({ type: 'error', text: err?.response?.data?.detail || 'Failed to change password' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'linear-gradient(135deg, #1e3a5f, #3a6a9a)',
              color: 'white', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 24, fontWeight: 700,
            }}>
              {(me?.name || user.name || '?')[0].toUpperCase()}
            </div>
            <div>
              <h2 style={{ marginBottom: 2 }}>{me?.name || user.name}</h2>
              <div style={{ fontSize: 13, color: '#718096' }}>
                {me?.email || user.email}
                {me?.preferred_district && <span> · {me.preferred_district}</span>}
              </div>
            </div>
          </div>
          <button className="btn-danger btn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Update Profile</h3>
          <form onSubmit={saveProfile}>
            <div className="form-group">
              <label>Name</label>
              <input
                required
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Preferred District</label>
              <select
                value={profileForm.preferred_district}
                onChange={(e) => setProfileForm({ ...profileForm, preferred_district: e.target.value })}
              >
                {DISTRICTS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            {profileMsg.text && (
              <div className={profileMsg.type === 'error' ? 'error' : 'success'}>
                {profileMsg.text}
              </div>
            )}
            <button className="btn" disabled={busy} style={{ marginTop: 8 }}>
              {busy ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Change Password</h3>
          <form onSubmit={changePassword}>
            <div className="form-group">
              <label>Current Password</label>
              <input
                required
                type="password"
                value={pwdForm.current_password}
                onChange={(e) => setPwdForm({ ...pwdForm, current_password: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>New Password (min 6)</label>
              <input
                required
                type="password"
                minLength={6}
                value={pwdForm.new_password}
                onChange={(e) => setPwdForm({ ...pwdForm, new_password: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                required
                type="password"
                minLength={6}
                value={pwdForm.confirm}
                onChange={(e) => setPwdForm({ ...pwdForm, confirm: e.target.value })}
              />
            </div>
            {pwdMsg.text && (
              <div className={pwdMsg.type === 'error' ? 'error' : 'success'}>
                {pwdMsg.text}
              </div>
            )}
            <button className="btn" disabled={busy} style={{ marginTop: 8 }}>
              {busy ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}