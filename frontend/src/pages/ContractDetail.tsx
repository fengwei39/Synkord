// Synkord ContractDetail (Phase 1 placeholder)
// 契约集详情页
// 详见 docs/ui-spec.md §五

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { App as AntApp, Button, Skeleton, Space, Tag, Typography, Tabs, Card } from 'antd'
import { ApiOutlined, DatabaseOutlined, LeftOutlined, TeamOutlined } from '@ant-design/icons'
import { getContract } from '../api/contracts'
import { useContract } from '../contexts/ContractContext'
import type { ContractSet } from '../types/contract'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const { Title, Text } = Typography

const projectTypeLabels: Record<string, string> = {
  backend: '后端服务',
  web: 'Web 前端',
  app: 'App 移动端',
}

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const { activeContract, setActiveContract } = useContract()
  const [contract, setContract] = useState<ContractSet | null>(null)
  const [loading, setLoading] = useState(true)

  useDocumentTitle(contract?.name || '契约集详情')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getContract(id)
      .then(setContract)
      .catch((e) => message.error(e?.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [id, message])

  if (loading || !contract) {
    return (
      <div className="page-content">
        <Skeleton active />
      </div>
    )
  }

  const isActive = activeContract?.contract_id === contract.id
  const role = contract.my_role

  const handleSetActive = async () => {
    try {
      await setActiveContract(contract.id)
      message.success(`已切换到 ${contract.name}`)
    } catch (e: any) {
      message.error(e?.message || '切换失败')
    }
  }

  return (
    <div className="page-content contract-detail">
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<LeftOutlined />} type="text" onClick={() => navigate('/contracts')}>
          返回
        </Button>
      </Space>

      <div className="contract-detail-header">
        <Title level={3} style={{ margin: 0 }}>
          {contract.name}
          {isActive && <Tag color="blue" style={{ marginLeft: 12 }}>活跃中</Tag>}
        </Title>
        <Space style={{ marginTop: 8 }}>
          <Tag>{projectTypeLabels[contract.project_type] || contract.project_type}</Tag>
          <Text type="secondary">
            创建于 {new Date(contract.created_at).toLocaleDateString()} · 最近更新 {new Date(contract.updated_at).toLocaleDateString()}
          </Text>
        </Space>
        <Space style={{ marginTop: 8 }}>
          {role && <Tag>我的角色：{role === 'owner' ? '创建者' : role === 'editor' ? '编辑者' : '查看者'}</Tag>}
        </Space>
        <Space style={{ marginTop: 16 }}>
          {!isActive && (role === 'owner' || role === 'editor' || role === 'viewer') && (
            <Button type="primary" onClick={handleSetActive}>设为活跃</Button>
          )}
          {(role === 'owner' || role === 'editor') && (
            <Button onClick={() => navigate(`/contracts/${contract.id}/import`)}>导入 API</Button>
          )}
        </Space>
      </div>

      <Tabs
        defaultActiveKey="apis"
        style={{ marginTop: 24 }}
        items={[
          {
            key: 'apis',
            label: <span><ApiOutlined /> 接口 ({contract.api_count})</span>,
            children: (
              <Card>
                <Text type="secondary">接口列表（Phase 2 详细实现）</Text>
              </Card>
            ),
          },
          {
            key: 'models',
            label: <span><DatabaseOutlined /> 数据模型 ({contract.entity_count})</span>,
            children: (
              <Card>
                <Text type="secondary">数据模型列表（Phase 2 详细实现）</Text>
              </Card>
            ),
          },
          {
            key: 'members',
            label: <span><TeamOutlined /> 成员 ({contract.member_count})</span>,
            children: (
              <Card>
                <Text type="secondary">
                  成员管理（Phase 6 详细实现） · <a onClick={() => navigate(`/contracts/${contract.id}/members`)}>前往成员管理 →</a>
                </Text>
              </Card>
            ),
          },
        ]}
      />
    </div>
  )
}