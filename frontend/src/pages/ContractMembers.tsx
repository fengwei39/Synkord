// Synkord ContractMembers
// 契约集成员管理
// 详见 docs/ui-spec.md §七

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  App as AntApp,
  Alert,
  Avatar,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  LockOutlined,
  PlusOutlined,
  SearchOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import { useContract } from '../contexts/ContractContext'
import { searchUsers } from '../api/users'
import {
  listContractMembers,
  addContractMember,
  updateContractMember,
  removeContractMember,
} from '../api/members'
import type { ContractSetMember, ContractSetRole } from '../types/contract'
import { formatDate } from '../utils/format'

const { Title, Text } = Typography

const roleLabels: Record<ContractSetRole, string> = {
  owner: '创建者',
  editor: '编辑者',
  viewer: '查看者',
}

const roleColors: Record<ContractSetRole, string> = {
  owner: 'gold',
  editor: 'blue',
  viewer: 'default',
}

export default function ContractMembers() {
  const { id: contractId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { message, modal } = AntApp.useApp()
  const { activeContractSet } = useContract()

  const [members, setMembers] = useState<ContractSetMember[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [userSearchResults, setUserSearchResults] = useState<Array<{ id: string; username: string }>>([])

  // 角色选择
  const [inviteRole, setInviteRole] = useState<ContractSetRole>('editor')
  const [searchQuery, setSearchQuery] = useState('')

  const myRole = activeContractSet?.my_role
  const isOwner = myRole === 'owner'

  const load = async () => {
    if (!contractId) return
    setLoading(true)
    try {
      const items = await listContractMembers(contractId)
      setMembers(items)
    } catch (e: any) {
      message.error(e?.message || '加载成员失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId])

  // 用户搜索
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setUserSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const result = await searchUsers(searchQuery)
        setUserSearchResults(result.items.map((u) => ({ id: u.id, username: u.username })))
      } catch {
        setUserSearchResults([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleInvite = async (userId: string) => {
    if (!contractId) return
    setInviteLoading(true)
    try {
      await addContractMember(contractId, { user_id: userId, role: inviteRole })
      message.success('成员已添加')
      setInviteOpen(false)
      setSearchQuery('')
      setUserSearchResults([])
      await load()
    } catch (e: any) {
      message.error(e?.message || '添加失败')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleRoleChange = async (member: ContractSetMember, newRole: ContractSetRole) => {
    if (!contractId) return
    if (member.role === 'owner') {
      message.warning('创建者角色不可变更')
      return
    }
    try {
      await updateContractMember(contractId, member.user_id, { role: newRole })
      message.success(`已将 ${member.username} 的角色更新为 ${roleLabels[newRole]}`)
      await load()
    } catch (e: any) {
      message.error(e?.message || '更新失败')
    }
  }

  const handleRemove = (member: ContractSetMember) => {
    if (!contractId) return
    if (member.role === 'owner') {
      message.warning('创建者不可被移除')
      return
    }
    modal.confirm({
      title: `确认移除成员？`,
      content: `确认从当前契约集移除 ${member.username}？他将失去所有访问权限。`,
      okText: '确认移除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await removeContractMember(contractId, member.user_id)
          message.success(`${member.username} 已被移除`)
          await load()
        } catch (e: any) {
          message.error(e?.message || '移除失败')
        }
      },
    })
  }

  const columns = [
    {
      title: '成员',
      key: 'user',
      render: (_: any, m: ContractSetMember) => (
        <Space>
          <Avatar size="small">{m.username?.[0]?.toUpperCase()}</Avatar>
          <Text strong>{m.username}</Text>
          {m.role === 'owner' && <LockOutlined style={{ color: '#faad14' }} />}
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 160,
      render: (role: ContractSetRole, m: ContractSetMember) => {
        if (role === 'owner') {
          return <Tag color={roleColors[role]}>{roleLabels[role]}</Tag>
        }
        if (!isOwner) {
          return <Tag color={roleColors[role]}>{roleLabels[role]}</Tag>
        }
        return (
          <Select
            value={role}
            style={{ width: 120 }}
            onChange={(v) => handleRoleChange(m, v)}
            options={[
              { value: 'editor', label: roleLabels.editor },
              { value: 'viewer', label: roleLabels.viewer },
            ]}
          />
        )
      },
    },
    {
      title: '加入时间',
      dataIndex: 'invited_at',
      key: 'invited_at',
      width: 140,
      render: (s: string) => formatDate(s),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_: any, m: ContractSetMember) => {
        if (m.role === 'owner') {
          return <Text type="secondary">创建者</Text>
        }
        if (!isOwner) {
          return <Text type="secondary">-</Text>
        }
        return (
          <Popconfirm
            title={`移除 ${m.username}？`}
            description="他将失去当前契约集的访问权限"
            okText="移除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleRemove(m)}
          >
            <Button type="link" danger size="small">
              移除
            </Button>
          </Popconfirm>
        )
      },
    },
  ]

  return (
    <div className="page-content contract-members">
      <Space style={{ marginBottom: 16 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          type="text"
          onClick={() => navigate(`/contracts/${contractId}`)}
        >
          返回契约集
        </Button>
      </Space>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>成员管理</Title>
          <Text type="secondary">
            {activeContractSet?.name} · 共 {members?.length ?? 0} 人
          </Text>
        </div>
        {isOwner && (
          <Button
            type="primary"
            icon={<UserAddOutlined />}
            onClick={() => setInviteOpen(true)}
          >
            邀请成员
          </Button>
        )}
      </div>

      {!isOwner && (
        <Alert
          type="info"
          showIcon
          message="你当前不是创建者，只能查看成员列表，无法添加/移除/修改角色。"
          style={{ marginBottom: 16 }}
        />
      )}

      <Card>
        {loading && !members ? (
          <Skeleton active />
        ) : (
          <Table
            columns={columns}
            dataSource={members || []}
            rowKey="user_id"
            pagination={false}
            size="middle"
          />
        )}
      </Card>

      {/* 邀请成员 Modal */}
      <Modal
        title="邀请成员"
        open={inviteOpen}
        onCancel={() => {
          setInviteOpen(false)
          setSearchQuery('')
          setUserSearchResults([])
        }}
        footer={null}
        destroyOnHidden
      >
        <Form layout="vertical">
          <Form.Item label="搜索用户">
            <Input
              prefix={<SearchOutlined />}
              placeholder="输入用户名（至少 2 个字符）..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              allowClear
            />
          </Form.Item>

          <Form.Item label="角色">
            <Radio.Group
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              <Radio value="viewer">{roleLabels.viewer}</Radio>
              <Radio value="editor">{roleLabels.editor}</Radio>
              <Radio value="owner" disabled>
                {roleLabels.owner}（创建者不可直接邀请）
              </Radio>
            </Radio.Group>
          </Form.Item>

          {userSearchResults.length > 0 && (
            <div className="user-search-results">
              <div className="user-search-results-header">
                <Text type="secondary">搜索结果</Text>
              </div>
              <Space
                orientation="vertical"
                size={6}
                style={{ width: '100%' }}
              >
                {userSearchResults.map((u) => (
                  <div
                    key={u.id}
                    className="user-search-result-item"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 8px',
                      borderRadius: 6,
                      background: '#f8fafc',
                    }}
                  >
                    <Space>
                      <Avatar size="small">{u.username?.[0]?.toUpperCase()}</Avatar>
                      <Text>{u.username}</Text>
                    </Space>
                    <Button
                      type="link"
                      size="small"
                      icon={<PlusOutlined />}
                      loading={inviteLoading}
                      onClick={() => handleInvite(u.id)}
                    >
                      添加为 {roleLabels[inviteRole]}
                    </Button>
                  </div>
                ))}
              </Space>
            </div>
          )}
        </Form>
      </Modal>
    </div>
  )
}