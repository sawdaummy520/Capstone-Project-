import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api'

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/login', form)
      localStorage.setItem('token', res.data.access_token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      onLogin(res.data.user)
      navigate('/')
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Login failed'
      setError(typeof msg === 'string' ? msg : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 420, margin: '40px auto' }}>
        <h2 style={{ marginBottom: 6 }}>Login</h2>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 22 }}>
          Welcome back to SotorkoBangladesh.
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
            <label>Password</label>
            <input
              required
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          {error && <div className="error">{error}</div>}

          <button className="btn" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 13 }}>
          <Link to="/forgot-password" style={{ color: '#1e3a5f' }}>
            Forgot password?
          </Link>
          <span>
            No account? <Link to="/register" style={{ color: '#1e3a5f' }}>Register</Link>
          </span>
        </div>
      </div>
    </div>
  )
}