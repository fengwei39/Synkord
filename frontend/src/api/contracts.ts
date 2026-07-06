// Synkord Contract API
// 详见 docs/requirements.md §四
import apiClient from './client'
import type { ContractSet, ContractSetRole, ActiveContract, McpStatus } from '../types/contract'

// ============================================================================
// Contract Sets
// ============================================================================

export interface ListContractsOpts {
  keyword?: string
  project_type?: 'backend' | 'web' | 'app'
  include_archived?: boolean
  limit?: number
  offset?: number
}

export async function listContracts(opts: ListContractsOpts = {}): Promise<{
  total: number
  items: ContractSet[]
}> {
  const resp = await apiClient.get('/contracts', { params: opts })
  return resp.data
}

export interface CreateContractInput {
  name: string
  project_type: 'backend' | 'web' | 'app'
  description?: string
}

export async function getContract(id: string): Promise<ContractSet> {
  const resp = await apiClient.get(`/contracts/${id}`)
  return resp.data
}

export async function createContract(input: CreateContractInput): Promise<ContractSet> {
  const resp = await apiClient.post('/contracts', input)
  return resp.data
}

export async function updateContract(
  id: string,
  patch: { name?: string; description?: string; archived?: boolean },
): Promise<ContractSet> {
  const resp = await apiClient.patch(`/contracts/${id}`, patch)
  return resp.data
}

export async function deleteContract(id: string): Promise<void> {
  await apiClient.delete(`/contracts/${id}`)
}

// ============================================================================
// MCP Active Contract
// ============================================================================

export async function getActiveContract(): Promise<ActiveContract | null> {
  const resp = await apiClient.get('/mcp/active-contract')
  return resp.data
}

export async function setActiveContract(contractId: string): Promise<ActiveContract> {
  const resp = await apiClient.put('/mcp/active-contract', { contract_id: contractId })
  return resp.data
}

export async function clearActiveContract(): Promise<void> {
  await apiClient.put('/mcp/active-contract', { contract_id: null })
}

// ============================================================================
// MCP Status
// ============================================================================

export async function getMcpStatus(): Promise<McpStatus> {
  const resp = await apiClient.get('/mcp/status')
  return resp.data
}

export async function startMcp(): Promise<McpStatus> {
  const resp = await apiClient.post('/mcp/start')
  return resp.data
}

export async function stopMcp(): Promise<McpStatus> {
  const resp = await apiClient.post('/mcp/stop')
  return resp.data
}

export async function restartMcp(): Promise<McpStatus> {
  const resp = await apiClient.post('/mcp/restart')
  return resp.data
}