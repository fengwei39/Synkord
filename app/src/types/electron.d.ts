interface DirEntry {
  name: string
  isDir: boolean
  path: string
}

interface Window {
  electronAPI: {
    // Core
    openExternal: (url: string) => Promise<void>
    platform: string

    // Overlay
    watchDirectory: (dir: string) => Promise<void>
    pickDirectory: () => Promise<string | null>
    onConfigChanged: (cb: (config: unknown) => void) => (() => void) | undefined

    // File system
    pickFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
    readTextFile: (path: string) => Promise<string>
    writeFile: (path: string, content: string) => Promise<void>
    readDirTree: (path: string) => Promise<DirEntry[]>
    collectFiles: (path: string) => Promise<{ name: string; path: string; relPath: string }[]>

    // System
    getDeviceInfo: () => Promise<{ platform: string; hostname: string; username: string }>

    // MCP
    setMCPToken: (token: string) => Promise<void>

    // Tray
    notifyTray?: (count: number) => Promise<void>
  }
}
