// Synkord ContractCreateModal
// 全局"创建契约集"弹窗（替代原独立页面 /contracts/new）
// 详见 docs/ui-spec.md §六
//
// 实现要点：
// - 弹窗显隐由 ContractContext 统一管理（createModalOpen / openCreateModal / closeCreateModal）
// - 创建成功后跳转到新契约集详情并自动设为活跃
// - 弹窗打开时自动重置表单，避免残留上次输入

import { useEffect, useRef } from 'react'
import {
  App as AntApp,
  Button,
  Form,
  Input,
  Modal,
  Space,
  Typography,
} from 'antd'
import {
  CheckCircleOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import { useContract } from '../contexts/ContractContext'

const { Text, Paragraph } = Typography

interface FormValues {
  name: string
  description?: string
}

export default function ContractCreateModal() {
  const { message } = AntApp.useApp()
  const { createModalOpen, closeCreateModal, createNewContract } = useContract()
  const [form] = Form.useForm<FormValues>()
  const submittingRef = useRef(false)

  // 打开时重置表单（避免上次残留）
  useEffect(() => {
    if (createModalOpen) {
      form.resetFields()
      submittingRef.current = false
    }
  }, [createModalOpen, form])

  const handleSubmit = async () => {
    let values: FormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    submittingRef.current = true
    try {
      const contract = await createNewContract({
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
      })
      message.success({
        content: (
          <span>
            契约集「<strong>{contract.name}</strong>」已创建并设为活跃
          </span>
        ),
        icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
        duration: 3,
      })
      closeCreateModal()
    } catch (e: any) {
      const msg = e?.message || '创建失败'
      message.error(msg)
      submittingRef.current = false
    }
  }

  const handleCancel = () => {
    if (submittingRef.current) return
    closeCreateModal()
  }

  return (
    <Modal
      title={
        <Space>
          <RocketOutlined />
          <span>创建契约集</span>
        </Space>
      }
      open={createModalOpen}
      onCancel={handleCancel}
      destroyOnHidden
      mask={{ closable: false }}
      width={520}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          取消
        </Button>,
        <Button
          key="submit"
          type="primary"
          icon={<RocketOutlined />}
          onClick={handleSubmit}
        >
          创建并设为活跃
        </Button>,
      ]}
    >
      <Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 16 }}>
        契约集是 Synkord 的核心：把后端 API + 数据模型集中管理，让 IDE 里的 AI 按真实约束生成代码。
      </Paragraph>

      <Form<FormValues>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        autoComplete="off"
        requiredMark={false}
        // 提交期间禁止回车触发外层
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
          }
        }}
      >
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
          extra={
            <Text type="secondary" style={{ fontSize: 12 }}>
              建议使用易识别的名称，如「订单平台」「用户中心」
            </Text>
          }
        >
          <Input
            placeholder="例如：订单平台"
            size="large"
            autoFocus
            maxLength={128}
            showCount
          />
        </Form.Item>

        <Form.Item
          label="描述（可选）"
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
            rows={3}
            maxLength={512}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
