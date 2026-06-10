import { api } from './api'

export interface Org {
  id: string
  name: string
  slug: string
  createdAt: string
}

export interface OrgMember {
  userId: string
  email: string
  role: 'admin' | 'member'
  joinedAt: string
}

export interface InviteInfo {
  orgName: string
  inviterEmail: string
  expiresAt: string
}

export async function getMyOrgs(): Promise<Org[]> {
  const res = await api.get<Org[]>('/api/orgs/me')
  return res.data
}

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'org'
}

export async function createOrg(name: string, slug?: string): Promise<Org> {
  const res = await api.post<Org>('/api/orgs', { name, slug: slug ?? toSlug(name) })
  return res.data
}

export async function getInvite(token: string): Promise<InviteInfo> {
  const res = await api.get<InviteInfo>(`/api/invites/${token}`)
  return res.data
}

export async function acceptInvite(token: string): Promise<void> {
  await api.post(`/api/invites/${token}/accept`)
}

export async function listMembers(orgId: string): Promise<OrgMember[]> {
  const res = await api.get<OrgMember[]>(`/api/orgs/${orgId}/members`)
  return res.data
}
