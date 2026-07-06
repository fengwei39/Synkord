// Synkord MCP-specific operations
// 详见 docs/requirements.md §四.7
import apiClient from './client'
import type { McpStatus, McpHealthSummary } from '../types/contract'

export interface IdeConfig {
  stdio: { command: string; args: string[] }
  http?: { url: string; token: string }
}

export interface AccessLogEntry {
  id: string
  contract_id?: string
  tool_name: string
  caller: string
  args?: Record<string, unknown>
  result_status: 'success' | 'error'
  status: number
  duration_ms: number
  error_message: string
  created_at: string
}

/**
 * 获取 IDE 配置（用于在 Synkord 页面生成配置片段给用户复制）
 * 状态接口已在 api/contracts.ts 中：getMcpStatus / startMcp / stopMcp / restartMcp
 */
export async function getIdeConfig(): Promise<IdeConfig> {
  const resp = await apiClient.get('/mcp/ide-config')
  return resp.data
}

export interface ListAccessLogOpts {
  limit?: number
  offset?: number
  /** 评审 R-4：日志页时间范围筛选 */
  start?: string
  end?: string
  /** 评审 R-4：日志页级别筛选（success / error / all） */
  level?: 'success' | 'error' | 'all'
  /** 评审 R-4：日志页关键字筛选 */
  keyword?: string
}

export async function listAccessLog(
  opts: ListAccessLogOpts = {},
): Promise<{ items: AccessLogEntry[]; total: number }> {
  const resp = await apiClient.get('/mcp/access-log', { params: opts })
  return resp.data
}

/**
 * 评审 R-3：为"最近调用"卡片补充时序统计（24h 调用次数 / 错误率 / TopN 工具）
 * 返回可被 sparkline / Top tools 直接消费的结构
 */
export interface AccessLogStats {
  sparkline: number[] // 长度 24，按小时桶的调用次数
  error_rate: number // 0~1
  top_tools: { tool_name: string; count: number }[]
}

export async function getAccessLogStats(): Promise<AccessLogStats> {
  const resp = await apiClient.get('/mcp/access-log/stats')
  return resp.data
}

/**
 * 评审 R-2：获取 MCP 完整运行时摘要（含 PID / 启动时间 / 健康度 / 重启次数）
 * 用于在 MCP 主页"状态卡"统一展示
 */
export interface McpRuntimeSummary {
  pid?: number | null
  started_at?: string | null
  uptime_seconds?: number | null
  restart_count: number
  health: McpHealthSummary
}

export async function getMcpSummary(): Promise<McpRuntimeSummary> {
  const resp = await apiClient.get('/mcp/summary')
  return resp.data
}

export type { McpStatus }