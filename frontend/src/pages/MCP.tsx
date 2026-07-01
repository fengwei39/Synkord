import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  App as AntApp,
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
  Radio,
} from 'antd';
import {
  ApiOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloudServerOutlined,
  CopyOutlined,
  ReloadOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import {
  getProjectMCPOnboarding,
  getProjectMCPOverview,
  listProjectMCPAuditLogs,
  type MCPAuditLog,
  type MCPOnboarding,
  type ProjectMCPOverview,
} from '../api/mcp';
import { useTeam } from '../contexts/TeamContext';
import { useProject } from '../contexts/ProjectContext';
import { useAuth } from '../api/auth';

const { Title, Paragraph, Text } = Typography;

const TOOL_OPTIONS = [
  { value: 'get_project_entities', label: '查询当前项目的数据模型列表', icon: '📊' },
  { value: 'get_project_apis', label: '查询当前项目的 API 端点列表', icon: '🔌' },
  { value: 'get_entity_dependencies', label: '查询数据模型的依赖关系', icon: '🔗' },
  { value: 'get_api_dependencies', label: '查询 API 的依赖关系', icon: '🔗' },
  { value: 'validate_entity_usage', label: '校验代码中的实体使用是否正确', icon: '✅' },
];

// ============================================================================
// 主页面
// ============================================================================

export default function MCP() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { message: antMessage } = AntApp.useApp();
  const { currentTeamId } = useTeam();
  const { setCurrentProjectId } = useProject();
  const { token, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<ProjectMCPOverview | null>(null);
  const [auditLogs, setAuditLogs] = useState<MCPAuditLog[]>([]);
  const [onboarding, setOnboarding] = useState<MCPOnboarding | null>(null);

  useEffect(() => {
    if (!currentTeamId || !projectId) return;
    setCurrentProjectId(projectId);
    window.synkord?.mcpSetActiveProject?.({
      teamId: currentTeamId,
      projectId,
      projectName: overview?.project_name || projectId,
    }).catch(() => undefined);
  }, [currentTeamId, overview?.project_name, projectId, setCurrentProjectId]);

  // 通知 Electron 当前用户认证信息（用于 MCP 服务调用后端）
  useEffect(() => {
    if (token && user) {
      window.synkord?.mcpSetUserAuth?.({
        token,
        user_id: user.id,
        user_name: user.username || '',
      }).catch(() => undefined);
    }
  }, [token, user]);

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
      antMessage.error('加载 MCP 信息失败：' + (err?.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [currentTeamId, projectId]);

  if (loading && !overview) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
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
        defaultActiveKey="access"
        size="large"
        items={[
          {
            key: 'access',
            label: (
              <span>
                <RocketOutlined />
                IDE 接入
              </span>
            ),
            children: <IDEAccessTab onboarding={onboarding} />,
          },
          {
            key: 'tools',
            label: (
              <span>
                <ApiOutlined />
                可用工具
              </span>
            ),
            children: <ToolsTab tools={overview.tools || []} />,
          },
          {
            key: 'audit',
            label: (
              <span>
                <CloudServerOutlined />
                调用记录
                {auditLogs.length > 0 && (
                  <Badge count={Math.min(auditLogs.length, 99)} style={{ marginLeft: 8 }} />
                )}
              </span>
            ),
            children: <AuditTab logs={auditLogs} />,
          },
        ]}
      />
    </div>
  );
}

// ============================================================================
// Tab 1: IDE 接入（无需 Token）
// ============================================================================

type TransportType = 'stdio' | 'streamable-http';

function IDEAccessTab({ onboarding }: { onboarding: MCPOnboarding | null }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [transport, setTransport] = useState<TransportType>('stdio');

  // HTTP 配置
  const httpUrl = 'http://127.0.0.1:37991/mcp';

  // STDIO 配置
  const stdioCommand = 'node';
  const stdioArgs = 'local-mcp-service.cjs --mode stdio';

  const copyText = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    messageApi.success(`${label} 已复制`);
  };

  const copyConfig = async () => {
    let config: any;
    if (transport === 'stdio') {
      config = {
        mcpServers: {
          synkord: {
            command: stdioCommand,
            args: stdioArgs.split(' ').filter(Boolean),
          },
        },
      };
    } else {
      config = {
        mcpServers: {
          synkord: {
            type: 'streamable-http',
            url: httpUrl,
          },
        },
      };
    }
    await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    messageApi.success('配置已复制');
  };

  const configJson = transport === 'stdio'
    ? { mcpServers: { synkord: { command: stdioCommand, args: stdioArgs.split(' ').filter(Boolean) } } }
    : { mcpServers: { synkord: { type: 'streamable-http', url: httpUrl } } };

  return (
    <>
      {contextHolder}
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 说明 */}
        <Alert
          type="info"
          showIcon
          message="无需 Token"
          description={
            <Space direction="vertical" size={4}>
              <Text>IDE/Codex 无需任何认证即可连接本地 MCP 服务。</Text>
              <Text>MCP 服务内部使用当前登录用户身份调用后端 API。</Text>
              <Text>切换项目后无需修改任何配置。</Text>
            </Space>
          }
        />

        {/* 传输方式 */}
        <Card title="传输方式">
          <Radio.Group
            value={transport}
            onChange={e => setTransport(e.target.value)}
          >
            <Space direction="vertical">
              <Radio value="stdio">
                <Space>
                  <Text strong>STDIO</Text>
                  <Text type="secondary">（适用于 Codex CLI、Claude CLI 等）</Text>
                </Space>
              </Radio>
              <Radio value="streamable-http">
                <Space>
                  <Text strong>Streamable HTTP</Text>
                  <Text type="secondary">（适用于 VS Code、Cursor、JetBrains 等 IDE）</Text>
                </Space>
              </Radio>
            </Space>
          </Radio.Group>
        </Card>

        {/* 配置预览 + 复制 */}
        <Card title="IDE MCP 配置">
          <Text type="secondary">配置预览：</Text>
          <Input.TextArea
            value={JSON.stringify(configJson, null, 2)}
            readOnly
            autoSize={{ minRows: 4, maxRows: 8 }}
            style={{ fontFamily: 'monospace', marginTop: 8, marginBottom: 12 }}
          />
          <Button type="primary" icon={<CopyOutlined />} onClick={copyConfig}>
            复制配置
          </Button>
        </Card>

        {/* 预设模板 */}
        {onboarding?.templates && Object.keys(onboarding.templates).length > 0 && (
          <Card title="预设模板">
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {Object.entries(onboarding.templates).map(([key, tpl]) => (
                <Card key={key} size="small" styles={{ body: { padding: 12 } }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space direction="vertical" size={4}>
                      <Text strong>{key.toUpperCase()}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>写入路径：{tpl.path}</Text>
                    </Space>
                    <Button
                      icon={<CopyOutlined />}
                      onClick={() => copyText(tpl.value, `${key} 模板`)}
                    >
                      复制
                    </Button>
                  </Space>
                </Card>
              ))}
            </Space>
          </Card>
        )}
      </Space>
    </>
  );
}

