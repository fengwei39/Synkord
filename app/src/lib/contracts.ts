import { api } from './api'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PackListItem {
  name: string
  version: string
  contentType: string
  updatedAt: string
  ownerEmail: string
}

export interface PackDetail {
  name: string
  version: string
  contentType: string
  content: string
}

export interface VersionInfo {
  version: string
  tagName: string
  committedAt: string
  authorEmail: string
}

// ─── Diff types (line-level) ──────────────────────────────────────────────────

export type LineType = 'context' | 'added' | 'removed'

export interface DiffLine {
  type: LineType
  oldNum?: number
  newNum?: number
  content: string
}

export interface DiffHunk {
  oldStart: number
  newStart: number
  lines: DiffLine[]
}

export interface DiffStats {
  added: number
  removed: number
}

export interface DiffResult {
  from: string
  to: string
  hunks: DiffHunk[]
  stats: DiffStats
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function listPacks(orgId: string): Promise<PackListItem[]> {
  const res = await api.get<PackListItem[]>(`/api/orgs/${orgId}/packs`)
  return res.data
}

export async function getPack(orgId: string, packName: string): Promise<PackDetail> {
  const res = await api.get<PackDetail>(`/api/orgs/${orgId}/packs/${packName}`)
  return res.data
}

export async function createPack(
  orgId: string,
  name: string,
  version: string,
  content: string,
  contentType: string,
): Promise<PackListItem> {
  const res = await api.post<PackListItem>(`/api/orgs/${orgId}/packs`, {
    name, version, content, contentType,
  })
  return res.data
}

export async function updatePack(
  orgId: string,
  packName: string,
  version: string,
  content: string,
  contentType: string,
): Promise<PackListItem> {
  const res = await api.put<PackListItem>(`/api/orgs/${orgId}/packs/${packName}`, {
    version, content, contentType,
  })
  return res.data
}

export async function deletePack(orgId: string, packName: string): Promise<void> {
  await api.delete(`/api/orgs/${orgId}/packs/${packName}`)
}

export async function listVersions(orgId: string, packName: string): Promise<VersionInfo[]> {
  const res = await api.get<VersionInfo[]>(`/api/orgs/${orgId}/packs/${packName}/versions`)
  return res.data
}

export async function getDiff(
  orgId: string,
  packName: string,
  from: string,
  to: string,
): Promise<DiffResult> {
  const res = await api.get<DiffResult>(
    `/api/orgs/${orgId}/packs/${packName}/diff`,
    { params: { from, to } },
  )
  return res.data
}

// ─── Subscriber types & API ───────────────────────────────────────────────────

export interface DeviceInfo {
  platform: string   // "win32" | "darwin" | "linux"
  hostname: string
  username?: string
}

export interface GitInfo {
  emails: string[]
}

export interface SubscriberItem {
  userId: string
  email: string
  pinnedVersion: string
  isLatest: boolean
  device: DeviceInfo
  git: GitInfo
  projectNames: string[]
  updatedAt: string
}

export async function listSubscribers(orgId: string, packName: string): Promise<SubscriberItem[]> {
  const res = await api.get<SubscriberItem[]>(`/api/orgs/${orgId}/packs/${packName}/subscribers`)
  return res.data
}

export async function addSubscriber(orgId: string, packName: string, email: string): Promise<SubscriberItem> {
  const res = await api.post<SubscriberItem>(`/api/orgs/${orgId}/packs/${packName}/subscribers`, { email })
  return res.data
}

export async function removeSubscriber(orgId: string, packName: string, userId: string): Promise<void> {
  await api.delete(`/api/orgs/${orgId}/packs/${packName}/subscribers/${userId}`)
}

export async function registerDevice(
  orgId: string,
  device: DeviceInfo,
  projectNames: string[],
): Promise<void> {
  await api.post(`/api/orgs/${orgId}/register-device`, { device, projectNames })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function detectContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    md: 'markdown', markdown: 'markdown',
    yaml: 'yaml', yml: 'yaml',
    json: 'json',
    ts: 'typescript', tsx: 'typescript',
    go: 'go',
    sql: 'sql',
    proto: 'proto',
    txt: 'text',
  }
  return map[ext] ?? 'text'
}

export function bumpPatch(version: string): string {
  const parts = version.split('.').map(Number)
  if (parts.length !== 3) return version
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`
}
