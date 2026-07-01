export {};

declare global {
  // 状态结构（与主进程 mcpStatus 对齐）
  interface Window {
    synkord?: {
      getAPIBase: () => Promise<string>;
      mcpGetStatus: () => Promise<MCPStatus>;
      mcpStart: () => Promise<MCPStatus>;
      mcpStop: () => Promise<MCPStatus>;
      mcpRestart: () => Promise<MCPStatus>;
      mcpSetActiveProject: (project: null | { teamId: string; projectId: string; projectName: string }) => Promise<MCPStatus>;
      mcpGetIDEConfig: () => Promise<{ url: string; host: string; port: number; path: string }>;
      mcpSetUserAuth: (auth: { token: string; user_id: string; user_name: string } | null) => Promise<{ ok: boolean }>;
      onMcpEvent: (callback: (payload: MCPEvent) => void) => () => void;
      windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
    };
    synkordApiBase?: string;
  }

  // MCP 服务状态（与主进程 mcpStatus 对齐）
  interface MCPStatus {
    state: 'idle' | 'starting' | 'running' | 'stopped' | 'failed' | 'restarting';
    port: number | null;
    url: string | null;
    pid: number | null;
    activeProject: { teamId: string; projectId: string; projectName: string } | null;
    restartCount: number;
    reason?: string;
  }

  // MCP 事件（主进程推送）
  interface MCPEvent {
    type: string;
    state: MCPStatus['state'];
    port?: number;
    url?: string;
    pid?: number;
    reason?: string;
    timestamp?: string;
  }
}
