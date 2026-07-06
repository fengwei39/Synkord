// Synkord AccessLogModal
// MCP 访问日志查看器（Modal）
// 详见 docs/ui-spec.md §四.4 高级操作

import { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Empty,
  Modal,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { listAccessLog, type AccessLogEntry } from '../api/mcp'

const { Text } = Typography

interface AccessLogModalProps {
  open: boolean
  onClose: () => void
}

const statusColor = (status: number): string => {
  if (status >= 200 && status < 300) return 'green'
  if (status >= 400 && status < 500) return 'orange'
  if (status >= 500) return 'red'
  return 'default'
}

const formatArgs = (args?: Record<string, unknown>): string => {
  if (!args) return '-'
  try {
    const s = JSON.stringify(args)
    return s.length > 60 ? s.slice(0, 60) + '...' : s
  } catch {
    return '-'
  }
}

const formatTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function AccessLogModal({ open, onClose }: AccessLogModalProps) {
  const { message } = AntApp.useApp()
  const [items, setItems] = useState<AccessLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)

  const load = async () => {
    setLoading(true)
    try {
      const res = await listAccessLog({ limit: pageSize, offset: (page - 1) * pageSize })
      setItems(res.items)
      setTotal(res.total)
    } catch (e: any) {
      message.error(e?.message || '加载访问日志失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) load()
  }, [open, page])

  const columns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 160,
      render: (s: string) => <Text style={{ fontSize: 12 }}>{formatTime(s)}</Text>,
    },
    {
      title: '客户端',
      dataIndex: 'client',
      key: 'client',
      width: 120,
    },
    {
      title: '工具',
      dataIndex: 'tool_name',
      key: 'tool_name',
      width: 220,
      render: (s: string) => <Text code>{s}</Text>,
    },
    {
      title: '参数',
      dataIndex: 'args',
      key: 'args',
      render: formatArgs,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (s: number) => <Tag color={statusColor(s)}>{s}</Tag>,
    },
    {
      title: '耗时',
      dataIndex: 'duration_ms',
      key: 'duration_ms',
      width: 80,
      render: (ms: number) => `${ms}ms`,
    },
  ]

  return (
    <Modal
      title="MCP 访问日志"
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      destroyOnClose
    >
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          刷新
        </Button>
        <Text type="secondary">共 {total} 条记录</Text>
      </Space>

      {loading && items.length === 0 ? (
        <Skeleton active />
      ) : items.length === 0 ? (
        <Empty description="暂无访问记录（Codex / IDE 连接后会在此显示）" />
      ) : (
        <Table
          columns={columns}
          dataSource={items}
          rowKey="id"
          size="small"
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: false,
            onChange: setPage,
          }}
        />
      )}
    </Modal>
  )
}