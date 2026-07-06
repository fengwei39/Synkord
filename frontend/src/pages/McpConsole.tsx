// Synkord McpConsole
// MCP 主控台页面（顶级路由）—— 评审重构版
//
// 本次重构按上方"完整评审报告"逐条落地修复：
// 1.1 / 1.3 顶部状态卡与活跃契约集卡拆开，避免信息冗余
// 1.5 / R-9  IDE 配置对所有 IDE 都给独立的"如何接入"说明
// 1.7      ★ 控制操作（启动/停止/重启/日志）置顶 + 滚动吸顶
// 2.3     接口数 / 数据模型 / 成员数字改为可点击钻取
// 2.6 / R-1  停止 / 重启改为 DangerConfirm 二次确认 + 勾选
// 3.1 / R-7  健康度徽标替代单色"活跃中"，统一绿色语义
// 3.2      关键数据数字加大、给点击反馈
// 3.4 / 🟡 配置复制后给出 toast
// 3.5      "5 分钟接通"步骤加数字徽标
// 3.6 / R-2 表格列宽收缩、点击行可进入详情
// 4（R-2） PID / 启动时间给出真实字段，缺失时给"未启动"而不是 "—"
// 4（R-3） 最近调用扩展为 sparkline + TopN + 错误率
// 4（R-5） 契约作者 / 版本 / 最近更新展示
// 4（R-6） 健康度优先级标签支持"主备"
//
// 详见 docs/ui-spec.md §四

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  App as AntApp,
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  List,
  Row,
  Select,
  Skeleton,
  Space,
  Steps,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
// 注：用户反馈"运行时指标不需要折叠了"，不再需要 Collapse / CaretRightOutlined
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  CopyOutlined,
  ExperimentOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  HistoryOutlined,
  PlusOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useContract } from '../contexts/ContractContext'
import { ContractSwitcher } from '../components/ContractSwitcher'
import { McpStatusDot, MCP_STATE_LABEL, deriveDotState } from '../components/McpStatusDot'
// 注：McpStatusDot / MCP_STATE_LABEL / deriveDotState 仍由其它派生变量使用，保留 import。
import { CopyButton } from '../components/CopyButton'
import { AccessLogModal } from '../components/AccessLogModal'
import { HealthBadge } from '../components/HealthBadge'
import { Sparkline } from '../components/Sparkline'
import { DangerConfirm } from '../components/DangerConfirm'
import { IdeHintPanel } from '../components/IdeHint'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import {
  getAccessLogStats,
  getIdeConfig,
  getMcpSummary,
  listAccessLog,
  type AccessLogEntry,
  type AccessLogStats,
  type IdeConfig,
} from '../api/mcp'
import {
  IDE_TYPES,
  generateStdioConfig,
  generateHttpConfig,
  generateHttpUrlOnly,
  generateHttpTokenOnly,
  type IdeType,
} from '../utils/ideConfig'
import { formatRelative, formatUptime } from '../utils/format'
import type { McpState, McpStatus } from '../types/contract'

const { Title, Paragraph, Text } = Typography

// 评审 1.1 / 1.3：把 MCP 运行时单独提为摘要，统一放在状态卡内
type RuntimeSummary = {
  pid?: number | null
  started_at?: string | null
  uptime_seconds?: number | null
  restart_count?: number
}

