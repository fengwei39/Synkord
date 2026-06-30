import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  ApiOutlined,
  ApartmentOutlined,
  DatabaseOutlined,
  KeyOutlined,
  LeftOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { getProject } from '../api/projects';
import {
  createProjectMCPToken,
  getProjectMCPOverview,
  listProjectMCPAuditLogs,
  rotateProjectMCPToken,
  updateProjectMCPToken,
  type MCPAuditLog,
  type MCPConfig,
  type ProjectMCPOverview,
} from '../api/mcp';
import { useTeam } from '../contexts/TeamContext';

const { Paragraph, Text } = Typography;

const typeLabels: Record<string, string> = { backend: '后端服务', web: 'Web 前端', app: 'App 移动端' };
const toolOptions = [
  'get_project_entities',
  'get_project_apis',
  'get_entity_dependencies',
  'get_api_dependencies',
  'validate_entity_usage',
].map((value) => ({ value, label: value }));

export default function ProjectDetail() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { currentTeam, currentTeamId } = useTeam();
  const { message } = AntApp.useApp();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mcpOverview, setMcpOverview] = useState<ProjectMCPOverview | null>(null);
  const [audit, setAudit] = useState<MCPAuditLog[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [localStatus, setLocalStatus] = useState<any>(null);
  const [createdToken, setCreatedToken] = useState<string>('');
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tokenForm] = Form.useForm();

  const loadProject = useCallback(async () => {
    if (!currentTeamId || !projectId) return;
    setLoading(true);
    try {
      setProject(await getProject(currentTeamId, projectId));
    } finally {
      setLoading(false);
    }
  }, [currentTeamId, projectId]);

  const loadMCP = useCallback(async () => {
    if (!currentTeamId || !projectId) return;
    setMcpLoading(true);
    try {
      const [overview, auditResp, status] = await Promise.all([
        getProjectMCPOverview(currentTeamId, projectId),
        listProjectMCPAuditLogs(currentTeamId, projectId),
        window.synkord?.mcpGetStatus?.(),
      ]);
      setMcpOverview(overview);
      setAudit(auditResp.items || []);
      setLocalStatus(status || null);
    } finally {
      setMcpLoading(false);
    }
  }, [currentTeamId, projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  useEffect(() => {
    if (!currentTeamId || !projectId || !project?.name) return;
    window.synkord?.mcpSetActiveProject?.({
      teamId: currentTeamId,
      projectId,
      projectName: project.name,
    }).then(setLocalStatus).catch(() => undefined);
    loadMCP();
  }, [currentTeamId, loadMCP, project?.name, projectId]);

  if (loading) {
    return <div className="route-loading"><Spin /></div>;
  }

  if (!project) {
    return <Empty description="项目不存在" />;
  }

  return (
    <div className="project-page">
      <header className="page-header">
        <Button type="text" icon={<LeftOutlined />} onClick={() => navigate('/projects')}>返回项目</Button>
        <div className="page-title-row">
          <h1>{project.name}</h1>
          <span className="owner-badge">{currentTeam?.name || '当前团队'}</span>
        </div>
        <Text type="secondary">{project.description || '暂无项目描述'}</Text>
      </header>

      <Tabs
        items={[
          {
            key: 'overview',
            label: '项目概览',
            children: (
              <>
                <Card style={{ marginBottom: 16 }}>
                  <Descriptions column={2} size="small">
                    <Descriptions.Item label="项目类型">
                      <Tag color="blue">{typeLabels[project.project_type] || project.project_type}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="负责人">{project.owner || '-'}</Descriptions.Item>
                    <Descriptions.Item label="仓库地址">
                      {project.repo_url ? <a href={project.repo_url} target="_blank" rel="noreferrer">{project.repo_url}</a> : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="OpenAPI 版本">{project.openapi_version || '-'}</Descriptions.Item>
                    <Descriptions.Item label="创建时间">{project.created_at ? new Date(project.created_at).toLocaleString() : '-'}</Descriptions.Item>
                    <Descriptions.Item label="更新时间">{project.updated_at ? new Date(project.updated_at).toLocaleString() : '-'}</Descriptions.Item>
                  </Descriptions>
                </Card>

                <Card title="项目资产入口">
                  <Space wrap>
                    <Button icon={<ApiOutlined />} onClick={() => navigate(`/projects/${project.id}/apis`)}>查看接口</Button>
                    <Button icon={<DatabaseOutlined />} onClick={() => navigate(`/projects/${project.id}/models`)}>查看数据模型</Button>
                    <Button icon={<ApartmentOutlined />} onClick={() => navigate(`/projects/${project.id}/dependencies`)}>查看依赖拓扑</Button>
                  </Space>
                </Card>
              </>
            ),
          },
          {
            key: 'mcp',
            label: 'MCP',
            children: (
              <ProjectMCPTab
                loading={mcpLoading}
                overview={mcpOverview}
                audit={audit}
                localStatus={localStatus}
                createdToken={createdToken}
                onRefresh={loadMCP}
                onCreate={() => {
                  tokenForm.setFieldsValue({
                    name: 'Codex',
                    purpose: 'IDE',
                    tool_scope: toolOptions.map((item) => item.value),
                  });
                  setTokenModalOpen(true);
                }}
                onStart={async () => {
                  setLocalStatus(await window.synkord?.mcpStart?.());
                  message.success('本地 MCP 服务已启动');
                }}
                onStop={async () => {
                  setLocalStatus(await window.synkord?.mcpStop?.());
                  message.success('本地 MCP 服务已停止');
                }}
                onRotate={async (item) => {
                  if (!currentTeamId || !projectId) return;
                  const rotated = await rotateProjectMCPToken(currentTeamId, projectId, item.id);
                  setCreatedToken(rotated.token || '');
                  message.success('Token 已重新生成');
                  loadMCP();
                }}
                onToggle={async (item) => {
                  if (!currentTeamId || !projectId) return;
                  await updateProjectMCPToken(currentTeamId, projectId, item.id, {
                    status: item.status === 'active' ? 'disabled' : 'active',
                  });
                  message.success(item.status === 'active' ? 'Token 已停用' : 'Token 已启用');
                  loadMCP();
                }}
              />
            ),
          },
        ]}
      />

      <Modal
        title="创建当前项目 MCP Token"
        open={tokenModalOpen}
        onCancel={() => setTokenModalOpen(false)}
        onOk={async () => {
          if (!currentTeamId || !projectId) return;
          const values = await tokenForm.validateFields();
          const created = await createProjectMCPToken(currentTeamId, projectId, values);
          setCreatedToken(created.token || '');
          setTokenModalOpen(false);
          message.success('Token 已创建，明文仅展示一次');
          loadMCP();
        }}
      >
        <Form form={tokenForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如 Codex / Cursor" />
          </Form.Item>
          <Form.Item name="purpose" label="用途" rules={[{ required: true, message: '请输入用途' }]}>
            <Input placeholder="例如 IDE" />
          </Form.Item>
          <Form.Item name="tool_scope" label="工具范围">
            <Select mode="multiple" options={toolOptions} />
          </Form.Item>
          <Form.Item name="expires_at" label="过期日期">
            <Input placeholder="YYYY-MM-DD，可留空" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function ProjectMCPTab(props: {
  loading: boolean;
  overview: ProjectMCPOverview | null;
  audit: MCPAuditLog[];
  localStatus: any;
  createdToken: string;
  onRefresh: () => void;
  onCreate: () => void;
  onStart: () => void;
  onStop: () => void;
  onRotate: (item: MCPConfig) => void;
  onToggle: (item: MCPConfig) => void;
}) {
  const endpoint = props.localStatus?.url || props.overview?.local_hint_url || 'http://127.0.0.1:37991/mcp';
  const ideConfig = useMemo(() => JSON.stringify({
    mcpServers: {
      synkord: {
        url: endpoint,
        headers: {
          Authorization: 'Bearer ${SYNKORD_MCP_TOKEN}',
        },
      },
    },
  }, null, 2), [endpoint]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {props.createdToken && (
        <Alert
          type="warning"
          showIcon
          message="请立即保存 MCP Token"
          description={<Paragraph copyable={{ text: props.createdToken }} style={{ margin: 0 }}><code>{props.createdToken}</code></Paragraph>}
        />
      )}

      <Card
        loading={props.loading}
        title="本地 MCP 服务"
        extra={<Button icon={<ReloadOutlined />} onClick={props.onRefresh}>刷新</Button>}
      >
        <Descriptions column={2} size="small">
          <Descriptions.Item label="服务状态">
            <Tag color={props.localStatus?.running ? 'green' : 'default'}>{props.localStatus?.running ? '运行中' : '未运行'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="当前项目">{props.localStatus?.activeProject?.projectName || '-'}</Descriptions.Item>
          <Descriptions.Item label="本地地址"><code>{endpoint}</code></Descriptions.Item>
          <Descriptions.Item label="Token 状态">
            <Tag color={props.overview?.status.ready ? 'green' : 'orange'}>{props.overview?.status.reason || '-'}</Tag>
          </Descriptions.Item>
        </Descriptions>
        <Space style={{ marginTop: 16 }}>
          <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={props.onStart}>启动</Button>
          <Button onClick={props.onStop}>停止</Button>
          <Button icon={<KeyOutlined />} onClick={props.onCreate}>创建 Token</Button>
        </Space>
      </Card>

      <Card title="IDE 配置">
        <Paragraph copyable={{ text: ideConfig }} style={{ marginBottom: 0 }}>
          <pre>{ideConfig}</pre>
        </Paragraph>
      </Card>

      <Card title="项目 MCP Token">
        <Table
          rowKey="id"
          dataSource={props.overview?.configs || []}
          pagination={false}
          columns={[
            { title: '名称', dataIndex: 'name' },
            { title: '用途', dataIndex: 'purpose' },
            { title: 'Token', dataIndex: 'token_preview', render: (value) => <code>{value}</code> },
            { title: '状态', dataIndex: 'status', render: (value) => <Tag color={value === 'active' ? 'green' : 'default'}>{value === 'active' ? '启用' : '停用'}</Tag> },
            { title: '工具范围', dataIndex: 'tool_scope', render: (items: string[]) => <Space wrap>{items?.map((item) => <Tag key={item}>{item}</Tag>)}</Space> },
            {
              title: '操作',
              width: 180,
              render: (_, item: MCPConfig) => (
                <Space>
                  <Button size="small" onClick={() => props.onToggle(item)}>{item.status === 'active' ? '停用' : '启用'}</Button>
                  <Button size="small" onClick={() => props.onRotate(item)}>轮换</Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Card title="调用审计">
        <Table
          rowKey="id"
          dataSource={props.audit}
          pagination={{ pageSize: 8 }}
          columns={[
            { title: '工具', dataIndex: 'tool_name' },
            { title: '调用方', dataIndex: 'caller' },
            { title: '参数', dataIndex: 'params_summary', ellipsis: true },
            { title: '结果', dataIndex: 'result_status', render: (value) => <Tag color={value === 'success' ? 'green' : 'red'}>{value}</Tag> },
            { title: '时间', dataIndex: 'created_at', render: (value) => value ? new Date(value).toLocaleString() : '-' },
          ]}
        />
      </Card>
    </Space>
  );
}
