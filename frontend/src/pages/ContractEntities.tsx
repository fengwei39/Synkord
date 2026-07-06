// Synkord ContractEntities
// 契约集数据模型列表 + 编辑抽屉（JSON Schema 字符串）
// 详见 docs/ui-spec.md §五
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  App as AntApp,
  Alert,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  Popconfirm,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { listEntities, createEntity, updateEntity, deleteEntity } from '../api/entities'
import type { EntityDefinition } from '../api/entities'
import { useContract } from '../contexts/ContractContext'
import { formatRelative } from '../utils/format'
import { emptySchemaContent, parseSchemaFields } from '../utils/jsonSchema'

const { Title, Text } = Typography

interface EntityEditorValues {
  name: string
  description?: string
  schema_content: string
  change_summary?: string
}

export default function ContractEntities() {
  const { id: contractId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const { activeContractSet } = useContract()

  const [entities, setEntities] = useState<EntityDefinition[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingEntity, setEditingEntity] = useState<EntityDefinition | null>(null)
  const [saving, setSaving] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)

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

  const openCreate = () => {
    setEditingEntity(null)
    setEditorOpen(true)
  }
  const openEdit = (entity: EntityDefinition) => {
    setEditingEntity(entity)
    setEditorOpen(true)
  }
  const closeEditor = () => {
    setEditorOpen(false)
    setEditingEntity(null)
    setSchemaError(null)
  }

  const validateSchema = (raw: string): boolean => {
    if (!raw.trim()) {
      setSchemaError('请填写 schema_content')
      return false
    }
    try {
      const obj = JSON.parse(raw)
      if (!obj || typeof obj !== 'object') {
        setSchemaError('schema_content 必须是 JSON 对象')
        return false
      }
      setSchemaError(null)
      return true
    } catch (e: any) {
      setSchemaError(`JSON 解析失败：${e.message}`)
      return false
    }
  }

  const handleEditorSubmit = async (values: EntityEditorValues) => {
    if (!contractId) return
    if (!validateSchema(values.schema_content)) return
    setSaving(true)
    try {
      if (editingEntity) {
        await updateEntity(contractId, editingEntity.id, {
          name: values.name,
          description: values.description || '',
          schema_content: values.schema_content,
          change_summary: values.change_summary || 'Edit',
        })
        message.success('已保存（自动写入新版本快照）')
      } else {
        await createEntity(contractId, {
          name: values.name,
          description: values.description || '',
          schema_content: values.schema_content,
        })
        message.success('已创建')
      }
      closeEditor()
      await load()
    } catch (e: any) {
      message.error(e?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: EntityDefinition) => (
        <Space>
          <Text strong>{name}</Text>
          <Tooltip title={`v${record.current_version} · 共 ${record.version_count} 个版本`}>
            <Tag color="blue">v{record.current_version}</Tag>
          </Tooltip>
        </Space>
      ),
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
      width: 90,
      render: (_: unknown, e: EntityDefinition) => {
        const n = parseSchemaFields(e.schema_content).length
        return <Tag>{n}</Tag>
      },
    },
    {
      title: '必填',
      key: 'required',
      width: 80,
      render: (_: unknown, e: EntityDefinition) => {
        const required = parseSchemaFields(e.schema_content).filter((f) => f.required).length
        return <Tag color="blue">{required}</Tag>
      },
    },
    {
      title: '更新',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 140,
      render: (s: string) => <Text type="secondary">{formatRelative(s)}</Text>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: unknown, entity: EntityDefinition) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/contracts/${contractId}/models/${entity.id}`)}
          >
            详情
          </Button>
          {canEdit && (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(entity)}>
              编辑
            </Button>
          )}
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
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
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

      <Drawer
        title={editingEntity ? `编辑数据模型（v${editingEntity.current_version}）` : '新增数据模型'}
        open={editorOpen}
        onClose={closeEditor}
        width={620}
        destroyOnHidden
        extra={
          <Space>
            <Button onClick={closeEditor}>取消</Button>
            <Button
              type="primary"
              loading={saving}
              onClick={() => {
                const form = document.querySelector<HTMLFormElement>('#entity-editor-form')
                form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
              }}
            >
              保存
            </Button>
          </Space>
        }
      >
        <Form
          id="entity-editor-form"
          layout="vertical"
          initialValues={{
            name: editingEntity?.name || '',
            description: editingEntity?.description || '',
            schema_content: editingEntity?.schema_content || emptySchemaContent(),
            change_summary: '',
          }}
          onFinish={handleEditorSubmit}
        >
          <Form.Item
            label="名称"
            name="name"
            rules={[{ required: true, message: '请输入实体名' }]}
          >
            <Input placeholder="Order" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input placeholder="（可选）一句话说明" />
          </Form.Item>
          <Form.Item
            label="schema_content（JSON Schema）"
            name="schema_content"
            rules={[{ required: true, message: '请填写 JSON Schema' }]}
            extra={
              schemaError ? (
                <Text type="danger">{schemaError}</Text>
              ) : (
                <Text type="secondary">
                  支持 type / properties / required / items / $ref / enum 等标准 JSON Schema 字段。
                  保存时会自动写入版本快照。
                </Text>
              )
            }
          >
            <Input.TextArea
              rows={14}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              onChange={() => setSchemaError(null)}
            />
          </Form.Item>
          {editingEntity && (
            <Form.Item label="本次变更说明" name="change_summary">
              <Input placeholder="如：新增字段 userId、改 enum 值" />
            </Form.Item>
          )}
        </Form>
      </Drawer>
    </div>
  )
}
