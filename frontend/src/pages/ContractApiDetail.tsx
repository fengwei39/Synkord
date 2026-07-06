// Synkord ContractApiDetail (Phase 1 placeholder)
// 接口详情
import { useParams } from 'react-router-dom'
import { Typography, Alert } from 'antd'

const { Title } = Typography

export default function ContractApiDetail() {
  const { id, apiId } = useParams<{ id: string; apiId: string }>()
  return (
    <div className="page-content">
      <Title level={3}>接口详情</Title>
      <Alert
        type="info"
        showIcon
        message="Phase 1 占位页面"
        description={`接口详情将在 Phase 6 详细实现。契约集 ID: ${id}, 接口 ID: ${apiId}`}
      />
    </div>
  )
}