// Synkord Entities (data models within a contract set)
// 详见 docs/requirements.md §四.5
import apiClient from './client'

export interface EntityField {
  name: string
  type: string
  required: boolean
  description?: string
  ref_entity_id?: string
  is_array?: boolean
  nullable?: boolean
}

export interface EntityDefinition {
  id: string
  contract_id: string
  name: string
  description?: string
  fields: EntityField[]
  created_at: string
  updated_at: string
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
  input: Omit<EntityDefinition, 'id' | 'contract_id' | 'created_at' | 'updated_at'>,
): Promise<EntityDefinition> {
  const resp = await apiClient.post(`/contracts/${contractId}/entities`, input)
  return resp.data
}

export async function updateEntity(
  contractId: string,
  entityId: string,
  patch: Partial<EntityDefinition>,
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
  references_entities: Array<{ entity_id: string; entity_name: string; field_name: string }>
}> {
  const resp = await apiClient.get(`/contracts/${contractId}/entities/${entityId}/dependencies`)
  return resp.data
}