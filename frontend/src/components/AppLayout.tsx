// Synkord AppLayout
// 顶级导航：Logo | MCP★ | 契约集 | 设置 | [切换契约集▾] [👤]
// 详见 docs/ui-spec.md §二

import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Button, Dropdown, Tooltip } from 'antd'
import {
  BorderOutlined,
  CloseOutlined,
  DownOutlined,
  MinusOutlined,
  PushpinOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useAuth } from '../api/auth'
import { useContract } from '../contexts/ContractContext'
import { ContractSwitcher } from './ContractSwitcher'
import { McpStatusDot } from './McpStatusDot'

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const { activeContract } = useContract()

  const isMcpActive = location.pathname.startsWith('/mcp')
  const isContractsActive = location.pathname.startsWith('/contracts')
  const isSettingsActive = location.pathname.startsWith('/settings')

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const handleWindow = (action: 'minimize' | 'maximize' | 'close') => {
    window.synkord?.windowControl?.(action)
  }

  const handleLogoClick = () => {
    navigate('/mcp')
  }

  return (
    <div className="synkord-shell">
      <header className="synkord-titlebar">
        {/* Logo */}
        <div
          className="synkord-brand"
          onClick={handleLogoClick}
          style={{ cursor: 'pointer' }}
        >
          <div className="synkord-logo-mark">S</div>
          <span>Synkord</span>
        </div>

        {/* 顶级导航 Tab */}
        <div className="synkord-nav-tabs">
          <button
            className={`synkord-nav-tab ${isMcpActive ? 'active' : ''}`}
            onClick={() => navigate('/mcp')}
          >
            <McpStatusDot status={null} />
            <span>MCP</span>
          </button>
          <button
            className={`synkord-nav-tab ${isContractsActive ? 'active' : ''}`}
            onClick={() => navigate('/contracts')}
          >
            <span>契约集</span>
          </button>
          <button
            className={`synkord-nav-tab ${isSettingsActive ? 'active' : ''}`}
            onClick={() => navigate('/settings')}
          >
            <SettingOutlined />
            <span>设置</span>
          </button>
        </div>

        {/* 右侧操作 */}
        <div className="synkord-title-actions">
          {/* 切换契约集下拉 */}
          <ContractSwitcher variant="topbar" />

          {/* 用户菜单 */}
          <Dropdown
            menu={{
              items: [
                {
                  key: 'user',
                  label: user?.username || '当前用户',
                  disabled: true,
                },
                { type: 'divider' },
                { key: 'logout', label: '退出登录', danger: true },
              ],
              onClick: ({ key }) => {
                if (key === 'logout') handleLogout()
              },
            }}
            trigger={['click']}
          >
            <Avatar
              size={24}
              className="synkord-user-avatar"
              style={{ cursor: 'pointer' }}
            >
              {user?.username?.[0]?.toUpperCase() || 'S'}
            </Avatar>
          </Dropdown>

          {/* 窗口控制 */}
          <Tooltip title="置顶">
            <Button type="text" icon={<PushpinOutlined />} />
          </Tooltip>
          <Tooltip title="最小化">
            <Button
              type="text"
              className="window-button"
              icon={<MinusOutlined />}
              onClick={() => handleWindow('minimize')}
            />
          </Tooltip>
          <Tooltip title="最大化">
            <Button
              type="text"
              className="window-button"
              icon={<BorderOutlined />}
              onClick={() => handleWindow('maximize')}
            />
          </Tooltip>
          <Tooltip title="关闭">
            <Button
              type="text"
              className="window-button close"
              icon={<CloseOutlined />}
              onClick={() => handleWindow('close')}
            />
          </Tooltip>
        </div>
      </header>

      <main className="synkord-main">
        <Outlet />
      </main>
    </div>
  )
}