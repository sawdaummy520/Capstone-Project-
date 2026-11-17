import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api'

const DISTRICTS = [
  'Dhaka', 'Chattogram', 'Rajshahi', 'Khulna',
  'Sylhet', 'Barishal', 'Rangpur', 'Mymensingh',
]

export default function Register({ onLogin }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    preferred_district: 'Dhaka',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/register', form)
      const res = await api.post('/auth/login', {
        email: form.email,
        password: form.password,
      })
      localStorage.setItem('token', res.data.access_token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      onLogin(res.data.user)
      navigate('/')
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Registration failed'
      setError(typeof msg === 'string' ? msg : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 480, margin: '40px auto' }}>
        <h2 style={{ marginBottom: 6 }}>Create Account</h2>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 22 }}>
          Register to save locations and receive in-app alerts.
        </p>

        <form onSubmit={submit}>
          <div className="form-group">
            <label>Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
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
            <label>Password (min 6 chars)</label>
            <input
              required
              type="password"
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Preferred District</label>
            <select
              value={form.preferred_district}
              onChange={(e) =>
                setForm({ ...form, preferred_district: e.target.value })
              }
            >
              {DISTRICTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>

          {error && <div className="error">{error}</div>}

          <button className="btn" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Creating account...' : 'Register'}
          </button>
        </form>

        <p style={{ fontSize: 13, marginTop: 16, textAlign: 'center' }}>
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  )
}