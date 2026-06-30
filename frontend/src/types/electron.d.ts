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
      windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
    };
  }
}
