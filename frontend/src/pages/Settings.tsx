import { useState, useEffect } from 'react';
import { Typography, Card, Form, Input, Button, Space, Table, Tag, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import apiClient from '../api/client';
import { useAuth } from '../api/auth';

const { Title } = Typography;

export default function Settings() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [apiBase, setApiBase] = useState(localStorage.getItem('synkord_api_base') || '');
  const [webhookUrl, setWebhookUrl] = useState('');

  const loadUsers = async () => {
    try {
      const resp = await apiClient.get('/auth/users');
      setUsers(resp.data || []);
    } catch {}
  };

  useEffect(() => { if (user?.role === 'admin') loadUsers(); }, [user]);

  const handleRegister = async (values: any) => {
    try {
      await apiClient.post('/auth/register', values);
      message.success('用户创建成功');
      loadUsers();
    } catch (e: any) {
      message.error(e.response?.data?.detail || '创建失败');
    }
  };

  const roleLabels: Record<string, string> = { admin: '管理员', editor: '编辑者', viewer: '只读者' };
  const roleColors: Record<string, string> = { admin: 'red', editor: 'blue', viewer: 'default' };

  const saveAPIBase = () => {
    const value = apiBase.trim();
    if (value) {
      localStorage.setItem('synkord_api_base', value);
      apiClient.defaults.baseURL = value;
    } else {
      localStorage.removeItem('synkord_api_base');
      apiClient.defaults.baseURL = '/api';
    }
    message.success('后端地址已保存');
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>系统设置</Title>

      <Card title="后端连接" style={{ marginBottom: 16 }}>
        <Form layout="inline">
          <Form.Item label="synkord-core API 地址">
            <Input
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              placeholder="http://127.0.0.1:8000/api"
              style={{ width: 420 }}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={saveAPIBase}>保存</Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="Webhook 通知配置" style={{ marginBottom: 16 }}>
        <Form layout="inline">
          <Form.Item label="钉钉/飞书 Webhook URL">
            <Input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
              style={{ width: 500 }}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={() => message.info('配置已保存（演示）')}>保存</Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="MCP 服务状态">
        <Space direction="vertical">
          <div>
            <Tag color="green">运行中</Tag>
            <span>MCP Server 端口: 8100</span>
          </div>
          <div>
            <span>接入地址: </span>
            <code>http://&lt;内网IP&gt;:8100/mcp</code>
          </div>
          <div style={{ marginTop: 8 }}>
            <span>各 IDE 在项目根目录创建 </span>
            <code>.mcp.json</code>
            <span> 文件即可接入</span>
          </div>
        </Space>
      </Card>

      {user?.role === 'admin' && (
        <Card title="用户管理" style={{ marginTop: 16 }}>
          <Form onFinish={handleRegister} layout="inline" style={{ marginBottom: 16 }}>
            <Form.Item name="username" rules={[{ required: true }]}>
              <Input placeholder="用户名" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, min: 6 }]}>
              <Input.Password placeholder="密码" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>创建用户</Button>
            </Form.Item>
          </Form>

          <Table
            dataSource={users}
            rowKey="id"
            columns={[
              { title: '用户名', dataIndex: 'username' },
              { title: '角色', dataIndex: 'role', render: (r: string) => <Tag color={roleColors[r]}>{roleLabels[r]}</Tag> },
              { title: '状态', dataIndex: 'is_active', render: (a: boolean) => a ? <Tag color="green">正常</Tag> : <Tag color="red">禁用</Tag> },
            ]}
            pagination={false}
            size="small"
          />
        </Card>
      )}
    </div>
  );
}
