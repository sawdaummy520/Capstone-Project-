import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

const PAGE_SIZE = 20

export default function News({ user }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [district, setDistrict] = useState('')
  const [year, setYear] = useState('')
  const [weather, setWeather] = useState('')
  const [options, setOptions] = useState({ districts: [], years: [] })
  const [weatherOptions, setWeatherOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    api.get('/filter-options')
      .then((r) => setOptions(r.data))
      .catch(() => {})
    api.get('/stats/weather')
      .then((r) => setWeatherOptions(r.data.weather || []))
      .catch(() => {})
  }, [user])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE }
        if (district) params.district = district
        if (year) params.year = year
        if (weather) params.weather = weather
        const res = await api.get('/news', { params })
        setItems(res.data.results)
        setTotal(res.data.total)
      } catch (e) {
        setError('Could not load news data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user, page, district, year, weather])

  if (!user) {
    return (
      <div className="page">
        <div className="guest-block">
          <div className="lock-icon">📰</div>
          <h2>Login Required</h2>
          <p>News incident data and source links are available to registered users only.</p>
          <Link to="/login" className="btn">Login to Continue</Link>
        </div>
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="page">
      <div className="card">
        <h2>News Incidents</h2>
        <p style={{ fontSize: 13, color: '#718096', marginTop: 4, marginBottom: 16 }}>
          Read-only list of cleaned road-accident news records with source links, weather and cause.
        </p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
            <label>District</label>
            <select
              value={district}
              onChange={(e) => { setDistrict(e.target.value); setPage(0) }}
            >
              <option value="">All districts</option>
              {(options.districts || []).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 120 }}>
            <label>Year</label>
            <select
              value={year}
              onChange={(e) => { setYear(e.target.value); setPage(0) }}
            >
              <option value="">All years</option>
              {(options.years || []).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
            <label>Weather</label>
            <select
              value={weather}
              onChange={(e) => { setWeather(e.target.value); setPage(0) }}
            >
              <option value="">Any weather</option>
              {weatherOptions.map((w) => (
                <option key={w.weather} value={w.weather}>{w.weather}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        <div style={{ fontSize: 13, color: '#718096', marginBottom: 12 }}>
          Showing {items.length} of {total} records · Page {page + 1} / {totalPages}
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>District</th>
                <th>Title / Type</th>
                <th>Vehicles</th>
                <th>Weather</th>
                <th>Cause</th>
                <th style={{ textAlign: 'right' }}>Deaths</th>
                <th style={{ textAlign: 'right' }}>Injured</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {items.map((n) => (
                <tr key={n.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{n.event_date || '—'}</td>
                  <td>
                    {n.district}
                    {n.upazila && (
                      <div style={{ fontSize: 11, color: '#a0aec0' }}>{n.upazila}</div>
                    )}
                  </td>
                  <td style={{ maxWidth: 240 }}>
                    {n.title ? (
                      <div title={n.title} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.title}
                      </div>
                    ) : null}
                    {n.accident_type && (
                      <div style={{ fontSize: 11, color: '#718096' }}>
                        {n.accident_type}
                      </div>
                    )}
                  </td>
                  <td
                    style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={n.vehicles_involved || ''}
                  >
                    {n.vehicles_involved || '—'}
                  </td>
                  <td>
                    {n.weather_condition ? (
                      <span
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: '#e3f2fd',
                          color: '#1565c0',
                          fontWeight: 500,
                        }}
                      >
                        {n.weather_condition}
                      </span>
                    ) : '—'}
                  </td>
                  <td
                    style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}
                    title={n.cause_of_accident || ''}
                  >
                    {n.cause_of_accident || '—'}
                  </td>
                  <td className={`cell-num ${n.fatalities > 0 ? 'cell-deaths' : ''}`}>
                    {n.fatalities}
                  </td>
                  <td className="cell-num">{n.injuries}</td>
                  <td>
                    {n.source_url ? (
                      <a
                        href={n.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="source-link"
                      >
                        Open ↗
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {items.length === 0 && !loading && (
          <p style={{ fontSize: 13, color: '#718096', marginTop: 12 }}>
            No records match the filter.
          </p>
        )}

        <div className="pagination">
          <button className="btn btn-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
            ← Previous
          </button>
          <span className="page-info">Page {page + 1} / {totalPages}</span>
          <button className="btn btn-secondary" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}