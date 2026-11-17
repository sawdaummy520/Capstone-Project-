import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api'

export default function ForgotPassword() {
  const [form, setForm] = useState({ email: '', new_password: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const res = await api.post('/auth/forgot-password', form)
      setSuccess(res.data.message || 'Password reset successfully')
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Failed to reset password'
      setError(typeof msg === 'string' ? msg : 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 480, margin: '40px auto' }}>
        <h2 style={{ marginBottom: 6 }}>Reset Password</h2>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
          Enter your email and a new password. In a production system this would send a reset link — this demo resets directly.
        </p>

        <form onSubmit={submit}>
          <div className="form-group">
            <label>Email</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>New Password (min 6)</label>
            <input
              required
              type="password"
              minLength={6}
              value={form.new_password}
              onChange={(e) => setForm({ ...form, new_password: e.target.value })}
            />
          </div>

          {error && <div className="error">{error}</div>}
          {success && <div className="success">{success}</div>}

          <button className="btn" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>

        <p style={{ fontSize: 13, marginTop: 16, textAlign: 'center' }}>
          Remembered it? <Link to="/login" style={{ color: '#1e3a5f' }}>Back to Login</Link>
        </p>
      </div>
    </div>
  )
}