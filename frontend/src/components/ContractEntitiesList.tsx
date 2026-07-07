// Synkord ContractEntitiesList
// 主从布局数据模型列表：左侧列表 + 右侧详情
// 详见 docs/ui-spec.md §五

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  App as AntApp,
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
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { listEntities, createEntity, updateEntity, deleteEntity } from '../api/entities'
import type { EntityDefinition } from '../api/entities'
import { useContract } from '../contexts/ContractContext'
import { emptySchemaContent } from '../utils/jsonSchema'
import EntityDetailPanel from './EntityDetailPanel'

const { Title, Text } = Typography

interface EntityEditorValues {
  name: string
  description?: string
  schema_content: string
  change_summary?: string
}

interface Props {
  contractId: string
  embedded?: boolean
  onCountChange?: (n: number) => void
}

export default function ContractEntitiesList({ contractId, embedded, onCountChange }: Props) {
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const { activeContractSet, refreshContracts } = useContract()

  const [entities, setEntities] = useState<EntityDefinition[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)

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
      onCountChange?.(res.items.length)
      await refreshContracts().catch(() => {})

      if (selectedEntityId && !res.items.find((e) => e.id === selectedEntityId)) {
        setSelectedEntityId(null)
      }
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

  useEffect(() => {
    setSelectedEntityId(null)
  }, [contractId])

  const filtered = useMemo(() => {
    if (!entities) return []
    const kw = keyword.toLowerCase().trim()
    if (!kw) return entities
    return entities.filter(
      (e) =>
        e.name.toLowerCase().includes(kw) ||
        (e.description || '').toLowerCase().includes(kw),
    )
  }, [entities, keyword])

  const handleDelete = async (entity: EntityDefinition) => {
    if (!contractId) return
    try {
      await deleteEntity(contractId, entity.id)
      message.success(`已删除 ${entity.name}`)
      if (selectedEntityId === entity.id) setSelectedEntityId(null)
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
        const updated = await updateEntity(contractId, editingEntity.id, {
          name: values.name,
          description: values.description || '',
          schema_content: values.schema_content,
          change_summary: values.change_summary || 'Edit',
        })
        message.success('已保存（自动写入新版本快照）')
        setSelectedEntityId(updated.id)
      } else {
        const created = await createEntity(contractId, {
          name: values.name,
          description: values.description || '',
          schema_content: values.schema_content,
        })
        message.success('已创建')
        setSelectedEntityId(created.id)
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
  ]

  const onRowClick = (record: EntityDefinition) => ({
    onClick: () => setSelectedEntityId(record.id),
    onDoubleClick: () => {
      if (!embedded) navigate(`/contracts/${contractId}/models/${record.id}`)
    },
  })
  const rowClassName = (record: EntityDefinition) =>
    record.id === selectedEntityId ? 'api-row-selected' : ''

  // 左侧列表内容
  const listContent = (
    <div className="entities-list-pane">
      <Space style={{ marginBottom: 8 }} wrap>
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索模型名称或描述..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
          size="small"
          style={{ width: 240 }}
        />
      </Space>

      {loading && !entities ? (
        <Skeleton active />
      ) : filtered.length === 0 ? (
        <Empty
          description={keyword ? '未找到匹配的模型' : '还没有数据模型'}
          style={{ padding: '40px 0' }}
        >
          {canEdit && !keyword && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增第一个模型
            </Button>
          )}
        </Empty>
      ) : (
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          onRow={onRowClick}
          rowClassName={rowClassName}
          pagination={false}
          size="middle"
          showHeader={false}
        />
      )}
    </div>
  )

  // 右侧详情内容
  const detailContent = selectedEntityId ? (
    <EntityDetailPanel
      key={selectedEntityId}
      contractId={contractId}
      entityId={selectedEntityId}
      compact
      onEdit={canEdit ? openEdit : undefined}
    />
  ) : (
    <div className="apis-detail-empty">
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Text type="secondary">
            {filtered.length === 0
              ? '左侧列表为空'
              : '← 从左侧选择一个数据模型查看详情'}
          </Text>
        }
        style={{ marginTop: 80 }}
      />
    </div>
  )

  return (
    <div className="contract-entities-list">
      {!embedded && (
        <Space style={{ marginBottom: 16 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            type="text"
            onClick={() => navigate(`/contracts/${contractId}`)}
          >
            返回契约集
          </Button>
        </Space>
      )}

      {!embedded && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <Title level={3} style={{ margin: 0 }}>数据模型</Title>
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增模型
            </Button>
          )}
        </div>
      )}

      {embedded && canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增数据模型
          </Button>
        </div>
      )}

      {/* 主从布局 */}
      <div className="master-detail-layout">
        <div className="master-pane">{listContent}</div>
        <div className="detail-pane">{detailContent}</div>
      </div>

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
