// Synkord AppLayout
// 顶级导航：Logo | MCP★ | 契约集 | 设置 | [切换契约集▾] [👤]
// 详见 docs/ui-spec.md §二
//
// 实现要点：
// - 使用原生 button 元素替代 antd Button，确保 -webkit-app-region: no-drag 生效
// - 在 Electron drag 区域内只有显式标注 no-drag 的元素才能点击

import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Tooltip } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import { useAuth } from '../api/auth'
import { useContract } from '../contexts/ContractContext'
import { ContractSwitcher } from './ContractSwitcher'
import { McpStatusDot } from './McpStatusDot'
import WindowControlBar from './WindowControlBar'
import ContractCreateModal from './ContractCreateModal'
import VersionBadge from './VersionBadge'

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

  const handleLogoClick = () => {
    navigate('/mcp')
  }

  return (
    <div className="synkord-shell">
      <header className="synkord-titlebar">
        {/* Logo + Synkord + 版本徽标 — 与登录页顶栏样式保持一致 */}
        <div
          onClick={handleLogoClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 14,
            fontSize: 13,
            fontWeight: 500,
            color: '#1f2d46',
            cursor: 'pointer',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: 'linear-gradient(135deg, #8f6bff, #38bdf8)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            S
          </span>
          <span>Synkord</span>
          <VersionBadge />
        </div>

        {/* 顶级导航 Tab */}
        <div className="synkord-nav-tabs">
          <button
            type="button"
            className={`synkord-nav-tab ${isMcpActive ? 'active' : ''}`}
            onClick={() => navigate('/mcp')}
          >
            <McpStatusDot status={null} />
            <span>MCP</span>
          </button>
          <button
            type="button"
            className={`synkord-nav-tab ${isContractsActive ? 'active' : ''}`}
            onClick={() => navigate('/contracts')}
          >
            <span>契约集</span>
          </button>
          <button
            type="button"
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

          {/* 活跃契约集指示（点击跳到 /mcp） */}
          {activeContract && (
            <Tooltip title="查看活跃契约集详情">
              <button
                type="button"
                className="topbar-active-indicator"
                onClick={() => navigate(`/contracts/${activeContract.contract_id}`)}
              >
                <span className="dot" />
                <span>活跃</span>
              </button>
            </Tooltip>
          )}

          {/* 用户菜单 */}
          <div className="user-menu">
            <button
              type="button"
              className="user-avatar-btn"
              onClick={() => {
                const confirmed = window.confirm(`退出登录？\n用户：${user?.username || ''}`)
                if (confirmed) handleLogout()
              }}
              title={`${user?.username || '当前用户'}（点击退出）`}
            >
              <Avatar size={24} className="synkord-user-avatar">
                {user?.username?.[0]?.toUpperCase() || 'S'}
              </Avatar>
            </button>
          </div>

          {/* 窗口控制 */}
          <WindowControlBar />
        </div>
      </header>

      <main className="synkord-main">
        <Outlet />
      </main>

      {/* 全局"创建契约集"弹窗 */}
      <ContractCreateModal />
    </div>
  )
}
