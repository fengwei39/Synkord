// Synkord ContractEntityDetail（v1.2：真实详情）
// 数据模型详情：字段视图 + JSON Schema 原文 + 版本历史 + 依赖 + 编辑入口
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  App as AntApp,
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  BlockOutlined,
  ClockCircleOutlined,
  EditOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { getEntity, getEntityDependencies, listEntityVersions } from '../api/entities'
import type { EntityDefinition, EntityVersion } from '../api/entities'
import { useContract } from '../contexts/ContractContext'
import { formatRelative } from '../utils/format'
import { parseSchemaFields } from '../utils/jsonSchema'

const { Title, Text, Paragraph } = Typography

export default function ContractEntityDetail() {
  const { id: contractId, modelId } = useParams<{ id: string; modelId: string }>()
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const { activeContractSet } = useContract()

  const [entity, setEntity] = useState<EntityDefinition | null>(null)
  const [deps, setDeps] = useState<{
    used_in_apis: Array<{ api_id: string; path: string; method: string; usage: string }>
    references_entities: Array<{ entity_name: string; field_name: string }>
  } | null>(null)
  const [versions, setVersions] = useState<EntityVersion[]>([])
  const [loading, setLoading] = useState(false)

  const myRole = activeContractSet?.my_role
  const canEdit = myRole === 'owner' || myRole === 'editor'

  const load = async () => {
    if (!contractId || !modelId) return
    setLoading(true)
    try {
      const [e, d, v] = await Promise.all([
        getEntity(contractId, modelId),
        getEntityDependencies(contractId, modelId).catch(() => null),
        listEntityVersions(contractId, modelId).catch(() => ({ items: [], total: 0 })),
      ])
      setEntity(e)
      setDeps(d)
      setVersions(v.items || [])
    } catch (err: any) {
      message.error(err?.message || '加载实体详情失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, modelId])

  if (loading && !entity) {
    return (
      <div className="page-content">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    )
  }
  if (!entity) {
    return (
      <div className="page-content">
        <Alert type="warning" message="未找到该数据模型" showIcon />
      </div>
    )
  }

  const fields = parseSchemaFields(entity.schema_content)

  return (
    <div className="page-content contract-entity-detail">
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate(`/contracts/${contractId}/models`)}>
          返回模型列表
        </Button>
      </Space>

      <Card
        title={
          <Space size="middle">
            <Title level={3} style={{ margin: 0 }}>{entity.name}</Title>
            <Tag color="blue">v{entity.current_version}</Tag>
            <Tag>共 {entity.version_count} 个版本</Tag>
          </Space>
        }
        extra={
          <Space>
            <Tooltip title="刷新">
              <Button icon={<ReloadOutlined />} onClick={load} />
            </Tooltip>
            {canEdit && (
              <Button type="primary" icon={<EditOutlined />} onClick={() => navigate(`/contracts/${contractId}/models`)}>
                在列表中编辑
              </Button>
            )}
          </Space>
        }
      >
        {entity.description && <Paragraph>{entity.description}</Paragraph>}
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="ID">
            <Text type="secondary" style={{ fontFamily: 'monospace' }}>{entity.id}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="契约集 ID">
            <Text type="secondary" style={{ fontFamily: 'monospace' }}>{entity.contract_id}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="字段数">{fields.length}</Descriptions.Item>
          <Descriptions.Item label="必填字段">{fields.filter((f) => f.required).length}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{formatRelative(entity.updated_at)}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatRelative(entity.created_at)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={<Space><BlockOutlined /><span>字段视图</span></Space>} style={{ marginTop: 16 }}>
        {fields.length > 0 ? (
          <Table
            rowKey="name"
            dataSource={fields}
            pagination={false}
            size="small"
            columns={[
              { title: '名称', dataIndex: 'name', key: 'name', render: (n: string) => <Text strong>{n}</Text> },
              {
                title: '类型',
                dataIndex: 'type',
                key: 'type',
                render: (t: string, f: any) => (
                  <Space size={4}>
                    {f.is_array && <Tag color="purple">array</Tag>}
                    <Tag color="geekblue">{t}</Tag>
                  </Space>
                ),
                width: 140,
              },
              {
                title: '必填',
                dataIndex: 'required',
                key: 'required',
                width: 80,
                render: (v: boolean) => (v ? <Tag color="red">是</Tag> : <Text type="secondary">-</Text>),
              },
              {
                title: '引用实体',
                dataIndex: 'ref_entity_id',
                key: 'ref',
                render: (ref?: string) => (ref ? <Tag>{ref}</Tag> : <Text type="secondary">-</Text>),
                width: 140,
              },
              { title: '说明', dataIndex: 'description', key: 'description' },
            ]}
          />
        ) : (
          <Empty description="schema_content 为空或无法解析" />
        )}
      </Card>

      <Card title="schema_content（JSON Schema 原文）" style={{ marginTop: 16 }}>
        <pre style={{ background: '#fafafa', padding: 12, borderRadius: 4, overflow: 'auto' }}>
          {entity.schema_content}
        </pre>
      </Card>

      <Card title={<Space><LinkOutlined /><span>依赖关系</span></Space>} style={{ marginTop: 16 }}>
        <Title level={5}>被这些 API 使用</Title>
        {deps?.used_in_apis && deps.used_in_apis.length > 0 ? (
          <Table
            rowKey={(a: any) => `${a.api_id}-${a.path}-${a.method}`}
            dataSource={deps.used_in_apis}
            pagination={false}
            size="small"
            columns={[
              { title: '方法', dataIndex: 'method', key: 'method', width: 80, render: (m: string) => <Tag color="blue">{m}</Tag> },
              { title: '路径', dataIndex: 'path', key: 'path' },
              { title: '用途', dataIndex: 'usage', key: 'usage', width: 120 },
            ]}
          />
        ) : <Text type="secondary">无</Text>}

        <Title level={5} style={{ marginTop: 16 }}>引用了这些实体</Title>
        {deps?.references_entities && deps.references_entities.length > 0 ? (
          <Space wrap>
            {deps.references_entities.map((r, i) => (
              <Tag key={`${r.entity_name}-${r.field_name}-${i}`} color="purple">
                {r.entity_name}.{r.field_name}
              </Tag>
            ))}
          </Space>
        ) : <Text type="secondary">无</Text>}
      </Card>

      <Card title={<Space><ClockCircleOutlined /><span>版本历史</span></Space>} style={{ marginTop: 16 }}>
        {versions.length > 0 ? (
          <Table
            rowKey="id"
            dataSource={versions}
            pagination={false}
            size="small"
            columns={[
              { title: '版本', dataIndex: 'version_number', key: 'version_number', width: 100, render: (v: string) => <Tag color="blue">v{v}</Tag> },
              { title: '说明', dataIndex: 'change_summary', key: 'change_summary' },
              { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 160, render: (s: string) => formatRelative(s) },
            ]}
          />
        ) : (
          <Empty description="暂无历史版本" />
        )}
      </Card>
    </div>
  )
}
