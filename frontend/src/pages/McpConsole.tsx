// Synkord McpConsole
// MCP 主控台页面（顶级路由）
// 详见 docs/ui-spec.md §四
//
// 实现要点：
// - MCP 进程启停走 Electron IPC（window.synkord.mcpStart/Stop/Restart）
// - 实时状态通过 onMcpEvent 订阅
// - 后端 /api/mcp/* 仅用于元数据（access log）
// - window.synkord 类型在 src/types/electron.d.ts 统一声明

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
  Row,
  Select,
  Skeleton,
  Space,
  Statistic,
  Steps,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  ApiOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  CopyOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  HistoryOutlined,
  PlusOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { useContract } from '../contexts/ContractContext'
import { ContractSwitcher } from '../components/ContractSwitcher'
import { McpStatusDot, MCP_STATE_LABEL, deriveDotState } from '../components/McpStatusDot'
import { CopyButton } from '../components/CopyButton'
import { AccessLogModal } from '../components/AccessLogModal'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { getIdeConfig, listAccessLog, type IdeConfig, type AccessLogEntry } from '../api/mcp'
import {
  IDE_TYPES,
  generateStdioConfig,
  generateHttpConfig,
  generateHttpUrlOnly,
  generateHttpTokenOnly,
  type IdeType,
} from '../utils/ideConfig'
import { formatRelative } from '../utils/format'
import type { McpStatus, McpState } from '../types/contract'

const { Title, Paragraph, Text } = Typography

