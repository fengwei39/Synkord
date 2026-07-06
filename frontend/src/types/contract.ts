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

/**
 * 健康度统计 — 用于 MCP 页面右上角徽标展示
 * 修复评审 R-7：让"健康度"代替纯绿色徽标，避免颜色同质化混淆
 */
export interface McpHealthSummary {
  /** 最近 5xx 错误次数（基于近 100 次调用） */
  recent_errors: number
  /** 连续失败次数，>0 时进入"降级"状态 */
  consecutive_failures: number
  /** 24h 调用总量 */
  calls_24h: number
  /** 24h 平均 QPS */
  qps_24h: number
  /** 24h 错误率 0~1 */
  error_rate_24h: number
}

export interface McpStatus {
  state: McpState
  pid?: number | null
  port?: number | null
  url?: string | null
  started_at?: string | null
  last_connection?: { client: string; at: string } | null
  last_error?: { message: string; at: string } | null
  restart_count?: number
  /** 用于 24h 调用时序图（fix R-3） */
  calls_per_hour?: number[]
  /** 修复 R-7 / R-6：健康度摘要，用于右上角徽标 */
  health?: McpHealthSummary | null
  /** 修复 R-5：契约版本与作者，便于多人协作 */
  active_contract_version?: string | null
  active_contract_owner?: string | null
  active_contract_updated_at?: string | null
  /** 修复 R-6：活跃契约集列表长度（用于主备区分） */
  active_set_priority?: number | null
}

export interface ApiError {
  code: string
  message: string
  hint?: string
  details?: Record<string, unknown>
  httpStatus: number
  recoverable: boolean
}