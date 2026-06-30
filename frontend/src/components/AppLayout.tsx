import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Button, Dropdown, Select, Tooltip } from 'antd';
import {
  BorderOutlined,
  CloseOutlined,
  HomeOutlined,
  MinusOutlined,
  ProjectOutlined,
  PushpinOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useAuth } from '../api/auth';
import { useTeam } from '../contexts/TeamContext';

const workspaceLinks = [
  { key: '/projects', icon: <ProjectOutlined />, label: '项目管理' },
  { key: '/members', icon: <TeamOutlined />, label: '团队管理' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { teams, currentTeam, currentTeamId, switchTeam } = useTeam();
  const [mcpStatus, setMcpStatus] = useState<'enabled' | 'disabled' | 'not_configured'>('not_configured');
  const selectedTopKey = location.pathname === '/' ? '/' : '/' + location.pathname.split('/')[1];
  const selectedWorkspaceKey = workspaceLinks.find((item) => selectedTopKey === item.key)?.key || selectedTopKey;
  const isWorkbenchRoute = selectedTopKey === '/' || selectedTopKey === '/teams';
  const projectSpaceActive = !isWorkbenchRoute;

  useEffect(() => {
    window.synkord?.mcpGetStatus?.()
      .then((status) => setMcpStatus(status?.running ? 'enabled' : (status?.activeProject ? 'disabled' : 'not_configured')))
      .catch(() => setMcpStatus('not_configured'));
  }, [location.pathname]);

  const handleWindow = (action: 'minimize' | 'maximize' | 'close') => {
    window.synkord?.windowControl(action);
  };

  return (
    <div className="synkord-shell">
      <header className="synkord-titlebar">
        <div className="synkord-brand">
          <div className="synkord-logo-mark">S</div>
          <span>Synkord</span>
        </div>
        <nav className="synkord-top-tabs">
          <button className={selectedTopKey === '/' || selectedTopKey === '/teams' ? 'synkord-top-tab active' : 'synkord-top-tab'} onClick={() => navigate('/')}>
            <HomeOutlined />
            工作台
          </button>
          <button className={projectSpaceActive ? 'synkord-top-tab active' : 'synkord-top-tab'} onClick={() => navigate(currentTeam ? '/projects' : '/teams/new')}>
            团队空间
          </button>
        </nav>
        <div className="synkord-title-actions">
          {teams.length > 0 && (
            <Select
              size="small"
              value={currentTeamId || undefined}
              style={{ width: 180 }}
              options={teams.map((team) => ({ value: team.id, label: team.name }))}
              onChange={(teamId) => {
                switchTeam(teamId);
                window.synkord?.mcpSetActiveProject?.(null).catch(() => undefined);
                navigate('/projects');
              }}
            />
          )}
          <Tooltip title="本地 MCP 服务状态">
            <button className={`mcp-status-chip ${mcpStatus}`} onClick={() => navigate(currentTeam ? '/projects' : '/teams/new')}>
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
                { key: 'logout', label: '退出登录' },
              ],
              onClick: ({ key }) => {
                if (key === 'logout') {
                  logout();
                  navigate('/login', { replace: true });
                }
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
          <section className="workspace-section">
            <div className="workspace-title">
              <span><TeamOutlined /> 我的团队</span>
            </div>
            {teams.map((team) => (
              <button
                key={team.id}
                className={currentTeam?.id === team.id ? 'workspace-item active' : 'workspace-item'}
                onClick={() => {
                  switchTeam(team.id);
                  window.synkord?.mcpSetActiveProject?.(null).catch(() => undefined);
                  navigate('/projects');
                }}
              >
                {team.name}
              </button>
            ))}
            <button className="workspace-create" onClick={() => navigate('/teams/new')}>+ 新建团队</button>
          </section>

          {currentTeam && !isWorkbenchRoute && (
            <section className="workspace-section separated">
              {workspaceLinks.map((item) => (
                <button
                  key={item.key}
                  className={selectedWorkspaceKey === item.key ? 'workspace-link active' : 'workspace-link'}
                  onClick={() => navigate(item.key)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </section>
          )}
        </aside>

        <main className="synkord-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const mcpStatusLabel = {
  enabled: 'MCP 运行中',
  disabled: 'MCP 已停止',
  not_configured: 'MCP 未激活',
};
