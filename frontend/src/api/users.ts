// Synkord Users API
// 详见 docs/requirements.md §四.8
import apiClient from './client'
import type { User } from '../types/contract'

export async function searchUsers(query: string): Promise<{ items: User[] }> {
  const resp = await apiClient.get('/users/search', { params: { q: query } })
  return resp.data
}