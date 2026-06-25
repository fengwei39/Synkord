import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Button, Tooltip } from 'antd';
import {
  ApiOutlined,
  ApartmentOutlined,
  BellOutlined,
  BorderOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  CompassOutlined,
  DashboardOutlined,
  DiffOutlined,
  HistoryOutlined,
  HomeOutlined,
  MinusOutlined,
  MoreOutlined,
  NodeIndexOutlined,
  ProjectOutlined,
  PushpinOutlined,
  SettingOutlined,
  SyncOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useAuth } from '../api/auth';

const primaryNav = [
  { key: '/', icon: <DashboardOutlined />, label: '工作台' },
  { key: '/projects', icon: <ProjectOutlined />, label: '项目空间' },
  { key: '/apis', icon: <ApiOutlined />, label: 'API 规范' },
  { key: '/entities', icon: <ApartmentOutlined />, label: '实体模型' },
  { key: '/dependencies', icon: <NodeIndexOutlined />, label: '依赖拓扑' },
  { key: '/diff', icon: <DiffOutlined />, label: '变更检测' },
  { key: '/changesets', icon: <HistoryOutlined />, label: '变更记录' },
];

const workspaceLinks = [
  { key: '/projects', icon: <TeamOutlined />, label: '默认工作空间' },
  { key: '/apis', icon: <ApiOutlined />, label: 'API 规范库', hint: 'OpenAPI 资产' },
  { key: '/changesets', icon: <ClockCircleOutlined />, label: '变更记录' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统配置' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const selectedTopKey = location.pathname === '/' ? '/' : '/' + location.pathname.split('/')[1];
  const selectedWorkspaceKey = workspaceLinks.find((item) => selectedTopKey === item.key)?.key || '/projects';

  const handleWindow = (action: 'minimize' | 'maximize' | 'close') => {
    window.synkord?.windowControl(action);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="synkord-shell">
      <header className="synkord-titlebar">
        <div className="synkord-brand">
          <div className="synkord-logo-mark">S</div>
          <span>Synkord</span>
        </div>
        <nav className="synkord-top-tabs">
          <button className="synkord-top-tab active" onClick={() => navigate('/')}>
            <HomeOutlined />
            工作台
          </button>
          <button className="synkord-top-tab" onClick={() => navigate('/projects')}>项目空间</button>
          <button className="synkord-top-tab icon-only" aria-label="更多">
            <MoreOutlined />
          </button>
        </nav>
        <div className="synkord-title-actions">
          <Tooltip title="同步">
            <Button type="text" icon={<SyncOutlined />} />
          </Tooltip>
          <Tooltip title="设置">
            <Button type="text" icon={<SettingOutlined />} onClick={() => navigate('/settings')} />
          </Tooltip>
          <Tooltip title="通知">
            <Button type="text" icon={<BellOutlined />} />
          </Tooltip>
          <Avatar size={24} className="synkord-user-avatar">{user?.username?.[0]?.toUpperCase() || 'S'}</Avatar>
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
              <span><TeamOutlined /> 工作空间</span>
              <span className="workspace-caret">▾</span>
            </div>
            <button
              className={selectedWorkspaceKey === '/projects' ? 'workspace-item active' : 'workspace-item'}
              onClick={() => navigate('/projects')}
            >
              默认工作空间
            </button>
            <button className="workspace-item plain" onClick={() => navigate('/apis')}>API 规范库</button>
            <button className="workspace-create">+ 新建空间</button>
          </section>

          <section className="workspace-section separated">
            <div className="workspace-group-label">规范资产</div>
            {workspaceLinks.slice(1).map((item) => (
              <button
                key={item.key}
                className={selectedWorkspaceKey === item.key ? 'workspace-link active' : 'workspace-link'}
                onClick={() => navigate(item.key)}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.hint && <small>{item.hint}</small>}
              </button>
            ))}
          </section>

          <section className="workspace-section separated">
            <div className="workspace-group-label">质量控制</div>
            {primaryNav.slice(2, 7).map((item) => (
              <button
                key={item.key}
                className={selectedTopKey === item.key ? 'workspace-link active' : 'workspace-link'}
                onClick={() => navigate(item.key)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </section>

          <div className="sidebar-footer">
            <button className="org-button" onClick={handleLogout}>
              <CompassOutlined />
              {user?.username || '组织'}
            </button>
          </div>
        </aside>

        <main className="synkord-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
