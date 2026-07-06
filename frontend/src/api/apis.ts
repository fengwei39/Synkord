// Synkord APIs (interfaces within a contract set)
// 详见 docs/requirements.md §四.4
import apiClient from './client'

export interface ApiParameter {
  name: string
  in: 'path' | 'query' | 'header' | 'cookie'
  required: boolean
  schema: Record<string, unknown>
  description?: string
}

export interface ApiRequestBody {
  required: boolean
  schema: Record<string, unknown>
  description?: string
}

export interface ApiResponse {
  description: string
  schema?: Record<string, unknown>
}

export interface ApiDefinition {
  id: string
  contract_id: string
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
  summary: string
  description?: string
  tags: string[]
  deprecated: boolean
  parameters?: ApiParameter[]
  request_body?: ApiRequestBody
  responses: Record<string, ApiResponse>
  examples?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ListApisOpts {
  keyword?: string
  method?: string
  tag?: string
  include_deprecated?: boolean
  limit?: number
  offset?: number
}

export async function listApis(
  contractId: string,
  opts: ListApisOpts = {},
): Promise<{ total: number; items: ApiDefinition[] }> {
  const resp = await apiClient.get(`/contracts/${contractId}/apis`, { params: opts })
  return resp.data
}

export async function getApi(contractId: string, apiId: string): Promise<ApiDefinition> {
  const resp = await apiClient.get(`/contracts/${contractId}/apis/${apiId}`)
  return resp.data
}

export async function createApi(
  contractId: string,
  input: Omit<ApiDefinition, 'id' | 'contract_id' | 'created_at' | 'updated_at'>,
): Promise<ApiDefinition> {
  const resp = await apiClient.post(`/contracts/${contractId}/apis`, input)
  return resp.data
}

export async function updateApi(
  contractId: string,
  apiId: string,
  patch: Partial<ApiDefinition>,
): Promise<ApiDefinition> {
  const resp = await apiClient.patch(`/contracts/${contractId}/apis/${apiId}`, patch)
  return resp.data
}

export async function deleteApi(contractId: string, apiId: string): Promise<void> {
  await apiClient.delete(`/contracts/${contractId}/apis/${apiId}`)
}

export async function getApiDependencies(
  contractId: string,
  apiId: string,
): Promise<{
  uses_entities: Array<{ entity_id: string; entity_name: string; usage: string }>
  used_by_apis: Array<{ api_id: string; path: string; method: string }>
}> {
  const resp = await apiClient.get(`/contracts/${contractId}/apis/${apiId}/dependencies`)
  return resp.data
}