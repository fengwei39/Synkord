// Synkord Contract Members API
// 详见 docs/requirements.md §四.3
import apiClient from './client'
import type { ContractSetMember, ContractSetRole } from '../types/contract'

export async function listContractMembers(contractId: string): Promise<ContractSetMember[]> {
  const resp = await apiClient.get(`/contracts/${contractId}/members`)
  return resp.data
}

export interface AddMemberInput {
  user_id: string
  role: ContractSetRole
}

export async function addContractMember(
  contractId: string,
  input: AddMemberInput,
): Promise<ContractSetMember> {
  const resp = await apiClient.post(`/contracts/${contractId}/members`, input)
  return resp.data
}

export async function updateContractMember(
  contractId: string,
  userId: string,
  patch: { role: ContractSetRole },
): Promise<ContractSetMember> {
  const resp = await apiClient.patch(`/contracts/${contractId}/members/${userId}`, patch)
  return resp.data
}

export async function removeContractMember(contractId: string, userId: string): Promise<void> {
  await apiClient.delete(`/contracts/${contractId}/members/${userId}`)
}