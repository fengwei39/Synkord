import { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Button, Card, Empty, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { CopyOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  createMCPConfig,
  getTeamMCPOverview,
  listMCPAuditLogs,
  rotateMCPConfigToken,
  updateMCPConfigStatus,
  updateTeamMCPEnabled,
  type MCPAuditLog,
  type MCPConfig,
  type TeamMCPOverview,
} from '../api/mcp';
import { listProjects } from '../api/projects';
import { useTeam } from '../contexts/TeamContext';

const { Paragraph, Text, Title } = Typography;

export default function MCPManagement() {
  const { currentTeam, currentTeamId } = useTeam();
  const { message } = AntApp.useApp();
  const [overview, setOverview] = useState<TeamMCPOverview | null>(null);
  const [auditLogs, setAuditLogs] = useState<MCPAuditLog[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    if (!currentTeamId) return;
    setLoading(true);
    try {
      const [mcp, projectItems, audit] = await Promise.all([
        getTeamMCPOverview(currentTeamId),
        listProjects(currentTeamId),
        listMCPAuditLogs(currentTeamId),
      ]);
      setOverview(mcp);
      setProjects(projectItems);
      setAuditLogs(audit.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [currentTeamId]);

  const serviceUrl = useMemo(() => {
    const apiBase = localStorage.getItem('synkord_api_base') || 'http://127.0.0.1:8000/api';
    const endpoint = overview?.sse_endpoint || '/mcp/sse';
    return apiBase.replace(/\/api\/?$/, '') + `${endpoint}?token=<team-token>`;
  }, [overview?.sse_endpoint]);

  const ideConfig = useMemo(() => JSON.stringify({
    mcpServers: {
      synkord: {
        url: serviceUrl,
      },
    },
  }, null, 2), [serviceUrl]);

  const handleCreate = async () => {
    if (!currentTeamId) return;
    const values = await form.validateFields();
    const created = await createMCPConfig(currentTeamId, {
      name: values.name,
      purpose: values.purpose,
      project_scope: values.projects || [],
      tool_scope: values.tools,
      expires_at: values.expiresAt,
    });
    setModalOpen(false);
    form.resetFields();
    await load();
    Modal.success({
      title: 'MCP Token 已生成',
      content: (
        <Paragraph copyable={{ text: created.token || '' }}>
          {created.token}
        </Paragraph>
      ),
    });
  };

  const toggleTeamEnabled = (checked: boolean) => {
    if (!currentTeamId) return;
    Modal.confirm({
      title: checked ? '开启团队 MCP？' : '关闭团队 MCP？',
      content: checked ? '开启后，已启用的团队 Token 可访问 MCP 服务。' : '关闭后，当前团队下所有 MCP Token 会立即不可用。',
      onOk: async () => {
        const next = await updateTeamMCPEnabled(currentTeamId, checked);
        setOverview(next);
        message.success(checked ? '团队 MCP 已开启' : '团队 MCP 已关闭');
      },
    });
  };

  const toggleConfig = async (record: MCPConfig) => {
    if (!currentTeamId) return;
    const status = record.status === 'active' ? 'disabled' : 'active';
    const updated = await updateMCPConfigStatus(currentTeamId, record.id, status);
    setOverview((value) => value ? {
      ...value,
      configs: value.configs.map((item) => item.id === updated.id ? updated : item),
    } : value);
  };

  const rotateConfig = async (record: MCPConfig) => {
    if (!currentTeamId) return;
    const updated = await rotateMCPConfigToken(currentTeamId, record.id);
    await load();
    Modal.success({
      title: 'MCP Token 已重新生成',
      content: (
        <Paragraph copyable={{ text: updated.token || '' }}>
          {updated.token}
        </Paragraph>
      ),
    });
  };

  return (
    <div className="project-page">
      <header className="page-header">
        <div className="page-title-row">
          <h1>MCP 管理</h1>
          <span className="owner-badge">团队级配置</span>
        </div>
        <Text type="secondary">{currentTeam?.name || '当前团队'} 使用一个 MCP Server 入口，可创建多个 Token 区分 IDE、CI、Git Hook。</Text>
      </header>

      <Card style={{ marginBottom: 16 }}>
        <div className="mcp-status-row">
          <div>
            <Title level={5}>团队 MCP 开关</Title>
            <Text type="secondary">关闭后，当前团队下所有 MCP Token 都会立即不可用。</Text>
          </div>
          <Switch
            checkedChildren="已开启"
            unCheckedChildren="已关闭"
            disabled={!overview?.global_enabled}
            checked={!!overview?.enabled}
            onChange={toggleTeamEnabled}
          />
        </div>
        {!overview?.global_enabled && (
          <div style={{ marginTop: 12 }}>
            <Tag color="red">全局 MCP 已关闭</Tag>
            <Text type="secondary">需要平台管理员在全局 MCP 服务器管理中开启。</Text>
          </div>
        )}
        <div className="mcp-url-row">
          <Text type="secondary">接入地址</Text>
          <code>{serviceUrl}</code>
          <Button size="small" icon={<CopyOutlined />} onClick={() => navigator.clipboard?.writeText(serviceUrl)}>
            复制
          </Button>
        </div>
      </Card>

      <Card
        title="MCP 配置列表"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新建配置</Button>}
      >
        <Table
          loading={loading}
          rowKey="id"
          dataSource={overview?.configs || []}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无 MCP Token" /> }}
          columns={[
            { title: '名称', dataIndex: 'name' },
            { title: '用途', dataIndex: 'purpose', width: 100, render: (v) => <Tag>{v}</Tag> },
            { title: 'Token', dataIndex: 'token_preview', width: 140 },
            { title: '项目范围', dataIndex: 'project_scope', render: (items: string[]) => items?.length ? items.join('、') : '全部项目' },
            { title: '工具范围', dataIndex: 'tool_scope', render: (items: string[]) => items.map((item) => <Tag key={item}>{item}</Tag>) },
            { title: '状态', dataIndex: 'status', width: 90, render: (v) => v === 'active' ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag> },
            { title: '过期时间', dataIndex: 'expires_at', width: 120, render: (v) => v ? new Date(v).toLocaleDateString() : '未设置' },
            { title: '最近调用', dataIndex: 'last_used_at', width: 150, render: (v) => v ? new Date(v).toLocaleString() : '-' },
            {
              title: '操作',
              width: 180,
              render: (_, record) => (
                <Space>
                  <Button size="small" onClick={() => toggleConfig(record)}>
                    {record.status === 'active' ? '停用' : '启用'}
                  </Button>
                  <Button size="small" icon={<ReloadOutlined />} onClick={() => rotateConfig(record)}>重生成</Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Card title="IDE 接入说明" style={{ marginTop: 16 }}>
        <Text type="secondary">创建 Token 后，将接入地址中的 <code>&lt;team-token&gt;</code> 替换为实际 Token。</Text>
        <Paragraph copyable={{ text: ideConfig }} style={{ marginTop: 12 }}>
          <pre style={{ margin: 0 }}>{ideConfig}</pre>
        </Paragraph>
      </Card>

      <Card title="调用审计" style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          dataSource={auditLogs}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条审计` }}
          columns={[
            { title: '工具', dataIndex: 'tool_name' },
            { title: '调用方', dataIndex: 'caller', render: (value) => value || '-' },
            { title: '参数摘要', dataIndex: 'params_summary', ellipsis: true, render: (value) => value || '-' },
            {
              title: '结果',
              dataIndex: 'result_status',
              width: 100,
              render: (value) => <Tag color={value === 'success' ? 'green' : 'red'}>{value}</Tag>,
            },
            { title: '时间', dataIndex: 'created_at', width: 180, render: (value) => value ? new Date(value).toLocaleString() : '-' },
          ]}
        />
      </Card>

      <Modal
        title="新建 MCP 配置"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="配置名称" rules={[{ required: true, message: '请输入配置名称' }]}>
            <Input placeholder="例如 Cursor 开发环境" />
          </Form.Item>
          <Form.Item name="purpose" label="用途" rules={[{ required: true, message: '请选择用途' }]}>
            <Select options={[
              { value: 'IDE', label: 'IDE' },
              { value: 'CI', label: 'CI' },
              { value: 'Git Hook', label: 'Git Hook' },
              { value: 'AI Agent', label: 'AI Agent' },
            ]} />
          </Form.Item>
          <Form.Item name="projects" label="项目范围">
            <Select
              mode="multiple"
              placeholder="不选表示全部项目"
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
            />
          </Form.Item>
          <Form.Item name="tools" label="工具范围" rules={[{ required: true, message: '请选择可调用工具' }]}>
            <Select mode="multiple" options={(overview?.tools || []).map((tool) => ({ value: tool, label: tool }))} />
          </Form.Item>
          <Form.Item name="expiresAt" label="过期时间">
            <Input placeholder="例如 2026-12-31，留空表示不过期" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
