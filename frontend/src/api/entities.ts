// Synkord Entities (data models within a contract set)
// 详见 docs/requirements.md §四.5
//
// v1.2 修订：后端直接返回 DataModel（含 schema_content 字符串 + current_version），
// 前端可在收到数据后用 utils/jsonSchema.ts 自解析生成 fields 视图。
import apiClient from './client'

// 后端真实返回的结构（对齐 models.DataModel）
export interface EntityDefinition {
  id: string
  contract_id: string
  name: string
  description?: string
  schema_content: string          // JSON Schema 原始字符串
  current_version: string
  version_count: number
  created_by?: string
  created_at: string
  updated_at: string
}

// 前端展示用的字段视图（运行期解析得到，非后端字段）
export interface EntityField {
  name: string
  type: string
  required: boolean
  description?: string
  ref_entity_id?: string
  is_array?: boolean
  nullable?: boolean
}

// 版本历史项（v1.2 新增 API）
export interface EntityVersion {
  id: string
  data_model_id: string
  version_number: string
  schema_content: string
  change_summary: string
  created_by?: string
  created_at: string
}

export interface ListEntitiesOpts {
  keyword?: string
  limit?: number
  offset?: number
}

export async function listEntities(
  contractId: string,
  opts: ListEntitiesOpts = {},
): Promise<{ total: number; items: EntityDefinition[] }> {
  const resp = await apiClient.get(`/contracts/${contractId}/entities`, { params: opts })
  return resp.data
}

export async function getEntity(contractId: string, entityId: string): Promise<EntityDefinition> {
  const resp = await apiClient.get(`/contracts/${contractId}/entities/${entityId}`)
  return resp.data
}

export async function createEntity(
  contractId: string,
  input: {
    name: string
    description?: string
    schema_content: string
  },
): Promise<EntityDefinition> {
  const resp = await apiClient.post(`/contracts/${contractId}/entities`, input)
  return resp.data
}

export async function updateEntity(
  contractId: string,
  entityId: string,
  patch: {
    name?: string
    description?: string
    schema_content?: string
    change_summary?: string
  },
): Promise<EntityDefinition> {
  const resp = await apiClient.patch(`/contracts/${contractId}/entities/${entityId}`, patch)
  return resp.data
}

export async function deleteEntity(contractId: string, entityId: string): Promise<void> {
  await apiClient.delete(`/contracts/${contractId}/entities/${entityId}`)
}

export async function getEntityDependencies(
  contractId: string,
  entityId: string,
): Promise<{
  used_in_apis: Array<{ api_id: string; path: string; method: string; usage: string }>
  references_entities: Array<{ entity_name: string; field_name: string }>
}> {
  const resp = await apiClient.get(`/contracts/${contractId}/entities/${entityId}/dependencies`)
  return resp.data
}

export async function listEntityVersions(
  contractId: string,
  entityId: string,
): Promise<{ items: EntityVersion[]; total: number }> {
  const resp = await apiClient.get(`/contracts/${contractId}/entities/${entityId}/versions`)
  return resp.data
}
