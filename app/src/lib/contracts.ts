import { api } from './api'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PackListItem {
  name: string
  version: string
  updatedAt: string
  ownerEmail: string
}

export interface FieldDef {
  type: 'uuid' | 'string' | 'int' | 'boolean' | 'datetime' | 'enum' | 'json'
  primary?: boolean
  unique?: boolean
  maxLength?: number
  values?: string[]
}

export interface RelationDef {
  type: 'many-to-one' | 'one-to-many' | 'many-to-many' | 'one-to-one'
  target: string
  through?: string
}

export interface EntityDef {
  table: string
  fields: Record<string, FieldDef>
  relations?: Record<string, RelationDef>
}

export interface ContractContent {
  pack: string
  version: string
  entities: Record<string, EntityDef>
  conventions?: {
    id_type?: 'uuid' | 'int' | 'string'
    naming?: Record<string, string>
    timestamps?: Record<string, string>
  }
}

export interface PackDetail {
  name: string
  version: string
  content: string // raw JSON string
}

export interface VersionInfo {
  version: string
  tagName: string
  committedAt: string
  authorEmail: string
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

export async function listVersions(orgId: string, packName: string): Promise<VersionInfo[]> {
  const res = await api.get<VersionInfo[]>(`/api/orgs/${orgId}/packs/${packName}/versions`)
  return res.data
}

export function parseContent(detail: PackDetail): ContractContent | null {
  try {
    return JSON.parse(detail.content) as ContractContent
  } catch {
    return null
  }
}
