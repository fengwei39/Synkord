// Synkord ContractDetail
// 契约集详情页
// 详见 docs/ui-spec.md §五
//
// Phase X：
// - 移除"项目类型"字段；新增"基本信息" Tab 用于编辑名称/描述。
// - 基本信息 Tab 末尾增加"删除契约集"入口：仅 owner + 契约集为空时可用。
// - 顶部 Card 右上角提供"编辑"图标，owner 可在查看/编辑模式间切换。

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  App as AntApp,
  Alert,
  Button,
  Card,
  Divider,
  Form,
  Input,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
  Tabs,
} from 'antd'
import {
  ApiOutlined,
  CloseOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  LeftOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { getContract, updateContract, deleteContract } from '../api/contracts'
import { useContract } from '../contexts/ContractContext'
import type { ContractSet } from '../types/contract'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { DangerConfirm } from '../components/DangerConfirm'

const { Title, Text } = Typography

interface BasicInfoFormValues {
  name: string
  description?: string
}

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { message: ctxMessage } = AntApp.useApp()
  const {
    activeContract,
    setActiveContract,
    clearActiveContract,
    refreshContracts,
  } = useContract()
  const [contract, setContract] = useState<ContractSet | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // owner 在「查看 / 编辑」两种模式间切换；非 owner 永远不可编辑
  const [editing, setEditing] = useState(false)
  const [form] = Form.useForm<BasicInfoFormValues>()

  useDocumentTitle(contract?.name || '契约集详情')

  // 删除前置条件：仅 owner + 契约集为空（无 API/模型，成员只有创建者）
  const isOwner = contract?.my_role === 'owner'
  const emptyForDelete = useMemo(
    () =>
      !!contract &&
      contract.api_count === 0 &&
      contract.entity_count === 0 &&
      contract.member_count === 1,
    [contract],
  )
  const canDelete = isOwner && emptyForDelete
  const deleteBlockReason = !isOwner
    ? '仅契约集管理员（创建者）可删除'
    : contract && contract.api_count > 0
      ? `请先删除全部 ${contract.api_count} 个接口`
      : contract && contract.entity_count > 0
        ? `请先删除全部 ${contract.entity_count} 个数据模型`
        : contract && contract.member_count > 1
          ? `请先移除其他 ${contract.member_count - 1} 名成员，仅保留您本人`
          : ''

  // 删除前置条件逐条结果（用于 Alert 显式列出）
  const deleteConditions = useMemo(() => {
    if (!contract) return []
    const otherMembers = Math.max(0, contract.member_count - 1)
    return [
      {
        key: 'api',
        label: '无接口',
        met: contract.api_count === 0,
        current: `${contract.api_count} 个`,
      },
      {
        key: 'entity',
        label: '无数据模型',
        met: contract.entity_count === 0,
        current: `${contract.entity_count} 个`,
      },
      {
        key: 'member',
        label: '成员仅包含您本人（管理员）',
        met: otherMembers === 0,
        current:
          otherMembers === 0
            ? '仅 1 人'
            : `您 + ${otherMembers} 名其他成员`,
      },
    ]
  }, [contract])

  const load = async (contractId: string) => {
    setLoading(true)
    try {
      const c = await getContract(contractId)
      setContract(c)
      form.setFieldsValue({ name: c.name, description: c.description || '' })
    } catch (e: any) {
      ctxMessage.error(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!id) return
    // 切到另一个契约集时重置编辑模式
    setEditing(false)
    load(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const isActive = !!contract && activeContract?.contract_id === contract.id
  const role = contract?.my_role
  // 实际可编辑：必须是 owner，且点过右上角编辑图标
  const formEditable = isOwner && editing

  // 切换编辑模式：若表单已脏，提示放弃
  const handleToggleEdit = async () => {
    if (editing) {
      const dirty = form.isFieldsTouched()
      if (dirty) {
        const confirmed = window.confirm('当前有未保存的修改，确定放弃？')
        if (!confirmed) return
      }
      // 退出编辑前重置回最新值
      if (contract) {
        form.setFieldsValue({ name: contract.name, description: contract.description || '' })
      }
      setEditing(false)
    } else {
      setEditing(true)
    }
  }

  const handleSetActive = async () => {
    if (!contract) return
    try {
      await setActiveContract(contract.id)
      ctxMessage.success(`已切换到 ${contract.name}`)
    } catch (e: any) {
      ctxMessage.error(e?.message || '切换失败')
    }
  }

  const handleSaveBasicInfo = async () => {
    if (!contract) return
    try {
      const values = await form.validateFields()
      const trimmedName = values.name.trim()
      if (trimmedName === contract.name && (values.description || '') === (contract.description || '')) {
        ctxMessage.info('没有需要保存的修改')
        return
      }
      setSaving(true)
      const updated = await updateContract(contract.id, {
        name: trimmedName,
        description: values.description?.trim() || '',
      })
      setContract(updated)
      form.setFieldsValue({ name: updated.name, description: updated.description || '' })
      // 同步列表与活跃契约集信息
      await refreshContracts()
      ctxMessage.success('基本信息已更新')
      // 保存成功自动退出编辑模式
      setEditing(false)
    } catch (e: any) {
      if (e?.errorFields) return // 表单校验失败
      ctxMessage.error(e?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleResetBasicInfo = () => {
    if (!contract) return
    form.setFieldsValue({ name: contract.name, description: contract.description || '' })
  }

  const handleConfirmDelete = async () => {
    if (!contract) return
    setDeleting(true)
    try {
      await deleteContract(contract.id)
      // 若被删除的是当前活跃契约集，先清空活跃指针
      if (activeContract?.contract_id === contract.id) {
        try {
          await clearActiveContract()
        } catch {
          /* 清空失败不影响主流程 */
        }
      }
      ctxMessage.success(`契约集「${contract.name}」已删除`)
      setDeleteOpen(false)
      // 刷新列表（不强制，因为我们要跳走）
      await refreshContracts()
      navigate('/contracts', { replace: true })
    } catch (e: any) {
      // 后端 409 会带 detail 提示
      ctxMessage.error(e?.message || '删除失败')
    } finally {
      setDeleting(false)
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
        {contract ? (
          <>
            <Title level={3} style={{ margin: 0 }}>
              {contract.name}
              {isActive && <Tag color="blue" style={{ marginLeft: 12 }}>活跃中</Tag>}
              {contract.archived && <Tag color="default" style={{ marginLeft: 8 }}>已归档</Tag>}
            </Title>
            <Space style={{ marginTop: 8 }}>
              <Text type="secondary">
                创建于 {new Date(contract.created_at).toLocaleDateString()} · 最近更新 {new Date(contract.updated_at).toLocaleDateString()}
              </Text>
            </Space>
            <Space style={{ marginTop: 8 }}>
              {role && <Tag>我的角色：{role === 'owner' ? '创建者' : role === 'editor' ? '编辑者' : '查看者'}</Tag>}
            </Space>
            <Space style={{ marginTop: 16 }}>
              {!isActive && role && (
                <Button type="primary" onClick={handleSetActive}>设为活跃</Button>
              )}
              {(role === 'owner' || role === 'editor') && (
                <Button onClick={() => navigate(`/contracts/${contract.id}/import`)}>导入 API</Button>
              )}
            </Space>
          </>
        ) : (
          <Skeleton active paragraph={{ rows: 2 }} title={{ width: 240 }} />
        )}
      </div>

      <Tabs
        defaultActiveKey="apis"
        style={{ marginTop: 24 }}
        items={[
          {
            key: 'apis',
            label: <span><ApiOutlined /> 接口 ({contract?.api_count ?? 0})</span>,
            children: (
              <Card>
                <Text type="secondary">接口列表（Phase 2 详细实现）</Text>
              </Card>
            ),
          },
          {
            key: 'models',
            label: <span><DatabaseOutlined /> 数据模型 ({contract?.entity_count ?? 0})</span>,
            children: (
              <Card>
                <Text type="secondary">数据模型列表（Phase 2 详细实现）</Text>
              </Card>
            ),
          },
          {
            key: 'members',
            label: <span><TeamOutlined /> 成员 ({contract?.member_count ?? 0})</span>,
            children: (
              <Card>
                <Text type="secondary">
                  成员管理（Phase 6 详细实现） ·{' '}
                  {contract && (
                    <a onClick={() => navigate(`/contracts/${contract.id}/members`)}>前往成员管理 →</a>
                  )}
                </Text>
              </Card>
            ),
          },
          {
            key: 'settings',
            label: <span><SettingOutlined /> 设置</span>,
            children: (
              <Card
                title={
                  <Space>
                    <EditOutlined />
                    <span>{editing ? '编辑契约集基本信息' : '基本信息'}</span>
                  </Space>
                }
                extra={
                  <Space size={4}>
                    {!isOwner && <Tag>只读</Tag>}
                    {isOwner && (
                      <Tooltip title={editing ? '退出编辑' : '编辑'}>
                        <Button
                          type="text"
                          shape="circle"
                          icon={editing ? <CloseOutlined /> : <EditOutlined />}
                          onClick={handleToggleEdit}
                          aria-label={editing ? '退出编辑' : '编辑'}
                        />
                      </Tooltip>
                    )}
                  </Space>
                }
              >
                {/*
                  Form 始终挂载，避免 useForm() 实例在卸载时报"未连接任何 Form 元素"。
                  编辑/查看态只切换 children。
                */}
                <Form<BasicInfoFormValues>
                  form={form}
                  layout="vertical"
                  requiredMark={false}
                  initialValues={contract ? { name: contract.name, description: contract.description || '' } : undefined}
                >
                  {!contract ? (
                    // 加载中：Form 仍挂载以维持 useForm 连接，内部显示 Skeleton
                    <Skeleton active paragraph={{ rows: 3 }} />
                  ) : formEditable ? (
                    // ===== 编辑态：表单字段 =====
                    <>
                      <Form.Item
                        label="契约集名称"
                        name="name"
                        rules={[
                          { required: true, message: '请输入契约集名称' },
                          { min: 2, max: 128, message: '名称长度需在 2-128 字符之间' },
                          {
                            validator: (_, value) => {
                              if (!value) return Promise.resolve()
                              if (value.trim() !== value) {
                                return Promise.reject(new Error('名称首尾不能有空格'))
                              }
                              return Promise.resolve()
                            },
                          },
                        ]}
                      >
                        <Input placeholder="例如：订单平台" maxLength={128} showCount />
                      </Form.Item>

                      <Form.Item
                        label="描述"
                        name="description"
                        rules={[{ max: 512, message: '描述不能超过 512 字符' }]}
                        extra={
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            帮助团队成员理解这个契约集的用途
                          </Text>
                        }
                      >
                        <Input.TextArea
                          placeholder="例如：订单中心后端，提供订单创建、查询、状态管理"
                          rows={4}
                          maxLength={512}
                          showCount
                        />
                      </Form.Item>

                      <Form.Item style={{ marginBottom: 0 }}>
                        <Space>
                          <Button
                            type="primary"
                            icon={<EditOutlined />}
                            loading={saving}
                            onClick={handleSaveBasicInfo}
                          >
                            保存修改
                          </Button>
                          <Button onClick={handleResetBasicInfo} disabled={saving}>
                            重置
                          </Button>
                        </Space>
                      </Form.Item>
                    </>
                  ) : (
                    // ===== 查看态：简洁展示块（无 input 视觉噪音）=====
                    <div className="basic-info-view">
                      <div className="info-row">
                        <div className="info-label">名称</div>
                        <div className="info-value">{contract.name}</div>
                      </div>
                      <div className="info-row">
                        <div className="info-label">描述</div>
                        <div className="info-value">
                          {contract.description ? (
                            <span style={{ whiteSpace: 'pre-wrap' }}>{contract.description}</span>
                          ) : (
                            <Text type="secondary">（无）</Text>
                        )}
                      </div>
                    </div>
                    </div>
                  )}
                </Form>

                {/* 危险区：删除契约集（同 Card 内以 Divider 与编辑区分隔） */}
                <Divider style={{ margin: '24px 0 16px' }} />
                <div className="danger-zone">
                  <div className="danger-zone-label">
                    <Text strong style={{ color: '#ff4d4f' }}>危险操作</Text>
                  </div>
                  {!isOwner && (
                    <Alert
                      type="info"
                      showIcon
                      className="danger-zone-alert"
                      message="仅契约集管理员（创建者）可删除"
                    />
                  )}
                  {isOwner && !emptyForDelete && (
                    <Alert
                      type="warning"
                      showIcon
                      className="danger-zone-alert"
                      message="删除前需满足以下全部条件："
                      description={
                        <Space direction="vertical" size={4} style={{ marginTop: 4 }}>
                          {deleteConditions.map((c) => (
                            <Space key={c.key} size={6}>
                              <Text style={{ color: c.met ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>
                                {c.met ? '✓' : '✗'}
                              </Text>
                              <Text type={c.met ? 'secondary' : undefined} delete={c.met}>
                                {c.label}
                              </Text>
                              {!c.met && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  （当前：{c.current}）
                                </Text>
                              )}
                            </Space>
                          ))}
                        </Space>
                      }
                    />
                  )}
                  <div className="danger-zone-action">
                    <Tooltip title={canDelete ? '' : deleteBlockReason}>
                      <Button
                        danger
                        type="primary"
                        icon={<DeleteOutlined />}
                        disabled={!canDelete}
                        onClick={() => setDeleteOpen(true)}
                      >
                        删除契约集
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              </Card>
            ),
          },
        ]}
      />

      <DangerConfirm
        open={deleteOpen}
        title={contract ? `删除契约集「${contract.name}」` : '删除契约集'}
        description={
          <Space direction="vertical" size={4}>
            <span>此操作将永久删除该契约集及其所有数据，无法恢复。</span>
            {isActive && <Text type="warning">该契约集当前是活跃契约集，删除后会自动清空活跃指针。</Text>}
          </Space>
        }
        okText="确认删除"
        acknowledge="我已了解此操作不可恢复"
        onCancel={() => setDeleteOpen(false)}
        onOk={handleConfirmDelete}
      />
    </div>
  )
}
