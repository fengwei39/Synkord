import { contextBridge, ipcRenderer } from 'electron'

// Expose a safe subset of Electron APIs to the renderer process.
contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  platform: process.platform,
})

// Type declaration for window.electronAPI (used in renderer TypeScript code)
export type ElectronAPI = {
  openExternal: (url: string) => Promise<void>
  platform: NodeJS.Platform
}
