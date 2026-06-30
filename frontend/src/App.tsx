import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import AppLayout from './components/AppLayout';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import APIs from './pages/APIs';
import APIDetail from './pages/APIDetail';
import DataModels from './pages/DataModels';
import DataModelDetail from './pages/DataModelDetail';
import DependencyGraph from './pages/DependencyGraph';
import Members from './pages/Members';
import MCP from './pages/MCP';
import TeamInfo from './pages/TeamInfo';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './api/auth';
import { TeamProvider } from './contexts/TeamContext';
import { ProjectProvider } from './contexts/ProjectContext';
import TeamRequiredRoute from './components/TeamRequiredRoute';
import ProjectRequiredRoute from './components/ProjectRequiredRoute';
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
                <ProjectProvider>
                  <AppLayout />
                </ProjectProvider>
              </TeamProvider>
            </ProtectedRoute>
          }
        >
          {/* 已登录无团队：落到 /teams/new 创建团队引导 */}
          <Route path="teams/new" element={<CreateTeam />} />
          {/* 团队管理子页：团队信息 / 成员与权限 */}
          <Route path="teams/:teamId" element={<TeamRequiredRoute><TeamInfo /></TeamRequiredRoute>} />
          <Route path="members" element={<TeamRequiredRoute><Members /></TeamRequiredRoute>} />
          {/* 项目列表：已登录有团队即可访问；无团队时 TeamRequiredRoute 重定向到 /teams/new */}
          <Route path="projects" element={<TeamRequiredRoute><Projects /></TeamRequiredRoute>} />
          {/* 项目详情：默认 Tab = 项目信息 */}
          <Route path="projects/:projectId" element={<ProjectRequiredRoute><ProjectDetail /></ProjectRequiredRoute>} />
          <Route path="projects/:projectId/apis" element={<ProjectRequiredRoute><APIs /></ProjectRequiredRoute>} />
          <Route path="projects/:projectId/apis/:apiId" element={<ProjectRequiredRoute><APIDetail /></ProjectRequiredRoute>} />
          <Route path="projects/:projectId/models" element={<ProjectRequiredRoute><DataModels /></ProjectRequiredRoute>} />
          <Route path="projects/:projectId/models/:modelId" element={<ProjectRequiredRoute><DataModelDetail /></ProjectRequiredRoute>} />
          <Route path="projects/:projectId/dependencies" element={<ProjectRequiredRoute><DependencyGraph /></ProjectRequiredRoute>} />
          <Route path="projects/:projectId/mcp" element={<ProjectRequiredRoute><MCP /></ProjectRequiredRoute>} />
          {/* 旧入口重定向到 /projects（已登录有团队时） */}
          <Route path="" element={<Navigate to="/projects" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
