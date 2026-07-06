// Synkord AccessLogModal
// MCP 访问日志查看器（Modal）—— 评审重构版
//
// 评审 R-4：原版只支持 limit / offset，缺少时间范围 / 级别筛选，
// 排障效率低。本次新增 start / end / level / keyword 四个筛选项 + 导出。

import { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  DatePicker,
  Empty,
  Input,
  Modal,
  Radio,
  Segmented,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { listAccessLog, type AccessLogEntry } from '../api/mcp'
import type { Dayjs } from 'dayjs'

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

/** 导出当前过滤结果为 CSV，评审 R-4：方便脱敏后分享 */
function exportCsv(items: AccessLogEntry[]) {
  const header = ['time', 'client', 'tool', 'status', 'duration_ms', 'args', 'error']
  const rows = items.map((it) =>
    [
      it.created_at,
      it.caller,
      it.tool_name,
      String(it.status),
      String(it.duration_ms),
      JSON.stringify(it.args ?? {}),
      it.error_message ?? '',
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  )
  const csv = [header.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mcp-access-log-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function AccessLogModal({ open, onClose }: AccessLogModalProps) {
  const { message } = AntApp.useApp()
  const [items, setItems] = useState<AccessLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  // 评审 R-4：四个新筛选项
  const [level, setLevel] = useState<'all' | 'success' | 'error'>('all')
  const [keyword, setKeyword] = useState('')
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await listAccessLog({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        level,
        keyword: keyword || undefined,
        start: range?.[0]?.toISOString(),
        end: range?.[1]?.toISOString(),
      })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page, level])

  const columns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (s: string) => <Text style={{ fontSize: 12 }}>{formatTime(s)}</Text>,
    },
    {
      title: '客户端',
      dataIndex: 'caller',
      key: 'caller',
      width: 140,
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
      width={920}
      destroyOnHidden
    >
      {/* 评审 R-4：日志筛选区（时间 / 级别 / 关键字） */}
      <Space wrap style={{ marginBottom: 12 }} size="middle">
        <DatePicker.RangePicker
          showTime
          value={range as any}
          onChange={(v) => setRange(v as any)}
          allowClear
        />
        <Segmented
          value={level}
          onChange={(v) => {
            setLevel(v as any)
            setPage(1)
          }}
          options={[
            { label: '全部', value: 'all' },
            { label: '成功', value: 'success' },
            { label: '失败', value: 'error' },
          ]}
        />
        <Input.Search
          placeholder="按工具名 / 调用方搜索"
          value={keyword}
          allowClear
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={() => {
            setPage(1)
            load()
          }}
          style={{ width: 220 }}
        />
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          刷新
        </Button>
        <Button icon={<DownloadOutlined />} onClick={() => exportCsv(items)}>
          导出 CSV
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
