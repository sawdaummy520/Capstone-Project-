import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid, LineChart, Line,
} from 'recharts'
import api from '../api'

const COLORS = ['#1e3a5f', '#d32f2f', '#f57c00', '#388e3c', '#7b1fa2', '#0288d1', '#c2185b', '#455a64']
const tooltipStyle = { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }

export default function Analytics({ user }) {
  const [summary, setSummary] = useState(null)
  const [yearly, setYearly] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [types, setTypes] = useState([])
  const [weather, setWeather] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    Promise.all([
      api.get('/stats/summary'),
      api.get('/stats/yearly'),
      api.get('/stats/vehicles'),
      api.get('/stats/accident-types'),
      api.get('/stats/weather'),
    ])
      .then(([s, y, v, t, w]) => {
        setSummary(s.data)
        setYearly(y.data.years || [])
        setVehicles((v.data.vehicles || []).slice(0, 6))
        setTypes((t.data.types || []).slice(0, 6))
        setWeather(w.data.weather || [])
      })
      .catch(() => setError('Could not load analytics'))
      .finally(() => setLoading(false))
  }, [user])

  if (!user) {
    return (
      <div className="page">
        <div className="guest-block">
          <div className="lock-icon">📊</div>
          <h2>Login Required</h2>
          <p>Analytics and risk insights are available to registered users only.</p>
          <Link to="/login" className="btn">Login to Continue</Link>
        </div>
      </div>
    )
  }

  if (loading) return <div className="page">Loading analytics...</div>

  return (
    <div className="page">
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Analytics Dashboard</h2>
        <p style={{ fontSize: 13, color: '#718096', marginTop: 4 }}>
          Accident patterns — combines <b>BUET</b> (46,944 verified) and <b>news</b> records (1,429).
        </p>
        {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

        {summary && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
              marginTop: 16,
            }}
          >
            {[
              { label: 'Total Accidents', value: summary.total_accidents, color: '#1e3a5f' },
              { label: 'Deaths', value: summary.total_fatalities, color: '#d32f2f' },
              { label: 'Injuries', value: summary.total_injuries, color: '#f57c00' },
              { label: 'Real Coordinates', value: summary.with_real_coords, color: '#388e3c' },
              { label: 'BUET Records', value: summary.buet_records, color: '#7b1fa2' },
              { label: 'News Records', value: summary.news_records, color: '#0288d1' },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  padding: 14,
                  background: '#f7fafc',
                  borderRadius: 10,
                  borderLeft: `3px solid ${s.color}`,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: '#718096',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  {s.label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, marginTop: 4 }}>
                  {s.value?.toLocaleString() ?? '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Accidents by Year</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={yearly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="year" fontSize={11} stroke="#718096" />
              <YAxis fontSize={11} stroke="#718096" />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#1e3a5f"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Weather Conditions</h3>
          {weather.length === 0 ? (
            <p style={{ fontSize: 13, color: '#718096' }}>No weather data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weather} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" fontSize={11} stroke="#718096" />
                <YAxis
                  dataKey="weather"
                  type="category"
                  fontSize={11}
                  width={90}
                  stroke="#718096"
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#0288d1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Vehicle Types Involved</h3>
          {vehicles.length === 0 ? (
            <p style={{ fontSize: 13, color: '#718096' }}>
              Vehicle breakdown only covers news data (1,429 records).
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={vehicles}
                  dataKey="count"
                  nameKey="vehicle"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                >
                  {vehicles.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Accident Types</h3>
          {types.length === 0 ? (
            <p style={{ fontSize: 13, color: '#718096' }}>
              Accident-type breakdown only covers news data (1,429 records).
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={types}
                  dataKey="count"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                >
                  {types.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}