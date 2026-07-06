// Synkord MCP-specific operations
// 详见 docs/requirements.md §四.7
import apiClient from './client'
import type { McpStatus } from '../types/contract'

export interface IdeConfig {
  stdio: { command: string; args: string[] }
  http?: { url: string; token: string }
}

export interface AccessLogEntry {
  id: string
  contract_id?: string
  tool_name: string
  client: string
  args?: Record<string, unknown>
  status: number
  duration_ms: number
  timestamp: string
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
}

export async function listAccessLog(
  opts: ListAccessLogOpts = {},
): Promise<{ items: AccessLogEntry[]; total: number }> {
  const resp = await apiClient.get('/mcp/access-log', { params: opts })
  return resp.data
}

export type { McpStatus }