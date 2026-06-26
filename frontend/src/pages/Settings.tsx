import { useEffect, useState } from 'react';
import { App as AntApp, Button, Card, Form, InputNumber, Modal, Select, Space, Switch, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { getGlobalMCPServer, updateGlobalMCPServer, type GlobalMCPServerConfig } from '../api/mcp';
import { useAuth } from '../api/auth';

const { Text, Title } = Typography;

const mcpToolOptions = [
  'get_team_entities',
  'get_project_entities',
  'get_project_apis',
  'get_api_dependencies',
  'detect_breaking_changes',
  'validate_entity_usage',
].map((tool) => ({ value: tool, label: tool }));

export default function Settings() {
  const { user } = useAuth();
  const { message } = AntApp.useApp();
  const [config, setConfig] = useState<GlobalMCPServerConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const isAdmin = user?.role === 'admin' || user?.role === 'platform_admin';

  const load = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const next = await getGlobalMCPServer();
      setConfig(next);
      form.setFieldsValue({
        enabled: next.enabled,
        tools: next.tools,
        rate_limit_per_minute: next.rate_limit_per_minute,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [isAdmin]);

  const save = async () => {
    const values = await form.validateFields();
    const next = await updateGlobalMCPServer({
      enabled: values.enabled,
      tools: values.tools || [],
      rate_limit_per_minute: values.rate_limit_per_minute,
    });
    setConfig(next);
    message.success('全局 MCP 配置已保存');
  };

  const toggleGlobal = (checked: boolean) => {
    Modal.confirm({
      title: checked ? '开启全局 MCP Server？' : '关闭全局 MCP Server？',
      content: checked
        ? '开启后，团队 MCP 开关和 Token 启用的情况下可访问 MCP 服务。'
        : '关闭后，所有团队 MCP Token 会立即不可用，但不会删除配置和审计记录。',
      onOk: () => {
        form.setFieldValue('enabled', checked);
        return save();
      },
    });
  };

  if (!isAdmin) {
    return (
      <div className="project-page">
        <Card>
          <Title level={4}>无权限访问</Title>
          <Text type="secondary">全局 MCP 服务器管理仅平台管理员可用。</Text>
        </Card>
      </div>
    );
  }

  return (
    <div className="project-page">
      <header className="page-header">
        <div className="page-title-row">
          <h1>全局 MCP 服务器管理</h1>
          <span className="owner-badge">平台管理员</span>
        </div>
        <Text type="secondary">全局开关只控制 MCP Server 能力，不承载团队资产、Webhook 或后端连接配置。</Text>
      </header>

      <Card
        loading={loading}
        title="MCP Server"
        extra={<Button icon={<ReloadOutlined />} onClick={load}>刷新状态</Button>}
      >
        <Form form={form} layout="vertical">
          <div className="mcp-status-row">
            <div>
              <Title level={5}>全局 MCP 服务开关</Title>
              <Space>
                <Tag color={config?.enabled ? 'green' : 'red'}>{config?.enabled ? '运行中' : '已关闭'}</Tag>
                <Text type="secondary">关闭后 `/mcp/sse` 与 `/mcp/message` 返回不可用。</Text>
              </Space>
            </div>
            <Form.Item name="enabled" valuePropName="checked" style={{ margin: 0 }}>
              <Switch
                checkedChildren="已开启"
                unCheckedChildren="已关闭"
                onChange={toggleGlobal}
              />
            </Form.Item>
          </div>

          <div className="mcp-url-row">
            <Text type="secondary">SSE 端点</Text>
            <code>{config?.sse_endpoint || '/mcp/sse'}</code>
          </div>
          <div className="mcp-url-row">
            <Text type="secondary">Message 端点</Text>
            <code>{config?.message_endpoint || '/mcp/message'}</code>
          </div>

          <Form.Item
            name="tools"
            label="全局工具开关"
            rules={[{ required: true, message: '至少保留一个 MCP 工具' }]}
            style={{ marginTop: 18 }}
          >
            <Select
              mode="multiple"
              options={mcpToolOptions}
            />
          </Form.Item>

          <Form.Item
            name="rate_limit_per_minute"
            label="调用限流（次 / 分钟）"
            rules={[{ required: true, message: '请输入限流值' }]}
          >
            <InputNumber min={1} max={10000} style={{ width: 220 }} />
          </Form.Item>

          <Button type="primary" onClick={save}>保存配置</Button>
        </Form>
      </Card>
    </div>
  );
}
