// Synkord Settings
// 个人设置
import { Typography, Alert, Card } from 'antd'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const { Title, Paragraph } = Typography

export default function Settings() {
  useDocumentTitle('设置')
  return (
    <div className="page-content">
      <Title level={3}>个人设置</Title>

      <Card title="账号信息" style={{ marginBottom: 16 }}>
        <Paragraph>
          设置项将在后续 Phase 完善。当前 Phase 7 提供基础框架：
        </Paragraph>
        <ul>
          <li>账号信息（用户名、邮箱、最后登录）</li>
          <li>密码修改</li>
          <li>已连接设备管理</li>
          <li>PAT (Personal Access Token) 管理</li>
        </ul>
      </Card>

      <Alert
        type="info"
        showIcon
        message="Phase 7 占位页面"
        description="上述设置项的详细 UI 将在后续 Phase 完善"
      />
    </div>
  )
}