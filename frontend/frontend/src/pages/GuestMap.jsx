import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import api from '../api'

const DISTRICT_COORDS = {
  Dhaka: [23.8103, 90.4125], Chattogram: [22.3569, 91.7832],
  Rajshahi: [24.3745, 88.6042], Khulna: [22.8456, 89.5403],
  Sylhet: [24.8949, 91.8687], Barishal: [22.7010, 90.3535],
  Rangpur: [25.7439, 89.2752], Mymensingh: [24.7471, 90.4203],
  "Cox's Bazar": [21.4272, 92.0058], Gazipur: [23.9999, 90.4203],
  Narayanganj: [23.6238, 90.4999], Tangail: [24.2513, 89.9167],
  Cumilla: [23.4607, 91.1809], Bogura: [24.8465, 89.3773],
  Jashore: [23.1664, 89.2081], Dinajpur: [25.6217, 88.6354],
  Pabna: [24.0064, 89.2372], Faridpur: [23.6070, 89.8429],
  Noakhali: [22.8696, 91.0995], Feni: [23.0159, 91.3976],
  Brahmanbaria: [23.9571, 91.1115], Kushtia: [23.9013, 89.1206],
  Jamalpur: [24.9375, 89.9372], Sirajganj: [24.4534, 89.7007],
  Natore: [24.4206, 88.9938], Narsingdi: [23.9322, 90.7151],
  Munshiganj: [23.5422, 90.5305], Manikganj: [23.8617, 90.0003],
  Madaripur: [23.1640, 90.1897], Gopalganj: [23.0051, 89.8266],
  Shariatpur: [23.2423, 90.4348], Rajbari: [23.7574, 89.6445],
  Kishoreganj: [24.4449, 90.7766], Netrokona: [24.8103, 90.7279],
  Sherpur: [25.0205, 90.0153], Lalmonirhat: [25.9923, 89.2847],
  Kurigram: [25.8072, 89.6295], Gaibandha: [25.3288, 89.5281],
  Nilphamari: [25.9317, 88.8560], Panchagarh: [26.3411, 88.5541],
  Thakurgaon: [26.0337, 88.4616], Rangamati: [22.6533, 92.1735],
  Khagrachhari: [23.1193, 91.9846], Bandarban: [22.1953, 92.2184],
  Jhalokati: [22.6406, 90.1987], Pirojpur: [22.5841, 89.9720],
  Barguna: [22.0953, 90.1121], Bhola: [22.6859, 90.6482],
  Patuakhali: [22.3596, 90.3298], Jhenaidah: [23.5449, 89.1539],
  Magura: [23.4854, 89.4198], Narail: [23.1725, 89.5127],
  Satkhira: [22.7185, 89.0705], Bagerhat: [22.6516, 89.7859],
  Chuadanga: [23.6401, 88.8418], Meherpur: [23.7622, 88.6318],
  Chapainawabganj: [24.5965, 88.2775], Naogaon: [24.7936, 88.9318],
  Joypurhat: [25.0947, 89.0227], Sunamganj: [25.0658, 91.3950],
  Habiganj: [24.3745, 91.4155], Moulvibazar: [24.4829, 91.7774],
}

const RISK_COLOR = {
  Critical: '#b71c1c',
  High: '#d32f2f',
  Medium: '#f57c00',
  Low: '#388e3c',
}

const GUEST_COLOR = '#94a3b8'

const WEATHER_ICON = {
  Clear: '☀️', Cloudy: '☁️', Rain: '🌧️', 'Heavy rain': '⛈️',
  Fog: '🌫️', Smoke: '💨', Dust: '🌪️', Storm: '⛈️', Other: '🌤️',
}

