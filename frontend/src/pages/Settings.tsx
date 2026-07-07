// Synkord Settings（v1.2：基础功能已实现）
// 账号信息 + 密码修改 + JWT 解码查看 + 路径配置 + CLI 安装器
import { useEffect, useState } from 'react'
import {
  App as AntApp,
  Alert,
  Button,
  Card,
  Form,
  Input,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  CheckCircleOutlined,
  CodeOutlined,
  DeleteOutlined,
  KeyOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useAuth } from '../api/auth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const { Title, Text, Paragraph } = Typography

interface ChangePasswordForm {
  old_password: string
  new_password: string
  confirm_password: string
}

interface CliStatus {
  bundled: boolean
  installed: boolean
  path: string | null
  inPath: boolean
  version: string | null
  runError?: string | null
}

const isElectron = typeof window !== 'undefined' && !!window.synkord

export default function Settings() {
  useDocumentTitle('设置')
  const { user, logout } = useAuth()
  const { message } = AntApp.useApp()
  const [submitting, setSubmitting] = useState(false)
  const [cli, setCli] = useState<CliStatus | null>(null)
  const [cliBusy, setCliBusy] = useState(false)

  // 拉取 CLI 状态
  const refreshCli = async () => {
    if (!isElectron || !window.synkord) return
    try {
      const s = await window.synkord.cliStatus()
      setCli(s)
    } catch (e: any) {
      console.warn('cliStatus failed:', e?.message)
    }
  }
  useEffect(() => { refreshCli() }, [])

  const handleInstallCli = async () => {
    if (!isElectron || !window.synkord) return
    setCliBusy(true)
    try {
      const res = await window.synkord.cliInstall()
      if (res.ok) {
        if (res.warning) {
          message.warning(res.warning)
        } else {
          message.success(`CLI 已安装到 ${res.path}\n${res.shellHint || ''}`)
        }
        await refreshCli()
      } else {
        message.error(res.error || '安装失败')
      }
    } catch (e: any) {
      message.error(e?.message || '安装失败')
    } finally {
      setCliBusy(false)
    }
  }

  const handleUninstallCli = async () => {
    if (!isElectron || !window.synkord) return
    setCliBusy(true)
    try {
      await window.synkord.cliUninstall()
      message.success('CLI 已卸载')
      await refreshCli()
    } catch (e: any) {
      message.error(e?.message || '卸载失败')
    } finally {
      setCliBusy(false)
    }
  }

  const handleChangePassword = async (values: ChangePasswordForm) => {
    if (values.new_password !== values.confirm_password) {
      message.error('两次输入的新密码不一致')
      return
    }
    setSubmitting(true)
    try {
      const apiBase = localStorage.getItem('synkord_api_base') || '/api'
      const token = localStorage.getItem('synkord_token') || ''
      const resp = await fetch(`${apiBase.replace(/\/$/, '')}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          old_password: values.old_password,
          new_password: values.new_password,
        }),
      })
      if (!resp.ok) {
        const errText = await resp.text()
        let detail = `HTTP ${resp.status}`
        try {
          const data = JSON.parse(errText)
          detail = data?.detail || detail
        } catch {}
        throw new Error(detail)
      }
      message.success('密码已更新，请重新登录')
      setTimeout(() => logout(), 600)
    } catch (e: any) {
      message.error(e?.message || '修改失败')
    } finally {
      setSubmitting(false)
    }
  }

  // CLI 状态指示器
  const renderCliStatus = () => {
    if (!isElectron) {
      return <Alert type="info" showIcon message="CLI 管理仅在桌面端可用（当前是 Web 浏览器）" />
    }
    if (!cli) {
      return <Skeleton active paragraph={{ rows: 2 }} />
    }
    if (!cli.bundled) {
      return <Alert type="warning" showIcon message="当前安装包未包含 CLI（可能运行在开发模式）" />
    }
    if (cli.installed && cli.inPath) {
      return (
        <Space direction="vertical" size={4}>
          <Space>
            <Tag icon={<CheckCircleOutlined />} color="green">已安装并加入 PATH</Tag>
            {cli.version && <Tag>v{cli.version}</Tag>}
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            路径：<Text code>{cli.path}</Text>
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            终端执行 <Text code>synkord version</Text> 验证
          </Text>
        </Space>
      )
    }
    if (cli.installed && !cli.inPath) {
      return (
        <Space direction="vertical" size={4}>
          <Tag color="orange">已安装但未在 PATH 中</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>
            路径：<Text code>{cli.path}</Text>（需重启终端 / 重新登录）
          </Text>
        </Space>
      )
    }
    return (
      <Space direction="vertical" size={4}>
        <Tag color="default">未安装</Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          桌面端内嵌了 CLI，但尚未复制到用户 PATH
        </Text>
      </Space>
    )
  }

  return (
    <div className="page-content">
      <Title level={3}>个人设置</Title>

      <Card
        title={<Space><UserOutlined /><span>账号信息</span></Space>}
        style={{ marginBottom: 16 }}
      >
        {!user ? (
          <Alert type="warning" message="未登录" showIcon />
        ) : (
          <Space orientation="vertical" size="small">
            <Text>用户名：<Text strong>{user.username}</Text></Text>
            <Text>角色：<Tag color={user.role === 'admin' ? 'red' : 'blue'}>{user.role || 'viewer'}</Tag></Text>
            {user.email && <Text>邮箱：{user.email}</Text>}
            <Text type="secondary">ID：{user.id}</Text>
          </Space>
        )}
      </Card>

      <Card
        title={<Space><KeyOutlined /><span>修改密码</span></Space>}
        style={{ marginBottom: 16 }}
      >
        <Form layout="vertical" style={{ maxWidth: 480 }} onFinish={handleChangePassword}>
          <Form.Item
            label="当前密码"
            name="old_password"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            label="新密码"
            name="new_password"
            rules={[{ required: true, min: 6, message: '至少 6 个字符' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            label="确认新密码"
            name="confirm_password"
            rules={[{ required: true, message: '请再次输入新密码' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting}>
            更新密码
          </Button>
        </Form>
      </Card>

      {isElectron && (
        <Card
          title={
            <Space>
              <CodeOutlined />
              <span>CLI 工具</span>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {renderCliStatus()}
            <Space>
              {!cli?.installed && (
                <Button
                  type="primary"
                  icon={<CodeOutlined />}
                  loading={cliBusy}
                  disabled={!cli?.bundled}
                  onClick={handleInstallCli}
                >
                  安装到 PATH
                </Button>
              )}
              {cli?.installed && (
                <Tooltip title="从 PATH 移除 CLI（不影响桌面端运行）">
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    loading={cliBusy}
                    onClick={handleUninstallCli}
                  >
                    卸载
                  </Button>
                </Tooltip>
              )}
              <Button onClick={refreshCli}>刷新状态</Button>
            </Space>
            <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
              CLI 用于 CI/CD 流水线（<Text code>synkord push-spec</Text>）和 Git pre-commit 校验（<Text code>synkord validate-deps</Text>）。
              桌面端自带，启用后可在终端直接使用 <Text code>synkord</Text> 命令。
            </Paragraph>
          </Space>
        </Card>
      )}

      <Card title="后端连接" style={{ marginBottom: 16 }}>
        <Paragraph>
          当前 base URL：<Text code>{localStorage.getItem('synkord_api_base') || '/api'}</Text>
        </Paragraph>
        <Paragraph type="secondary" style={{ fontSize: 12 }}>
          由 Synkord 桌面应用自动注入（默认 <code>http://127.0.0.1:8000/api</code>）；
          若需要手动切换，在浏览器开发者工具里设置
          <Text code>localStorage.setItem('synkord_api_base', '...')</Text>
          然后刷新页面。
        </Paragraph>
      </Card>

      <Card title="会话">
        <Space>
          <Button danger icon={<LogoutOutlined />} onClick={logout}>
            退出登录
          </Button>
        </Space>
      </Card>
    </div>
  )
}