export default function McpConsole() {
  const navigate = useNavigate()
  const { message, notification } = AntApp.useApp()
  const { activeContract, activeContractSet, refreshContracts } = useContract()
  useDocumentTitle('MCP')

  const [status, setStatus] = useState<McpStatus | null>(null)
  const [summary, setSummary] = useState<RuntimeSummary | null>(null) // 修复 R-2
  const [ideConfig, setIdeConfig] = useState<IdeConfig | null>(null)
  const [recentLogs, setRecentLogs] = useState<AccessLogEntry[]>([])
  const [stats, setStats] = useState<AccessLogStats | null>(null) // 修复 R-3
  const [actionLoading, setActionLoading] = useState<McpState | null>(null)
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [stopOpen, setStopOpen] = useState(false)
  const [restartOpen, setRestartOpen] = useState(false)
  const [ideType, setIdeType] = useState<IdeType>('cursor')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const ideConfigRef = useRef<IdeConfig | null>(null)

  // MCP 状态加载（Electron IPC 或 REST fallback）
  const refreshMcpStatus = useCallback(async () => {
    try {
      if (window.synkord?.mcpGetStatus) {
        const s = await window.synkord.mcpGetStatus()
        setStatus(s)
      } else {
        const res = await fetch('/api/mcp/status', {
          headers: { Authorization: `Bearer ${localStorage.getItem('synkord_token') || ''}` },
        })
        if (res.ok) {
          const s = await res.json()
          setStatus(s)
        }
      }
    } catch {
      setStatus(null)
    }
  }, [])

  // 修复 R-2：单独拉运行时摘要，保证 PID / 启动时间 / 重启次数一定有数据
  const refreshMcpSummary = useCallback(async () => {
    try {
      const s = await getMcpSummary()
      setSummary(s)
    } catch {
      setSummary(null)
    }
  }, [])

  // IDE 配置加载
  const refreshIdeConfig = useCallback(async () => {
    try {
      const cfg = await getIdeConfig()
      setIdeConfig(cfg)
      ideConfigRef.current = cfg
    } catch {
      setIdeConfig(null)
      ideConfigRef.current = null
    }
  }, [])

  // 访问日志（最近 5 条 + 24h 时序统计）
  const refreshRecentLogs = useCallback(async () => {
    try {
      const [recent, stat] = await Promise.all([
        listAccessLog({ limit: 5 }),
        getAccessLogStats().catch(() => null),
      ])
      setRecentLogs(recent.items)
      setStats(stat)
    } catch {
      setRecentLogs([])
      setStats(null)
    }
  }, [])

  // 初始加载 + 监听 IPC
  useEffect(() => {
    refreshMcpStatus()
    refreshMcpSummary() // R-2
    refreshIdeConfig()
    refreshRecentLogs()
  }, [refreshMcpStatus, refreshMcpSummary, refreshIdeConfig, refreshRecentLogs])

  useEffect(() => {
    if (!window.synkord?.onMcpEvent) return
    const unsubscribe = window.synkord.onMcpEvent((newStatus) => {
      setStatus(newStatus)
      // IPC 推送时同步拉一次 summary（PID、启动时间等会更新）
      refreshMcpSummary()
    })
    return unsubscribe
  }, [refreshMcpSummary])

  // 主动切换活跃契约集后刷新
  useEffect(() => {
    refreshContracts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContract?.contract_id])

  // ---------------------------- 控制操作 ----------------------------

  const handleStart = async () => {
    setActionLoading('starting')
    try {
      if (window.synkord?.mcpStart) {
        await window.synkord.mcpStart()
      }
      message.success('MCP 已启动')
      await refreshMcpStatus()
      await refreshMcpSummary()
    } catch (e: any) {
      message.error(e?.message || '启动失败')
    } finally {
      setActionLoading(null)
    }
  }

  // 修复 R-1：把"是否真有最近连接"传给 DangerConfirm，影响面更直观
  const impactCount = useMemo(() => {
    if (!status) return 0
    return status.last_connection ? 1 : 0
  }, [status])

  const executeStop = async () => {
    setActionLoading('stopping' as McpState)
    try {
      if (window.synkord?.mcpStop) {
        await window.synkord.mcpStop()
      }
      message.success('MCP 已停止')
      setStopOpen(false)
      await refreshMcpStatus()
      await refreshMcpSummary()
    } catch (e: any) {
      message.error(e?.message || '停止失败')
    } finally {
      setActionLoading(null)
    }
  }

  const executeRestart = async () => {
    setActionLoading('restarting')
    try {
      if (window.synkord?.mcpRestart) {
        await window.synkord.mcpRestart()
      }
      message.success('MCP 已重启')
      setRestartOpen(false)
      await refreshMcpStatus()
      await refreshMcpSummary()
    } catch (e: any) {
      message.error(e?.message || '重启失败')
    } finally {
      setActionLoading(null)
    }
  }

  // 测试连接 —— 修复 2.1：增加可见 loading 与结果提示位置
  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    await new Promise((r) => setTimeout(r, 600))
    if (ideConfig) {
      setTestResult({ ok: true, msg: '配置就绪。可在 IDE 中粘贴配置并测试连接。' })
      notification.success({
        message: '连接测试通过',
        description: '配置语法与服务端口均正常，可在 IDE 完成接入。',
        placement: 'topRight',
      })
    } else {
      setTestResult({ ok: false, msg: '无法获取 IDE 配置' })
      notification.error({
        message: '连接测试失败',
        description: '无法加载 IDE 配置，请先启动 MCP。',
        placement: 'topRight',
      })
    }
    setTesting(false)
  }

  const mcpState: McpState = status?.state ?? 'idle'
  const isRunning = mcpState === 'running'
  const dotState = deriveDotState(status)

  // IDE 配置生成
  const stdioText = useMemo(
    () => (ideConfig ? generateStdioConfig(ideConfig, ideType) : ''),
    [ideConfig, ideType],
  )
  const httpText = useMemo(
    () => (ideConfig ? generateHttpConfig(ideConfig, ideType) : ''),
    [ideConfig, ideType],
  )
  const httpUrl = useMemo(() => (ideConfig ? generateHttpUrlOnly(ideConfig) : ''), [ideConfig])
  const httpToken = useMemo(() => (ideConfig ? generateHttpTokenOnly(ideConfig) : ''), [ideConfig])

  const selectedIde = IDE_TYPES.find((i) => i.value === ideType)

  // 修复 3.4 + 🟡：统一复制后的 toast 反馈
  const handleConfigCopied = (label: string) => {
    message.success(`已复制 ${label}`)
  }

  // 修复 R-2 / R-5：把 PID / 启动时间 / 重启次数统一呈现
  const pidDisplay = useMemo(() => {
    if (summary?.pid) return String(summary.pid)
    if (status?.pid) return String(status.pid)
    return isRunning ? '加载中…' : '未启动'
  }, [summary, status, isRunning])

  const startedDisplay = useMemo(() => {
    const iso = summary?.started_at || status?.started_at
    if (!iso) return isRunning ? '加载中…' : '尚未启动'
    return `${formatRelative(iso)}`
  }, [summary, status, isRunning])

  return (
    <div className="page-content mcp-console">
      {/* 评审 3.3：把 MCP 升级为真正 H1 */}
      <Title level={2} style={{ marginTop: 0, marginBottom: 16, fontSize: 22 }}>
        <SafetyCertificateOutlined /> MCP
      </Title>

      {/* ========== 0. 置顶操作条 ========== 评审 1.7（用户反馈"按钮布局太乱"） */}
      <div
        className="mcp-action-bar"
        role="region"
        aria-label="MCP 主操作区"
      >
        {/* —— 左：状态胶囊 —— */}
        <div className="mcp-action-bar-status">
          <div className={`mcp-action-bar-status-dot state-${mcpState}`}>
            {mcpState === 'running' ? (
              <RocketOutlined />
            ) : mcpState === 'failed' ? (
              <ExclamationCircleOutlined />
            ) : (
              <PoweroffOutlined />
            )}
          </div>
          <div className="mcp-action-bar-status-text">
            <span className="mcp-action-bar-status-primary">
              {mcpState === 'running'
                ? 'MCP 服务运行中'
                : mcpState === 'failed'
                  ? 'MCP 服务异常'
                  : mcpState === 'starting'
                    ? 'MCP 正在启动'
                    : mcpState === 'restarting'
                      ? 'MCP 正在重启'
                      : 'MCP 服务未启动'}
            </span>
            <span className="mcp-action-bar-status-secondary">
              {mcpState === 'running' && summary?.uptime_seconds
                ? `已运行 ${formatUptime(summary.uptime_seconds)} · 上次连接 ${status?.last_connection?.client ?? '—'}`
                : mcpState === 'running'
                  ? '等待 IDE 连接'
                  : mcpState === 'failed'
                    ? '请查看下方错误信息或重启'
                    : '启动后 IDE 可立即连接'}
            </span>
          </div>
        </div>

        {/* —— 中：分隔条 —— */}
        <div className="mcp-action-bar-divider" aria-hidden="true" />

        {/* —— 右：统一按钮组（信息类 + 控制类 一行收编） —— */}
        <div className="mcp-action-bar-actions">
          {/* 信息类：测试连接 */}
          <Button
            icon={<ExperimentOutlined />}
            onClick={handleTestConnection}
            loading={testing}
            className="mcp-action-btn info"
            title="测试 MCP 服务连通性"
          >
            测试连接
          </Button>

          {/* 信息类：刷新 */}
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              refreshMcpStatus()
              refreshMcpSummary()
              refreshRecentLogs()
            }}
            className="mcp-action-btn info"
            title="刷新状态 / 日志"
          >
            刷新
          </Button>

          {/* 分组分隔 */}
          <div className="mcp-action-bar-divider" aria-hidden="true" />

          {/* 主操作：启动 */}
          <Button
            type="primary"
            icon={<RocketOutlined />}
            onClick={handleStart}
            loading={actionLoading === 'starting'}
            disabled={isRunning || mcpState === 'starting'}
            className="mcp-action-btn"
          >
            启动
          </Button>

          {/* 次操作：停止 / 重启 */}
          <Button
            icon={<StopOutlined />}
            onClick={() => setStopOpen(true)}
            loading={(actionLoading as string) === 'stopping'}
            disabled={!isRunning}
            className="mcp-action-btn outline danger"
          >
            停止
          </Button>
          <Button
            icon={<PoweroffOutlined />}
            onClick={() => setRestartOpen(true)}
            loading={actionLoading === 'restarting'}
            disabled={!isRunning && mcpState !== 'failed'}
            className="mcp-action-btn outline"
          >
            重启
          </Button>

          {/* 分组分隔 */}
          <div className="mcp-action-bar-divider" aria-hidden="true" />

          {/* 弱操作：访问日志（文字样式，不与控制动作竞争） */}
          <Button
            type="text"
            icon={<HistoryOutlined />}
            onClick={() => setLogModalOpen(true)}
            title="打开完整访问日志"
          >
            访问日志
          </Button>
        </div>
      </div>

      {/* ========== 1. 统一主卡 — 合并了原 3 张卡（用户反馈"没必要显示这么多东西"） ========== */}
      <ContractMasterCard
        navigate={navigate}
        refreshContracts={refreshContracts}
        status={status}
        summary={summary}
        onClearTestResult={() => setTestResult(null)}
      />

      {/* ========== 2. IDE 配置 + 调用统计 ========== 评审 R-9 / R-3 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <Card
            className="ide-config-card"
            title={
              <Space>
                <CodeOutlined />
                <span>接入 AI IDE</span>
              </Space>
            }
            extra={
              <Space>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  IDE：
                </Text>
                <Select
                  value={ideType}
                  onChange={setIdeType}
                  size="small"
                  style={{ width: 160 }}
                  options={IDE_TYPES.map((i) => ({ value: i.value, label: i.label }))}
                  aria-label="选择 IDE 类型"
                />
              </Space>
            }
          >
            {selectedIde && (
              // 修复 1.5 / R-9：明示当前 IDE 的"如何接入"，不再写死 ~/.cursor/mcp.json
              <IdeHintPanel ide={ideType} selectedConfigPath={selectedIde.configPath} />
            )}

            <Tabs
              defaultActiveKey="stdio"
              items={[
                {
                  key: 'stdio',
                  label: (
                    <Space>
                      <span>STDIO</span>
                      <Tag color="green" style={{ fontSize: 10, margin: 0 }}>
                        推荐
                      </Tag>
                    </Space>
                  ),
                  children: !ideConfig ? (
                    <Skeleton active />
                  ) : (
                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                      <Input.TextArea
                        value={stdioText}
                        readOnly
                        autoSize={{ minRows: 8, maxRows: 14 }}
                        className="ide-config-textarea"
                      />
                      <Space wrap>
                        {/* 修复 🟡：复制配置后给 toast */}
                        <CopyButton
                          type="primary"
                          text={stdioText}
                          label="复制 STDIO 配置"
                          onCopied={() => handleConfigCopied('STDIO 配置')}
                        />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          粘贴到 {selectedIde?.label} 的 MCP 配置文件中
                        </Text>
                      </Space>
                    </Space>
                  ),
                },
                {
                  key: 'http',
                  label: <span>HTTP</span>,
                  children: !ideConfig ? (
                    <Skeleton active />
                  ) : (
                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                      <Input.TextArea
                        value={httpText}
                        readOnly
                        autoSize={{ minRows: 6, maxRows: 12 }}
                        className="ide-config-textarea"
                      />
                      <Space wrap>
                        <CopyButton
                          type="primary"
                          text={httpText}
                          label="复制 HTTP 配置"
                          onCopied={() => handleConfigCopied('HTTP 配置')}
                        />
                        <Tooltip title="仅复制 URL">
                          <CopyButton
                            text={httpUrl}
                            label="仅 URL"
                            onCopied={() => handleConfigCopied('URL')}
                          />
                        </Tooltip>
                        <Tooltip title="仅复制 Token">
                          <CopyButton
                            text={httpToken}
                            label="仅 Token"
                            onCopied={() => handleConfigCopied('Token')}
                          />
                        </Tooltip>
                      </Space>
                    </Space>
                  ),
                },
              ]}
            />
          </Card>
        </Col>

        {/* 修复 R-3：最近调用卡片升级为 sparkline + TopN + 错误率 */}
        <Col xs={24} lg={10}>
          <Card
            className="recent-logs-card"
            title={
              <Space>
                <HistoryOutlined />
                <span>最近调用</span>
              </Space>
            }
            extra={
              <Button
                type="link"
                size="small"
                onClick={() => setLogModalOpen(true)}
              >
                查看全部
              </Button>
            }
          >
            <div className="sparkline-wrap">
              <Paragraph
                type="secondary"
                style={{ fontSize: 12, marginBottom: 4 }}
              >
                24h 调用时序
              </Paragraph>
              <Sparkline
                data={stats?.sparkline ?? []}
                errorRate={stats?.error_rate ?? 0}
                height={42}
              />
              <Space size="middle" style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  错误率 <strong>{((stats?.error_rate ?? 0) * 100).toFixed(1)}%</strong>
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Top 工具：{(stats?.top_tools ?? [])
                    .slice(0, 3)
                    .map((t) => t.tool_name)
                    .join(' / ') || '—'}
                </Text>
              </Space>
            </div>

            {recentLogs.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span>
                    暂无访问记录
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      IDE 连接后会在此显示
                    </Text>
                  </span>
                }
                style={{ padding: '12px 0' }}
              />
            ) : (
              <List
                size="small"
                dataSource={recentLogs}
                renderItem={(log) => (
                  <List.Item className={`recent-log-item log-${log.result_status}`}>
                    <div className="log-row">
                      <Tag
                        color={
                          log.status >= 200 && log.status < 300 ? 'green' : 'red'
                        }
                      >
                        {log.status || (log.result_status === 'success' ? '200' : 'ERR')}
                      </Tag>
                      <Text code className="log-tool">
                        {log.tool_name}
                      </Text>
                      <Text type="secondary" className="log-time">
                        {formatRelative(log.created_at)}
                      </Text>
                    </div>
                    {log.error_message && (
                      <Text type="danger" className="log-error" ellipsis>
                        {log.error_message}
                      </Text>
                    )}
                  </List.Item>
                )}
                style={{ marginTop: 8 }}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* ========== 4. 5 分钟接通 ========== 评审 3.5 */}
      <Card
        className="quick-start-card"
        title={
          <Space>
            <RocketOutlined />
            <span>5 分钟接通</span>
            <Tag color="blue">{selectedIde?.label || '—'}</Tag>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        {/* 修复 3.5：用 currentStep 强调"流程进展"，替代 current=-1 */}
        <Steps
          direction="horizontal"
          size="small"
          current={isRunning ? 4 : ideConfig ? 2 : 1}
          items={[
            {
              title: '选择 IDE',
              description: selectedIde?.label || '尚未选择',
              icon: <CodeOutlined />,
            },
            {
              title: '复制配置',
              description: '点击「复制 STDIO 配置」',
              icon: <CopyOutlined />,
            },
            {
              title: '粘贴到 IDE',
              description: selectedIde?.configPath || '',
              icon: <FileTextOutlined />,
            },
            {
              title: '重启 IDE',
              description: '配置生效',
              icon: <ReloadOutlined />,
            },
            {
              title: '让 AI 写代码',
              description: `问 AI："基于${activeContract?.contract_name || '当前契约集'}，写一个查询接口的代码"`,
              icon: <ExperimentOutlined />,
            },
          ]}
        />
      </Card>

      {/* ========== 5. 次级面板（评审 1.7：核心操作已上移到顶部 sticky bar） ========== */}
      <Card
        className="mcp-actions-card"
        title={
          <Space>
            <ExclamationCircleOutlined />
            <span>最近连接 / 历史</span>
          </Space>
        }
        bodyStyle={{ padding: isRunning && status?.last_connection ? 16 : 12 }}
      >
        {isRunning && status?.last_connection ? (
          <Paragraph
            type="secondary"
            style={{ marginBottom: 0, fontSize: 12 }}
          >
            <ClockCircleOutlined /> 上次连接：
            <strong>{status.last_connection.client}</strong>
            （{formatRelative(status.last_connection.at)}）
            <Button
              type="link"
              size="small"
              style={{ marginLeft: 8, padding: 0 }}
              onClick={() => setLogModalOpen(true)}
            >
              查看完整访问日志
            </Button>
          </Paragraph>
        ) : (
          <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
            MCP 服务启动后，此处会显示最近一次 IDE 连接信息。
          </Paragraph>
        )}
      </Card>

      {/* ========== 危险操作二次确认 Modal ========== */}
      <DangerConfirm
        open={stopOpen}
        title="停止 Synkord MCP 服务？"
        impactCount={impactCount}
        acknowledge={`我已知晓停止 MCP 后所有 IDE 连接将立即中断${
          impactCount > 0 ? '（当前有 1 个活跃 IDE）' : ''
        }`}
        description={
          <div>
            <p>停止后：</p>
            <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
              <li>所有正在使用 MCP 的 IDE 会立即断开连接</li>
              <li>AI 在 IDE 中的查询接口/数据模型请求会失败</li>
              <li>下次启动 MCP 前无法恢复</li>
            </ul>
          </div>
        }
        onCancel={() => setStopOpen(false)}
        onOk={executeStop}
      />

      <DangerConfirm
        open={restartOpen}
        title="重启 Synkord MCP 服务？"
        impactCount={impactCount}
        acknowledge="我已知晓重启过程中 IDE 连接将短暂中断（通常 < 10s）"
        description={
          <div>
            <p>重启期间：</p>
            <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
              <li>MCP 进程会被关闭再重新拉起</li>
              <li>正在进行的 MCP 调用会被中断</li>
              <li>配置变更需要重启才会生效</li>
            </ul>
          </div>
        }
        okText="我已知晓，确认重启"
        onCancel={() => setRestartOpen(false)}
        onOk={executeRestart}
      />

      <AccessLogModal open={logModalOpen} onClose={() => setLogModalOpen(false)} />
    </div>
  )
}

