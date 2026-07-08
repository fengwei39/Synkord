import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { App as AntApp, Button, Card, Form, Input, Modal, Select, Space, Typography } from 'antd';
import {
  CloudServerOutlined,
  EditOutlined,
  LinkOutlined,
  LockOutlined,
  SaveOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useAuth } from '../api/auth';
import {
  API_BASE_RAW_STORAGE_KEY,
  API_BASE_STORAGE_KEY,
  assertValidApiBase,
  composeServerAddress,
  configureApiBase,
  normalizeApiBase,
  splitServerAddress,
  type ServerProtocol,
} from '../api/baseUrl';
import WindowControlBar from '../components/WindowControlBar';
import VersionBadge from '../components/VersionBadge';

const { Title, Text, Link } = Typography;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { message } = AntApp.useApp();

  // 初始值：localStorage > 默认（/api，在桌面端进程内嵌时用）
  const initialBase = localStorage.getItem(API_BASE_STORAGE_KEY) || '/api';
  const initialRaw = localStorage.getItem(API_BASE_RAW_STORAGE_KEY) || '';
  const [apiBase, setApiBase] = useState(initialBase);
  const [apiBaseRaw, setApiBaseRaw] = useState(initialRaw);
  const [serverModalOpen, setServerModalOpen] = useState(!initialRaw);
  const initialServer = splitServerAddress(initialRaw);
  const [serverProtocol, setServerProtocol] = useState<ServerProtocol>(initialServer.protocol);
  const [serverDraft, setServerDraft] = useState(initialServer.address);
  const [serverSaving, setServerSaving] = useState(false);

  useEffect(() => {
    // 同步 baseURL：监听 storage 变化或本组件内修改
    const handler = () => {
      const v = localStorage.getItem(API_BASE_STORAGE_KEY) || '/api'
      setApiBase(v)
      const raw = localStorage.getItem(API_BASE_RAW_STORAGE_KEY) || ''
      setApiBaseRaw(raw)
      const server = splitServerAddress(raw)
      setServerProtocol(server.protocol)
      setServerDraft(server.address)
    }
    window.addEventListener('storage', handler)
    window.addEventListener('synkord:api-base-changed', handler)
    return () => {
      window.removeEventListener('storage', handler)
      window.removeEventListener('synkord:api-base-changed', handler)
    }
  }, [])

  const handleServerSave = async () => {
    const raw = composeServerAddress(serverProtocol, serverDraft)
    if (!raw) {
      message.warning('请填写服务器地址')
      return
    }
    setServerSaving(true)
    try {
      const normalized = await configureApiBase(raw)
      setApiBaseRaw(raw)
      setApiBase(normalized)
      setServerModalOpen(false)
      message.success('服务器地址已保存')
    } catch (error: any) {
      message.error(error?.message || '服务器地址保存失败')
    } finally {
      setServerSaving(false)
    }
  }

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true)
    try {
      const loginBase = assertValidApiBase(apiBase)
      await login(values.username, values.password, loginBase)
      message.success('登录成功')
      const redirect = searchParams.get('redirect')
      if (redirect && redirect.startsWith('/')) {
        navigate(redirect, { replace: true })
      } else {
        navigate('/mcp', { replace: true })
      }
    } catch (error: any) {
      message.error(error?.response?.data?.detail || error?.message || '用户名或密码错误')
    } finally {
      setLoading(false)
    }
  }

  const hasServerConfigured = !!apiBaseRaw

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* 顶栏：可拖拽 + 窗口控制（frame: false 模式下替代系统顶栏） */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          height: 36,
          color: 'rgba(255,255,255,0.85)',
          flexShrink: 0,
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 500,
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
        >
          <span style={{
            width: 22, height: 22, borderRadius: 4,
            background: 'rgba(255,255,255,0.2)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700,
          }}>S</span>
          Synkord
          <VersionBadge />
        </div>
        <WindowControlBar size="small" />
      </div>

      {/* 登录卡片 */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}>
        <Card style={{ width: 460, borderRadius: 8 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <Title level={2} style={{ marginBottom: 4 }}>Synkord</Title>
            <Text type="secondary">开源 MCP 规范协同平台</Text>
          </div>

          {/* 服务器连接状态 */}
          <div style={{
            marginBottom: hasServerConfigured ? 18 : 20,
            padding: 14,
            background: hasServerConfigured ? '#f6ffed' : '#fff7e6',
            border: hasServerConfigured ? '1px solid #b7eb8f' : '1px solid #ffd591',
            borderRadius: 8,
          }}>
            {hasServerConfigured ? (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space>
                    <CloudServerOutlined style={{ color: '#52c41a' }} />
                    <Text strong>已连接服务器</Text>
                  </Space>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      const server = splitServerAddress(apiBaseRaw)
                      setServerProtocol(server.protocol)
                      setServerDraft(server.address)
                      setServerModalOpen(true)
                    }}
                  >
                    更改
                  </Button>
                </Space>
                <Text style={{ display: 'block', wordBreak: 'break-all' }}>{apiBaseRaw}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  API base: <Text code>{apiBase}</Text>
                </Text>
              </Space>
            ) : (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Space>
                  <CloudServerOutlined style={{ color: '#fa8c16' }} />
                  <Text strong>请先配置团队服务器地址</Text>
                </Space>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  管理员会通过钉钉 / 飞书 / 邮件发送此地址。配置完成后再登录账号。
                </Text>
                <Button
                  type="primary"
                  icon={<LinkOutlined />}
                  block
                  onClick={() => setServerModalOpen(true)}
                >
                  配置服务器地址
                </Button>
              </Space>
            )}
          </div>

          {hasServerConfigured && (
            <Form onFinish={onFinish} size="large">
              <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
                <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block>
                  登录
                </Button>
              </Form.Item>
            </Form>
          )}

          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              需要帮助？联系管理员
              <Link href="https://github.com/synkord/synkord" target="_blank" style={{ marginLeft: 6 }}>
                项目文档
              </Link>
            </Text>
          </div>
        </Card>
      </div>

      <Modal
        title={<Space><CloudServerOutlined /><span>服务器地址配置</span></Space>}
        open={serverModalOpen}
        onCancel={hasServerConfigured ? () => setServerModalOpen(false) : undefined}
        closable={hasServerConfigured}
        maskClosable={hasServerConfigured}
        footer={[
          hasServerConfigured ? (
            <Button key="cancel" onClick={() => setServerModalOpen(false)}>
              取消
            </Button>
          ) : null,
          <Button key="save" type="primary" icon={<SaveOutlined />} loading={serverSaving} onClick={handleServerSave}>
            保存并继续
          </Button>,
        ]}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Text type="secondary">
            填写公司内部部署的 Synkord 服务地址，通常形如 https://synkord.yourcompany.com。
          </Text>
          <Input
            value={serverDraft}
            onChange={(event) => setServerDraft(event.target.value)}
            onPressEnter={handleServerSave}
            addonBefore={
              <Select
                value={serverProtocol}
                onChange={setServerProtocol}
                style={{ width: 92 }}
                options={[
                  { value: 'https', label: 'https://' },
                  { value: 'http', label: 'http://' },
                ]}
              />
            }
            placeholder="synkord.yourcompany.com"
            autoFocus
            allowClear
          />
          {serverDraft.trim() && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              将使用：<Text code>{normalizeApiBase(composeServerAddress(serverProtocol, serverDraft))}</Text>
            </Text>
          )}
        </Space>
      </Modal>
    </div>
  );
}
