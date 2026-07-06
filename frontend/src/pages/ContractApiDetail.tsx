// Synkord ContractApiDetail（v1.2：真实详情）
// 单个 API 端点的完整定义 + 依赖 + 编辑入口
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
  ApiOutlined,
  BlockOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { getApi, getApiDependencies } from '../api/apis'
import type { ApiDefinition } from '../api/apis'
import { useContract } from '../contexts/ContractContext'
import { formatRelative } from '../utils/format'

const { Title, Text, Paragraph } = Typography

export default function ContractApiDetail() {
  const { id: contractId, apiId } = useParams<{ id: string; apiId: string }>()
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const { activeContractSet } = useContract()

  const [api, setApi] = useState<ApiDefinition | null>(null)
  const [deps, setDeps] = useState<{
    uses_entities: Array<{ entity_id: string; entity_name: string; usage: string }>
    used_by_apis: Array<{ api_id: string; path: string; method: string }>
  } | null>(null)
  const [loading, setLoading] = useState(false)

  const myRole = activeContractSet?.my_role
  const canEdit = myRole === 'owner' || myRole === 'editor'

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
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, apiId])

  if (loading && !api) {
    return (
      <div className="page-content">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    )
  }
  if (!api) {
    return (
      <div className="page-content">
        <Alert type="warning" message="未找到该接口" showIcon />
      </div>
    )
  }

  const tags = Array.isArray(api.tags) ? api.tags : []

  return (
    <div className="page-content contract-api-detail">
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate(`/contracts/${contractId}/apis`)}>
          返回接口列表
        </Button>
      </Space>

      <Card
        title={
          <Space size="middle">
            <Title level={3} style={{ margin: 0 }}>{api.summary || api.path}</Title>
            {api.deprecated && <Tag color="default">已废弃</Tag>}
          </Space>
        }
        extra={
          <Space>
            <Tooltip title="刷新">
              <Button icon={<ReloadOutlined />} onClick={load} />
            </Tooltip>
            {canEdit && (
              <Button type="primary" onClick={() => navigate(`/contracts/${contractId}/apis`)}>
                在列表中编辑
              </Button>
            )}
          </Space>
        }
      >
        <Space size="middle" style={{ marginBottom: 16 }}>
          <Tag color="blue">{api.method}</Tag>
          <Text code style={{ fontSize: 14 }}>{api.path}</Text>
          {tags.map((t) => <Tag key={t}>{t}</Tag>)}
        </Space>
        {api.description && <Paragraph>{api.description}</Paragraph>}

        <Descriptions column={2} bordered size="small" style={{ marginTop: 16 }}>
          <Descriptions.Item label="ID"><Text type="secondary" style={{ fontFamily: 'monospace' }}>{api.id}</Text></Descriptions.Item>
          <Descriptions.Item label="契约集 ID"><Text type="secondary" style={{ fontFamily: 'monospace' }}>{api.contract_id}</Text></Descriptions.Item>
          <Descriptions.Item label="更新时间">{formatRelative(api.updated_at)}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatRelative(api.created_at)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={<Space><ApiOutlined /><span>参数定义</span></Space>} style={{ marginTop: 16 }}>
        {api.parameters && api.parameters.length > 0 ? (
          <Table
            rowKey={(p: any) => `${p.in}-${p.name}`}
            dataSource={api.parameters}
            pagination={false}
            size="small"
            columns={[
              { title: '名称', dataIndex: 'name', key: 'name' },
              { title: '位置', dataIndex: 'in', key: 'in', render: (v: string) => <Tag>{v}</Tag>, width: 100 },
              { title: '必填', dataIndex: 'required', key: 'required', width: 80, render: (v: boolean) => v ? <Tag color="red">是</Tag> : '-' },
              { title: '类型', key: 'type', render: (_: any, p: any) => p.schema?.type || '-' },
              { title: '说明', dataIndex: 'description', key: 'description' },
            ]}
          />
        ) : (
          <Empty description="无参数" />
        )}
      </Card>

      <Card title={<Space><BlockOutlined /><span>请求体 / 响应</span></Space>} style={{ marginTop: 16 }}>
        <Title level={5}>请求体</Title>
        {api.request_body ? (
          <pre style={{ background: '#fafafa', padding: 12, borderRadius: 4, overflow: 'auto' }}>
            {JSON.stringify(api.request_body, null, 2)}
          </pre>
        ) : <Empty description="无请求体" />}

        <Title level={5} style={{ marginTop: 16 }}>响应</Title>
        {api.responses ? (
          <pre style={{ background: '#fafafa', padding: 12, borderRadius: 4, overflow: 'auto' }}>
            {JSON.stringify(api.responses, null, 2)}
          </pre>
        ) : <Empty description="未定义响应" />}
      </Card>

      <Card title={<Space><LinkOutlined /><span>依赖关系</span></Space>} style={{ marginTop: 16 }}>
        <Title level={5}>引用了这些实体</Title>
        {deps?.uses_entities && deps.uses_entities.length > 0 ? (
          <Space wrap>
            {deps.uses_entities.map((e, i) => (
              <Tag key={`${e.entity_name}-${i}`} color="purple">{e.entity_name}</Tag>
            ))}
          </Space>
        ) : <Text type="secondary">无</Text>}

        <Title level={5} style={{ marginTop: 16 }}>被这些接口调用</Title>
        {deps?.used_by_apis && deps.used_by_apis.length > 0 ? (
          <Table
            rowKey={(a: any) => a.api_id}
            dataSource={deps.used_by_apis}
            pagination={false}
            size="small"
            columns={[
              { title: '方法', dataIndex: 'method', key: 'method', width: 80, render: (m: string) => <Tag color="blue">{m}</Tag> },
              { title: '路径', dataIndex: 'path', key: 'path' },
            ]}
          />
        ) : <Text type="secondary">无</Text>}
      </Card>
    </div>
  )
}
