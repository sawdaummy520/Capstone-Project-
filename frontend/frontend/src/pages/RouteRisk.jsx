import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Marker } from 'react-leaflet'
import L from 'leaflet'
import api from '../api'

const RISK_COLOR = {
  Critical: '#b71c1c',
  High: '#d32f2f',
  Medium: '#f57c00',
  Low: '#388e3c',
}

// Custom icon for route endpoints (start/end)
const makeIcon = (label, color) =>
  L.divIcon({
    className: 'route-endpoint-icon',
    html: `<div style="background:${color};color:white;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })

export default function RouteRisk({ user }) {
  const [districts, setDistricts] = useState([])
  const [fromD, setFromD] = useState('Dhaka')
  const [toD, setToD] = useState('Sylhet')
  const [radius, setRadius] = useState(10)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    api.get('/filter-options')
      .then((r) => setDistricts(r.data.districts || []))
      .catch(() => {})
  }, [user])

  if (!user) {
    return (
      <div className="page">
        <div className="guest-block">
          <div className="lock-icon">🛣️</div>
          <h2>Login Required</h2>
          <p>Route risk analysis is available to registered users only.</p>
          <Link to="/login" className="btn">Login to Continue</Link>
        </div>
      </div>
    )
  }

  const analyze = async (e) => {
    e.preventDefault()
    if (fromD === toD) {
      setError('From and To must be different districts')
      return
    }
    setError('')
    setLoading(true)
    setResult(null)
    try {
      const res = await api.post('/route-risk', {
        from_district: fromD,
        to_district: toD,
        samples: 25,
        radius_km: radius,
      })
      setResult(res.data)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to analyze route')
    } finally {
      setLoading(false)
    }
  }

  const center = result
    ? [(result.from_coords.lat + result.to_coords.lat) / 2,
       (result.from_coords.lon + result.to_coords.lon) / 2]
    : [23.8103, 90.4125]

  return (
    <div className="page">
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginBottom: 6 }}>🛣️ Route Risk Analysis</h2>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
          See how accident risk changes along a route between two districts.
          Risk is computed from accidents within <b>{radius} km</b> of the straight-line path.
        </p>

        <form onSubmit={analyze}>
          <div className="form-grid-3">
            <div className="form-group">
              <label>From District</label>
              <select value={fromD} onChange={(e) => setFromD(e.target.value)}>
                {districts.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>To District</label>
              <select value={toD} onChange={(e) => setToD(e.target.value)}>
                {districts.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Corridor radius ({radius} km)</label>
              <input
                type="range"
                min="5" max="30" step="1"
                value={radius}
                onChange={(e) => setRadius(parseInt(e.target.value))}
              />
            </div>
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Analyzing...' : 'Analyze Route Risk'}
          </button>
        </form>
      </div>

      {result && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 12 }}>
              {result.from_district} → {result.to_district}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {[
                { label: 'Distance', value: `${result.distance_km} km`, color: '#1e3a5f' },
                { label: 'Overall Risk', value: `${result.overall_risk_score}/100`, color: RISK_COLOR[result.overall_risk_level] },
                { label: 'Risk Level', value: result.overall_risk_level, color: RISK_COLOR[result.overall_risk_level] },
                { label: 'High-Risk Segments', value: result.high_risk_segment_count, color: '#d32f2f' },
                { label: 'Accidents in Corridor', value: result.total_accidents_in_corridor, color: '#7b1fa2' },
              ].map((s, i) => (
                <div key={i} style={{
                  padding: 14, background: '#f7fafc', borderRadius: 10,
                  borderLeft: `3px solid ${s.color}`,
                }}>
                  <div style={{ fontSize: 11, color: '#718096', textTransform: 'uppercase', fontWeight: 600 }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color, marginTop: 4 }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Route on Map</h3>
            <div style={{ height: 480, borderRadius: 12, overflow: 'hidden' }}>
              <MapContainer
                key={`${result.from_district}-${result.to_district}`}
                center={center}
                zoom={8}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Route line */}
                <Polyline
                  positions={result.waypoints.map(w => [w.lat, w.lon])}
                  pathOptions={{ color: '#1e3a5f', weight: 4, opacity: 0.7, dashArray: '8, 4' }}
                />

                {/* Waypoint risk circles */}
                {result.waypoints.map((w, i) => (
                  <CircleMarker
                    key={i}
                    center={[w.lat, w.lon]}
                    radius={7}
                    pathOptions={{
                      color: RISK_COLOR[w.risk_level],
                      fillColor: RISK_COLOR[w.risk_level],
                      fillOpacity: 0.75,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <div style={{ fontSize: 12 }}>
                        <strong>Segment #{w.index + 1}</strong><br />
                        At {w.distance_km} km from start<br />
                        <span style={{
                          display: 'inline-block', padding: '2px 8px',
                          borderRadius: 10, background: RISK_COLOR[w.risk_level],
                          color: 'white', fontSize: 11, fontWeight: 700, marginTop: 4,
                        }}>
                          {w.risk_score}/100 · {w.risk_level}
                        </span>
                        <br />
                        <span style={{ color: '#555', marginTop: 4, display: 'inline-block' }}>
                          {w.nearby_accidents} accidents · {w.nearby_fatalities} deaths
                        </span>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}

                {/* Start marker */}
                <Marker
                  position={[result.from_coords.lat, result.from_coords.lon]}
                  icon={makeIcon('A', '#388e3c')}
                >
                  <Popup><b>Start: {result.from_district}</b></Popup>
                </Marker>

                {/* End marker */}
                <Marker
                  position={[result.to_coords.lat, result.to_coords.lon]}
                  icon={makeIcon('B', '#1e3a5f')}
                >
                  <Popup><b>End: {result.to_district}</b></Popup>
                </Marker>
              </MapContainer>
            </div>

            <div className="legend" style={{ marginTop: 12 }}>
              <span className="legend-pill critical">Critical</span>
              <span className="legend-pill high">High</span>
              <span className="legend-pill medium">Medium</span>
              <span className="legend-pill low">Low</span>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 12 }}>High-Risk Segments</h3>
            {result.high_risk_segments.length === 0 ? (
              <p style={{ fontSize: 13, color: '#718096' }}>
                ✅ No high-risk segments detected on this route.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Distance from Start</th>
                      <th>Risk Score</th>
                      <th>Level</th>
                      <th style={{ textAlign: 'right' }}>Accidents Nearby</th>
                      <th style={{ textAlign: 'right' }}>Deaths Nearby</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.high_risk_segments.map((w) => (
                      <tr key={w.index}>
                        <td>Segment {w.index + 1}</td>
                        <td>{w.distance_km} km</td>
                        <td className="cell-num">{w.risk_score}/100</td>
                        <td>
                          <span style={{
                            padding: '2px 10px', borderRadius: 10,
                            background: RISK_COLOR[w.risk_level],
                            color: 'white', fontSize: 11, fontWeight: 700,
                          }}>
                            {w.risk_level}
                          </span>
                        </td>
                        <td className="cell-num">{w.nearby_accidents}</td>
                        <td className={`cell-num ${w.nearby_fatalities > 0 ? 'cell-deaths' : ''}`}>
                          {w.nearby_fatalities}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ fontSize: 12, color: '#718096', marginTop: 12 }}>
              ⚠️ Route is a straight-line approximation between district centroids. Risk is estimated from historical accidents within {result.radius_km} km of each waypoint.
            </p>
          </div>
        </>
      )}
    </div>
  )
}