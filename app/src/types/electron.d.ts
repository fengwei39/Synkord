interface Window {
  electronAPI: {
    openExternal: (url: string) => Promise<void>
    platform: string
  }
}
