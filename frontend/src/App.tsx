import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import AppLayout from './components/AppLayout';
import WorkspaceHome from './pages/WorkspaceHome';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import APIs from './pages/APIs';
import APIDetail from './pages/APIDetail';
import DataModels from './pages/Entities';
import DataModelDetail from './pages/DataModelDetail';
import DependencyGraph from './pages/DependencyGraph';
import Members from './pages/Members';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './api/auth';
import { TeamProvider } from './contexts/TeamContext';
import TeamRequiredRoute from './components/TeamRequiredRoute';
import CreateTeam from './pages/CreateTeam';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, bootstrapping } = useAuth();
  if (bootstrapping) {
    return (
      <div className="route-loading">
        <Spin />
      </div>
    );
  }
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
              <TeamProvider>
                <AppLayout />
              </TeamProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<WorkspaceHome />} />
          <Route path="teams/new" element={<CreateTeam />} />
          <Route path="team" element={<Navigate to="/projects" replace />} />
          <Route path="projects" element={<TeamRequiredRoute><Projects /></TeamRequiredRoute>} />
          <Route path="projects/:projectId" element={<TeamRequiredRoute><ProjectDetail /></TeamRequiredRoute>} />
          <Route path="projects/:projectId/apis" element={<TeamRequiredRoute><APIs /></TeamRequiredRoute>} />
          <Route path="projects/:projectId/apis/:apiId" element={<TeamRequiredRoute><APIDetail /></TeamRequiredRoute>} />
          <Route path="projects/:projectId/models" element={<TeamRequiredRoute><DataModels /></TeamRequiredRoute>} />
          <Route path="projects/:projectId/models/:modelId" element={<TeamRequiredRoute><DataModelDetail /></TeamRequiredRoute>} />
          <Route path="projects/:projectId/dependencies" element={<TeamRequiredRoute><DependencyGraph /></TeamRequiredRoute>} />
          <Route path="members" element={<TeamRequiredRoute><Members /></TeamRequiredRoute>} />
          <Route path="apis" element={<Navigate to="/projects" replace />} />
          <Route path="models" element={<Navigate to="/projects" replace />} />
          <Route path="dependencies" element={<Navigate to="/projects" replace />} />
          <Route path="diff" element={<Navigate to="/projects" replace />} />
          <Route path="changesets" element={<Navigate to="/projects" replace />} />
          <Route path="entities" element={<Navigate to="/projects" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
