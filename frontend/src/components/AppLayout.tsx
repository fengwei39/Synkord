import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, theme } from 'antd';
import {
  DashboardOutlined,
  ProjectOutlined,
  ApiOutlined,
  ApartmentOutlined,
  NodeIndexOutlined,
  DiffOutlined,
  HistoryOutlined,
  SettingOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { useAuth } from '../api/auth';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '概览' },
  { key: '/projects', icon: <ProjectOutlined />, label: '项目管理' },
  { key: '/apis', icon: <ApiOutlined />, label: 'API 管理' },
  { key: '/entities', icon: <ApartmentOutlined />, label: '实体管理' },
  { key: '/dependencies', icon: <NodeIndexOutlined />, label: '依赖拓扑' },
  { key: '/diff', icon: <DiffOutlined />, label: '变更检测' },
  { key: '/changesets', icon: <HistoryOutlined />, label: '变更历史' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { token: themeToken } = theme.useToken();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const selectedKey = location.pathname === '/' ? '/' : '/' + location.pathname.split('/')[1];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        style={{ background: themeToken.colorBgContainer }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid ' + themeToken.colorBorderSecondary,
          }}
        >
          <span style={{ fontSize: collapsed ? 16 : 20, fontWeight: 700, color: themeToken.colorPrimary }}>
            {collapsed ? 'S' : 'Synkord'}
          </span>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 'none' }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: themeToken.colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid ' + themeToken.colorBorderSecondary,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ color: themeToken.colorTextSecondary }}>
              {user?.username} ({user?.role === 'admin' ? '管理员' : user?.role === 'editor' ? '编辑者' : '只读者'})
            </span>
            <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
              退出
            </Button>
          </div>
        </Header>
        <Content
          style={{
            margin: 24,
            padding: 24,
            background: themeToken.colorBgContainer,
            borderRadius: themeToken.borderRadius,
            minHeight: 280,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
