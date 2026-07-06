// Synkord ContractEntities
// 契约集数据模型列表
// 详见 docs/ui-spec.md §五

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  App as AntApp,
  Alert,
  Button,
  Empty,
  Input,
  Popconfirm,
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
import { listEntities, deleteEntity } from '../api/entities'
import type { EntityDefinition } from '../api/entities'
import { useContract } from '../contexts/ContractContext'
import { formatRelative } from '../utils/format'

const { Title, Text } = Typography

export default function ContractEntities() {
  const { id: contractId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const { activeContractSet } = useContract()

  const [entities, setEntities] = useState<EntityDefinition[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')

  const myRole = activeContractSet?.my_role
  const canEdit = myRole === 'owner' || myRole === 'editor'

  const load = async () => {
    if (!contractId) return
    setLoading(true)
    try {
      const res = await listEntities(contractId, { limit: 200 })
      setEntities(res.items)
    } catch (e: any) {
      message.error(e?.message || '加载数据模型失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId])

  const filtered = useMemo(() => {
    if (!entities) return []
    const kw = keyword.toLowerCase().trim()
    if (!kw) return entities
    return entities.filter(
      (e) =>
        e.name.toLowerCase().includes(kw) ||
        e.description?.toLowerCase().includes(kw),
    )
  }, [entities, keyword])

  const handleDelete = async (entity: EntityDefinition) => {
    if (!contractId) return
    try {
      await deleteEntity(contractId, entity.id)
      message.success(`已删除 ${entity.name}`)
      await load()
    } catch (e: any) {
      message.error(e?.message || '删除失败')
    }
  }

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (s?: string) => s || <Text type="secondary">-</Text>,
    },
    {
      title: '字段数',
      key: 'fields',
      width: 100,
      render: (_: any, e: EntityDefinition) => (
        <Tag>{e.fields.length}</Tag>
      ),
    },
    {
      title: '必填字段',
      key: 'required',
      width: 100,
      render: (_: any, e: EntityDefinition) => {
        const required = e.fields.filter((f) => f.required).length
        return <Tag color="blue">{required}</Tag>
      },
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
      render: (_: any, entity: EntityDefinition) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/contracts/${contractId}/models/${entity.id}`)}
          >
            查看
          </Button>
          {canEdit && (
            <Popconfirm
              title="确认删除？"
              description={`将删除数据模型 ${entity.name}`}
              okText="删除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => handleDelete(entity)}
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
    <div className="page-content contract-entities">
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
        <Title level={3} style={{ margin: 0 }}>数据模型</Title>
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} disabled>
            新增模型
          </Button>
        )}
      </div>

      <Space style={{ marginBottom: 16 }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索模型名称或描述..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
          style={{ width: 300 }}
        />
      </Space>

      {loading && !entities ? (
        <Skeleton active />
      ) : filtered.length === 0 ? (
        <Empty description={keyword ? '未找到匹配的模型' : '还没有数据模型'} />
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