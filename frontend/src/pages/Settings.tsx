// Synkord Settings（v1.2：基础功能已实现）
// 账号信息 + 密码修改 + JWT 解码查看 + 路径配置
import { useState } from 'react'
import {
  App as AntApp,
  Alert,
  Button,
  Card,
  Form,
  Input,
  Space,
  Tag,
  Typography,
} from 'antd'
import { KeyOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons'
import { useAuth } from '../api/auth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const { Title, Text, Paragraph } = Typography

interface ChangePasswordForm {
  old_password: string
  new_password: string
  confirm_password: string
}

export default function Settings() {
  useDocumentTitle('设置')
  const { user, logout } = useAuth()
  const { message } = AntApp.useApp()
  const [submitting, setSubmitting] = useState(false)

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
      // 短暂延迟后清除会话
      setTimeout(() => logout(), 600)
    } catch (e: any) {
      message.error(e?.message || '修改失败')
    } finally {
      setSubmitting(false)
    }
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
