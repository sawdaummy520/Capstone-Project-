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

export default function SavedLocations({ user }) {
  const [list, setList] = useState([])
  const [form, setForm] = useState({ label: '', district: 'Dhaka', upazila: '', note: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    try {
      const res = await api.get('/locations')
      setList(res.data)
    } catch {
      setError('Could not load saved locations')
    }
  }

  useEffect(() => {
    if (user) load()
  }, [user])

  if (!user) {
    return (
      <div className="page">
        <div className="guest-block">
          <div className="lock-icon">📍</div>
          <h2>Login Required</h2>
          <p>Save your home, office, or university to receive personalized risk updates and alerts.</p>
          <Link to="/login" className="btn">Login to Continue</Link>
        </div>
      </div>
    )
  }

  const add = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/locations', {
        label: form.label,
        district: form.district,
        upazila: form.upazila || null,
        note: form.note || null,
      })
      setForm({ label: '', district: 'Dhaka', upazila: '', note: '' })
      await load()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to add')
    } finally {
      setLoading(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('Delete this location?')) return
    try {
      await api.delete(`/locations/${id}`)
      await load()
    } catch {
      setError('Failed to delete')
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h2>My Saved Locations</h2>
        <p style={{ fontSize: 13, color: '#718096', marginTop: 4, marginBottom: 20 }}>
          Save districts or upazilas you care about. You'll get alerts when their risk increases.
        </p>

        <form onSubmit={add} style={{ marginBottom: 24 }}>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Label</label>
              <input
                required
                placeholder="Home, Office, University"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>District</label>
              <select
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
              >
                {DISTRICTS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Upazila (optional)</label>
              <input
                placeholder="e.g., Savar"
                value={form.upazila}
                onChange={(e) => setForm({ ...form, upazila: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Note (optional)</label>
              <input
                placeholder="e.g., Daily commute route"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={loading}>
            {loading ? 'Saving...' : 'Add Location'}
          </button>
        </form>

        <h3 style={{ marginTop: 20, marginBottom: 12 }}>
          {list.length} saved location(s)
        </h3>

        {list.length === 0 && (
          <p style={{ fontSize: 13, color: '#718096' }}>No saved locations yet.</p>
        )}

        {list.map((loc) => (
          <div key={loc.id} className="list-item">
            <div>
              <div className="item-title">{loc.label}</div>
              <div className="item-meta">
                {loc.upazila ? `${loc.upazila}, ` : ''}{loc.district}
                {loc.note && <span> · {loc.note}</span>}
              </div>
            </div>
            <button
              onClick={() => remove(loc.id)}
              className="btn-sm danger"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}