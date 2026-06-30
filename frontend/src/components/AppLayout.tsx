import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Button, Dropdown, Tooltip } from 'antd';
import {
  ApiOutlined,
  ApartmentOutlined,
  BorderOutlined,
  CloseOutlined,
  DatabaseOutlined,
  DownOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  LeftOutlined,
  MinusOutlined,
  PlusOutlined,
  ProjectOutlined,
  PushpinOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useAuth } from '../api/auth';
import { useTeam } from '../contexts/TeamContext';
import { useProject } from '../contexts/ProjectContext';
import { getProject } from '../api/projects';

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { teams, currentTeam, currentTeamId, switchTeam } = useTeam();
  const { currentProjectId, clearCurrentProject } = useProject();
  const [mcpStatus, setMcpStatus] = useState<'enabled' | 'disabled' | 'not_configured'>('not_configured');
  const [projectInSidebar, setProjectInSidebar] = useState<any>(null);

  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const routeProjectId = projectMatch?.[1] || null;
  const inProjectContext = Boolean(routeProjectId);

  useEffect(() => {
    window.synkord?.mcpGetStatus?.()
      .then((status) => setMcpStatus(status?.running ? 'enabled' : (status?.activeProject ? 'disabled' : 'not_configured')))
      .catch(() => setMcpStatus('not_configured'));
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    if (!currentTeamId || !routeProjectId) {
      setProjectInSidebar(null);
      return;
    }
    getProject(currentTeamId, routeProjectId)
      .then((project) => {
        if (!cancelled) setProjectInSidebar(project);
      })
      .catch(() => {
        if (!cancelled) setProjectInSidebar(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTeamId, routeProjectId]);

  const handleWindow = (action: 'minimize' | 'maximize' | 'close') => {
    window.synkord?.windowControl(action);
  };

  const handleSwitchTeam = (teamId: string) => {
    // 切换团队：清空当前项目与 Electron 激活 MCP 项目，跳回 /projects
    switchTeam(teamId);
    clearCurrentProject();
    window.synkord?.mcpSetActiveProject?.(null).catch(() => undefined);
    navigate('/projects');
  };

  const handleLogout = () => {
    // 退出登录：清空所有上下文，跳到 /login
    clearCurrentProject();
    window.synkord?.mcpSetActiveProject?.(null).catch(() => undefined);
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="synkord-shell">
      <header className="synkord-titlebar">
        <div
          className="synkord-brand"
          onClick={() => navigate('/projects')}
          style={{ cursor: 'pointer' }}
        >
          <div className="synkord-logo-mark">S</div>
          <span>Synkord</span>
        </div>

        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              ...teams.map((team) => ({
                key: `team:${team.id}`,
                label: team.name,
              })),
              { type: 'divider' as const },
              { key: 'create-team', icon: <PlusOutlined />, label: '创建团队' },
            ],
            onClick: ({ key }) => {
              if (key === 'create-team') {
                navigate('/teams/new');
                return;
              }
              if (key.startsWith('team:')) {
                handleSwitchTeam(key.slice('team:'.length));
              }
            },
          }}
        >
          <button className="top-team-switcher">
            <TeamOutlined />
            <span>{currentTeam?.name || '选择团队'}</span>
            <DownOutlined />
          </button>
        </Dropdown>

        <div className="synkord-title-actions" style={{ marginLeft: 'auto' }}>
          <Tooltip title="当前激活项目（只读）">
            <span className="active-project-chip">
              {currentProjectId ? `项目 ${currentProjectId.slice(0, 6)}` : '未激活项目'}
            </span>
          </Tooltip>
          <Tooltip title="本地 MCP 服务状态">
            <button
              className={`mcp-status-chip ${mcpStatus}`}
              onClick={() => currentTeamId ? navigate('/projects') : navigate('/teams/new')}
            >
              <SafetyCertificateOutlined />
              {mcpStatusLabel[mcpStatus]}
            </button>
          </Tooltip>
          <Tooltip title="刷新">
            <Button type="text" icon={<SyncOutlined />} onClick={() => window.location.reload()} />
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                { key: 'user', label: user?.username || '当前用户', disabled: true },
                { key: 'profile', label: '个人信息' },
                { type: 'divider' },
                { key: 'logout', label: '退出登录', danger: true },
              ],
              onClick: ({ key }) => {
                if (key === 'logout') handleLogout();
              },
            }}
            trigger={['click']}
          >
            <Avatar size={24} className="synkord-user-avatar">{user?.username?.[0]?.toUpperCase() || 'S'}</Avatar>
          </Dropdown>
          <Tooltip title="置顶">
            <Button type="text" icon={<PushpinOutlined />} />
          </Tooltip>
          <Button type="text" className="window-button" icon={<MinusOutlined />} onClick={() => handleWindow('minimize')} />
          <Button type="text" className="window-button" icon={<BorderOutlined />} onClick={() => handleWindow('maximize')} />
          <Button type="text" className="window-button close" icon={<CloseOutlined />} onClick={() => handleWindow('close')} />
        </div>
      </header>

      <div className="synkord-body">
        <aside className="synkord-sidebar">
          {inProjectContext && routeProjectId ? (
            <ProjectSidebar
              projectId={routeProjectId}
              project={projectInSidebar}
              locationPath={location.pathname}
              onNavigate={navigate}
            />
          ) : (
            <TeamSidebar
              currentTeamName={currentTeam?.name || '当前团队'}
              currentTeamId={currentTeamId}
              locationPath={location.pathname}
              onNavigate={navigate}
            />
          )}
        </aside>

        <main className="synkord-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function TeamSidebar({
  currentTeamName,
  currentTeamId,
  locationPath,
  onNavigate,
}: {
  currentTeamName: string;
  currentTeamId: string | null;
  locationPath: string;
  onNavigate: (path: string) => void;
}) {
  const projectMgmtActive = locationPath === '/projects';
  const teamMgmtActive = locationPath.startsWith('/members') || locationPath.startsWith('/teams/');

  return (
    <section className="workspace-section">
      <div className="workspace-title">
        <span><TeamOutlined /> {currentTeamName}</span>
      </div>
      <button
        className={projectMgmtActive ? 'workspace-link active' : 'workspace-link'}
        onClick={() => onNavigate('/projects')}
      >
        <ProjectOutlined />
        <span>项目管理</span>
      </button>
      <button
        className={teamMgmtActive ? 'workspace-link active' : 'workspace-link'}
        onClick={() => onNavigate('/members')}
      >
        <TeamOutlined />
        <span>团队管理</span>
      </button>
      {teamMgmtActive && (
        <div className="submenu">
          <button
            className={locationPath.startsWith('/teams/') ? 'submenu-item active' : 'submenu-item'}
            onClick={() => currentTeamId && onNavigate(`/teams/${currentTeamId}`)}
            disabled={!currentTeamId}
          >
            团队信息
          </button>
          <button
            className={locationPath === '/members' ? 'submenu-item active' : 'submenu-item'}
            onClick={() => onNavigate('/members')}
          >
            成员与权限
          </button>
        </div>
      )}
    </section>
  );
}

