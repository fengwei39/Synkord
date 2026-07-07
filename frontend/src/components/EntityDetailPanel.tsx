// Synkord EntityDetailPanel
// 数据模型详情面板：基本信息 + 字段视图 + JSON Schema 原文 + 依赖 + 版本历史
// 复用于：
// - ContractEntitiesList 的主从布局（右侧详情）
// - ContractEntityDetail 独立详情页
// 详见 docs/ui-spec.md §五

import { useEffect, useState } from 'react'
import {
  App as AntApp,
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
  BlockOutlined,
  ClockCircleOutlined,
  EditOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  getEntity,
  getEntityDependencies,
  listEntityVersions,
} from '../api/entities'
import type { EntityDefinition, EntityVersion } from '../api/entities'
import { formatRelative } from '../utils/format'
import { parseSchemaFields } from '../utils/jsonSchema'

const { Title, Text, Paragraph } = Typography

interface Props {
  contractId: string
  entityId: string
  compact?: boolean
  onEdit?: (entity: EntityDefinition) => void
}

interface Deps {
  used_in_apis: Array<{ api_id: string; path: string; method: string; usage: string }>
  references_entities: Array<{ entity_name: string; field_name: string }>
}

export default function EntityDetailPanel({ contractId, entityId, compact, onEdit }: Props) {
  const { message } = AntApp.useApp()
  const [entity, setEntity] = useState<EntityDefinition | null>(null)
  const [deps, setDeps] = useState<Deps | null>(null)
  const [versions, setVersions] = useState<EntityVersion[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!contractId || !entityId) return
    setLoading(true)
    try {
      const [e, d, v] = await Promise.all([
        getEntity(contractId, entityId),
        getEntityDependencies(contractId, entityId).catch(() => null),
        listEntityVersions(contractId, entityId).catch(() => ({ items: [], total: 0 })),
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
    setEntity(null)
    setDeps(null)
    setVersions([])
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, entityId])

  if (loading && !entity) {
    return <Skeleton active paragraph={{ rows: 6 }} />
  }
  if (!entity) {
    return <Empty description="未找到该数据模型" />
  }

  const fields = parseSchemaFields(entity.schema_content)

  return (
    <div className="entity-detail-panel">
      {/* 头部 */}
      <div className="entity-detail-header">
        <div className="entity-detail-title-row">
          <Space size={8}>
            <Title level={4} style={{ margin: 0 }}>{entity.name}</Title>
            <Tag color="blue">v{entity.current_version}</Tag>
            <Tag>共 {entity.version_count} 个版本</Tag>
          </Space>
          {!compact && (
            <Space size={4} style={{ marginLeft: 'auto' }}>
              <Tooltip title="刷新">
                <Button size="small" icon={<ReloadOutlined />} onClick={load} />
              </Tooltip>
              {onEdit && (
                <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => onEdit(entity)}>
                  编辑
                </Button>
              )}
            </Space>
          )}
          {compact && onEdit && (
            <Button
              size="small"
              type="primary"
              icon={<EditOutlined />}
              onClick={() => onEdit(entity)}
              style={{ marginLeft: 'auto' }}
            >
              编辑
            </Button>
          )}
        </div>
        {entity.description && (
          <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            {entity.description}
          </Paragraph>
        )}
      </div>

      {/* 基本信息 */}
      <Card size="small" title="基本信息" style={{ marginTop: 16 }}>
        <Descriptions column={1} size="small" colon={false}>
          <Descriptions.Item label="ID">
            <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>
              {entity.id}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="字段数">{fields.length}</Descriptions.Item>
          <Descriptions.Item label="必填字段">
            {fields.filter((f) => f.required).length}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">{formatRelative(entity.updated_at)}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatRelative(entity.created_at)}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 字段视图 */}
      <Card
        size="small"
        title={
          <Space>
            <BlockOutlined />
            <span>字段（{fields.length}）</span>
          </Space>
        }
        style={{ marginTop: 12 }}
      >
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
                width: 70,
                render: (v: boolean) => (v ? <Tag color="red">是</Tag> : <Text type="secondary">-</Text>),
              },
              {
                title: '引用实体',
                dataIndex: 'ref_entity_id',
                key: 'ref',
                render: (ref?: string) => (ref ? <Tag>{ref}</Tag> : <Text type="secondary">-</Text>),
                width: 140,
              },
              { title: '说明', dataIndex: 'description', key: 'description', ellipsis: true },
            ]}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="schema_content 为空或无法解析" />
        )}
      </Card>

      {/* JSON Schema 原文 */}
      <Card
        size="small"
        title={
          <Space>
            <BlockOutlined />
            <span>schema_content（JSON Schema 原文）</span>
          </Space>
        }
        style={{ marginTop: 12 }}
      >
        <pre className="api-detail-pre">
          {entity.schema_content || '// (空)'}
        </pre>
      </Card>

      {/* 依赖 */}
      <Card
        size="small"
        title={
          <Space>
            <LinkOutlined />
            <span>依赖</span>
          </Space>
        }
        style={{ marginTop: 12 }}
      >
        <div className="api-detail-section">
          <div className="api-detail-section-label">被这些 API 使用</div>
          {deps?.used_in_apis && deps.used_in_apis.length > 0 ? (
            <Table
              rowKey={(a) => `${a.api_id}-${a.path}-${a.method}`}
              dataSource={deps.used_in_apis}
              pagination={false}
              size="small"
              columns={[
                {
                  title: '方法',
                  dataIndex: 'method',
                  key: 'method',
                  width: 80,
                  render: (m: string) => <Tag color="blue">{m}</Tag>,
                },
                { title: '路径', dataIndex: 'path', key: 'path' },
                { title: '用途', dataIndex: 'usage', key: 'usage', width: 120 },
              ]}
            />
          ) : (
            <Text type="secondary">无</Text>
          )}
        </div>
        <div className="api-detail-section">
          <div className="api-detail-section-label">引用了这些实体</div>
          {deps?.references_entities && deps.references_entities.length > 0 ? (
            <Space wrap>
              {deps.references_entities.map((r, i) => (
                <Tag key={`${r.entity_name}-${r.field_name}-${i}`} color="purple">
                  {r.entity_name}.{r.field_name}
                </Tag>
              ))}
            </Space>
          ) : (
            <Text type="secondary">无</Text>
          )}
        </div>
      </Card>

      {/* 版本历史 */}
      <Card
        size="small"
        title={
          <Space>
            <ClockCircleOutlined />
            <span>版本历史（{versions.length}）</span>
          </Space>
        }
        style={{ marginTop: 12 }}
      >
        {versions.length > 0 ? (
          <Table
            rowKey="id"
            dataSource={versions}
            pagination={false}
            size="small"
            columns={[
              {
                title: '版本',
                dataIndex: 'version_number',
                key: 'version_number',
                width: 100,
                render: (v: string) => <Tag color="blue">v{v}</Tag>,
              },
              { title: '说明', dataIndex: 'change_summary', key: 'change_summary', ellipsis: true },
              {
                title: '时间',
                dataIndex: 'created_at',
                key: 'created_at',
                width: 140,
                render: (s: string) => formatRelative(s),
              },
            ]}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史版本" />
        )}
      </Card>
    </div>
  )
}
