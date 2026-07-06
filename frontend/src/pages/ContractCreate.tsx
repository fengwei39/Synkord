// Synkord ContractCreate (Phase 1 placeholder)
// 创建契约集
import { Typography, Alert } from 'antd'

const { Title } = Typography

export default function ContractCreate() {
  return (
    <div className="page-content">
      <Title level={3}>创建契约集</Title>
      <Alert
        type="info"
        showIcon
        message="Phase 1 占位页面"
        description="创建表单将在后续 Phase 完善（支持手动创建 + OpenAPI 导入）"
      />
    </div>
  )
}