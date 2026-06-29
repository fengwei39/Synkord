import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { App as AntApp, Avatar, Badge, Button, Drawer, Dropdown, Empty, Form, Input, Modal, Select, Space, Spin, Switch, Tag, Tooltip } from 'antd';
import {
  ApiOutlined,
  ApartmentOutlined,
  BellOutlined,
  BorderOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  DashboardOutlined,
  DiffOutlined,
  HomeOutlined,
  MinusOutlined,
  MoreOutlined,
  NodeIndexOutlined,
  ProjectOutlined,
  PushpinOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  SyncOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useAuth } from '../api/auth';
import { getTeamMCPOverview } from '../api/mcp';
import {
  getWebhookConfig,
  listNotifications,
  markNotificationRead,
  retryNotificationDelivery,
  testWebhookConfig,
  updateWebhookConfig,
  type TeamNotification,
  type WebhookConfig,
} from '../api/notifications';
import { useTeam } from '../contexts/TeamContext';

const workspaceLinks = [
  { key: '/team', icon: <DashboardOutlined />, label: '团队首页' },
  { key: '/projects', icon: <ProjectOutlined />, label: '项目管理' },
  { key: '/apis', icon: <ApiOutlined />, label: '接口管理', hint: 'Swagger / Postman' },
  { key: '/models', icon: <ApartmentOutlined />, label: '数据模型' },
  { key: '/mcp', icon: <SafetyCertificateOutlined />, label: 'MCP 管理' },
  { key: '/dependencies', icon: <NodeIndexOutlined />, label: '依赖拓扑' },
  { key: '/diff', icon: <DiffOutlined />, label: '变更检测' },
  { key: '/changesets', icon: <ClockCircleOutlined />, label: '变更记录' },
  { key: '/members', icon: <TeamOutlined />, label: '团队成员与权限' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { teams, currentTeam, currentTeamId, switchTeam } = useTeam();
  const { message } = AntApp.useApp();
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<TeamNotification[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookForm] = Form.useForm<WebhookConfig>();
  const [mcpStatus, setMcpStatus] = useState<'enabled' | 'disabled' | 'not_configured'>('not_configured');
  const selectedTopKey = location.pathname === '/' ? '/' : '/' + location.pathname.split('/')[1];
  const selectedWorkspaceKey = workspaceLinks.find((item) => selectedTopKey === item.key)?.key || selectedTopKey;
  const isPlatformAdmin = user?.role === 'admin' || user?.role === 'platform_admin';
  const isWorkbenchRoute = selectedTopKey === '/' || selectedTopKey === '/teams';
  const projectSpaceActive = !isWorkbenchRoute && selectedTopKey !== '/admin';
  const unreadCount = useMemo(
    () => notifications.filter((item) => item.read_status === 'unread').length,
    [notifications],
  );

  const loadNotifications = useCallback(async () => {
    if (!currentTeamId) {
      setNotifications([]);
      return;
    }
    setNotificationLoading(true);
    try {
      setNotifications(await listNotifications(currentTeamId));
    } finally {
      setNotificationLoading(false);
    }
  }, [currentTeamId]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!currentTeamId) {
      setMcpStatus('not_configured');
      return;
    }
    getTeamMCPOverview(currentTeamId)
      .then((overview) => {
        setMcpStatus(overview.global_enabled && overview.enabled ? 'enabled' : 'disabled');
      })
      .catch(() => setMcpStatus('disabled'));
  }, [currentTeamId]);

  const handleWindow = (action: 'minimize' | 'maximize' | 'close') => {
    window.synkord?.windowControl(action);
  };

  const handleNotificationClick = async (item: TeamNotification) => {
    if (!currentTeamId) return;
    if (item.read_status === 'unread') {
      const updated = await markNotificationRead(currentTeamId, item.id);
      setNotifications((items) => items.map((next) => (next.id === item.id ? updated : next)));
    }
    setNotificationOpen(false);
    navigate('/changesets');
  };

  const handleRetryNotification = async (event: MouseEvent<HTMLElement>, item: TeamNotification) => {
    event.stopPropagation();
    if (!currentTeamId) return;
    const updated = await retryNotificationDelivery(currentTeamId, item.id);
    setNotifications((items) => items.map((next) => (next.id === item.id ? updated : next)));
  };

  const openWebhookSettings = async () => {
    if (!currentTeamId) return;
    const config = await getWebhookConfig(currentTeamId);
    webhookForm.setFieldsValue(config);
    setWebhookOpen(true);
  };

  const saveWebhookSettings = async () => {
    if (!currentTeamId) return;
    const values = await webhookForm.validateFields();
    setWebhookSaving(true);
    try {
      const config = await updateWebhookConfig(currentTeamId, {
        enabled: !!values.enabled,
        provider: values.provider || 'dingtalk',
        webhook_url: values.webhook_url || '',
        notify_warning: !!values.notify_warning,
      });
      webhookForm.setFieldsValue(config);
      message.success('Webhook 配置已保存');
      setWebhookOpen(false);
      loadNotifications();
    } catch (error: any) {
      message.error(error?.response?.data?.detail || '保存失败');
    } finally {
      setWebhookSaving(false);
    }
  };

  const testWebhook = async () => {
    if (!currentTeamId) return;
    setWebhookSaving(true);
    try {
      await testWebhookConfig(currentTeamId);
      message.success('测试通知已发送');
    } catch (error: any) {
      message.error(error?.response?.data?.detail || '测试发送失败');
    } finally {
      setWebhookSaving(false);
    }
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
          <button className={projectSpaceActive ? 'synkord-top-tab active' : 'synkord-top-tab'} onClick={() => navigate(currentTeam ? '/team' : '/teams/new')}>团队空间</button>
          <button className="synkord-top-tab icon-only" aria-label="更多">
            <MoreOutlined />
          </button>
        </nav>
        <div className="synkord-title-actions">
          <Tooltip title="MCP 服务状态">
            <button className={`mcp-status-chip ${mcpStatus}`} onClick={() => navigate(currentTeam ? '/mcp' : '/teams/new')}>
              <SafetyCertificateOutlined />
              {mcpStatusLabel[mcpStatus]}
            </button>
          </Tooltip>
          <Tooltip title="同步">
            <Button type="text" icon={<SyncOutlined />} />
          </Tooltip>
          {isPlatformAdmin && (
            <Tooltip title="全局 MCP 服务器管理">
              <Button type="text" icon={<SettingOutlined />} onClick={() => navigate('/admin/mcp-server')} />
            </Tooltip>
          )}
          <Tooltip title="通知">
            <Button
              type="text"
              disabled={!currentTeam}
              icon={<Badge count={unreadCount} size="small" offset={[3, -3]}><BellOutlined /></Badge>}
              onClick={() => {
                setNotificationOpen(true);
                loadNotifications();
              }}
            />
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                { key: 'user', label: user?.username || '当前用户', disabled: true },
                ...(isPlatformAdmin ? [{ key: 'global-mcp', label: '全局 MCP 服务器管理' }] : []),
                { key: 'logout', label: '退出登录' },
              ],
              onClick: ({ key }) => {
                if (key === 'global-mcp') {
                  navigate('/admin/mcp-server');
                }
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
              <span className="workspace-caret">▾</span>
            </div>
            {teams.map((team) => (
              <button
                key={team.id}
                className={currentTeam?.id === team.id ? 'workspace-item active' : 'workspace-item'}
                onClick={() => {
                  switchTeam(team.id);
                  navigate('/team');
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
                  {item.hint && <small>{item.hint}</small>}
                </button>
              ))}
            </section>
          )}

          {isPlatformAdmin && (
            <div className="sidebar-footer">
              <button className="org-button" onClick={() => navigate('/admin/mcp-server')}>
                <SettingOutlined />
                全局 MCP
              </button>
            </div>
          )}
        </aside>

        <main className="synkord-main">
          <Outlet />
        </main>
      </div>

      <Drawer
        title={currentTeam ? `${currentTeam.name} 通知` : '团队通知'}
        open={notificationOpen}
        onClose={() => setNotificationOpen(false)}
        size="default"
        extra={<Button size="small" onClick={openWebhookSettings}>通知设置</Button>}
      >
        {notificationLoading ? (
          <div className="notification-loading">
            <Spin />
          </div>
        ) : notifications.length === 0 ? (
          <Empty description="暂无通知" />
        ) : (
          <div className="notification-list">
            {notifications.map((item) => (
              <button
                key={item.id}
                className={item.read_status === 'unread' ? 'notification-item unread' : 'notification-item'}
                onClick={() => handleNotificationClick(item)}
              >
                <div className="notification-content">
                  <div className="notification-title">
                    <Tag color={severityColor[item.severity]}>{severityLabel[item.severity]}</Tag>
                    <span>{item.title}</span>
                  </div>
                  <div className="notification-summary">
                    <span>{item.summary}</span>
                    <time>{formatNotificationTime(item.created_at)}</time>
                  </div>
                </div>
                <div className="notification-action">
                  {item.delivery_status === 'failed' ? (
                    <Button size="small" onClick={(event) => handleRetryNotification(event, item)}>
                      重试
                    </Button>
                  ) : (
                    <Tag color={deliveryStatusColor[item.delivery_status]}>
                      {deliveryStatusLabel[item.delivery_status]}
                    </Tag>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </Drawer>

      <Modal
        title="团队 Webhook 通知配置"
        open={webhookOpen}
        onOk={saveWebhookSettings}
        confirmLoading={webhookSaving}
        onCancel={() => setWebhookOpen(false)}
        footer={(
          <Space>
            <Button onClick={() => setWebhookOpen(false)}>取消</Button>
            <Button onClick={testWebhook} loading={webhookSaving}>测试通知</Button>
            <Button type="primary" onClick={saveWebhookSettings} loading={webhookSaving}>保存配置</Button>
          </Space>
        )}
      >
        <Form form={webhookForm} layout="vertical">
          <Form.Item name="enabled" label="Webhook 开关" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
          <Form.Item name="provider" label="通知渠道" rules={[{ required: true, message: '请选择通知渠道' }]}>
            <Select options={[
              { value: 'dingtalk', label: '钉钉' },
              { value: 'feishu', label: '飞书' },
            ]} />
          </Form.Item>
          <Form.Item
            name="webhook_url"
            label="Webhook 地址"
            rules={[{ required: true, message: '请输入 Webhook 地址' }]}
          >
            <Input.Password placeholder="粘贴群机器人 Webhook 地址" />
          </Form.Item>
          <Form.Item name="notify_warning" label="warning 变更也推送" valuePropName="checked">
            <Switch checkedChildren="推送" unCheckedChildren="不推送" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

const severityLabel: Record<TeamNotification['severity'], string> = {
  info: '普通',
  warning: '警告',
  breaking: '破坏',
};

const severityColor: Record<TeamNotification['severity'], string> = {
  info: 'blue',
  warning: 'gold',
  breaking: 'red',
};

const deliveryStatusLabel: Record<TeamNotification['delivery_status'], string> = {
  disabled: '通知已关闭',
  not_configured: '未配置 Webhook',
  pending: '待发送',
  sent: '已发送',
  failed: '发送失败',
};

const deliveryStatusColor: Record<TeamNotification['delivery_status'], string> = {
  disabled: 'default',
  not_configured: 'default',
  pending: 'processing',
  sent: 'success',
  failed: 'error',
};

function formatNotificationTime(value: string) {
  if (!value) return '';
  return new Date(value).toLocaleString();
}

const mcpStatusLabel = {
  enabled: 'MCP 已启用',
  disabled: 'MCP 已关闭',
  not_configured: 'MCP 未配置',
};
