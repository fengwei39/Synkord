import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Placeholder from './pages/Placeholder'

// Route guard: redirect to /login if no token is stored
function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('synkord_token')
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export default function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Placeholder title="登录" />} />
        <Route
          path="/home"
          element={
            <RequireAuth>
              <Placeholder title="主界面" />
            </RequireAuth>
          }
        />
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </HashRouter>
  )
}
