// Synkord ContractMembers
// 成员管理独立页
// Tab 内嵌视图：[components/ContractMembersList.tsx](../components/ContractMembersList.tsx)
import { useParams } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import ContractMembersList from '../components/ContractMembersList'

export default function ContractMembers() {
  const { id: contractId } = useParams<{ id: string }>()
  useDocumentTitle('成员管理')
  if (!contractId) return null
  return <ContractMembersList contractId={contractId} />
}
