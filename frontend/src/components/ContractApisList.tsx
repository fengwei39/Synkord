// Synkord ContractApisList
// 主从布局接口列表：左侧列表 + 右侧详情
// 详见 docs/ui-spec.md §五
//
// 同时支持两种使用模式：
// - embedded: true  → 嵌入到 ContractDetail 的"接口" Tab 内
// - embedded: false → 独立页（ContractApis），含页头、"管理全部"链接

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  CaretDownOutlined,
  CaretRightOutlined,
  ClusterOutlined,
  DeleteOutlined,
  EditOutlined,
  ImportOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { listApis, createApi, deleteApi, updateApi } from '../api/apis'
import type { ApiDefinition } from '../api/apis'
import { useContract } from '../contexts/ContractContext'
import { HTTP_METHOD_COLORS } from '../utils/format'
import ApiDetailPanel from './ApiDetailPanel'

const { Title, Text } = Typography

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const

type GroupBy = 'method' | 'tag' | 'path' | 'none'

function parseApiTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((s): s is string => typeof s === 'string' && s.length > 0)
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed.filter((s): s is string => typeof s === 'string' && s.length > 0)
        }
      } catch {
        // fall through
      }
    }
    return [trimmed]
  }
  return []
}

const GROUP_BY_OPTIONS: Array<{ value: GroupBy; label: string }> = [
  { value: 'method', label: '按方法' },
  { value: 'tag', label: '按标签' },
  { value: 'path', label: '按路径前缀' },
  { value: 'none', label: '不分组' },
]

interface ApiEditorValues {
  path: string
  method: string
  summary?: string
  description?: string
  tagsText?: string
}

interface Props {
  contractId: string
  embedded?: boolean
  onCountChange?: (n: number) => void
}

interface ApiGroup {
  key: string
  label: string
  color?: string
  items: ApiDefinition[]
}

