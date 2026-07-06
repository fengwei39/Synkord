// Synkord ContractEntityDetail (Phase 1 placeholder)
// 数据模型详情
import { useParams } from 'react-router-dom'
import { Typography, Alert } from 'antd'

const { Title } = Typography

export default function ContractEntityDetail() {
  const { id, modelId } = useParams<{ id: string; modelId: string }>()
  return (
    <div className="page-content">
      <Title level={3}>数据模型详情</Title>
      <Alert
        type="info"
        showIcon
        message="Phase 1 占位页面"
        description={`数据模型详情将在 Phase 6 详细实现。契约集 ID: ${id}, 模型 ID: ${modelId}`}
      />
    </div>
  )
}