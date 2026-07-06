// Synkord ContractApis
// 契约集接口列表
// 详见 docs/ui-spec.md §五

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  App as AntApp,
  Alert,
  Button,
  Checkbox,
  Empty,
  Input,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { listApis, deleteApi } from '../api/apis'
import type { ApiDefinition } from '../api/apis'
import { useContract } from '../contexts/ContractContext'
import { formatRelative, HTTP_METHOD_COLORS } from '../utils/format'

const { Title, Text } = Typography

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const

export default function ContractApis() {
  const { id: contractId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const { activeContractSet } = useContract()

  const [apis, setApis] = useState<ApiDefinition[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [methodFilter, setMethodFilter] = useState<string | undefined>()
  const [includeDeprecated, setIncludeDeprecated] = useState(false)

  const myRole = activeContractSet?.my_role
  const canEdit = myRole === 'owner' || myRole === 'editor'

  const load = async () => {
    if (!contractId) return
    setLoading(true)
    try {
      const res = await listApis(contractId, {
        keyword: keyword || undefined,
        method: methodFilter,
        include_deprecated: includeDeprecated,
        limit: 200,
      })
      setApis(res.items)
    } catch (e: any) {
      message.error(e?.message || '加载接口失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, includeDeprecated])

  const filtered = useMemo(() => {
    if (!apis) return []
    const kw = keyword.toLowerCase().trim()
    return apis.filter((api) => {
      if (methodFilter && api.method !== methodFilter) return false
      if (!includeDeprecated && api.deprecated) return false
      if (kw && !api.path.toLowerCase().includes(kw) && !api.summary.toLowerCase().includes(kw)) {
        return false
      }
      return true
    })
  }, [apis, keyword, methodFilter, includeDeprecated])

  const handleDelete = async (api: ApiDefinition) => {
    if (!contractId) return
    try {
      await deleteApi(contractId, api.id)
      message.success(`已删除 ${api.method} ${api.path}`)
      await load()
    } catch (e: any) {
      message.error(e?.message || '删除失败')
    }
  }

  const columns = [
    {
      title: '方法',
      dataIndex: 'method',
      key: 'method',
      width: 80,
      render: (m: string) => (
        <Tag color={HTTP_METHOD_COLORS[m] || 'default'} style={{ width: 60, textAlign: 'center' }}>
          {m}
        </Tag>
      ),
    },
    {
      title: '路径',
      dataIndex: 'path',
      key: 'path',
      render: (path: string, api: ApiDefinition) => (
        <Space>
          <Text code>{path}</Text>
          {api.deprecated && <Tag color="default">已废弃</Tag>}
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'summary',
      key: 'summary',
      ellipsis: true,
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 180,
      render: (tags: string[]) => (
        <Space wrap size={[0, 4]}>
          {tags?.map((t) => <Tag key={t}>{t}</Tag>)}
        </Space>
      ),
    },
    {
      title: '更新',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 140,
      render: (s: string) => formatRelative(s),
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_: any, api: ApiDefinition) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/contracts/${contractId}/apis/${api.id}`)}
          >
            查看
          </Button>
          {canEdit && (
            <Popconfirm
              title="确认删除？"
              description={`将删除 ${api.method} ${api.path}`}
              okText="删除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => handleDelete(api)}
            >
              <Button type="link" danger size="small" icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  if (!activeContractSet) {
    return (
      <div className="page-content">
        <Alert type="warning" message="未找到契约集信息" />
      </div>
    )
  }

  return (
    <div className="page-content contract-apis">
      <Space style={{ marginBottom: 16 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          type="text"
          onClick={() => navigate(`/contracts/${contractId}`)}
        >
          返回契约集
        </Button>
      </Space>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>接口管理</Title>
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} disabled>
            新增接口
          </Button>
        )}
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索路径或描述..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
          style={{ width: 280 }}
        />
        <Select
          placeholder="HTTP 方法"
          value={methodFilter}
          onChange={setMethodFilter}
          allowClear
          style={{ width: 140 }}
          options={HTTP_METHODS.map((m) => ({ value: m, label: m }))}
        />
        <Checkbox checked={includeDeprecated} onChange={(e) => setIncludeDeprecated(e.target.checked)}>
          包含已废弃
        </Checkbox>
      </Space>

      {loading && !apis ? (
        <Skeleton active />
      ) : filtered.length === 0 ? (
        <Empty description={keyword ? '未找到匹配的接口' : '还没有接口'} />
      ) : (
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          pagination={{ pageSize: 20, showSizeChanger: false }}
        />
      )}
    </div>
  )
}