function ProjectSidebar({
  projectId,
  project,
  locationPath,
  onNavigate,
}: {
  projectId: string;
  project: any;
  locationPath: string;
  onNavigate: (path: string) => void;
}) {
  const isActive = (section: 'info' | 'apis' | 'models' | 'dependencies' | 'mcp') => {
    if (section === 'info') return locationPath === `/projects/${projectId}`;
    return locationPath.startsWith(`/projects/${projectId}/${section}`);
  };

  return (
    <section className="workspace-section project-sidebar-section">
      <button className="project-back-link" onClick={() => onNavigate('/projects')}>
        <LeftOutlined /> 返回项目列表
      </button>

      <div className="project-sidebar-header">
        <div className="project-sidebar-title">{project?.name || '当前项目'}</div>
        <div className="project-sidebar-meta">{projectTypeLabels[project?.project_type] || project?.project_type || '项目'}</div>
      </div>

      <button
        className={isActive('info') ? 'workspace-link active' : 'workspace-link'}
        onClick={() => onNavigate(`/projects/${projectId}`)}
      >
        <InfoCircleOutlined />
        <span>项目信息</span>
      </button>
      <button
        className={isActive('apis') ? 'workspace-link active' : 'workspace-link'}
        onClick={() => onNavigate(`/projects/${projectId}/apis`)}
      >
        <ApiOutlined />
        <span>接口管理</span>
      </button>
      <button
        className={isActive('models') ? 'workspace-link active' : 'workspace-link'}
        onClick={() => onNavigate(`/projects/${projectId}/models`)}
      >
        <DatabaseOutlined />
        <span>数据模型</span>
      </button>
      <button
        className={isActive('dependencies') ? 'workspace-link active' : 'workspace-link'}
        onClick={() => onNavigate(`/projects/${projectId}/dependencies`)}
      >
        <ApartmentOutlined />
        <span>依赖拓扑</span>
      </button>
      <button
        className={isActive('mcp') ? 'workspace-link active' : 'workspace-link'}
        onClick={() => onNavigate(`/projects/${projectId}/mcp`)}
      >
        <KeyOutlined />
        <span>MCP</span>
      </button>
    </section>
  );
}

const projectTypeLabels: Record<string, string> = {
  backend: '后端服务',
  web: 'Web 前端',
  app: 'App 移动端',
};

const mcpStatusLabel: Record<string, string> = {
  enabled: 'MCP 运行中',
  disabled: 'MCP 已停止',
  not_configured: 'MCP 未激活',
};