export default function GuestMap({ user }) {
  const [districts, setDistricts] = useState([])
  const [detail, setDetail] = useState(null)
  const [risk, setRisk] = useState(null)
  const [mlInfo, setMlInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    setDetail(null)
    setRisk(null)
    setMlInfo(null)

    const url = user ? '/districts' : '/public/districts'

    api.get(url)
      .then((res) => setDistricts(res.data.districts || []))
      .catch(() => setError('Could not load map data. Is the backend running?'))
      .finally(() => setLoading(false))

    if (user) {
      api.get('/ml-info')
        .then((r) => setMlInfo(r.data))
        .catch(() => null)
    }
  }, [user])

  const handleClick = async (districtName) => {
    if (!user) return
    setDetail({ district: districtName, loading: true })
    setRisk(null)
    try {
      const [dRes, rRes] = await Promise.all([
        api.get(`/districts/${districtName}`),
        api.get(`/risk/${districtName}`),
      ])
      setDetail(dRes.data)
      setRisk(rRes.data.risk)
    } catch (e) {
      setError('Failed to load district detail')
      setDetail(null)
    }
  }

  if (loading) return <div className="page">Loading map...</div>
  if (error) return <div className="page"><div className="error">{error}</div></div>

  return (
    <div className="page">
      {!user && (
        <div className="hero">
          <h2>🗺️ Road Accident Risk Map of Bangladesh</h2>
          <p>
            Explore district-level accident data from public news reports.
            Register to unlock risk scores, top risk factors, personal alerts, and analytics.
          </p>
          <div className="cta-row">
            <Link to="/register" className="cta">Create Free Account →</Link>
            <Link to="/login" className="cta outline">Login</Link>
          </div>
        </div>
      )}

      {user && mlInfo && mlInfo.model_loaded && (
        <div className="ml-badge">
          🤖 <b>ML Model Active:</b> {mlInfo.metrics?.model_type} ·
          R² {mlInfo.metrics?.r2} · MAE {mlInfo.metrics?.mae} ·
          Trained on {mlInfo.metrics?.trained_on} accidents ·
          {mlInfo.cluster_count} districts clustered
          {mlInfo.metrics?.top_features?.[0] && (
            <div className="ml-sub">
              Top factor: <b>{mlInfo.metrics.top_features[0].label}</b> ({mlInfo.metrics.top_features[0].importance})
            </div>
          )}
        </div>
      )}

      <div className="layout-split">
        <div className="main">
          <div className="card">
            <h2>{user ? 'Road Accident Risk Map' : 'Bangladesh Districts'}</h2>
            <p style={{ fontSize: 13, color: '#718096', marginTop: 4, marginBottom: 16 }}>
              {user
                ? `Click a district to see risk score and detailed breakdown. ${districts.length} districts loaded.`
                : `${districts.length} districts shown. Register to see risk levels and details.`}
            </p>

            <div className="map-container">
              <MapContainer
                center={[23.8103, 90.4125]}
                zoom={7}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {districts.map((d) => {
                  const coords = DISTRICT_COORDS[d.district]
                  if (!coords) return null

                  const isUser = !!user
                  const color = isUser
                    ? (RISK_COLOR[d.risk_level] || '#666')
                    : GUEST_COLOR
                  const radius = isUser
                    ? Math.min(15 + Math.sqrt(d.total_accidents || 0) * 2, 30)
                    : 14

                  return (
                    <CircleMarker
                      key={d.district}
                      center={coords}
                      radius={radius}
                      pathOptions={{
                        color,
                        fillColor: color,
                        fillOpacity: isUser ? 0.55 : 0.45,
                        weight: 2,
                      }}
                      eventHandlers={isUser ? { click: () => handleClick(d.district) } : {}}
                    >
                      <Popup>
                        <strong>{d.district}</strong>
                        {isUser ? (
                          <>
                            <br />
                            {d.total_accidents} accidents · {d.fatalities} deaths
                            <br />
                            Risk: <b>{d.risk_level}</b>
                          </>
                        ) : (
                          <>
                            <br />
                            <span style={{ fontSize: 12, color: '#666' }}>
                              🔒 Register to view risk data
                            </span>
                          </>
                        )}
                      </Popup>
                    </CircleMarker>
                  )
                })}
              </MapContainer>
            </div>

            <div className="legend">
              {user ? (
                <>
                  <span className="legend-pill critical">Critical</span>
                  <span className="legend-pill high">High</span>
                  <span className="legend-pill medium">Medium</span>
                  <span className="legend-pill low">Low</span>
                </>
              ) : (
                <span className="legend-pill guest">District (register to see risk)</span>
              )}
            </div>
          </div>
        </div>

        {user && detail && (
          <div className="side">
            <div className="card">
              <h3>{detail.district}</h3>

              {detail.loading ? (
                <p style={{ fontSize: 13, color: '#666', marginTop: 8 }}>Loading...</p>
              ) : (
                <>
                  {risk && (
                    <>
                      <div
                        className="risk-score"
                        style={{ color: RISK_COLOR[risk.level] || '#333' }}
                      >
                        {risk.score}/100
                      </div>
                      <div className="risk-meta">
                        Risk: <b style={{ color: RISK_COLOR[risk.level] }}>{risk.level}</b>
                        {'  ·  '}
                        Confidence: <b>{risk.confidence}</b>
                      </div>

                      {risk.confidence === 'low' && (
                        <div className="risk-warn">
                          ⚠️ Low data volume. Predictions may be unreliable.
                        </div>
                      )}

                      <h4 style={{ marginBottom: 8 }}>Top Risk Factors</h4>
                      <ul className="factor-list">
                        {risk.factors.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    </>
                  )}

                  <h4 style={{ marginTop: 20, marginBottom: 8 }}>Statistics</h4>
                  <p className="stat-row">
                    {detail.total_accidents} accidents · {detail.fatalities} deaths · {detail.injuries} injuries
                    <br />
                    Coverage: <b>{detail.coverage}</b>
                  </p>

                  {detail.top_weather && detail.top_weather.length > 0 && (
                    <>
                      <h4 style={{ marginTop: 20, marginBottom: 8 }}>Weather Patterns</h4>
                      <ul className="factor-list">
                        {detail.top_weather.map((w, i) => (
                          <li key={i}>
                            {WEATHER_ICON[w.weather] || '🌤️'} {w.weather}: {w.count} accidents
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {detail.top_causes && detail.top_causes.length > 0 && (
                    <>
                      <h4 style={{ marginTop: 20, marginBottom: 8 }}>Common Causes</h4>
                      <ul className="factor-list">
                        {detail.top_causes.map((c, i) => (
                          <li key={i}>{c.cause}: {c.count}</li>
                        ))}
                      </ul>
                    </>
                  )}

                  <h4 style={{ marginTop: 20, marginBottom: 8 }}>Top Upazilas</h4>
                  <ul className="factor-list">
                    {(detail.upazilas || []).slice(0, 5).map((u, i) => (
                      <li key={i}>{u.upazila}: {u.total} accidents</li>
                    ))}
                  </ul>

                  <h4 style={{ marginTop: 20, marginBottom: 8 }}>Top Vehicles</h4>
                  <ul className="factor-list">
                    {(detail.top_vehicles || []).map((v, i) => (
                      <li key={i}>{v.vehicle}: {v.count}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}