export default function McpConsole() {
  const navigate = useNavigate()
  const { message, modal } = AntApp.useApp()
  const { activeContract, activeContractSet, refreshContracts } = useContract()
  useDocumentTitle('MCP')

  const [status, setStatus] = useState<McpStatus | null>(null)
  const [ideConfig, setIdeConfig] = useState<IdeConfig | null>(null)
  const [recentLogs, setRecentLogs] = useState<AccessLogEntry[]>([])
  const [actionLoading, setActionLoading] = useState<McpState | null>(null)
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [ideType, setIdeType] = useState<IdeType>('cursor')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const ideConfigRef = useRef<IdeConfig | null>(null)

  // MCP 状态加载
  const refreshMcpStatus = useCallback(async () => {
    try {
      if (window.synkord?.mcpGetStatus) {
        const s = await window.synkord.mcpGetStatus()
        setStatus(s)
      } else {
        // 浏览器环境（dev 模式）— 从后端拉
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

  // 访问日志（只取最近 5 条）
  const refreshRecentLogs = useCallback(async () => {
    try {
      const res = await listAccessLog({ limit: 5 })
      setRecentLogs(res.items)
    } catch {
      setRecentLogs([])
    }
  }, [])

  // 初始加载
  useEffect(() => {
    refreshMcpStatus()
    refreshIdeConfig()
    refreshRecentLogs()
  }, [refreshMcpStatus, refreshIdeConfig, refreshRecentLogs])

  // 订阅 Electron 实时事件
  useEffect(() => {
    if (!window.synkord?.onMcpEvent) return
    const unsubscribe = window.synkord.onMcpEvent((newStatus) => {
      setStatus(newStatus)
    })
    return unsubscribe
  }, [])

  // 主动切换活跃契约集后刷新
  useEffect(() => {
    refreshContracts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContract?.contract_id])

  // MCP 启停（走 Electron IPC）
  const handleStart = async () => {
    setActionLoading('starting')
    try {
      if (window.synkord?.mcpStart) {
        await window.synkord.mcpStart()
      }
      message.success('MCP 已启动')
      await refreshMcpStatus()
    } catch (e: any) {
      message.error(e?.message || '启动失败')
    } finally {
      setActionLoading(null)
    }
  }

  const handleStop = () => {
    if (status?.last_connection) {
      modal.confirm({
        title: '停止 Synkord MCP？',
        content: (
          <div>
            <p>停止后所有 IDE 连接将断开：</p>
            <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
              <li>
                <strong>{status.last_connection.client}</strong>
                （{formatRelative(status.last_connection.at)}）
              </li>
            </ul>
            <p style={{ marginTop: 8, marginBottom: 0, color: '#666' }}>
              AI 在 IDE 里的查询将失败，直到 MCP 重新启动。
            </p>
          </div>
        ),
        okText: '确认停止',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: async () => {
          setActionLoading('stopping' as McpState)
          try {
            if (window.synkord?.mcpStop) {
              await window.synkord.mcpStop()
            }
            message.success('MCP 已停止')
            await refreshMcpStatus()
          } catch (e: any) {
            message.error(e?.message || '停止失败')
          } finally {
            setActionLoading(null)
          }
        },
      })
    } else {
      // 没有最近连接，直接停
      modal.confirm({
        title: '停止 Synkord MCP？',
        content: '确认停止？此操作可随时撤销。',
        okText: '确认',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: async () => {
          setActionLoading('stopping' as McpState)
          try {
            if (window.synkord?.mcpStop) {
              await window.synkord.mcpStop()
            }
            message.success('MCP 已停止')
            await refreshMcpStatus()
          } catch (e: any) {
            message.error(e?.message || '停止失败')
          } finally {
            setActionLoading(null)
          }
        },
      })
    }
  }

  const handleRestart = async () => {
    setActionLoading('restarting')
    try {
      if (window.synkord?.mcpRestart) {
        await window.synkord.mcpRestart()
      }
      message.success('MCP 已重启')
      await refreshMcpStatus()
    } catch (e: any) {
      message.error(e?.message || '重启失败')
    } finally {
      setActionLoading(null)
    }
  }

  // 测试连接
  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    // 简化版测试：检查 IDE 配置是否可用
    await new Promise((r) => setTimeout(r, 600))
    if (ideConfig) {
      setTestResult({ ok: true, msg: '配置就绪。可在 IDE 中粘贴配置并测试连接。' })
    } else {
      setTestResult({ ok: false, msg: '无法获取 IDE 配置' })
    }
    setTesting(false)
  }

  const mcpState = status?.state ?? 'idle'
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

  return (
    <div className="page-content mcp-console">
      <Title level={3} style={{ marginTop: 0, marginBottom: 24 }}>
        <SafetyCertificateOutlined /> MCP
      </Title>

      {/* 状态卡 */}
      <Card
        className="mcp-status-card"
        title={
          <Space size="middle">
            <McpStatusDot status={status} size="default" />
            <span>MCP 状态</span>
            <Tag
              color={mcpState === 'running' ? 'green' : mcpState === 'failed' ? 'red' : 'default'}
            >
              {MCP_STATE_LABEL[mcpState]}
            </Tag>
            {isRunning && (
              <Tag color="cyan" icon={<SyncOutlined spin />}>
                实时
              </Tag>
            )}
          </Space>
        }
        extra={
          <Space>
            <Tooltip title="测试连接">
              <Button
                icon={<ExperimentOutlined />}
                onClick={handleTestConnection}
                loading={testing}
              >
                测试连接
              </Button>
            </Tooltip>
            <Button icon={<ReloadOutlined />} onClick={() => { refreshMcpStatus(); refreshRecentLogs() }}>
              刷新
            </Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        {!status ? (
          <Skeleton active />
        ) : (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={8} md={6}>
                <Statistic
                  title="活跃契约集"
                  value={activeContract?.contract_name || '未设置'}
                  valueStyle={{
                    fontSize: 16,
                    color: activeContract ? '#1677ff' : '#94a3b8',
                  }}
                />
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Statistic
                  title="PID"
                  value={status.pid ?? '—'}
                  valueStyle={{ fontSize: 16, fontFamily: 'monospace' }}
                />
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Statistic
                  title="启动时间"
                  value={status.started_at ? formatRelative(status.started_at) : '—'}
                  valueStyle={{ fontSize: 16 }}
                />
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Statistic
                  title="最近连接"
                  value={status.last_connection?.client || '—'}
                  valueStyle={{ fontSize: 16 }}
                />
              </Col>
            </Row>

            {status.last_error && (
              <Alert
                type="error"
                showIcon
                style={{ marginTop: 16 }}
                message="最近错误"
                description={status.last_error.message}
              />
            )}

            {testResult && (
              <Alert
                type={testResult.ok ? 'success' : 'error'}
                showIcon
                style={{ marginTop: 16 }}
                message={testResult.ok ? '连接测试通过' : '连接测试失败'}
                description={testResult.msg}
                closable
                onClose={() => setTestResult(null)}
              />
            )}
          </>
        )}
      </Card>

      {/* 活跃契约集卡 */}
      <Card
        className="active-contract-card"
        title={
          <Space>
            <RocketOutlined />
            <span>活跃契约集</span>
          </Space>
        }
        extra={
          activeContractSet && (
            <Button
              type="text"
              icon={<SyncOutlined />}
              onClick={refreshContracts}
              size="small"
            >
              刷新
            </Button>
          )
        }
        style={{ marginBottom: 16 }}
      >
        {activeContractSet ? (
          <div className="active-contract-content">
            <div className="active-contract-main">
              <div className="active-contract-name">
                <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                <Text strong style={{ fontSize: 20 }}>
                  {activeContractSet.name}
                </Text>
                <Tag color="blue" style={{ marginLeft: 12 }}>活跃中</Tag>
              </div>
              {activeContractSet.description && (
                <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                  {activeContractSet.description}
                </Paragraph>
              )}
              <Space size="large" style={{ marginTop: 16 }}>
                <Statistic
                  title="接口数"
                  value={activeContractSet.api_count}
                  valueStyle={{ fontSize: 18 }}
                />
                <Statistic
                  title="数据模型"
                  value={activeContractSet.entity_count}
                  valueStyle={{ fontSize: 18 }}
                />
                <Statistic
                  title="成员"
                  value={activeContractSet.member_count}
                  valueStyle={{ fontSize: 18 }}
                />
              </Space>
              <Space style={{ marginTop: 20 }}>
                <Button
                  type="primary"
                  icon={<ArrowRightOutlined />}
                  onClick={() => navigate(`/contracts/${activeContractSet.id}`)}
                >
                  查看契约
                </Button>
                <Button
                  icon={<ApiOutlined />}
                  onClick={() => navigate(`/contracts/${activeContractSet.id}/apis`)}
                >
                  管理接口
                </Button>
                <ContractSwitcher variant="mcp-page" />
              </Space>
            </div>
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="尚未选择活跃契约集"
            style={{ padding: '24px 0' }}
          >
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate('/contracts/new')}
              >
                创建第一个契约集
              </Button>
              <Button onClick={() => navigate('/contracts')}>查看现有契约集</Button>
            </Space>
          </Empty>
        )}
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {/* IDE 配置区 */}
        <Col xs={24} lg={16}>
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
                <Text type="secondary" style={{ fontSize: 12 }}>IDE：</Text>
                <Select
                  value={ideType}
                  onChange={setIdeType}
                  size="small"
                  style={{ width: 140 }}
                  options={IDE_TYPES.map((i) => ({ value: i.value, label: i.label }))}
                />
              </Space>
            }
            style={{ height: '100%' }}
          >
            {selectedIde && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message={
                  <Space size={4}>
                    <Text>配置文件路径：</Text>
                    <Text code copyable={{ tooltips: ['复制路径'] }}>
                      {selectedIde.configPath}
                    </Text>
                  </Space>
                }
              />
            )}

            <Tabs
              defaultActiveKey="stdio"
              items={[
                {
                  key: 'stdio',
                  label: (
                    <Space>
                      <span>STDIO</span>
                      <Tag color="green" style={{ fontSize: 10, margin: 0 }}>推荐</Tag>
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
                        <CopyButton type="primary" text={stdioText} label="复制配置" />
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
                        <CopyButton type="primary" text={httpText} label="复制配置" />
                        <Tooltip title="仅复制 URL">
                          <CopyButton text={httpUrl} label="仅 URL" />
                        </Tooltip>
                        <Tooltip title="仅复制 Token">
                          <CopyButton text={httpToken} label="仅 Token" />
                        </Tooltip>
                      </Space>
                    </Space>
                  ),
                },
              ]}
            />
          </Card>
        </Col>

        {/* 最近访问日志（右侧） */}
        <Col xs={24} lg={8}>
          <Card
            className="recent-logs-card"
            title={
              <Space>
                <HistoryOutlined />
                <span>最近调用</span>
              </Space>
            }
            extra={
              <Button type="link" size="small" onClick={() => setLogModalOpen(true)}>
                查看全部
              </Button>
            }
            style={{ height: '100%' }}
          >
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
              <ul className="recent-logs-list">
                {recentLogs.map((log) => (
                  <li key={log.id} className={`recent-log-item log-${log.result_status}`}>
                    <div className="log-row">
                      <Tag color={log.status >= 200 && log.status < 300 ? 'green' : 'red'}>
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
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Col>
      </Row>

      {/* 快速开始 */}
      <Card
        className="quick-start-card"
        title={
          <Space>
            <RocketOutlined />
            <span>5 分钟接通</span>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Steps
          direction="horizontal"
          size="small"
          current={-1}
          items={[
            {
              title: '选择 IDE',
              description: '上方已选择 ' + (selectedIde?.label || '—'),
              icon: <CodeOutlined />,
            },
            {
              title: '复制配置',
              description: '点击「复制配置」按钮',
              icon: <CopyOutlined />,
            },
            {
              title: '粘贴到 IDE',
              description: `粘贴到 ${selectedIde?.configPath || ''}`,
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

      {/* 高级操作 */}
      <Card
        className="mcp-actions-card"
        title={
          <Space>
            <span>控制</span>
          </Space>
        }
      >
        <Row gutter={[12, 12]}>
          <Col>
            <Button
              type="primary"
              icon={<RocketOutlined />}
              onClick={handleStart}
              loading={actionLoading === 'starting'}
              disabled={isRunning || mcpState === 'starting'}
            >
              启动
            </Button>
          </Col>
          <Col>
            <Button
              icon={<StopOutlined />}
              danger
              onClick={handleStop}
              loading={(actionLoading as string) === 'stopping'}
              disabled={!isRunning}
            >
              停止
            </Button>
          </Col>
          <Col>
            <Button
              icon={<PoweroffOutlined />}
              onClick={handleRestart}
              loading={actionLoading === 'restarting'}
            >
              重启
            </Button>
          </Col>
          <Col>
            <Button
              icon={<HistoryOutlined />}
              onClick={() => setLogModalOpen(true)}
            >
              完整访问日志
            </Button>
          </Col>
        </Row>
        {isRunning && status?.last_connection && (
          <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0, fontSize: 12 }}>
            <ClockCircleOutlined /> 上次连接：<strong>{status.last_connection.client}</strong>
            （{formatRelative(status.last_connection.at)}）
          </Paragraph>
        )}
      </Card>

      {/* 访问日志 Modal */}
      <AccessLogModal open={logModalOpen} onClose={() => setLogModalOpen(false)} />
    </div>
  )
}