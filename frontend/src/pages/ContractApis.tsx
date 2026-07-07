// Synkord ContractApis
// 接口管理独立页（Phase 2 完整管理）
// 详见 docs/ui-spec.md §五
//
// Tab 内嵌视图：[components/ContractApisList.tsx](../components/ContractApisList.tsx)
// 本页是其"独立页"包装：加上页头与返回按钮。

import { useParams } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import ContractApisList from '../components/ContractApisList'

export default function ContractApis() {
  const { id: contractId } = useParams<{ id: string }>()
  useDocumentTitle('接口管理')
  if (!contractId) return null
  return <ContractApisList contractId={contractId} />
}
