// Synkord ApiDetailPanel
// 接口详情面板：基本信息 + 参数 + 请求体/响应 + 依赖
// 复用于：
// - ContractApisList 的主从布局（右侧详情）
// - ContractApiDetail 独立详情页
// 详见 docs/ui-spec.md §五

import { useEffect, useState } from 'react'
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
  ApiOutlined,
  BlockOutlined,
  EditOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { getApi, getApiDependencies } from '../api/apis'
import type { ApiDefinition } from '../api/apis'
import { formatRelative, HTTP_METHOD_COLORS } from '../utils/format'

const { Title, Text, Paragraph } = Typography

interface Props {
  contractId: string
  apiId: string
  /** 内嵌到主从布局时隐藏"返回"和"刷新"按钮（父级有 toolbar） */
  compact?: boolean
  /** 显示内联编辑按钮（点击触发） */
  onEdit?: (api: ApiDefinition) => void
}

interface Deps {
  uses_entities: Array<{ entity_id: string; entity_name: string; usage: string }>
  used_by_apis: Array<{ api_id: string; path: string; method: string }>
}

export default function ApiDetailPanel({ contractId, apiId, compact, onEdit }: Props) {
  const { message } = AntApp.useApp()
  const [api, setApi] = useState<ApiDefinition | null>(null)
  const [deps, setDeps] = useState<Deps | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!contractId || !apiId) return
    setLoading(true)
    try {
      const [apiData, depsData] = await Promise.all([
        getApi(contractId, apiId),
        getApiDependencies(contractId, apiId).catch(() => null),
      ])
      setApi(apiData)
      setDeps(depsData)
    } catch (e: any) {
      message.error(e?.message || '加载接口详情失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setApi(null) // 切换 api 时清空，避免闪现旧数据
    setDeps(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, apiId])

  if (loading && !api) {
    return <Skeleton active paragraph={{ rows: 6 }} />
  }
  if (!api) {
    return <Empty description="未找到该接口" />
  }

  const tags = Array.isArray(api.tags) ? api.tags : []

  return (
    <div className="api-detail-panel">
      {/* 头部：方法 + 路径 + 摘要 */}
      <div className="api-detail-header">
        <div className="api-detail-title-row">
          <Title level={4} style={{ margin: 0 }}>
            {api.summary || api.path}
          </Title>
          {api.deprecated && <Tag color="default">已废弃</Tag>}
          {!compact && (
            <Space size={4} style={{ marginLeft: 'auto' }}>
              <Tooltip title="刷新">
                <Button size="small" icon={<ReloadOutlined />} onClick={load} />
              </Tooltip>
              {onEdit && (
                <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => onEdit(api)}>
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
              onClick={() => onEdit(api)}
              style={{ marginLeft: 'auto' }}
            >
              编辑
            </Button>
          )}
        </div>
        <Space size={8} style={{ marginTop: 8 }}>
          <Tag color={HTTP_METHOD_COLORS[api.method] || 'default'} style={{ fontWeight: 600 }}>
            {api.method}
          </Tag>
          <Text code style={{ fontSize: 13 }}>{api.path}</Text>
          {tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </Space>
        {api.description && (
          <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            {api.description}
          </Paragraph>
        )}
      </div>

      {/* 基本信息 */}
      <Card size="small" title="基本信息" style={{ marginTop: 16 }}>
        <Descriptions column={1} size="small" colon={false}>
          <Descriptions.Item label="ID">
            <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>{api.id}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">{formatRelative(api.updated_at)}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatRelative(api.created_at)}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 参数 */}
      <Card
        size="small"
        title={
          <Space>
            <ApiOutlined />
            <span>参数（{api.parameters?.length || 0}）</span>
          </Space>
        }
        style={{ marginTop: 12 }}
      >
        {api.parameters && api.parameters.length > 0 ? (
          <Table
            rowKey={(p) => `${p.in}-${p.name}`}
            dataSource={api.parameters}
            pagination={false}
            size="small"
            columns={[
              { title: '名称', dataIndex: 'name', key: 'name' },
              {
                title: '位置',
                dataIndex: 'in',
                key: 'in',
                width: 80,
                render: (v: string) => <Tag>{v}</Tag>,
              },
              {
                title: '必填',
                dataIndex: 'required',
                key: 'required',
                width: 70,
                render: (v: boolean) => (v ? <Tag color="red">是</Tag> : <Text type="secondary">-</Text>),
              },
              {
                title: '类型',
                key: 'type',
                width: 90,
                render: (_: unknown, p: any) => p.schema?.type || '-',
              },
              {
                title: '说明',
                dataIndex: 'description',
                key: 'description',
                ellipsis: true,
                render: (s?: string) => s || <Text type="secondary">-</Text>,
              },
            ]}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无参数" />
        )}
      </Card>

      {/* 请求体 + 响应 */}
      <Card
        size="small"
        title={
          <Space>
            <BlockOutlined />
            <span>请求 / 响应</span>
          </Space>
        }
        style={{ marginTop: 12 }}
      >
        <div className="api-detail-section">
          <div className="api-detail-section-label">请求体</div>
          {api.request_body ? (
            <pre className="api-detail-pre">
              {JSON.stringify(api.request_body, null, 2)}
            </pre>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无请求体" />
          )}
        </div>
        <div className="api-detail-section">
          <div className="api-detail-section-label">响应</div>
          {api.responses && Object.keys(api.responses).length > 0 ? (
            <pre className="api-detail-pre">
              {JSON.stringify(api.responses, null, 2)}
            </pre>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未定义响应" />
          )}
        </div>
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
          <div className="api-detail-section-label">引用了这些实体</div>
          {deps?.uses_entities && deps.uses_entities.length > 0 ? (
            <Space wrap>
              {deps.uses_entities.map((e, i) => (
                <Tag key={`${e.entity_name}-${i}`} color="purple">{e.entity_name}</Tag>
              ))}
            </Space>
          ) : (
            <Text type="secondary">无</Text>
          )}
        </div>
        <div className="api-detail-section">
          <div className="api-detail-section-label">被这些接口调用</div>
          {deps?.used_by_apis && deps.used_by_apis.length > 0 ? (
            <Table
              rowKey={(a) => a.api_id}
              dataSource={deps.used_by_apis}
              pagination={false}
              size="small"
              columns={[
                {
                  title: '方法',
                  dataIndex: 'method',
                  key: 'method',
                  width: 80,
                  render: (m: string) => <Tag color={HTTP_METHOD_COLORS[m] || 'default'}>{m}</Tag>,
                },
                { title: '路径', dataIndex: 'path', key: 'path' },
              ]}
            />
          ) : (
            <Text type="secondary">无</Text>
          )}
        </div>
      </Card>
    </div>
  )
}
