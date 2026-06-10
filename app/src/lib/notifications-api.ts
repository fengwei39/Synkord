import { api } from './api'

export interface Notification {
  id: string
  orgId: string
  packName: string
  oldVersion?: string
  newVersion: string
  diffSummary?: unknown
  readAt?: string
  createdAt: string
}

export async function listNotifications(unreadOnly = false): Promise<Notification[]> {
  const res = await api.get<Notification[]>('/api/notifications', {
    params: unreadOnly ? { unreadOnly: 'true' } : undefined,
  })
  return res.data
}

export async function markRead(id: string): Promise<void> {
  await api.put(`/api/notifications/${id}/read`)
}

export async function subscribePack(orgId: string, packName: string, projectName?: string): Promise<{ id: string }> {
  const res = await api.post<{ id: string }>(`/api/orgs/${orgId}/packs/${packName}/subscribe`, {
    projectName: projectName ?? '',
  })
  return res.data
}

export async function unsubscribePack(orgId: string, packName: string): Promise<void> {
  await api.delete(`/api/orgs/${orgId}/packs/${packName}/subscribe`)
}
