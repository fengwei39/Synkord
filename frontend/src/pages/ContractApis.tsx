// Synkord ContractApis
// 契约集接口列表 + 编辑抽屉
// 详见 docs/ui-spec.md §五
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  App as AntApp,
  Button,
  Checkbox,
  Drawer,
  Empty,
  Form,
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
import { listApis, createApi, deleteApi, updateApi } from '../api/apis'
import type { ApiDefinition } from '../api/apis'
import { useContract } from '../contexts/ContractContext'
import { formatRelative, HTTP_METHOD_COLORS } from '../utils/format'

const { Title, Text } = Typography

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const

interface ApiEditorValues {
  path: string
  method: string
  summary?: string
  description?: string
  tagsText?: string
}

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

  // 编辑抽屉状态
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingApi, setEditingApi] = useState<ApiDefinition | null>(null)
  const [saving, setSaving] = useState(false)

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

  const openCreate = () => {
    setEditingApi(null)
    setEditorOpen(true)
  }
  const openEdit = (api: ApiDefinition) => {
    setEditingApi(api)
    setEditorOpen(true)
  }
  const closeEditor = () => {
    setEditorOpen(false)
    setEditingApi(null)
  }

  const handleEditorSubmit = async (values: ApiEditorValues) => {
    if (!contractId) return
    const tags = (values.tagsText || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const payload = {
      path: values.path,
      method: values.method as ApiDefinition['method'],
      summary: values.summary || '',
      description: values.description || '',
      tags,
      parameters: editingApi?.parameters ?? [],
      request_body: editingApi?.request_body,
      responses: editingApi?.responses ?? { '200': { description: 'OK' } },
      deprecated: editingApi?.deprecated ?? false,
    }
    setSaving(true)
    try {
      if (editingApi) {
        await updateApi(contractId, editingApi.id, payload)
        message.success('已保存')
      } else {
        await createApi(contractId, payload)
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
      title: '方法',
      dataIndex: 'method',
      key: 'method',
      width: 80,
      render: (m: string) => <Tag color={HTTP_METHOD_COLORS[m] || 'default'}>{m}</Tag>,
    },
    {
      title: '路径',
      dataIndex: 'path',
      key: 'path',
      render: (_: string, record: ApiDefinition) => (
        <Space>
          <Text strong style={{ fontFamily: 'monospace' }}>{record.path}</Text>
          {record.deprecated && <Tag color="default" style={{ fontSize: 10 }}>已废弃</Tag>}
        </Space>
      ),
    },
    {
      title: '摘要',
      dataIndex: 'summary',
      key: 'summary',
      ellipsis: true,
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 160,
      render: (t: string) => <Text type="secondary">{formatRelative(t)}</Text>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_: unknown, record: ApiDefinition) => (
        <Space>
          {canEdit && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
              编辑
            </Button>
          )}
          {canEdit && (
            <Popconfirm
              title="删除该接口？"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDelete(record)}
            >
              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="page-content">
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
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
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

      <Drawer
        title={editingApi ? '编辑接口' : '新增接口'}
        open={editorOpen}
        onClose={closeEditor}
        width={520}
        destroyOnHidden
        extra={
          <Space>
            <Button onClick={closeEditor}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => {
              const form = document.querySelector<HTMLFormElement>('#api-editor-form')
              form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
            }}>
              保存
            </Button>
          </Space>
        }
      >
        <Form
          id="api-editor-form"
          layout="vertical"
          initialValues={{
            method: editingApi?.method || 'GET',
            path: editingApi?.path || '/api/',
            summary: editingApi?.summary || '',
            description: editingApi?.description || '',
            tagsText: Array.isArray(editingApi?.tags) ? editingApi.tags.join(', ') : '',
          }}
          onFinish={handleEditorSubmit}
        >
          <Form.Item label="方法" name="method" rules={[{ required: true }]}>
            <Select options={HTTP_METHODS.map((m) => ({ value: m, label: m }))} />
          </Form.Item>
          <Form.Item
            label="路径"
            name="path"
            rules={[{ required: true, message: '请输入接口路径（以 / 开头）' }]}
          >
            <Input placeholder="/api/orders/{id}" />
          </Form.Item>
          <Form.Item label="摘要" name="summary">
            <Input placeholder="一句话说明接口用途" />
          </Form.Item>
          <Form.Item label="详细说明" name="description">
            <Input.TextArea rows={3} placeholder="（可选）" />
          </Form.Item>
          <Form.Item label="标签（逗号分隔）" name="tagsText">
            <Input placeholder="如 orders, public" />
          </Form.Item>
          <Text type="secondary">
            完整的请求体 / 响应 schema 请通过 OpenAPI 导入批量管理；当前表单保存后可在「导入」页面再次合并。
          </Text>
        </Form>
      </Drawer>
    </div>
  )
}
