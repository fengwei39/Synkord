// Synkord ContractCreate
// 创建契约集
// 详见 docs/ui-spec.md §六

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  App as AntApp,
  Alert,
  Button,
  Card,
  Form,
  Input,
  Radio,
  Space,
  Tag,
  Typography,
} from 'antd'
import {
  ApiOutlined,
  AppstoreOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  GlobalOutlined,
  PlusOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import { useContract } from '../contexts/ContractContext'

const { Title, Paragraph, Text } = Typography

const PROJECT_TYPES = [
  {
    value: 'backend',
    label: '后端服务',
    description: '提供 HTTP API 的服务端',
    icon: <ApiOutlined />,
    color: '#1677ff',
    bg: '#e6f4ff',
    example: '/api/users、/api/orders',
  },
  {
    value: 'web',
    label: 'Web 前端',
    description: '浏览器端应用',
    icon: <GlobalOutlined />,
    color: '#52c41a',
    bg: '#f6ffed',
    example: 'React、Vue、Angular 等',
  },
  {
    value: 'app',
    label: 'App 移动端',
    description: 'iOS / Android 原生或混合应用',
    icon: <AppstoreOutlined />,
    color: '#722ed1',
    bg: '#f9f0ff',
    example: 'React Native、Flutter 等',
  },
]

interface FormValues {
  name: string
  project_type: 'backend' | 'web' | 'app'
  description?: string
}

export default function ContractCreate() {
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const { createNewContract } = useContract()
  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (values: FormValues) => {
    setSubmitting(true)
    try {
      const contract = await createNewContract({
        name: values.name.trim(),
        project_type: values.project_type,
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
      // 跳转到契约集详情，让用户开始录入 API
      navigate(`/contracts/${contract.id}`)
    } catch (e: any) {
      const msg = e?.message || '创建失败'
      message.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const watchType = Form.useWatch('project_type', form)

  return (
    <div className="page-content contract-create">
      <Space style={{ marginBottom: 16 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          type="text"
          onClick={() => navigate('/contracts')}
        >
          返回契约集列表
        </Button>
      </Space>

      <Title level={3} style={{ marginTop: 0, marginBottom: 8 }}>
        <PlusOutlined /> 创建契约集
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        契约集是 Synkord 的核心：把后端 API + 数据模型集中管理，让 IDE 里的 AI 按真实约束生成代码。
      </Paragraph>

      <div className="contract-create-layout">
        {/* 左侧：表单 */}
        <Card className="contract-create-form-card" bordered={false}>
          <Form<FormValues>
            form={form}
            layout="vertical"
            initialValues={{ project_type: 'backend' }}
            onFinish={handleSubmit}
            autoComplete="off"
            requiredMark={false}
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
              label="项目类型"
              name="project_type"
              rules={[{ required: true, message: '请选择项目类型' }]}
            >
              <Radio.Group className="contract-type-group">
                <Space size={12} wrap>
                  {PROJECT_TYPES.map((t) => (
                    <Radio.Button key={t.value} value={t.value} className="contract-type-option">
                      <Space>
                        <span
                          className="contract-type-icon"
                          style={{ background: t.bg, color: t.color }}
                        >
                          {t.icon}
                        </span>
                        <span>{t.label}</span>
                      </Space>
                    </Radio.Button>
                  ))}
                </Space>
              </Radio.Group>
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
                rows={4}
                maxLength={512}
                showCount
              />
            </Form.Item>

            <Form.Item style={{ marginTop: 32, marginBottom: 0 }}>
              <Space size={12}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={submitting}
                  icon={<RocketOutlined />}
                  size="large"
                >
                  创建并设为活跃
                </Button>
                <Button
                  type="default"
                  size="large"
                  onClick={() => navigate('/contracts')}
                  disabled={submitting}
                >
                  取消
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>

        {/* 右侧：引导卡片 */}
        <div className="contract-create-side">
          <Card bordered={false} className="side-card">
            <Title level={5} style={{ marginTop: 0 }}>
              💡 创建后你可以
            </Title>
            <ul className="side-list">
              <li>
                <CheckCircleOutlined className="side-icon" />
                <span>导入 OpenAPI / Swagger 规范批量录入 API</span>
              </li>
              <li>
                <CheckCircleOutlined className="side-icon" />
                <span>手动添加数据模型（Entity）描述业务结构</span>
              </li>
              <li>
                <CheckCircleOutlined className="side-icon" />
                <span>在 IDE 里粘贴配置，让 AI 按契约写代码</span>
              </li>
            </ul>
          </Card>

          <Card bordered={false} className="side-card hint-card">
            <Title level={5} style={{ marginTop: 0 }}>
              <CloudUploadOutlined /> 已有 API 规范？
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 12 }}>
              创建契约集后，可在「导入」步骤上传 OpenAPI/Swagger/Postman 文件，自动批量录入。
            </Paragraph>
            <Button
              type="link"
              icon={<CloudUploadOutlined />}
              onClick={() => {
                // 创建一个临时契约集后跳转到导入页（更友好：先创建基础信息，再导入）
                form.validateFields().then((vals: FormValues) => {
                  handleSubmit(vals)
                }).catch(() => {
                  message.warning('请先填写契约集名称和类型')
                })
              }}
            >
              创建后立即导入规范文件
            </Button>
          </Card>

          {watchType && (
            <Card bordered={false} className="side-card type-example-card">
              <Title level={5} style={{ marginTop: 0 }}>
                <Tag color={
                  PROJECT_TYPES.find((t) => t.value === watchType)?.color || 'default'
                }>
                  {PROJECT_TYPES.find((t) => t.value === watchType)?.label}
                </Tag>
                示例
              </Title>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {PROJECT_TYPES.find((t) => t.value === watchType)?.example}
              </Paragraph>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}