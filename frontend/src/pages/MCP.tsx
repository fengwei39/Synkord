import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  App as AntApp,
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  CopyOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  createProjectMCPToken,
  getProjectMCPOnboarding,
  getProjectMCPOverview,
  listProjectMCPAuditLogs,
  rotateProjectMCPToken,
  updateProjectMCPToken,
  type MCPAuditLog,
  type MCPConfig,
  type MCPOnboarding,
  type ProjectMCPOverview,
} from '../api/mcp';
import { useTeam } from '../contexts/TeamContext';
import { useProject } from '../contexts/ProjectContext';

const { Title, Paragraph, Text } = Typography;

const TOOL_OPTIONS = [
  { value: 'get_project_entities', label: 'get_project_entities — 当前项目数据模型' },
  { value: 'get_project_apis', label: 'get_project_apis — 当前项目 API 列表' },
  { value: 'get_entity_dependencies', label: 'get_entity_dependencies — 实体被哪些项目引用' },
  { value: 'get_api_dependencies', label: 'get_api_dependencies — API 被哪些项目引用' },
  { value: 'validate_entity_usage', label: 'validate_entity_usage — 代码片段校验' },
];

export default function MCP() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const { currentTeamId } = useTeam();
  const { setCurrentProjectId } = useProject();

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<ProjectMCPOverview | null>(null);
  const [auditLogs, setAuditLogs] = useState<MCPAuditLog[]>([]);
  const [onboarding, setOnboarding] = useState<MCPOnboarding | null>(null);

  // 打开 MCP Tab 时把该项目设为当前激活项目，并通知 Electron 写入 active-context.json
  useEffect(() => {
    if (!currentTeamId || !projectId) return;
    setCurrentProjectId(projectId);
    window.synkord?.mcpSetActiveProject?.({
      teamId: currentTeamId,
      projectId,
      projectName: overview?.project_name || projectId,
    }).catch(() => undefined);
  }, [currentTeamId, overview?.project_name, projectId, setCurrentProjectId]);

  // 跨团队 URL 防护
  useEffect(() => {
    if (projectId && currentTeamId && overview?.team_id && overview.team_id !== currentTeamId) {
      navigate('/projects', { replace: true });
    }
  }, [projectId, currentTeamId, overview, navigate]);

  const loadAll = async () => {
    if (!currentTeamId || !projectId) return;
    setLoading(true);
    try {
      const [ov, audit, onb] = await Promise.all([
        getProjectMCPOverview(currentTeamId, projectId),
        listProjectMCPAuditLogs(currentTeamId, projectId).catch(() => ({ items: [], total: 0 })),
        getProjectMCPOnboarding(currentTeamId, projectId).catch(() => null),
      ]);
      setOverview(ov);
      setAuditLogs(audit.items || []);
      setOnboarding(onb);
    } catch (err: any) {
      message.error('加载 MCP 信息失败：' + (err?.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTeamId, projectId]);

  if (loading && !overview) {
    return <Skeleton active paragraph={{ rows: 6 }} />;
  }

  if (!overview) {
    return <Alert type="error" message="无法加载 MCP 概览" showIcon />;
  }

  return (
    <div className="page-mcp">
      <div className="page-header">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/projects/${projectId}`)}>
          返回项目详情
        </Button>
        <Title level={3} style={{ margin: 0 }}>MCP 管理</Title>
        <Button icon={<ReloadOutlined />} onClick={loadAll}>刷新</Button>
      </div>

      <Tabs
        defaultActiveKey="overview"
        items={[
          {
            key: 'overview',
            label: '概览',
            children: <OverviewTab overview={overview} />,
          },
          {
            key: 'tokens',
            label: 'Token 管理',
            children: <TokensTab
              teamId={currentTeamId!}
              projectId={projectId!}
              configs={overview.configs || []}
              onChanged={loadAll}
            />,
          },
          {
            key: 'tools',
            label: '工具列表',
            children: <ToolsTab tools={overview.tools || []} toolOptions={TOOL_OPTIONS} />,
          },
          {
            key: 'onboarding',
            label: 'IDE 接入说明',
            children: <OnboardingTab onboarding={onboarding} />,
          },
          {
            key: 'audit',
            label: '调用审计',
            children: <AuditTab logs={auditLogs} />,
          },
        ]}
      />
    </div>
  );
}

function OverviewTab({ overview }: { overview: ProjectMCPOverview }) {
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card title="本地 MCP 服务状态" size="small">
        <Descriptions column={2}>
          <Descriptions.Item label="运行状态">
            <Tag color={overview.status?.ready ? 'green' : 'red'}>
              {overview.status?.ready ? '已就绪' : '未就绪'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="连接状态">
            {overview.status?.connected ? '已连接' : '未连接'}
          </Descriptions.Item>
          <Descriptions.Item label="激活 Token 数">{overview.status?.active_tokens ?? 0}</Descriptions.Item>
          <Descriptions.Item label="本地访问地址">
            <Text code>{overview.local_hint_url}</Text>
          </Descriptions.Item>
        </Descriptions>
        {!overview.status?.ready && (
          <Alert
            style={{ marginTop: 12 }}
            type="warning"
            showIcon
            message="本地 MCP 服务未就绪"
            description="请在 Electron 主窗口顶部检查 MCP 状态，或在系统托盘中启动本地 MCP 服务。"
          />
        )}
      </Card>
      <Card title="提示" size="small">
        <Paragraph>
          MCP 管理只在当前项目内有效。打开本页面时，Electron 自动把项目 <Text strong>{overview.project_id}</Text> 设为本地 MCP 服务的激活项目。
        </Paragraph>
        <Paragraph>
          团队和项目由 Electron 当前激活上下文决定，IDE 配置文件只需指向本地 MCP 服务地址，<Text strong>切换项目无需修改 .mcp.json</Text>。
        </Paragraph>
      </Card>
    </Space>
  );
}

function TokensTab({
  teamId,
  projectId,
  configs,
  onChanged,
}: {
  teamId: string;
  projectId: string;
  configs: MCPConfig[];
  onChanged: () => void;
}) {
  const { modal, message } = AntApp.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<MCPConfig | null>(null);
  const [revealedToken, setRevealedToken] = useState<{ token: string; name: string } | null>(null);
  const [form] = Form.useForm<{ name: string; purpose: string; tool_scope: string[]; expires_at?: any }>();

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ tool_scope: TOOL_OPTIONS.map((t) => t.value) });
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    const values = await form.validateFields();
    const payload = {
      name: values.name,
      purpose: values.purpose,
      tool_scope: values.tool_scope,
      expires_at: values.expires_at ? dayjs(values.expires_at).format('YYYY-MM-DD') : undefined,
    };
    try {
      const created = await createProjectMCPToken(teamId, projectId, payload);
      setCreateOpen(false);
      message.success('Token 已创建');
      if (created.token) {
        setRevealedToken({ token: created.token, name: created.name });
      }
      onChanged();
    } catch (err: any) {
      message.error('创建失败：' + (err?.response?.data?.detail || err.message));
    }
  };

  const submitEdit = async () => {
    if (!editing) return;
    const values = await form.validateFields();
    try {
      await updateProjectMCPToken(teamId, projectId, editing.id, {
        status: editing.status,
        tool_scope: values.tool_scope,
      });
      setEditing(null);
      message.success('已更新');
      onChanged();
    } catch (err: any) {
      message.error('更新失败：' + (err?.response?.data?.detail || err.message));
    }
  };

  const doRotate = async (config: MCPConfig) => {
    try {
      const rotated = await rotateProjectMCPToken(teamId, projectId, config.id);
      message.success('Token 已轮换');
      if (rotated.token) {
        setRevealedToken({ token: rotated.token, name: rotated.name });
      }
      onChanged();
    } catch (err: any) {
      message.error('轮换失败：' + (err?.response?.data?.detail || err.message));
    }
  };

  const doToggle = async (config: MCPConfig) => {
    const next = config.status === 'active' ? 'disabled' : 'active';
    try {
      await updateProjectMCPToken(teamId, projectId, config.id, { status: next });
      message.success(next === 'active' ? '已启用' : '已停用');
      onChanged();
    } catch (err: any) {
      message.error('操作失败：' + (err?.response?.data?.detail || err.message));
    }
  };

  return (
    <Card
      title="当前项目 MCP Token"
      size="small"
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建 Token</Button>}
    >
      <Table<MCPConfig>
        rowKey="id"
        size="small"
        dataSource={configs}
        pagination={false}
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '用途', dataIndex: 'purpose' },
          { title: 'Token 摘要', dataIndex: 'token_preview', render: (v) => <Text code>{v}</Text> },
          {
            title: '状态',
            dataIndex: 'status',
            render: (s: string) => <Tag color={s === 'active' ? 'green' : 'red'}>{s === 'active' ? '启用' : '停用'}</Tag>,
          },
          {
            title: '工具范围',
            dataIndex: 'tool_scope',
            render: (scopes: string[]) => (scopes || []).map((s) => <Tag key={s}>{s}</Tag>),
          },
          {
            title: '最近使用',
            dataIndex: 'last_used_at',
            render: (v) => (v ? new Date(v).toLocaleString() : '从未'),
          },
          {
            title: '操作',
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => {
                  setEditing(record);
                  form.resetFields();
                  form.setFieldsValue({ tool_scope: record.tool_scope });
                }}>编辑</Button>
                <Button size="small" onClick={() => doToggle(record)}>
                  {record.status === 'active' ? '停用' : '启用'}
                </Button>
                <Popconfirm
                  title="轮换 Token？"
                  description="旧 Token 将立即失效"
                  onConfirm={() => doRotate(record)}
                >
                  <Button size="small">轮换</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="新建 MCP Token"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={submitCreate}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="名称" rules={[{ required: true, max: 128 }]}>
            <Input placeholder="例如：Cursor 开发环境" />
          </Form.Item>
          <Form.Item name="purpose" label="用途" rules={[{ required: true, max: 64 }]}>
            <Input placeholder="例如：本地 IDE 接入" />
          </Form.Item>
          <Form.Item name="tool_scope" label="工具范围" rules={[{ required: true, min: 1 }]}>
            <Checkbox.Group options={TOOL_OPTIONS} />
          </Form.Item>
          <Form.Item name="expires_at" label="过期时间（可选）">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`编辑 Token：${editing?.name || ''}`}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={submitEdit}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="tool_scope" label="工具范围" rules={[{ required: true, min: 1 }]}>
            <Checkbox.Group options={TOOL_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Token 明文（仅显示一次）"
        open={!!revealedToken}
        onCancel={() => setRevealedToken(null)}
        footer={[
          <Button key="copy" type="primary" icon={<CopyOutlined />}
            onClick={async () => {
              if (revealedToken) {
                await navigator.clipboard.writeText(revealedToken.token);
                message.success('已复制到剪贴板');
              }
            }}
          >
            复制
          </Button>,
          <Button key="close" onClick={() => setRevealedToken(null)}>关闭</Button>,
        ]}
      >
        <Paragraph>
          请妥善保存 <Text strong>{revealedToken?.name}</Text> 的 Token：
        </Paragraph>
        <Paragraph copyable={{ text: revealedToken?.token || '' }}>
          <Text code style={{ wordBreak: 'break-all' }}>{revealedToken?.token}</Text>
        </Paragraph>
        <Alert
          type="warning"
          showIcon
          message="Token 仅在创建或轮换时完整展示一次，请立即保存到 IDE 配置或安全存储。"
        />
      </Modal>
    </Card>
  );
}

function ToolsTab({ tools, toolOptions }: { tools: string[]; toolOptions: typeof TOOL_OPTIONS }) {
  return (
    <Card size="small" title="本地 MCP 服务工具列表">
      {toolOptions.map((opt) => {
        const enabled = tools.includes(opt.value);
        return (
          <div key={opt.value} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
            <Space>
              <Tag color={enabled ? 'green' : 'default'}>{enabled ? '已启用' : '未启用'}</Tag>
              <Text code>{opt.value}</Text>
            </Space>
            <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>{opt.label}</Paragraph>
          </div>
        );
      })}
    </Card>
  );
}

function OnboardingTab({ onboarding }: { onboarding: MCPOnboarding | null }) {
  const { message } = AntApp.useApp();
  if (!onboarding) {
    return <Alert type="info" showIcon message="IDE 接入说明加载失败或无权限" />;
  }
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card size="small" title="使用步骤">
        <Paragraph>{onboarding.description}</Paragraph>
        <Paragraph strong>环境变量：</Paragraph>
        <ul>
          {onboarding.env_vars.map((v) => (
            <li key={v.name}>
              <Text code>{v.name}</Text>：{v.description}
            </li>
          ))}
        </ul>
        <Paragraph strong>说明：</Paragraph>
        <ul>
          {onboarding.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      </Card>
      {Object.entries(onboarding.templates).map(([key, tpl]) => (
        <Card
          key={key}
          size="small"
          title={`${key.toUpperCase()} · 写入路径：${tpl.path}`}
          extra={
            <Button
              icon={<CopyOutlined />}
              onClick={async () => {
                await navigator.clipboard.writeText(tpl.value);
                message.success('已复制模板');
              }}
            >
              复制
            </Button>
          }
        >
          <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, overflow: 'auto' }}>
            {tpl.value}
          </pre>
        </Card>
      ))}
    </Space>
  );
}

function AuditTab({ logs }: { logs: MCPAuditLog[] }) {
  return (
    <Card size="small" title="MCP 调用审计（最近 100 条）">
      <Table<MCPAuditLog>
        rowKey="id"
        size="small"
        dataSource={logs}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: '时间', dataIndex: 'created_at', render: (v) => new Date(v).toLocaleString() },
          { title: '工具', dataIndex: 'tool_name', render: (v) => <Text code>{v}</Text> },
          { title: 'Token 摘要', dataIndex: 'mcp_config_id', render: (v) => <Text code>{(v || '').slice(0, 8)}</Text> },
          { title: '调用方', dataIndex: 'caller' },
          { title: '参数摘要', dataIndex: 'params_summary' },
          {
            title: '结果',
            dataIndex: 'result_status',
            render: (s: string) => <Tag color={s === 'success' || s === 'ok' ? 'green' : 'red'}>{s}</Tag>,
          },
          { title: '错误', dataIndex: 'error_message' },
        ]}
      />
    </Card>
  );
}