// ============================================================================
// Tab 2: 可用工具
// ============================================================================

function ToolsTab({ tools }: { tools: string[] }) {
  return (
    <Card title={<Space><ApiOutlined /><span>可用的 MCP 工具</span><Tag>{tools.length} 个</Tag></Space>}>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        以下工具可通过 MCP 协议调用，用于查询和操作 Synkord 项目数据。
      </Paragraph>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {TOOL_OPTIONS.map((item) => {
          const enabled = tools.includes(item.value);
          return (
            <Card key={item.value} size="small" styles={{ body: { padding: 12 } }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }} align="center">
                <Space direction="vertical" size={2}>
                  <Space>
                    <Text style={{ fontSize: 16 }}>{item.icon}</Text>
                    <Text code>{item.value}</Text>
                  </Space>
                  <Text type="secondary">{item.label}</Text>
                </Space>
                <Tag color={enabled ? 'green' : 'default'} icon={enabled ? <CheckCircleOutlined /> : undefined}>
                  {enabled ? '已启用' : '未启用'}
                </Tag>
              </Space>
            </Card>
          );
        })}
      </Space>
    </Card>
  );
}

// ============================================================================
// Tab 3: 调用记录
// ============================================================================

function AuditTab({ logs }: { logs: MCPAuditLog[] }) {
  return (
    <Card title={<Space><CloudServerOutlined /><span>调用记录</span><Badge count={logs.length} style={{ backgroundColor: '#52c41a' }} /></Space>}>
      {logs.length === 0 ? (
        <Empty description="暂无调用记录" />
      ) : (
        <Table
          dataSource={logs}
          rowKey="id"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          columns={[
            { title: '时间', dataIndex: 'created_at', width: 160, render: (v: string) => new Date(v).toLocaleString() },
            { title: '工具', dataIndex: 'tool_name', width: 200, render: (v: string) => <Text code>{v}</Text> },
            { title: '调用方', dataIndex: 'caller', width: 100 },
            { title: '参数', dataIndex: 'params_summary', ellipsis: true },
            {
              title: '结果', dataIndex: 'result_status', width: 80,
              render: (s: string) => (
                <Tag color={s === 'success' || s === 'ok' ? 'green' : 'red'}>
                  {s === 'success' || s === 'ok' ? '成功' : '失败'}
                </Tag>
              ),
            },
            {
              title: '错误', dataIndex: 'error_message', ellipsis: true,
              render: (v: string) => v ? <Text type="danger">{v}</Text> : '-',
            },
          ]}
        />
      )}
    </Card>
  );
}
