import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

const TIME_WINDOWS = [
  { value: 'any', label: 'Any time' },
  { value: 'morning', label: 'Morning (5am-12pm)' },
  { value: 'afternoon', label: 'Afternoon (12pm-5pm)' },
  { value: 'evening', label: 'Evening (5pm-9pm)' },
  { value: 'night', label: 'Night (9pm-5am)' },
]

const RISK_COLOR = {
  Critical: '#b71c1c',
  High: '#d32f2f',
  Medium: '#f57c00',
  Low: '#388e3c',
}

function LevelBadge({ level, score }) {
  const color = RISK_COLOR[level] || '#666'
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 12,
      background: color,
      color: 'white',
      fontSize: 11,
      fontWeight: 700,
    }}>
      {score}/100 · {level}
    </span>
  )
}

export default function Alerts({ user }) {
  const [data, setData] = useState(null)
  const [locations, setLocations] = useState([])
  const [form, setForm] = useState({
    location_id: '',
    threshold: 60,
    time_window: 'any',
    cooldown_hours: 6,
    daily_cap: 3,
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const [dash, locs] = await Promise.all([
        api.get('/alerts/dashboard'),
        api.get('/locations'),
      ])
      setData(dash.data)
      setLocations(locs.data)
      if (locs.data.length > 0 && !form.location_id) {
        setForm((f) => ({ ...f, location_id: locs.data[0].id }))
      }
    } catch (e) {
      setError('Could not load alerts data')
    }
  }

  useEffect(() => {
    if (user) load()
  }, [user])

  if (!user) {
    return (
      <div className="page">
        <div className="guest-block">
          <div className="lock-icon">🔔</div>
          <h2>Login Required</h2>
          <p>Personal alerts are available to registered users. Save locations and set thresholds to get notified.</p>
          <Link to="/login" className="btn">Login to Continue</Link>
        </div>
      </div>
    )
  }

  const createRule = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    if (!form.location_id) {
      setError('Save a location first')
      return
    }
    setBusy(true)
    try {
      await api.post('/alerts/rules', {
        location_id: parseInt(form.location_id),
        threshold: parseInt(form.threshold),
        time_window: form.time_window,
        cooldown_hours: parseInt(form.cooldown_hours),
        daily_cap: parseInt(form.daily_cap),
      })
      setMessage('✅ Alert rule created')
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to create rule')
    } finally {
      setBusy(false)
    }
  }

  const deleteRule = async (id) => {
    if (!confirm('Delete this rule?')) return
    try {
      await api.delete(`/alerts/rules/${id}`)
      await load()
    } catch (e) {
      setError('Failed to delete')
    }
  }

  const toggleRule = async (id) => {
    try {
      await api.post(`/alerts/rules/${id}/toggle`)
      await load()
    } catch (e) {
      setError('Failed to toggle')
    }
  }

  const checkNow = async () => {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      await api.post('/alerts/check-now')
      setMessage('✅ All rules evaluated — new alerts appear below')
      await load()
    } catch (e) {
      setError('Failed to evaluate')
    } finally {
      setBusy(false)
    }
  }

  const demoTrigger = async (ruleId) => {
    setBusy(true)
    try {
      const res = await api.post(`/alerts/demo-trigger/${ruleId}`)
      setMessage(`✅ Demo alert created (score ${res.data.alert.risk_score})`)
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to trigger')
    } finally {
      setBusy(false)
    }
  }

  const markRead = async () => {
    try {
      await api.post('/alerts/mark-read')
      await load()
    } catch (e) {}
  }

  const rules = data?.rules || []
  const alerts = data?.alerts || []
  const spikes = data?.recent_spikes || []
  const unread = data?.unread_count || 0

  return (
    <div className="page">
      {/* How it works */}
      <div className="card" style={{ marginBottom: 16, background: '#eff6ff', borderLeft: '4px solid #1e3a5f' }}>
        <h2 style={{ marginBottom: 6 }}>🔔 Alert System</h2>
        <p style={{ fontSize: 13, color: '#4a5568', lineHeight: 1.6 }}>
          Alerts fire on your saved locations when <b>(a)</b> current risk score exceeds your threshold,
          <b> (b)</b> a recent spike is detected (30-day accident count ≥ 1.5× baseline),
          or you manually trigger a demo. Cooldown and daily cap prevent spam.
        </p>
      </div>

      {/* Summary */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {[
            { label: 'Active Rules', value: rules.filter(r => r.enabled === 1).length, color: '#1e3a5f' },
            { label: 'Total Rules', value: rules.length, color: '#455a64' },
            { label: 'Unread Alerts', value: unread, color: '#d32f2f' },
            { label: 'Districts with Spikes', value: spikes.length, color: '#f57c00' },
          ].map((s, i) => (
            <div key={i} style={{
              padding: 14, background: '#f7fafc', borderRadius: 10,
              borderLeft: `3px solid ${s.color}`,
            }}>
              <div style={{ fontSize: 11, color: '#718096', textTransform: 'uppercase', fontWeight: 600 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color, marginTop: 4 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent spikes */}
      {spikes.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3>🚨 Recent Spikes (last 30 days vs baseline)</h3>
          </div>
          <p style={{ fontSize: 12, color: '#718096', marginBottom: 12 }}>
            Districts where recent accident rate is significantly higher than their yearly average.
          </p>
          {spikes.map((s, i) => (
            <div key={i} style={{
              padding: 10, background: '#fff3e0', borderRadius: 8,
              marginBottom: 8, display: 'flex', justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <strong>{s.district}</strong>
                <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>
                  {s.recent_count} accidents in 30d (expected {s.expected_in_window})
                </span>
              </div>
              <span style={{
                background: '#f57c00', color: 'white', padding: '3px 10px',
                borderRadius: 12, fontSize: 12, fontWeight: 700,
              }}>
                {s.spike_ratio}× spike
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Create rule */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>Create Alert Rule</h3>
        {locations.length === 0 ? (
          <div className="error">
            No saved locations yet. Go to <b>My Locations</b> first and add one.
          </div>
        ) : (
          <form onSubmit={createRule}>
            <div className="form-grid-3">
              <div className="form-group">
                <label>Location</label>
                <select
                  value={form.location_id}
                  onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.label} — {l.district}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Threshold (1-100)</label>
                <input type="number" min="1" max="100" value={form.threshold}
                  onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Time Window</label>
                <select value={form.time_window}
                  onChange={(e) => setForm({ ...form, time_window: e.target.value })}>
                  {TIME_WINDOWS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Cooldown (hours)</label>
                <input type="number" min="1" max="48" value={form.cooldown_hours}
                  onChange={(e) => setForm({ ...form, cooldown_hours: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Daily cap</label>
                <input type="number" min="1" max="10" value={form.daily_cap}
                  onChange={(e) => setForm({ ...form, daily_cap: e.target.value })} />
              </div>
            </div>
            {error && <div className="error">{error}</div>}
            {message && <div className="success">{message}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Creating...' : 'Create Rule'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={checkNow} disabled={busy}>
                Check All Rules Now
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Rules with live status */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>Your Rules ({rules.length})</h3>
        {rules.length === 0 && <p style={{ fontSize: 13, color: '#718096' }}>No rules yet.</p>}

        {rules.map((r) => (
          <div key={r.id} style={{
            padding: 14, border: '1px solid #e2e8f0', borderRadius: 10,
            marginBottom: 12, background: r.enabled === 1 ? 'white' : '#fafafa',
            opacity: r.enabled === 1 ? 1 : 0.65,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>
                  {r.location_label}
                  <span style={{ fontSize: 12, fontWeight: 400, color: '#718096', marginLeft: 6 }}>
                    ({r.location_district}{r.location_upazila ? `, ${r.location_upazila}` : ''})
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#718096' }}>
                  Threshold ≥ {r.threshold} · Cooldown {r.cooldown_hours}h · Cap {r.daily_cap}/day
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <LevelBadge level={r.current_risk_level} score={r.current_risk_score} />
                <button
                  onClick={() => toggleRule(r.id)}
                  className={`btn-sm ${r.enabled === 1 ? 'success' : 'muted'}`}
                >
                  {r.enabled === 1 ? 'ON' : 'OFF'}
                </button>
                <button onClick={() => deleteRule(r.id)} className="btn-sm danger">
                  Delete
                </button>
              </div>
            </div>

            {/* Status row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 12,
                background: r.threshold_met ? '#ffebee' : '#f5f5f5',
                color: r.threshold_met ? '#c62828' : '#666',
                fontWeight: 600,
              }}>
                {r.threshold_met ? '✓' : '○'} Threshold {r.threshold_met ? 'met' : 'not met'}
              </span>
              <span style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 12,
                background: r.spike_met ? '#fff3e0' : '#f5f5f5',
                color: r.spike_met ? '#e65100' : '#666',
                fontWeight: 600,
              }}>
                {r.spike_met ? '🚨' : '○'} {r.spike ? `${r.spike.spike_ratio}× spike` : 'No spike'}
              </span>
              {r.would_fire && (
                <span style={{
                  fontSize: 12, padding: '4px 10px', borderRadius: 12,
                  background: '#e8f5e9', color: '#2e7d32', fontWeight: 700,
                }}>
                  Would fire now
                </span>
              )}
            </div>

            {r.spike && (
              <div style={{ fontSize: 12, color: '#666', marginBottom: 10, padding: 8, background: '#f7fafc', borderRadius: 6 }}>
                <b>Spike data:</b> {r.spike.recent_count} accidents in last 30d · baseline {r.spike.baseline_count} in 365d · expected {r.spike.expected_in_window}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => demoTrigger(r.id)} className="btn btn-secondary btn-sm" disabled={busy}>
                🎬 Demo Trigger
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Alert history */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3>Alert History {unread > 0 && <span className="nav-badge">{unread} new</span>}</h3>
          {unread > 0 && (
            <button onClick={markRead} className="btn btn-secondary btn-sm">
              Mark All Read
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: '#718096', marginBottom: 12 }}>
          ⚠️ Predictive alerts only — not emergency notifications. In an emergency, call local emergency services.
        </p>

        {alerts.length === 0 && (
          <p style={{ fontSize: 13, color: '#718096' }}>No alerts yet.</p>
        )}

        {alerts.map((a) => (
          <div key={a.id} className={`alert-item ${a.is_read ? 'read' : ''}`}>
            <div className="alert-msg">{a.message}</div>
            <div className="alert-meta">
              Score: {a.risk_score}/100 · {new Date(a.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}