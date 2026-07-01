export {};

declare global {
  interface Window {
    synkord?: {
      getAPIBase: () => Promise<string>;
      mcpGetStatus: () => Promise<{
        running: boolean;
        port: number;
        url: string;
        activeProject: null | { teamId: string; projectId: string; projectName: string };
      }>;
      mcpStart: () => Promise<{
        running: boolean;
        port: number;
        url: string;
        activeProject: null | { teamId: string; projectId: string; projectName: string };
      }>;
      mcpStop: () => Promise<{
        running: boolean;
        port: number;
        url: string;
        activeProject: null | { teamId: string; projectId: string; projectName: string };
      }>;
      mcpRestart: () => Promise<{
        running: boolean;
        port: number;
        url: string;
        activeProject: null | { teamId: string; projectId: string; projectName: string };
      }>;
      mcpSetActiveProject: (project: null | { teamId: string; projectId: string; projectName: string }) => Promise<{
        running: boolean;
        port: number;
        url: string;
        activeProject: null | { teamId: string; projectId: string; projectName: string };
      }>;
      mcpGetIDEConfig: () => Promise<{ url: string; template: Record<string, unknown> }>;
      mcpSetUserAuth: (auth: { token: string; user_id: string; user_name: string } | null) => Promise<{ ok: boolean }>;
      windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
    };
    // 同步可用的 API 地址（在 Electron preload 中设置）
    synkordApiBase?: string;
  }
}
