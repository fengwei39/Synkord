interface Window {
  electronAPI: {
    // Core
    openExternal: (url: string) => Promise<void>
    platform: string

    // Overlay
    watchDirectory: (dir: string) => Promise<void>
    pickDirectory: () => Promise<string | null>
    onConfigChanged: (cb: (config: unknown) => void) => (() => void) | undefined

    // MCP
    setMCPToken: (token: string) => Promise<void>

    // Tray
    notifyTray?: (count: number) => Promise<void>
  }
}
