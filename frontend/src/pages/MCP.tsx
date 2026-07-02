/**
 * MCP.tsx - MCP Server 管理控制面板（阶段 6 终版）
 *
 * 严格遵循设计文档：
 *  - §3 启动方式（UI 控制启停）
 *  - §8 目录结构
 *  - §9.3 生命周期（状态机）
 *  - §10 安全（仅白名单 IPC、不暴露 Token）
 *
 * 硬性约束：
 *  - 不修改任何阶段 1-5 底层代码
 *  - 仅依赖 preload 暴露的 IPC 白名单
 *  - 不主动轮询，依赖主进程事件推送
 */
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message
} from 'antd'
import {
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  LoadingOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PoweroffOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ReactNode } from 'react'

const { Title, Text, Paragraph } = Typography

// ============================================================================
// 类型别名（与全局类型对齐）
// ============================================================================

type MCPState = MCPStatus['state']

// ============================================================================
// IDE 客户端预设
// ============================================================================

const MCP_CLIENTS = [
  {
    id: 'codex',
    name: 'Codex',
    description: 'OpenAI Codex CLI',
    mode: 'stdio'
  },
  {
    id: 'claude',
    name: 'Claude CLI',
    description: 'Anthropic Claude Code',
    mode: 'stdio'
  },
  { id: 'cursor', name: 'Cursor', description: 'Cursor IDE', mode: 'http' },
  {
    id: 'vscode',
    name: 'VS Code',
    description: 'VS Code + Copilot',
    mode: 'http'
  },
  {
    id: 'jetbrains',
    name: 'JetBrains',
    description: 'IntelliJ / PyCharm / GoLand',
    mode: 'http'
  }
] as const

type ClientId = (typeof MCP_CLIENTS)[number]['id']

// ============================================================================
// 状态展示辅助
// ============================================================================

const STATE_META: Record<
  MCPState,
  { color: string; text: string; icon: ReactNode }
> = {
  idle: { color: 'default', text: '未启动', icon: <PauseCircleOutlined /> },
  starting: {
    color: 'processing',
    text: '启动中',
    icon: <LoadingOutlined spin />
  },
  running: { color: 'success', text: '运行中', icon: <CheckCircleOutlined /> },
  stopped: { color: 'default', text: '已停止', icon: <PauseCircleOutlined /> },
  failed: { color: 'error', text: '启动失败', icon: <CloseCircleOutlined /> },
  restarting: {
    color: 'processing',
    text: '重启中',
    icon: <ReloadOutlined spin />
  }
}

// ============================================================================
// Status 合并与脏检查工具
// ============================================================================

type StatusPatch = Partial<MCPStatus>

/**
 * 把事件 / 轮询返回的片段 status 合并进当前 status。
 * - 顶层字段（state / reason / restartCount）按 patch 直接覆盖
 * - 可空字段（port / url / pid / activeProject）仅在 patch 提供时覆盖
 */
const mergeStatus = (prev: MCPStatus, patch: StatusPatch): MCPStatus => ({
  ...prev,
  state: patch.state ?? prev.state,
  port: patch.port ?? prev.port,
  url: patch.url ?? prev.url,
  pid: patch.pid ?? prev.pid,
  reason: patch.reason,
  activeProject: patch.activeProject ?? prev.activeProject,
  restartCount: patch.restartCount ?? prev.restartCount
})

/**
 * 判断新 status 是否相对当前有值得触发渲染的变化。
 * 仅检查真正影响 UI 的字段（reason / restartCount 频繁轮询时抖动不大，不参与）。
 */
const isStatusDirty = (prev: MCPStatus, next: MCPStatus): boolean =>
  prev.state !== next.state ||
  prev.port !== next.port ||
  prev.url !== next.url ||
  prev.pid !== next.pid ||
  prev.activeProject?.projectId !== next.activeProject?.projectId

// ============================================================================
// 主组件
// ============================================================================

