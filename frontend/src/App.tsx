import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import APIs from './pages/APIs';
import Entities from './pages/Entities';
import DependencyGraph from './pages/DependencyGraph';
import DiffChecker from './pages/DiffChecker';
import ChangeSets from './pages/ChangeSets';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './api/auth';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="apis" element={<APIs />} />
          <Route path="entities" element={<Entities />} />
          <Route path="dependencies" element={<DependencyGraph />} />
          <Route path="diff" element={<DiffChecker />} />
          <Route path="changesets" element={<ChangeSets />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
