import { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Button, Card, Modal, Space, Switch, Table, Tag, Typography } from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  ensureCodexMCPConfig,
  getTeamMCPOverview,
  listMCPAuditLogs,
  updateTeamMCPEnabled,
  type MCPAuditLog,
  type TeamMCPOverview,
} from '../api/mcp';
import { useTeam } from '../contexts/TeamContext';

const { Paragraph, Text, Title } = Typography;

const connectionStatusMeta: Record<string, { color: string; label: string }> = {
  connected: { color: 'green', label: '已连接' },
  ready: { color: 'blue', label: '可连接' },
  no_token: { color: 'orange', label: '未配置 Token' },
  disabled: { color: 'red', label: '不可用' },
};

export default function MCPManagement() {
  const { currentTeam, currentTeamId } = useTeam();
  const { message } = AntApp.useApp();
  const [overview, setOverview] = useState<TeamMCPOverview | null>(null);
  const [auditLogs, setAuditLogs] = useState<MCPAuditLog[]>([]);
  const [codexToken, setCodexToken] = useState('');
  const [ensureTokenError, setEnsureTokenError] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!currentTeamId) return;
    setLoading(true);
    try {
      try {
        const ensured = await ensureCodexMCPConfig(currentTeamId);
        setEnsureTokenError('');
        if (ensured.token) {
          setCodexToken(ensured.token);
          setShowToken(true);
        }
      } catch (e: any) {
        const detail = e.response?.status === 404
          ? '后端尚未加载自动生成 Token 接口，请重启 synkord-core'
          : e.response?.data?.detail || '自动生成 Codex Token 失败';
        setEnsureTokenError(detail);
        if (e.response?.status !== 403) {
          message.warning(detail);
        }
      }
      const [mcp, audit] = await Promise.all([
        getTeamMCPOverview(currentTeamId),
        listMCPAuditLogs(currentTeamId),
      ]);
      setOverview(mcp);
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

  const codexUrl = useMemo(() => {
    const apiBase = localStorage.getItem('synkord_api_base') || 'http://127.0.0.1:8000/api';
    const endpoint = overview?.streamable_http_endpoint || '/mcp';
    return apiBase.replace(/\/api\/?$/, '') + endpoint;
  }, [overview?.streamable_http_endpoint]);

  const codexConfig = useMemo(() => [
    '名称：synkord',
    '连接方式：流式 HTTP',
    `URL：${codexUrl}`,
    'Bearer 令牌环境变量：SYNKORD_MCP_TOKEN',
  ].join('\n'), [codexUrl]);

  const codexToml = useMemo(() => [
    '[mcp_servers.synkord]',
    `url = "${codexUrl}"`,
    'bearer_token_env_var = "SYNKORD_MCP_TOKEN"',
    'enabled = true',
  ].join('\n'), [codexUrl]);

  const displayStatus = useMemo(() => {
    if (overview?.status) {
      return overview.status;
    }
    if (!overview) {
      return {
        state: 'disabled' as const,
        ready: false,
        connected: false,
        reason: '正在读取 MCP 状态',
        active_tokens: 0,
      };
    }
    const activeTokens = (overview.configs || []).filter((item) => item.status === 'active').length;
    if (!overview.global_enabled) {
      return {
        state: 'disabled' as const,
        ready: false,
        connected: false,
        reason: '全局 MCP 服务未开启',
        active_tokens: activeTokens,
      };
    }
    if (!overview.enabled) {
      return {
        state: 'disabled' as const,
        ready: false,
        connected: false,
        reason: '团队 MCP 服务未开启',
        active_tokens: activeTokens,
      };
    }
    if (activeTokens === 0) {
      return {
        state: 'no_token' as const,
        ready: false,
        connected: false,
        reason: ensureTokenError || '尚无可用 MCP Token',
        active_tokens: 0,
      };
    }
    return {
      state: 'ready' as const,
      ready: true,
      connected: false,
      reason: '已就绪，等待 Codex 或其他 MCP 客户端连接',
      active_tokens: activeTokens,
    };
  }, [ensureTokenError, overview]);

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
        <div className="mcp-status-row" style={{ marginBottom: 16 }}>
          <div>
            <Title level={5}>连接状态</Title>
            <Space wrap>
              <Tag color={connectionStatusMeta[displayStatus.state]?.color}>
                {connectionStatusMeta[displayStatus.state]?.label}
              </Tag>
              <Text type="secondary">{displayStatus.reason}</Text>
            </Space>
            <div style={{ marginTop: 8 }}>
              <Space size={16} wrap>
                <Text type="secondary">可用 Token：{displayStatus.active_tokens}</Text>
                <Text type="secondary">
                  最近连接：{displayStatus.last_connected_at ? new Date(displayStatus.last_connected_at).toLocaleString() : '-'}
                </Text>
              </Space>
            </div>
          </div>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={load}>
            刷新状态
          </Button>
        </div>
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
          <Text type="secondary">Codex 流式 HTTP 地址</Text>
          <code>{codexUrl}</code>
          <Button size="small" icon={<CopyOutlined />} onClick={() => navigator.clipboard?.writeText(codexUrl)}>
            复制
          </Button>
        </div>
      </Card>


      <Card title="Codex 接入说明" style={{ marginTop: 16 }}>
        <Text type="secondary">在 Codex 自定义 MCP 中选择“流式 HTTP”，按下面字段填写；Token 建议通过环境变量提供。</Text>
        <Paragraph copyable={{ text: codexConfig }} style={{ marginTop: 12 }}>
          <pre style={{ margin: 0 }}>{codexConfig}</pre>
        </Paragraph>
        {codexToken && (
          <>
            <Text type="secondary">首次自动生成的 Token：</Text>
            <Paragraph copyable={{ text: codexToken }} style={{ marginTop: 12 }}>
              <pre style={{ margin: 0 }}>{codexToken}</pre>
            </Paragraph>
            <Text type="secondary">PowerShell 环境变量：</Text>
            <Paragraph copyable={{ text: `[Environment]::SetEnvironmentVariable("SYNKORD_MCP_TOKEN", "${codexToken}", "User")` }} style={{ marginTop: 12 }}>
              <pre style={{ margin: 0 }}>{`[Environment]::SetEnvironmentVariable("SYNKORD_MCP_TOKEN", "${codexToken}", "User")`}</pre>
            </Paragraph>
          </>
        )}
        <Text type="secondary">也可以写入 Codex 配置文件：</Text>
        <Paragraph copyable={{ text: codexToml }} style={{ marginTop: 12 }}>
          <pre style={{ margin: 0 }}>{codexToml}</pre>
        </Paragraph>
      </Card>

      <Card title="兼容 SSE 接入" style={{ marginTop: 16 }}>
        <Text type="secondary">用于仍采用 SSE 的 MCP 客户端。创建 Token 后，将地址中的 <code>&lt;team-token&gt;</code> 替换为实际 Token。</Text>
        <Paragraph copyable={{ text: serviceUrl }} style={{ marginTop: 12 }}>
          <pre style={{ margin: 0 }}>{serviceUrl}</pre>
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

    </div>
  );
}