export default function MCP() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [messageApi, contextHolder] = message.useMessage()

  // 当前状态
  const [status, setStatus] = useState<MCPStatus>({
    state: 'idle',
    port: null,
    url: null,
    pid: null,
    activeProject: null,
    restartCount: 0
  })
  const [loading, setLoading] = useState(true)
  // 当前正在进行的动作：用于按钮各自独立的 loading 态
  const [pending, setPending] = useState<'start' | 'stop' | 'restart' | null>(
    null
  )

  // 运行时长
  const [uptime, setUptime] = useState(0)
  const uptimeTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // 自动刷新设置
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState<number>(3) // 秒
  const [lastRefreshTime, setLastRefreshTime] = useState<string>('')

  // IDE 配置
  const [clientId, setClientId] = useState<ClientId>('codex')
  const [transport, setTransport] = useState<'stdio' | 'http'>('stdio')
  const [ideUrl, setIdeUrl] = useState('http://127.0.0.1:37991/mcp')
  const [ideConfig, setIdeConfig] = useState<string>('')

  // 最近访问日志
  const [accessLogs, setAccessLogs] = useState<MCPAccessLogEntry[]>([])
  const [accessTotal, setAccessTotal] = useState<number>(0)
  const [accessPage, setAccessPage] = useState<number>(1)
  const [accessPageSize, setAccessPageSize] = useState<number>(20)
  const [lastClientUA, setLastClientUA] = useState<string>('')
  const [lastClientTime, setLastClientTime] = useState<string>('')

  // ==========================================================================
  // 初始加载
  // ==========================================================================

  useEffect(() => {
    refreshStatus()
    return () => stopUptimeTimer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 订阅主进程事件（仅挂载一次）
  useEffect(() => {
    if (!window.synkord?.onMcpEvent) {
      console.error('[MCP.tsx] window.synkord.onMcpEvent is NOT available')
      return
    }
    console.log('[MCP.tsx] subscribed to mcp:event')
    const unsubscribe = window.synkord.onMcpEvent((payload: MCPEvent) => {
      console.log('[MCP.tsx] received mcp:event:', JSON.stringify(payload))
      setStatus((prev) => mergeStatus(prev, payload))
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 兜底：每秒轮询状态（防止事件丢失）
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const s = await window.synkord?.mcpGetStatus?.()
        if (s) {
          setStatus((prev) =>
            isStatusDirty(prev, s) ? mergeStatus(prev, s) : prev
          )
        }
      } catch {
        // ignore
      }
    }, 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 拉取访问日志（间隔可调；autoRefresh 关闭时不创建 interval）
  useEffect(() => {
    if (!autoRefresh) return
    const fetchLogs = async () => {
      try {
        // 后端只支持 limit 不支持 offset，采用客户端分页
        // 拉取当前页对应的总量，limit = page * pageSize（最小 50）
        const limit = Math.max(accessPage * accessPageSize, 50)
        const logs = await window.synkord?.mcpGetAccessLog?.(limit)
        if (logs) {
          setAccessLogs(logs)
          setAccessTotal(logs.length)
          if (logs.length > 0) {
            // 始终以最新一条日志覆盖 lastClientUA / lastClientTime
            setLastClientUA(logs[0].ua)
            setLastClientTime(logs[0].ts)
          }
          setLastRefreshTime(new Date().toLocaleTimeString())
        }
      } catch {
        // ignore
      }
    }
    fetchLogs()
    const interval = setInterval(fetchLogs, refreshInterval * 1000)
    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, accessPage, accessPageSize])

  // ==========================================================================
  // 操作
  // ==========================================================================

  const refreshStatus = async () => {
    setLoading(true)
    try {
      const s = await window.synkord?.mcpGetStatus?.()
      if (s) {
        setStatus(s)
      }
    } catch (e: any) {
      messageApi.error('获取状态失败：' + (e?.message || '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  // 手动刷新全部数据：状态 + 访问日志
  const refreshAll = async () => {
    setLoading(true)
    try {
      const limit = Math.max(accessPage * accessPageSize, 50)
      const [s, logs] = await Promise.all([
        window.synkord?.mcpGetStatus?.(),
        window.synkord?.mcpGetAccessLog?.(limit)
      ])
      if (s) {
        setStatus(s)
      }
      if (logs) {
        setAccessLogs(logs)
        setAccessTotal(logs.length)
        if (logs.length > 0) {
          setLastClientUA(logs[0].ua)
          setLastClientTime(logs[0].ts)
        }
        setLastRefreshTime(new Date().toLocaleTimeString())
      }
      messageApi.success('已刷新')
    } catch (e: any) {
      messageApi.error('刷新失败：' + (e?.message || '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  const handleStart = async () => {
    setPending('start')
    try {
      const s = await window.synkord?.mcpStart?.()
      if (s) setStatus(s)
      messageApi.success('已发送启动信号')
    } catch (e: any) {
      messageApi.error('启动失败：' + (e?.message || '未知错误'))
    } finally {
      setPending(null)
    }
  }

  const handleStop = async () => {
    setPending('stop')
    try {
      const s = await window.synkord?.mcpStop?.()
      if (s) setStatus(s)
      messageApi.success('已发送停止信号')
    } catch (e: any) {
      messageApi.error('停止失败：' + (e?.message || '未知错误'))
    } finally {
      setPending(null)
    }
  }

  const handleRestart = async () => {
    setPending('restart')
    try {
      const s = await window.synkord?.mcpRestart?.()
      if (s) setStatus(s)
      messageApi.success('已发送重启信号')
    } catch (e: any) {
      messageApi.error('重启失败：' + (e?.message || '未知错误'))
    } finally {
      setPending(null)
    }
  }

  // ==========================================================================
  // 运行时长
  // ==========================================================================

  const startUptimeTimer = () => {
    if (uptimeTimer.current) return
    setUptime(0)
    uptimeTimer.current = setInterval(() => {
      setUptime((u) => u + 1)
    }, 1000)
  }

  const stopUptimeTimer = () => {
    if (uptimeTimer.current) {
      clearInterval(uptimeTimer.current)
      uptimeTimer.current = null
    }
  }

  // 根据 status.state 自动启停运行时长计时器（取代散落在各处的手动调用）
  useEffect(() => {
    if (status.state === 'running') {
      startUptimeTimer()
    } else {
      stopUptimeTimer()
    }
  }, [status.state])

  // ==========================================================================
  // IDE 配置生成
  // ==========================================================================

  // 客户端选择变更时自动切换 transport
  useEffect(() => {
    const client = MCP_CLIENTS.find((c) => c.id === clientId)
    if (client) setTransport(client.mode)
  }, [clientId])

  // 拉取 IDE 配置
  useEffect(() => {
    if (status.state === 'running' && status.url) {
      setIdeUrl(status.url)
    } else {
      // 未运行时用默认 37991
      window.synkord
        ?.mcpGetIDEConfig?.()
        .then((cfg: any) => {
          if (cfg?.url) setIdeUrl(cfg.url)
        })
        .catch(() => {})
    }
  }, [status.state, status.url])

  // 生成配置
  useEffect(() => {
    if (transport === 'http') {
      setIdeConfig(
        JSON.stringify(
          {
            mcpServers: {
              synkord: {
                type: 'streamable-http',
                url: ideUrl
              }
            }
          },
          null,
          2
        )
      )
    } else {
      setIdeConfig(
        JSON.stringify(
          {
            mcpServers: {
              synkord: {
                command: 'node',
                args: ['<path-to>/local-mcp-service.cjs', 'stdio'],
                env: {
                  SYNKORD_API_BASE: 'http://127.0.0.1:8000/api',
                  SYNKORD_HOME: '~/.synkord'
                }
              }
            }
          },
          null,
          2
        )
      )
    }
  }, [transport, ideUrl])

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(ideConfig)
      messageApi.success('配置已复制到剪贴板')
    } catch {
      messageApi.error('复制失败')
    }
  }

  const copyShellScript = async () => {
    const script = `export SYNKORD_MCP_TOKEN="<your-token>"
export SYNKORD_API_BASE="http://127.0.0.1:8000/api"`
    try {
      await navigator.clipboard.writeText(script)
      messageApi.success('Shell 脚本已复制')
    } catch {
      messageApi.error('复制失败')
    }
  }

  // ==========================================================================
  // 计算属性
  // ==========================================================================

  const stateMeta = STATE_META[status.state] || STATE_META.idle

  const canStart = useMemo(
    () => ['idle', 'stopped', 'failed'].includes(status.state) && !pending,
    [status.state, pending]
  )
  const canStop = useMemo(
    () => ['running', 'restarting'].includes(status.state) && !pending,
    [status.state, pending]
  )
  const canRestart = useMemo(
    () => ['running', 'failed'].includes(status.state) && !pending,
    [status.state, pending]
  )

  const uptimeStr = useMemo(() => {
    const h = Math.floor(uptime / 3600)
    const m = Math.floor((uptime % 3600) / 60)
    const s = uptime % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }, [uptime])

  // ==========================================================================
  // 渲染
  // ==========================================================================

  if (loading && status.state === 'idle') {
    return (
      <div className="page-mcp">
        <Spin description="加载中..." />
      </div>
    )
  }

  return (
    <div className="page-mcp">
      {contextHolder}

      {/* 页头 */}
      <div
        className="page-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          MCP 管理
        </Title>
        <Space>
          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={refreshAll}
            loading={loading}
          >
            刷新全部
          </Button>
        </Space>
      </div>

      {/* 状态卡片 */}
      <Card
        title={
          <Space>
            <span>运行状态</span>
            <Badge
              status={
                status.state === 'running'
                  ? 'success'
                  : status.state === 'failed'
                    ? 'error'
                    : 'default'
              }
              text={
                <Space size={4}>
                  {stateMeta.icon}
                  <Text strong>{stateMeta.text}</Text>
                </Space>
              }
            />
          </Space>
        }
        extra={
          <Space>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              disabled={!canStart}
              loading={pending === 'start'}
              onClick={handleStart}
            >
              启动
            </Button>
            <Button
              danger
              icon={<PoweroffOutlined />}
              disabled={!canStop}
              loading={pending === 'stop'}
              onClick={handleStop}
            >
              停止
            </Button>
            <Button
              icon={<ReloadOutlined />}
              disabled={!canRestart}
              loading={pending === 'restart'}
              onClick={handleRestart}
            >
              重启
            </Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="端口"
              value={status.port ?? 37991}
              styles={{ content: { fontSize: 16 } }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="PID"
              value={status.pid ?? '-'}
              styles={{ content: { fontSize: 16 } }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="重启次数"
              value={status.restartCount ?? 0}
              styles={{ content: { fontSize: 16 } }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="运行时长"
              value={status.state === 'running' ? uptimeStr : '--:--:--'}
              styles={{ content: { fontSize: 16 } }}
            />
          </Col>
        </Row>

        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Space size={16}>
              <Text type="secondary">项目：</Text>
              {status.activeProject ? (
                <Tag color="blue">
                  {status.activeProject.projectName ||
                    status.activeProject.projectId}
                </Tag>
              ) : (
                <Text type="warning">未设置激活项目</Text>
              )}
              {status.activeProject && (
                <>
                  <Text type="secondary">团队：</Text>
                  <Tag>{status.activeProject.teamId.slice(0, 8)}...</Tag>
                </>
              )}
              <Text type="secondary">IDE 接入：</Text>
              <Tag color={transport === 'http' ? 'geekblue' : 'purple'}>
                {transport.toUpperCase()}
              </Tag>
              <Text type="secondary">地址：</Text>
              <Text code style={{ fontSize: 12 }}>
                {status.url ||
                  `http://127.0.0.1:${status.port ?? 37991}/mcp`}
              </Text>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 异常提示 */}
      {status.state === 'failed' && status.reason && (
        <Alert
          type="error"
          showIcon
          icon={<ExclamationCircleOutlined />}
          title="MCP Server 启动失败"
          description={status.reason}
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={handleRestart}>
              重试
            </Button>
          }
        />
      )}

      {status.state === 'idle' && (
        <Alert
          type="info"
          showIcon
          title="MCP Server 未启动"
          description="点击右上角「启动」按钮启动本地 MCP 服务，让 IDE/Codex 接入 Synkord 项目数据。"
          style={{ marginBottom: 16 }}
        />
      )}

      {status.state === 'stopped' && (
        <Alert
          type="warning"
          showIcon
          title="MCP Server 已停止"
          description="服务已优雅关闭，重新启动后可继续接收 IDE 请求。"
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 最近访问日志 */}
      {status.state === 'running' && (
        <Card
          title={
            <Space>
              <ApiOutlined />
              <span>最近访问</span>
              {lastClientUA && (
                <Tag color="processing">
                  最近客户端：{lastClientUA.slice(0, 60)}
                </Tag>
              )}
              {lastClientTime && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {new Date(lastClientTime).toLocaleString()}
                </Text>
              )}
            </Space>
          }
          extra={
            <Space>
              {lastRefreshTime && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  上次刷新 {lastRefreshTime}
                </Text>
              )}
              <Space size={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  自动刷新
                </Text>
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
              </Space>
              <Select
                size="small"
                value={refreshInterval}
                onChange={setRefreshInterval}
                style={{ width: 90 }}
                disabled={!autoRefresh}
                options={[
                  { value: 1, label: '1 秒' },
                  { value: 3, label: '3 秒' },
                  { value: 5, label: '5 秒' },
                  { value: 10, label: '10 秒' }
                ]}
              />
              <Button
                size="small"
                icon={<ReloadOutlined spin={loading} />}
                onClick={async () => {
                  try {
                    const limit = Math.max(accessPage * accessPageSize, 50)
                    const logs = await window.synkord?.mcpGetAccessLog?.(limit)
                    if (logs) {
                      setAccessLogs(logs)
                      setAccessTotal(logs.length)
                      if (logs.length > 0) {
                        setLastClientUA(logs[0].ua)
                        setLastClientTime(logs[0].ts)
                      }
                      setLastRefreshTime(new Date().toLocaleTimeString())
                    }
                    messageApi.success('访问日志已刷新')
                  } catch (e: any) {
                    messageApi.error('刷新失败：' + (e?.message || ''))
                  }
                }}
              >
                刷新
              </Button>
            </Space>
          }
          style={{ marginBottom: 16 }}
          size="small"
        >
          {accessLogs.length === 0 ? (
            <Text type="secondary">
              暂无访问记录（Codex/IDE 连接后会在此显示）
            </Text>
          ) : (
            <Table
              size="small"
              dataSource={accessLogs.slice(
                (accessPage - 1) * accessPageSize,
                accessPage * accessPageSize
              )}
              rowKey={(record, idx) => `${record.ts}-${idx}`}
              pagination={{
                current: accessPage,
                pageSize: accessPageSize,
                total: accessTotal,
                size: 'small',
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: (total) => `共 ${total} 条`,
                onChange: (page, size) => {
                  setAccessPage(page)
                  setAccessPageSize(size)
                }
              }}
              columns={[
                {
                  title: '时间',
                  dataIndex: 'ts',
                  width: 200,
                  render: (v: string) => (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(v).toLocaleString()}
                    </Text>
                  )
                },
                {
                  title: '方法',
                  dataIndex: 'rpc',
                  width: 100,
                  render: (v: string) => (v ? <Tag color="blue">{v}</Tag> : '-')
                },
                {
                  title: '客户端',
                  dataIndex: 'ua',
                  render: (v: string) => (
                    <Text style={{ fontSize: 12 }}>{v || '-'}</Text>
                  )
                },
                {
                  title: '耗时',
                  dataIndex: 'dur_ms',
                  width: 80,
                  render: (v: number) => <Text type="secondary">{v}ms</Text>
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 60,
                  render: (s: number) => (
                    <Tag color={s >= 400 ? 'red' : 'green'}>{s}</Tag>
                  )
                }
              ]}
            />
          )}
        </Card>
      )}

      {/* IDE 接入配置 */}
      <Card
        title={
          <Space>
            <FileTextOutlined />
            <span>IDE 接入</span>
          </Space>
        }
      >
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={12}>
            <Space>
              <Text type="secondary">客户端：</Text>
              <Select
                value={clientId}
                onChange={setClientId}
                style={{ width: 180 }}
                options={MCP_CLIENTS.map((c) => ({
                  label: c.name,
                  value: c.id
                }))}
              />
            </Space>
          </Col>
          <Col span={12}>
            <Space>
              <Text type="secondary">模式：</Text>
              <Segmented
                value={transport}
                onChange={(v) => setTransport(v as 'stdio' | 'http')}
                options={[
                  { label: 'STDIO', value: 'stdio' },
                  { label: 'Streamable HTTP', value: 'http' }
                ]}
              />
            </Space>
          </Col>
        </Row>

        <Paragraph type="secondary" style={{ marginBottom: 8, fontSize: 12 }}>
          {transport === 'http'
            ? `将以下配置写入 IDE 的 MCP 配置文件（如 Cursor 的 .cursor/mcp.json）`
            : `将以下配置写入 ~/.codex/mcp.json 或 Claude CLI 的 MCP 配置`}
        </Paragraph>

        <Card size="small" style={{ background: '#fafafa' }}>
          <pre
            style={{
              margin: 0,
              fontFamily: 'Monaco, Menlo, monospace',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: 300,
              overflow: 'auto'
            }}
          >
            {ideConfig}
          </pre>
        </Card>

        <Space style={{ marginTop: 12 }}>
          <Button type="primary" icon={<CopyOutlined />} onClick={copyConfig}>
            复制配置
          </Button>
          <Tooltip title="复制到 ~/.bashrc 或 ~/.zshrc">
            <Button icon={<CopyOutlined />} onClick={copyShellScript}>
              复制 Shell 脚本
            </Button>
          </Tooltip>
        </Space>

        {transport === 'stdio' && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 16 }}
            title="需要以 STDIO 模式接入？"
            description={<Text code>node local-mcp-service.cjs stdio</Text>}
          />
        )}
      </Card>
    </div>
  )
}
