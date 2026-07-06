// Synkord Electron IPC 类型定义（v1.2）
// 与 electron/preload.cjs 暴露的 API 严格对齐

export {}

declare global {
  interface Window {
    synkord?: {
      getAPIBase: () => Promise<string>
      mcpGetStatus: () => Promise<MCPStatus>
      mcpStart: () => Promise<MCPStatus>
      mcpStop: () => Promise<MCPStatus>
      mcpRestart: () => Promise<MCPStatus>
      /** v1.2：返回当前活跃契约集（替代旧 activeProject） */
      mcpGetActiveContract: () => Promise<ActiveContract | null>
      mcpGetIDEConfig: () => Promise<IdeConfig>
      mcpGetAccessLog: (limit?: number) => Promise<{
        items: AccessLogEntry[]
        total: number
      }>
      // 窗口控制
      windowMinimize: () => Promise<void>
      windowMaximize: () => Promise<void>
      windowClose: () => Promise<void>
      // 事件订阅
      onMcpEvent: (callback: (payload: MCPEvent) => void) => () => void
      onAuthExpired: (callback: () => void) => () => void
    }
    synkordApiBase?: string
  }

  // MCP 服务状态
  interface MCPStatus {
    state: 'idle' | 'starting' | 'running' | 'stopped' | 'failed' | 'restarting'
    pid: number | null
    port: number | null
    url: string | null
    started_at: string | null
    last_connection: { client: string; at: string } | null
    last_error: { message: string; at: string } | null
    restart_count: number
    gateway_port: number | null
    instance_id?: string
  }

  // MCP 状态变更事件
  interface MCPEvent extends MCPStatus {
    type?: string
    timestamp?: string
  }

  // 活跃契约集
  interface ActiveContract {
    contract_id: string
    contract_name: string
    set_at?: string
    set_by?: string
  }

  // IDE 配置
  interface IdeConfig {
    stdio: { command: string; args: string[] }
    http: { url: string } | null
  }

  // 访问日志条目
  interface AccessLogEntry {
    id?: string
    ts?: string
    conn?: number
    method?: string
    path?: string
    status: number
    dur_ms?: number
    duration_ms?: number
    remote?: string
    ua?: string
    rpc?: string
    tool?: string
    client?: string
    args?: Record<string, unknown>
    error?: string
    result_status?: 'success' | 'error'
    error_message?: string
    created_at?: string
  }
}