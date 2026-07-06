// Synkord McpConsole
// MCP 主控台页面（顶级路由）
// 详见 docs/ui-spec.md §四

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  App as AntApp,
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Row,
  Select,
  Skeleton,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import {
  ArrowRightOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { useContract } from '../contexts/ContractContext'
import { ContractSwitcher } from '../components/ContractSwitcher'
import { McpStatusDot, MCP_STATE_LABEL } from '../components/McpStatusDot'
import { CopyButton } from '../components/CopyButton'
import { AccessLogModal } from '../components/AccessLogModal'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import {
  getMcpStatus,
  startMcp,
  stopMcp,
  restartMcp,
} from '../api/contracts'
import { getIdeConfig, type IdeConfig } from '../api/mcp'
import {
  IDE_TYPES,
  generateStdioConfig,
  generateHttpConfig,
  generateHttpUrlOnly,
  generateHttpTokenOnly,
  type IdeType,
} from '../utils/ideConfig'
import { formatRelative } from '../utils/format'
import type { McpStatus } from '../types/contract'

const { Title, Paragraph, Text } = Typography

const POLL_INTERVAL = 3000

export default function McpConsole() {
  const navigate = useNavigate()
  const { message, modal } = AntApp.useApp()
  const { activeContract } = useContract()
  useDocumentTitle('MCP')

  const [status, setStatus] = useState<McpStatus | null>(null)
  const [ideConfig, setIdeConfig] = useState<IdeConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [ideType, setIdeType] = useState<IdeType>('cursor')

  const refresh = async () => {
    setLoading(true)
    try {
      const [s, cfg] = await Promise.all([getMcpStatus(), getIdeConfig().catch(() => null)])
      setStatus(s)
      setIdeConfig(cfg)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [])

  // 当前活跃契约集变化时也刷新一次（确保显示最新）
  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContract?.contract_id])

  const handleStart = async () => {
    setActionLoading(true)
    try {
      await startMcp()
      message.success('MCP 已启动')
      await refresh()
    } catch (e: any) {
      message.error(e?.message || '启动失败')
    } finally {
      setActionLoading(false)
    }
  }

  const handleStop = () => {
    modal.confirm({
      title: '停止 Synkord MCP？',
      content: '停止后所有 IDE 连接将断开，AI 在 IDE 里的查询将失败，直到 MCP 重新启动。',
      okText: '确认停止',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setActionLoading(true)
        try {
          await stopMcp()
          message.success('MCP 已停止')
          await refresh()
        } catch (e: any) {
          message.error(e?.message || '停止失败')
        } finally {
          setActionLoading(false)
        }
      },
    })
  }

  const handleRestart = async () => {
    setActionLoading(true)
    try {
      await restartMcp()
      message.success('MCP 已重启')
      await refresh()
    } catch (e: any) {
      message.error(e?.message || '重启失败')
    } finally {
      setActionLoading(false)
    }
  }

  const mcpState = status?.state ?? 'idle'

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
        title={
          <Space>
            <McpStatusDot status={status} />
            <span>MCP 状态</span>
            <Tag color={mcpState === 'running' ? 'green' : mcpState === 'failed' ? 'red' : 'default'}>
              {MCP_STATE_LABEL[mcpState]}
            </Tag>
          </Space>
        }
        extra={
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
            刷新状态
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        {loading && !status ? (
          <Skeleton active />
        ) : (
          <Descriptions column={3} size="small">
            <Descriptions.Item label="活跃契约集">
              {activeContract ? activeContract.contract_name : '未设置'}
            </Descriptions.Item>
            <Descriptions.Item label="PID">{status?.pid ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="启动时间">
              {formatRelative(status?.started_at)}
            </Descriptions.Item>
            <Descriptions.Item label="上次连接" span={2}>
              {status?.last_connection
                ? `${status.last_connection.client} (${formatRelative(status.last_connection.at)})`
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="最近错误" span={3}>
              {status?.last_error ? (
                <Text type="danger">{status.last_error.message}</Text>
              ) : (
                <Text type="secondary">无</Text>
              )}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      {/* 活跃契约集卡 */}
      <Card title="活跃契约集" style={{ marginBottom: 16 }}>
        {activeContract ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space size="large">
              <Text strong style={{ fontSize: 18 }}>
                {activeContract.contract_name}
              </Text>
              <Tag color="blue">活跃</Tag>
            </Space>
            <Space>
              <Button
                type="primary"
                icon={<ArrowRightOutlined />}
                onClick={() => navigate(`/contracts/${activeContract.contract_id}`)}
              >
                查看契约
              </Button>
              <ContractSwitcher variant="mcp-page" />
            </Space>
          </Space>
        ) : (
          <Empty description="尚未选择活跃契约集">
            <ContractSwitcher variant="mcp-page" />
          </Empty>
        )}
      </Card>

      {/* IDE 配置区 */}
      <Card
        title="接入 AI IDE"
        style={{ marginBottom: 16 }}
        extra={
          <Space>
            <Text type="secondary" style={{ fontSize: 12 }}>选择你的 IDE：</Text>
            <Select
              value={ideType}
              onChange={setIdeType}
              style={{ width: 160 }}
              options={IDE_TYPES.map((i) => ({ value: i.value, label: i.label }))}
            />
          </Space>
        }
      >
        {selectedIde && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={
              <span>
                配置文件路径：<Text code>{selectedIde.configPath}</Text>
              </span>
            }
          />
        )}

        <Tabs
          defaultActiveKey="stdio"
          items={[
            {
              key: 'stdio',
              label: 'STDIO（推荐）',
              children: !ideConfig ? (
                <Skeleton active />
              ) : (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Input.TextArea
                    value={stdioText}
                    readOnly
                    autoSize={{ minRows: 6, maxRows: 14 }}
                    style={{ fontFamily: 'monospace', fontSize: 13 }}
                  />
                  <Space>
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
              label: 'HTTP（远程场景）',
              children: !ideConfig ? (
                <Skeleton active />
              ) : (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Input.TextArea
                    value={httpText}
                    readOnly
                    autoSize={{ minRows: 6, maxRows: 14 }}
                    style={{ fontFamily: 'monospace', fontSize: 13 }}
                  />
                  <Space wrap>
                    <CopyButton type="primary" text={httpText} label="复制配置" />
                    <CopyButton text={httpUrl} label="仅复制 URL" />
                    <CopyButton text={httpToken} label="仅复制 Token" />
                  </Space>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      {/* 快速开始 */}
      <Card title="快速开始" style={{ marginBottom: 16 }}>
        <Paragraph>
          1. 在 IDE 配置文件中粘贴上面的配置
          <br />
          2. 重启 {selectedIde?.label || 'IDE'}
          <br />
          3. 在 IDE 里问："基于
          {activeContract?.contract_name || '当前契约集'}，写一个查询接口的代码"
          <br />
          4. AI 会通过 MCP 读取契约集，按真实接口约束生成代码
        </Paragraph>
      </Card>

      {/* 高级操作 */}
      <Card title="高级">
        <Row gutter={[16, 16]}>
          <Col>
            <Button
              onClick={handleStart}
              loading={actionLoading}
              disabled={mcpState === 'running' || mcpState === 'starting'}
            >
              启动 MCP
            </Button>
          </Col>
          <Col>
            <Button
              onClick={handleStop}
              loading={actionLoading}
              disabled={mcpState !== 'running'}
              danger
            >
              停止 MCP
            </Button>
          </Col>
          <Col>
            <Button onClick={handleRestart} loading={actionLoading}>
              重启 MCP
            </Button>
          </Col>
          <Col>
            <Button onClick={() => setLogModalOpen(true)}>查看访问日志</Button>
          </Col>
        </Row>
      </Card>

      {/* 访问日志 Modal */}
      <AccessLogModal open={logModalOpen} onClose={() => setLogModalOpen(false)} />
    </div>
  )
}