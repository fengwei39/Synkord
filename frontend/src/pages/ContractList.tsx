// Synkord ContractList
// 契约集列表（替代 Projects.tsx）
// 详见 docs/ui-spec.md §六

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  App as AntApp,
  Button,
  Checkbox,
  Empty,
  Input,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  CheckOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { listContracts } from '../api/contracts'
import { useContract } from '../contexts/ContractContext'
import type { ContractSet } from '../types/contract'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const { Title, Text } = Typography

const projectTypeLabels: Record<string, string> = {
  backend: '后端服务',
  web: 'Web 前端',
  app: 'App 移动端',
}

const projectTypeColors: Record<string, string> = {
  backend: 'blue',
  web: 'green',
  app: 'purple',
}

const roleLabels: Record<string, string> = {
  owner: '创建者',
  editor: '编辑者',
  viewer: '查看者',
}

export default function ContractList() {
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const { contracts, activeContract, refreshContracts, setActiveContract, loading } = useContract()
  useDocumentTitle('契约集')
  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState<string | undefined>()
  const [includeArchived, setIncludeArchived] = useState(false)
  const [settingActive, setSettingActive] = useState<string | null>(null)

  // 切换 archived 时重新拉
  useEffect(() => {
    refreshContracts()
  }, [includeArchived, refreshContracts])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return contracts.filter((c) => {
      if (typeFilter && c.project_type !== typeFilter) return false
      if (!includeArchived && c.archived) return false
      if (kw && !c.name.toLowerCase().includes(kw)) return false
      return true
    })
  }, [contracts, keyword, typeFilter, includeArchived])

  const handleSetActive = async (record: ContractSet, e: React.MouseEvent) => {
    e.stopPropagation()
    setSettingActive(record.id)
    try {
      await setActiveContract(record.id)
      message.success(`已切换到 ${record.name}`)
    } catch (err: any) {
      message.error(err?.message || '切换失败')
    } finally {
      setSettingActive(null)
    }
  }

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: ContractSet) => (
        <Space>
          {record.id === activeContract?.contract_id && (
            <CheckOutlined style={{ color: '#1677ff' }} />
          )}
          <Text strong>{name}</Text>
          {record.archived && <Tag color="default">已归档</Tag>}
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'project_type',
      key: 'project_type',
      width: 120,
      render: (t: string) => <Tag color={projectTypeColors[t] || 'default'}>{projectTypeLabels[t] || t}</Tag>,
    },
    {
      title: '我的角色',
      dataIndex: 'my_role',
      key: 'my_role',
      width: 100,
      render: (role?: string) => role ? <Tag>{roleLabels[role] || role}</Tag> : '-',
    },
    { title: '接口', dataIndex: 'api_count', key: 'api_count', width: 80 },
    { title: '模型', dataIndex: 'entity_count', key: 'entity_count', width: 80 },
    {
      title: '成员',
      dataIndex: 'member_count',
      key: 'member_count',
      width: 80,
    },
    {
      title: '更新',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 140,
      render: (s: string) => new Date(s).toLocaleDateString(),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_: any, record: ContractSet) => (
        <Button
          type="link"
          size="small"
          onClick={(e) => handleSetActive(record, e)}
          loading={settingActive === record.id}
          disabled={record.id === activeContract?.contract_id}
        >
          {record.id === activeContract?.contract_id ? '当前活跃' : '设为活跃'}
        </Button>
      ),
    },
  ]

  return (
    <div className="page-content contract-list">
      <div className="page-header">
        <Title level={3} style={{ margin: 0 }}>我的契约集</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refreshContracts}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/contracts/new')}>
            新建契约集
          </Button>
        </Space>
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索契约集名..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
          style={{ width: 280 }}
        />
        <Select
          placeholder="类型"
          value={typeFilter}
          onChange={setTypeFilter}
          allowClear
          style={{ width: 140 }}
          options={[
            { value: 'backend', label: '后端服务' },
            { value: 'web', label: 'Web 前端' },
            { value: 'app', label: 'App 移动端' },
          ]}
        />
        <Checkbox checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)}>
          包含归档
        </Checkbox>
      </Space>

      {loading ? (
        <Skeleton active />
      ) : filtered.length === 0 ? (
        <Empty
          description={
            keyword || typeFilter
              ? '未找到匹配的契约集'
              : '还没有契约集'
          }
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/contracts/new')}>
            创建契约集
          </Button>
        </Empty>
      ) : (
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          onRow={(record) => ({
            onClick: () => navigate(`/contracts/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          pagination={{ pageSize: 20, showSizeChanger: false }}
        />
      )}

      <div style={{ marginTop: 12 }}>
        <Text type="secondary">※ ✓ 标记表示当前活跃契约集</Text>
      </div>
    </div>
  )
}