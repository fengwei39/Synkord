import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Core
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  platform: process.platform,

  // Overlay: file watcher
  watchDirectory: (dir: string) => ipcRenderer.invoke('overlay:watch-dir', dir),
  pickDirectory: () => ipcRenderer.invoke('overlay:pick-dir'),
  onConfigChanged: (cb: (config: unknown) => void) => {
    const handler = (_: unknown, config: unknown) => cb(config)
    ipcRenderer.on('overlay:config-changed', handler)
    return () => ipcRenderer.off('overlay:config-changed', handler)
  },

  // File system
  pickFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('fs:pick-file', filters),
  readTextFile: (path: string) => ipcRenderer.invoke('fs:read-text', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('fs:write-file', path, content),
  readDirTree: (path: string) => ipcRenderer.invoke('fs:read-dir-tree', path),

  // MCP: pass auth token to main process
  setMCPToken: (token: string) => ipcRenderer.invoke('mcp:set-token', token),

  // Tray: update unread badge
  notifyTray: (count: number) => ipcRenderer.invoke('tray:set-badge', count),
})
