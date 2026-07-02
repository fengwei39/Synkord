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
  Form,
  Input,
  Row,
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
import { useParams } from 'react-router-dom'
import type { ReactNode } from 'react'

const { Title, Text } = Typography

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

// ============================================================================
// STDIO 接入默认值（只读展示用）
// ============================================================================

const STDIO_DEFAULTS = {
  command: 'node',
  env: [
    { key: 'SYNKORD_API_BASE', value: 'http://127.0.0.1:8000/api' },
    { key: 'SYNKORD_HOME', value: '~/.synkord' }
  ]
} as const

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
  // 与其他可空字段一致：patch 不携带 reason 时保留 prev
  reason: patch.reason ?? prev.reason,
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
  prev.activeProject?.projectId !== next.activeProject?.projectId ||
  prev.reason !== next.reason ||
  prev.restartCount !== next.restartCount

// ============================================================================
// 主组件
// ============================================================================

export default function MCP() {
  const { projectId } = useParams<{ projectId: string }>()
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

  // STDIO 接入：只读展示 + 复制。固定字段用 STDIO_DEFAULTS 常量，
  // 只有 stdioArgs 是 state（args[0] 会随 detectInstallPath 变成真实路径）。
  const [stdioArgs, setStdioArgs] = useState<string[]>([
    '<path-to>/local-mcp-service.cjs',
    'stdio'
  ])
  const [installPath, setInstallPath] = useState<string>('')
  const [installPathStatus, setInstallPathStatus] = useState<
    'pending' | 'ok' | 'failed'
  >('pending')

  // ==========================================================================
  // 自动检测 local-mcp-service.cjs 绝对路径
  // ==========================================================================
  // 调用主进程 mcp:get-install-path 拿到真实路径，
  // 替换 stdioArgs[0] 中的 <path-to> 占位符。
  const detectInstallPath = async () => {
    try {
      const r = await window.synkord?.mcpGetInstallPath?.()
      if (r?.servicePath) {
        setInstallPath(r.servicePath)
        setInstallPathStatus('ok')
        setStdioArgs((prev) => {
          // 只替换仍是占位符的那一项（用户可能已自定义过）
          const next = [...prev]
          const idx = next.findIndex(
            (a) => a === '<path-to>/local-mcp-service.cjs' || a === ''
          )
          if (idx >= 0) next[idx] = r.servicePath
          else if (next.length === 0) next.push(r.servicePath)
          return next
        })
        messageApi.success('已更新安装路径')
      } else {
        setInstallPathStatus('failed')
        messageApi.error('未检测到安装路径，请手动填写「参数」第一项')
      }
    } catch (e: any) {
      setInstallPathStatus('failed')
      messageApi.error('路径检测失败：' + (e?.message || '未知错误'))
    }
  }

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
    detectInstallPath()
    return () => stopUptimeTimer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 订阅主进程事件（仅挂载一次）— 主通道，状态变更实时推送
  // 说明：主进程 mcpStart 走 webContents.send('mcp:event') 与 ipcMain.handle() 两条不同 IPC 通道，
  //       派发顺序不可控。setStatus 使用函数式 prev 形态 + mergeStatus 的可空字段 ?? 兜底，
  //       保证即便事件与 IPC return 乱序到达也能收敛到一致结果。
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

  // 兜底轮询：仅在事件源稀疏的状态下启用，且降频到 5s
  // - running / starting：主进程事件频率高，不需要轮询
  // - idle / stopped / failed / restarting：状态可能在两次事件之间"卡住"，兜底拉一次保证 UI 不陈旧
  useEffect(() => {
    const POLL_INTERVAL_MS = 5000
    const needsPolling = ['idle', 'stopped', 'failed', 'restarting'].includes(
      status.state
    )
    if (!needsPolling) return
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
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.state])

  // 拉取访问日志（间隔可调；autoRefresh 关闭时不创建 interval）
  useEffect(() => {
    if (!autoRefresh) return
    const fetchLogs = async () => {
      try {
        // 后端只支持 limit 不支持 offset，采用客户端分页
        // 拉取当前页对应的总量，limit = page * pageSize（最小 50）
        const limit = Math.max(accessPage * accessPageSize, 50)
        const result = await window.synkord?.mcpGetAccessLog?.(limit)
        if (result) {
          // result: { items: MCPAccessLogEntry[], total: number }
          // items 是末尾 N 条（按时间倒序），total 是文件真实总行数
          setAccessLogs(result.items)
          setAccessTotal(result.total)
          if (result.items.length > 0) {
            // 始终以最新一条日志覆盖 lastClientUA / lastClientTime
            setLastClientUA(result.items[0].ua)
            setLastClientTime(result.items[0].ts)
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
      const [s, logsResult] = await Promise.all([
        window.synkord?.mcpGetStatus?.(),
        window.synkord?.mcpGetAccessLog?.(limit)
      ])
      if (s) {
        setStatus(s)
      }
      if (logsResult) {
        setAccessLogs(logsResult.items)
        setAccessTotal(logsResult.total)
        if (logsResult.items.length > 0) {
          setLastClientUA(logsResult.items[0].ua)
          setLastClientTime(logsResult.items[0].ts)
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
      // 移除成功 toast：状态变更由事件推送 + 页面 Alert / Badge 自动驱动
    } catch (e: any) {
      // 仅 IPC 通道通信异常才弹窗；业务启动失败由主进程 state=failed 事件自动渲染
      messageApi.error('启动指令下发失败：' + (e?.message || '未知错误'))
    } finally {
      setPending(null)
    }
  }

  const handleStop = async () => {
    setPending('stop')
    try {
      const s = await window.synkord?.mcpStop?.()
      if (s) setStatus(s)
      // 移除成功 toast：状态变更由事件推送 + 页面 Alert / Badge 自动驱动
    } catch (e: any) {
      messageApi.error('停止指令下发失败：' + (e?.message || '未知错误'))
    } finally {
      setPending(null)
    }
  }

  const handleRestart = async () => {
    setPending('restart')
    try {
      const s = await window.synkord?.mcpRestart?.()
      if (s) setStatus(s)
      // 移除成功 toast：状态变更由事件推送 + 页面 Alert / Badge 自动驱动
    } catch (e: any) {
      messageApi.error('重启指令下发失败：' + (e?.message || '未知错误'))
    } finally {
      setPending(null)
    }
  }

  // ==========================================================================
  // 运行时长
  // ==========================================================================

  // 单独追踪"是否首次进入 running"，避免重复清零累计时长。
  // 场景：运行中事件推送导致 status 短暂变为 running→running 抖动，
  //       不应把已经累计的 uptime 归零。
  const wasRunningRef = useRef(false)

  const startUptimeTimer = () => {
    if (uptimeTimer.current) return
    // 只有"非 running → running"的转换才清零；保持 running 期间不重置
    if (!wasRunningRef.current) {
      setUptime(0)
    }
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
      wasRunningRef.current = true
    } else {
      stopUptimeTimer()
      wasRunningRef.current = false
    }
  }, [status.state])

  // ==========================================================================
  // STDIO 接入配置生成
  // ==========================================================================

  // 由 STDIO_DEFAULTS + stdioArgs 组装出最终写入 IDE 配置文件的对象
  const buildStdioConfig = () => {
    const server: Record<string, unknown> = {
      command: STDIO_DEFAULTS.command,
      args: stdioArgs.map((a) => a.trim()).filter(Boolean)
    }
    const env = Object.fromEntries(
      STDIO_DEFAULTS.env
        .filter((e) => e.key.trim())
        .map((e) => [e.key.trim(), e.value])
    )
    if (Object.keys(env).length > 0) server.env = env
    return { mcpServers: { synkord: server } }
  }

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(buildStdioConfig(), null, 2)
      )
      messageApi.success('MCP 配置已复制到剪贴板')
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
            <span>HTTP 服务（端口 37991）</span>
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
              // pending 仅作防抖（避免狂点），按钮 loading 视觉移除：
              // IPC 瞬时返回，按钮 loading 一闪反而误导；启动中状态由页面 starting Alert 承担
              onClick={handleStart}
            >
              启动 HTTP 服务
            </Button>
            <Button
              danger
              icon={<PoweroffOutlined />}
              disabled={!canStop}
              onClick={handleStop}
            >
              停止
            </Button>
            <Button
              icon={<ReloadOutlined />}
              disabled={!canRestart}
              onClick={handleRestart}
            >
              重启
            </Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Space size={4} wrap style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            支持的 HTTP 客户端：
          </Text>
          {MCP_CLIENTS.filter((c) => c.mode === 'http').map((c) => (
            <Tag key={c.id}>{c.name}</Tag>
          ))}
        </Space>

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
              <Text type="secondary">地址：</Text>
              <Text code style={{ fontSize: 12 }}>
                {status.url ||
                  `http://127.0.0.1:${status.port ?? 37991}/mcp`}
              </Text>
              <Button
                size="small"
                type="link"
                icon={<CopyOutlined />}
                onClick={async () => {
                  const url =
                    status.url ||
                    `http://127.0.0.1:${status.port ?? 37991}/mcp`
                  try {
                    await navigator.clipboard.writeText(url)
                    messageApi.success('URL 已复制')
                  } catch {
                    messageApi.error('复制失败')
                  }
                }}
              >
                复制 URL
              </Button>
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
          title="HTTP 服务未启动"
          description="使用 Cursor / VS Code / JetBrains 时需要点「启动 HTTP 服务」。Codex / Claude CLI 用 STDIO 模式，无需此项。"
          style={{ marginBottom: 16 }}
        />
      )}

      {status.state === 'starting' && (
        <Alert
          type="info"
          showIcon
          icon={<LoadingOutlined spin />}
          title="HTTP 服务启动中…"
          description="等待子进程就绪信号（最长 5 秒）。"
          style={{ marginBottom: 16 }}
        />
      )}

      {status.state === 'restarting' && (
        <Alert
          type="warning"
          showIcon
          icon={<ReloadOutlined spin />}
          title="HTTP 服务异常退出，正在自动重启…"
          description={`已重试 ${status.restartCount ?? 0} / 3 次。如持续失败，请查看上方失败原因。`}
          style={{ marginBottom: 16 }}
        />
      )}

      {status.state === 'stopped' && (
        <Alert
          type="warning"
          showIcon
          title="HTTP 服务已停止"
          description="服务已停止。重新启动后可继续接收 IDE 请求；使用 Codex / Claude CLI 则无需此服务。"
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
                    const result = await window.synkord?.mcpGetAccessLog?.(limit)
                    if (result) {
                      setAccessLogs(result.items)
                      setAccessTotal(result.total)
                      if (result.items.length > 0) {
                        setLastClientUA(result.items[0].ua)
                        setLastClientTime(result.items[0].ts)
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
            <span>STDIO 接入（Codex / Claude CLI）</span>
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="如何把这套配置接入你的 IDE"
          description={
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12 }}>
              <li>点击下方「复制 MCP 配置」按钮，把 JSON 拷到剪贴板</li>
              <li>
                粘贴到 IDE 的 MCP 配置文件：
                <ul style={{ marginTop: 4 }}>
                  <li>
                    <Text code>~/.codex/mcp.json</Text>（Codex CLI）
                  </li>
                  <li>
                    <Text code>~/.claude.json</Text> 或{' '}
                    <Text code>~/.claude/settings.json</Text>（Claude CLI）
                  </li>
                </ul>
              </li>
              <li>重启 IDE，stdin/stdout 由 IDE 自己 spawn</li>
            </ol>
          }
        />

        <Form layout="vertical" size="small">
          {/* 启动命令 + 参数合并展示 */}
          <Form.Item
            label={
              <Space size={8}>
                <span>启动命令 + 参数</span>
                {/* 路径检测状态：行内可见 */}
                {installPathStatus === 'ok' && (
                  <Tag color="success" icon={<CheckCircleOutlined />}>
                    已检测
                  </Tag>
                )}
                {installPathStatus === 'failed' && (
                  <Tag color="error" icon={<ExclamationCircleOutlined />}>
                    未检测
                  </Tag>
                )}
                {installPathStatus === 'pending' && (
                  <Tag color="processing" icon={<LoadingOutlined />}>
                    检测中
                  </Tag>
                )}
                <Tooltip
                  title={
                    installPathStatus === 'ok'
                      ? `已检测到安装路径：${installPath}`
                      : installPathStatus === 'failed'
                        ? '未检测到安装路径'
                        : '正在检测安装路径…'
                  }
                >
                  <Button
                    type="link"
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={detectInstallPath}
                  >
                    重新检测路径
                  </Button>
                </Tooltip>
              </Space>
            }
          >
            {/* 启动命令（命令本身单独可复制） */}
            <div style={{ marginBottom: 8 }}>
              <Text
                copyable={{
                  text: STDIO_DEFAULTS.command,
                  tooltips: ['复制命令', '已复制']
                }}
                code
                style={{ fontSize: 13 }}
              >
                {STDIO_DEFAULTS.command}
              </Text>
            </div>
            {/* 参数列表（每项单独可复制；失败时第一项允许内联编辑） */}
            {stdioArgs.map((arg, i) => {
              const isPlaceholder =
                arg === '<path-to>/local-mcp-service.cjs' || arg === ''
              // 失败态 + 第一项（路径参数）→ 允许内联编辑，闭环"请手动填写"
              const editable =
                i === 0 && installPathStatus === 'failed'
              return (
                <div key={i} style={{ marginBottom: 6 }}>
                  {editable ? (
                    <Input
                      size="small"
                      value={arg}
                      placeholder="例如 /Users/you/synkord/frontend/electron/local-mcp-service.cjs"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const next = [...stdioArgs]
                        next[i] = e.target.value
                        setStdioArgs(next)
                      }}
                      style={{ fontSize: 13, maxWidth: 720 }}
                    />
                  ) : (
                    <Text
                      copyable={{
                        text: arg,
                        tooltips: ['复制', '已复制']
                      }}
                      code
                      type={isPlaceholder ? 'danger' : undefined}
                      style={{ fontSize: 13, wordBreak: 'break-all' }}
                    >
                      {arg || '(空)'}
                    </Text>
                  )}
                </div>
              )
            })}
          </Form.Item>

          {/* 环境变量（每行：键、值、整段 三个独立可复制） */}
          <Form.Item label="环境变量">
            {STDIO_DEFAULTS.env.map((env, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap'
                }}
              >
                {/* 键：单独可复制 */}
                <Text
                  copyable={{ text: env.key, tooltips: ['复制键', '已复制'] }}
                  code
                  style={{ fontSize: 13 }}
                >
                  {env.key}
                </Text>
                <Text type="secondary">=</Text>
                {/* 值：单独可复制 */}
                <Text
                  copyable={{ text: env.value, tooltips: ['复制值', '已复制'] }}
                  code
                  style={{ fontSize: 13 }}
                >
                  {env.value}
                </Text>
                {/* KEY=VALUE 组合：方便 .env 文件粘贴 */}
                <Text
                  copyable={{
                    text: `${env.key}=${env.value}`,
                    tooltips: ['复制 KEY=VALUE', '已复制']
                  }}
                  type="secondary"
                  style={{ fontSize: 12 }}
                >
                  · 整段
                </Text>
              </div>
            ))}
          </Form.Item>
        </Form>

        <Button
          type="primary"
          icon={<CopyOutlined />}
          onClick={copyConfig}
          disabled={
            installPathStatus === 'pending' ||
            (installPathStatus === 'failed' && !stdioArgs[0]?.trim())
          }
        >
          复制 MCP 配置
        </Button>

        <Alert
          type={installPathStatus === 'failed' ? 'warning' : 'info'}
          showIcon
          style={{ marginTop: 16 }}
          title={
            installPathStatus === 'failed'
              ? '未检测到安装路径，请手动填写「参数」第一项'
              : installPathStatus === 'ok'
                ? '已自动检测到安装路径'
                : '正在检测安装路径…'
          }
          description={
            <Text>
              {installPathStatus === 'ok' && installPath ? (
                <>
                  当前路径：<Text code>{installPath}</Text>
                </>
              ) : (
                <>
                  路径示例：<Text code>~/synkord/frontend/electron/local-mcp-service.cjs</Text>
                </>
              )}
              <br />
              IDE 配置文件：<Text code>~/.codex/mcp.json</Text>（Codex）或 Claude CLI 对应文件
            </Text>
          }
        />
      </Card>
    </div>
  )
}
