// Synkord Dependencies (cross-API / cross-entity graph)
// 详见 docs/requirements.md §四
import apiClient from './client'

export interface DependencyNode {
  id: string
  name: string
}

export interface DependencyEdge {
  source: string
  target: string
  entity_name?: string
  api_path?: string
  api_method?: string
}

/**
 * 获取契约集的完整依赖图（接口与实体之间）
 */
export async function getDependencyGraph(
  contractId: string,
): Promise<{ nodes: DependencyNode[]; edges: DependencyEdge[] }> {
  const resp = await apiClient.get(`/contracts/${contractId}/dependencies/graph`)
  return resp.data || { nodes: [], edges: [] }
}