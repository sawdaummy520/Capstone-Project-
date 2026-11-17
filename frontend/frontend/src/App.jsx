import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import GuestMap from './pages/GuestMap.jsx'
import Register from './pages/Register.jsx'
import Login from './pages/Login.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import Profile from './pages/Profile.jsx'
import SavedLocations from './pages/SavedLocations.jsx'
import Alerts from './pages/Alerts.jsx'
import Analytics from './pages/Analytics.jsx'
import News from './pages/News.jsx'
import RouteRisk from './pages/RouteRisk.jsx'
import api from './api'

export default function App() {
  const [user, setUser] = useState(null)
  const [unread, setUnread] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (stored) {
      try {
        setUser(JSON.parse(stored))
      } catch (e) {
        localStorage.removeItem('user')
      }
    }
  }, [])

  useEffect(() => {
    if (!user) { setUnread(0); return }
    const fetchUnread = () => {
      api.get('/alerts/unread-count').then((r) => setUnread(r.data.unread || 0)).catch(() => {})
    }
    fetchUnread()
    const timer = setInterval(fetchUnread, 30000)
    return () => clearInterval(timer)
  }, [user])

  const handleLogin = (u) => setUser(u)

  const handleUserUpdate = (u) => {
    setUser(u)
    localStorage.setItem('user', JSON.stringify(u))
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    navigate('/')
  }

  return (
    <>
      <header className="navbar">
        <h1>SotorkoBangladesh</h1>
        <nav className="nav-links">
          <Link to="/">Map</Link>
          {user && <Link to="/route">Route Risk</Link>}
          {user && <Link to="/analytics">Analytics</Link>}
          {user && <Link to="/news">News</Link>}
          {user && <Link to="/locations">My Locations</Link>}
          {user && (
            <Link to="/alerts">
              Alerts{unread > 0 && <span className="nav-badge">{unread}</span>}
            </Link>
          )}
          {user ? (
            <Link to="/profile" className="nav-profile">
              👤 {user.name.split(' ')[0]}
            </Link>
          ) : (
            <>
              <Link to="/login">Login</Link>
              <Link to="/register">Register</Link>
            </>
          )}
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<GuestMap user={user} />} />
        <Route path="/register" element={<Register onLogin={handleLogin} />} />
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/profile" element={<Profile user={user} onUpdate={handleUserUpdate} onLogout={logout} />} />
        <Route path="/locations" element={<SavedLocations user={user} />} />
        <Route path="/alerts" element={<Alerts user={user} />} />
        <Route path="/analytics" element={<Analytics user={user} />} />
        <Route path="/news" element={<News user={user} />} />
        <Route path="/route" element={<RouteRisk user={user} />} />
      </Routes>
    </>
  )
}