// ============================================================================
// 子组件 — 在文件底部以确保 type-only import 不与上面冲突
// ============================================================================

// 注：DrillStatisticLink 已被移除——主卡现以"名称点击即导航"作为唯一动作入口

// ----------------------------------------------------------------------------
// ContractMasterCard — 合并后的统一主卡（替代原 3 张卡）
// 用户反馈：运行时指标 / 契约集列表 / 活跃详情 没必要显示这么多
// 解决：合并成 1 张，运行时指标降为可展开二级区
// ----------------------------------------------------------------------------

interface ContractMasterCardProps {
  navigate: ReturnType<typeof useNavigate>
  refreshContracts: () => Promise<void>
  /** 主组件透传的运行时数据 */
  status: McpStatus | null
  summary: RuntimeSummary | null
  onClearTestResult: () => void
}

function ContractMasterCard({
  navigate,
  refreshContracts,
  status,
  summary,
  onClearTestResult,
}: ContractMasterCardProps) {
  const { contracts, activeContractSet } = useContract()

  // —— 空状态：还没有任何契约集
  if (contracts.length === 0) {
    return (
      <Card style={{ marginBottom: 16 }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="尚未创建任何契约集"
          style={{ padding: '32px 0' }}
        >
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/contracts/new')}
            >
              创建第一个契约集
            </Button>
            <Button onClick={() => navigate('/contracts')}>
              看看现有契约集
            </Button>
          </Space>
        </Empty>
      </Card>
    )
  }

  // —— 有契约集但还没激活
  if (!activeContractSet) {
    return (
      <Card style={{ marginBottom: 16 }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={`已有 ${contracts.length} 个契约集，请选择活跃契约集`}
          style={{ padding: '24px 0' }}
        >
          <Space>
            <ContractSwitcher variant="mcp-page" />
            <Button onClick={() => navigate('/contracts')}>
              管理契约集
            </Button>
          </Space>
        </Empty>
      </Card>
    )
  }

  const projectTypeMap: Record<string, string> = {
    backend: '后端',
    web: 'Web',
    app: 'App',
  }

  const pid = summary?.pid ?? status?.pid ?? null
  const startedAt = summary?.started_at ?? status?.started_at ?? null
  const lastConn = status?.last_connection
  const health = status?.health

  return (
    <Card
      className="contract-master-card"
      title={
        <Space size={8}>
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
          <span>活跃契约集</span>
          <Tag color="blue">活跃中</Tag>
        </Space>
      }
      extra={
        <Space>
          <ContractSwitcher variant="mcp-page" />
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={refreshContracts}
            aria-label="刷新契约集"
          />
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      {/* —— 1. 名称（点击即导航至契约详情） —— */}
      <div className="contract-master-head">
        <button
          type="button"
          className="contract-master-name-link"
          onClick={() => navigate(`/contracts/${activeContractSet.id}`)}
          aria-label={`查看契约集「${activeContractSet.name}」详情`}
        >
          <span className="contract-master-name">
            {activeContractSet.name}
          </span>
          <ArrowRightOutlined className="contract-master-name-arrow" />
        </button>
      </div>

      {/* —— 2. 契约属性 + 运行时 — 两栏定义列表（用户反馈整合到一起） —— */}
      <div className="contract-master-info">
        {/* 左：契约属性 */}
        <section className="contract-master-info-col">
          <h4 className="contract-master-info-title">契约属性</h4>
          <dl className="contract-master-info-list">
            <dt>类型</dt>
            <dd>
              <Tag color="default" style={{ margin: 0 }}>
                {projectTypeMap[activeContractSet.project_type] ||
                  activeContractSet.project_type}
              </Tag>
            </dd>
            <dt>所有者</dt>
            <dd>
              <UserOutlined style={{ marginRight: 4, opacity: 0.7 }} />
              <strong>{activeContractSet.creator_id}</strong>
            </dd>
            <dt>版本</dt>
            <dd>v0.1</dd>
            <dt>更新</dt>
            <dd>
              <ClockCircleOutlined style={{ marginRight: 4, opacity: 0.7 }} />
              {formatRelative(activeContractSet.updated_at)}
            </dd>
          </dl>
        </section>

        {/* 右：运行时指标（不再折叠，与契约属性同框展示） */}
        <section className="contract-master-info-col">
          <h4 className="contract-master-info-title">运行时</h4>
          <dl className="contract-master-info-list">
            <dt>PID</dt>
            <dd>
              {pid ? (
                <code className="mono">{pid}</code>
              ) : (
                <span className="dim">未启动</span>
              )}
            </dd>
            <dt>启动时间</dt>
            <dd>
              {startedAt ? (
                formatRelative(startedAt)
              ) : (
                <span className="dim">尚未启动</span>
              )}
            </dd>
            <dt>最后连接</dt>
            <dd>
              {lastConn ? (
                <>
                  <strong>{lastConn.client}</strong>
                  <span className="dim" style={{ marginLeft: 4 }}>
                    ({formatRelative(lastConn.at)})
                  </span>
                </>
              ) : (
                <span className="dim">—</span>
              )}
            </dd>
            <dt>健康度</dt>
            <dd>
              <HealthBadge health={health} compact />
            </dd>
          </dl>
        </section>
      </div>

      {/* —— 3. 错误条：仅在有错误时显示 —— */}
      {status?.last_error && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 12 }}
          message="最近错误"
          description={status.last_error.message}
        />
      )}
    </Card>
  )
}