export default function ContractApisList({ contractId, embedded, onCountChange }: Props) {
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const { activeContractSet, refreshContracts } = useContract()

  const [apis, setApis] = useState<ApiDefinition[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [methodFilter, setMethodFilter] = useState<string | undefined>()
  const [includeDeprecated, setIncludeDeprecated] = useState(false)
  const [groupBy, setGroupBy] = useState<GroupBy>('method')
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  // 选中的 API（主从布局右侧详情）
  const [selectedApiId, setSelectedApiId] = useState<string | null>(null)

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
      onCountChange?.(res.items.length)
      await refreshContracts().catch(() => {})

      // 校验当前选中项是否还在列表里；若不在，清空（被过滤掉了或刚被删）
      if (selectedApiId && !res.items.find((a) => a.id === selectedApiId)) {
        setSelectedApiId(null)
      }
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

  // 切换 contractId 时清空选中
  useEffect(() => {
    setSelectedApiId(null)
  }, [contractId])

  const filtered = useMemo(() => {
    if (!apis) return []
    const kw = keyword.toLowerCase().trim()
    return apis.filter((api) => {
      if (methodFilter && api.method !== methodFilter) return false
      if (!includeDeprecated && api.deprecated) return false
      if (kw && !api.path.toLowerCase().includes(kw) && !(api.summary || '').toLowerCase().includes(kw)) {
        return false
      }
      return true
    })
  }, [apis, keyword, methodFilter, includeDeprecated])

  const groups: ApiGroup[] = useMemo(() => {
    if (filtered.length === 0) return []

    if (groupBy === 'none') {
      return [{ key: 'all', label: '全部接口', items: filtered }]
    }

    if (groupBy === 'method') {
      return HTTP_METHODS
        .map((m) => ({
          key: `method:${m}`,
          label: m,
          color: HTTP_METHOD_COLORS[m],
          items: filtered.filter((a) => a.method === m),
        }))
        .filter((g) => g.items.length > 0)
    }

    if (groupBy === 'tag') {
      const map = new Map<string, ApiDefinition[]>()
      for (const api of filtered) {
        const tags = parseApiTags(api.tags)
        const effective = tags.length > 0 ? tags : ['未分类']
        for (const t of effective) {
          if (!map.has(t)) map.set(t, [])
          map.get(t)!.push(api)
        }
      }
      return Array.from(map.entries())
        .map(([label, items]) => ({ key: `tag:${label}`, label, items }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }

    const map = new Map<string, ApiDefinition[]>()
    for (const api of filtered) {
      const seg = api.path.split('/').filter(Boolean)[0] || '其他'
      if (!map.has(seg)) map.set(seg, [])
      map.get(seg)!.push(api)
    }
    return Array.from(map.entries())
      .map(([seg, items]) => ({ key: `path:${seg}`, label: `/${seg}`, items }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [filtered, groupBy])

  const handleDelete = async (api: ApiDefinition) => {
    if (!contractId) return
    try {
      await deleteApi(contractId, api.id)
      message.success(`已删除 ${api.method} ${api.path}`)
      if (selectedApiId === api.id) setSelectedApiId(null)
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
        const updated = await updateApi(contractId, editingApi.id, payload)
        message.success('已保存')
        // 保持在右侧详情里（更新后）
        setSelectedApiId(updated.id)
      } else {
        const created = await createApi(contractId, payload)
        message.success('已创建')
        // 自动选中新创建的 API
        setSelectedApiId(created.id)
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
      width: 70,
      render: (m: string) => <Tag color={HTTP_METHOD_COLORS[m] || 'default'}>{m}</Tag>,
    },
    {
      title: '摘要',
      dataIndex: 'summary',
      key: 'summary',
      ellipsis: true,
      render: (s: string, record: ApiDefinition) => (
        <Space size={4}>
          <Text>{s || record.path}</Text>
          {record.deprecated && <Tag color="default" style={{ fontSize: 10 }}>已废弃</Tag>}
        </Space>
      ),
    },
  ]

  const isCollapsed = (group: ApiGroup) => collapsedKeys.has(group.key)
  const toggleGroup = (group: ApiGroup) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(group.key)) next.delete(group.key)
      else next.add(group.key)
      return next
    })
  }
  const expandAll = () => setCollapsedKeys(new Set())
  const collapseAll = () => {
    if (groups.length === 0) return
    setCollapsedKeys(new Set(groups.map((g) => g.key)))
  }

  // 行点击：主从布局选中；非 embedded 模式也可双击跳详情页
  const onRowClick = (record: ApiDefinition) => ({
    onClick: () => setSelectedApiId(record.id),
    onDoubleClick: () => {
      if (!embedded) navigate(`/contracts/${contractId}/apis/${record.id}`)
    },
  })
  const rowClassName = (record: ApiDefinition) =>
    record.id === selectedApiId ? 'api-row-selected' : ''

  const renderGroup = (group: ApiGroup) => {
    const collapsed = isCollapsed(group)
    return (
      <div key={group.key} className="api-group">
        <div
          className="api-group-header"
          role="button"
          tabIndex={0}
          onClick={() => toggleGroup(group)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleGroup(group)
            }
          }}
        >
          <Space size={8}>
            <span className={`api-group-caret ${collapsed ? 'collapsed' : ''}`}>
              <CaretDownOutlined />
            </span>
            {group.color ? (
              <Tag color={group.color} style={{ margin: 0, fontWeight: 600 }}>
                {group.label}
              </Tag>
            ) : (
              <Text strong style={{ fontSize: 14 }}>
                <ClusterOutlined style={{ marginRight: 6, color: '#1677ff' }} />
                {group.label}
              </Text>
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
              {group.items.length} 个
            </Text>
          </Space>
        </div>
        {!collapsed && (
          <Table
            columns={columns}
            dataSource={group.items}
            rowKey="id"
            onRow={onRowClick}
            rowClassName={rowClassName}
            pagination={false}
            size="small"
            showHeader={false}
          />
        )}
      </div>
    )
  }

  // 列表内容（左侧）
  const listContent = (
    <div className="apis-list-pane">
      {/* 过滤行 */}
      <Space style={{ marginBottom: 8 }} wrap size={6}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索路径或描述..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={load}
          allowClear
          size="small"
          style={{ width: 200 }}
        />
        <Select
          placeholder="HTTP 方法"
          value={methodFilter}
          onChange={setMethodFilter}
          allowClear
          size="small"
          style={{ width: 110 }}
          options={HTTP_METHODS.map((m) => ({ value: m, label: m }))}
        />
        <Select
          value={groupBy}
          onChange={(v) => setGroupBy(v as GroupBy)}
          size="small"
          style={{ width: 110 }}
          options={GROUP_BY_OPTIONS}
        />
        <Checkbox
          checked={includeDeprecated}
          onChange={(e) => setIncludeDeprecated(e.target.checked)}
        >
          包含已废弃
        </Checkbox>
      </Space>

      {loading && !apis ? (
        <Skeleton active />
      ) : filtered.length === 0 ? (
        <Empty
          description={keyword || methodFilter ? '未找到匹配的接口' : '还没有接口'}
          style={{ padding: '40px 0' }}
        >
          {canEdit && !keyword && !methodFilter && (
            <Space direction="vertical" size={8}>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                新增第一个接口
              </Button>
              <Button
                icon={<ImportOutlined />}
                onClick={() => navigate(`/contracts/${contractId}/import`)}
              >
                从 OpenAPI 导入
              </Button>
            </Space>
          )}
        </Empty>
      ) : groupBy === 'none' ? (
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
      ) : (
        <div className="api-groups">
          {groups.map(renderGroup)}
          {groups.length > 0 && (
            <div style={{ display: 'flex', gap: 8, padding: '0 10px' }}>
              <Button
                size="small"
                type="link"
                icon={<CaretDownOutlined />}
                onClick={expandAll}
                disabled={collapsedKeys.size === 0}
              >
                全部展开
              </Button>
              <Button
                size="small"
                type="link"
                icon={<CaretRightOutlined />}
                onClick={collapseAll}
                disabled={collapsedKeys.size === groups.length}
              >
                全部折叠
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )

  // 详情内容（右侧）
  const detailContent = selectedApiId ? (
    <ApiDetailPanel
      key={selectedApiId}
      contractId={contractId}
      apiId={selectedApiId}
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
              : '← 从左侧选择一个接口查看详情'}
          </Text>
        }
        style={{ marginTop: 80 }}
      />
    </div>
  )

  return (
    <div className="contract-apis-list">
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
          <Title level={3} style={{ margin: 0 }}>
            接口管理
          </Title>
          {canEdit && (
            <Space>
              <Button
                icon={<ImportOutlined />}
                onClick={() => navigate(`/contracts/${contractId}/import`)}
              >
                导入 OpenAPI
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                新增接口
              </Button>
            </Space>
          )}
        </div>
      )}

      {embedded && canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <Space size={6}>
            <Button
              size="small"
              icon={<ImportOutlined />}
              onClick={() => navigate(`/contracts/${contractId}/import`)}
            >
              导入 OpenAPI
            </Button>
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增接口
            </Button>
          </Space>
        </div>
      )}

      {/* 主从布局 */}
      <div className="master-detail-layout">
        <div className="master-pane">{listContent}</div>
        <div className="detail-pane">{detailContent}</div>
      </div>

      <Drawer
        title={editingApi ? '编辑接口' : '新增接口'}
        open={editorOpen}
        onClose={closeEditor}
        width={520}
        destroyOnHidden
        extra={
          <Space>
            <Button onClick={closeEditor}>取消</Button>
            <Button
              type="primary"
              loading={saving}
              onClick={() => {
                const form = document.querySelector<HTMLFormElement>('#api-editor-form')
                form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
              }}
            >
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
