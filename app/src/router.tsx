import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import OnboardingPage from './pages/OnboardingPage'
import OverlayPage from './pages/OverlayPage'
import NotificationsPage from './pages/NotificationsPage'
import { getToken } from './lib/api'

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export default function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/onboarding"
          element={<RequireAuth><OnboardingPage /></RequireAuth>}
        />
        <Route
          path="/home"
          element={<RequireAuth><HomePage /></RequireAuth>}
        />
        <Route
          path="/notifications"
          element={<RequireAuth><NotificationsPage /></RequireAuth>}
        />
        {/* Overlay window route — renders floating panel */}
        <Route path="/overlay" element={<OverlayPage />} />
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </HashRouter>
  )
}
