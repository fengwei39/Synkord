// Synkord Contract Set type definitions
// 详见 docs/requirements.md §三

export type ContractSetRole = 'owner' | 'editor' | 'viewer'

export interface User {
  id: string
  username: string
  email?: string
  created_at: string
}

export interface ContractSet {
  id: string
  name: string
  project_type: 'backend' | 'web' | 'app'
  description?: string
  creator_id: string
  created_at: string
  updated_at: string
  archived: boolean
  member_count: number
  api_count: number
  entity_count: number
  my_role?: ContractSetRole
}

export interface ContractSetMember {
  contract_id: string
  user_id: string
  username: string
  role: ContractSetRole
  invited_at: string
  accepted_at?: string
}

export interface ActiveContract {
  contract_id: string
  contract_name: string
  set_at: string
}

export type McpState = 'stopped' | 'idle' | 'starting' | 'running' | 'failed' | 'restarting'

export interface McpStatus {
  state: McpState
  pid?: number | null
  port?: number | null
  url?: string | null
  started_at?: string | null
  last_connection?: { client: string; at: string } | null
  last_error?: { message: string; at: string } | null
  restart_count?: number
}

export interface ApiError {
  code: string
  message: string
  hint?: string
  details?: Record<string, unknown>
  httpStatus: number
  recoverable: boolean
}