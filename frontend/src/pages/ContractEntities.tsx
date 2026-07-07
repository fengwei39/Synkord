// Synkord ContractEntities
// 数据模型管理独立页（Phase 2 完整管理）
// Tab 内嵌视图：[components/ContractEntitiesList.tsx](../components/ContractEntitiesList.tsx)
import { useParams } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import ContractEntitiesList from '../components/ContractEntitiesList'

export default function ContractEntities() {
  const { id: contractId } = useParams<{ id: string }>()
  useDocumentTitle('数据模型')
  if (!contractId) return null
  return <ContractEntitiesList contractId={contractId} />
}
