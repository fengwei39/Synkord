import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import AppLayout from './components/AppLayout';
import WorkspaceHome from './pages/WorkspaceHome';
import TeamHome from './pages/TeamHome';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import APIs from './pages/APIs';
import APIDetail from './pages/APIDetail';
import DataModels from './pages/Entities';
import DataModelDetail from './pages/DataModelDetail';
import MCPManagement from './pages/MCPManagement';
import DependencyGraph from './pages/DependencyGraph';
import DiffChecker from './pages/DiffChecker';
import ChangeSets from './pages/ChangeSets';
import ChangeSetDetail from './pages/ChangeSetDetail';
import Members from './pages/Members';
import Settings from './pages/Settings';
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
          <Route path="team" element={<TeamRequiredRoute><TeamHome /></TeamRequiredRoute>} />
          <Route path="projects" element={<TeamRequiredRoute><Projects /></TeamRequiredRoute>} />
          <Route path="projects/:projectId" element={<TeamRequiredRoute><ProjectDetail /></TeamRequiredRoute>} />
          <Route path="apis" element={<TeamRequiredRoute><APIs /></TeamRequiredRoute>} />
          <Route path="apis/:apiId" element={<TeamRequiredRoute><APIDetail /></TeamRequiredRoute>} />
          <Route path="models" element={<TeamRequiredRoute><DataModels /></TeamRequiredRoute>} />
          <Route path="models/:modelId" element={<TeamRequiredRoute><DataModelDetail /></TeamRequiredRoute>} />
          <Route path="mcp" element={<TeamRequiredRoute><MCPManagement /></TeamRequiredRoute>} />
          <Route path="dependencies" element={<TeamRequiredRoute><DependencyGraph /></TeamRequiredRoute>} />
          <Route path="diff" element={<TeamRequiredRoute><DiffChecker /></TeamRequiredRoute>} />
          <Route path="changesets" element={<TeamRequiredRoute><ChangeSets /></TeamRequiredRoute>} />
          <Route path="changesets/:changeSetId" element={<TeamRequiredRoute><ChangeSetDetail /></TeamRequiredRoute>} />
          <Route path="members" element={<TeamRequiredRoute><Members /></TeamRequiredRoute>} />
          <Route path="admin/mcp-server" element={<Settings />} />
          <Route path="entities" element={<Navigate to="/models" replace />} />
          <Route path="settings" element={<Navigate to="/admin/mcp-server" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
