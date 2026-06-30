const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('synkord', {
  getAPIBase: () => ipcRenderer.invoke('synkord:get-api-base'),
  mcpGetStatus: () => ipcRenderer.invoke('synkord:mcp:get-status'),
  mcpStart: () => ipcRenderer.invoke('synkord:mcp:start'),
  mcpStop: () => ipcRenderer.invoke('synkord:mcp:stop'),
  mcpRestart: () => ipcRenderer.invoke('synkord:mcp:restart'),
  mcpSetActiveProject: (project) => ipcRenderer.invoke('synkord:mcp:set-active-project', project),
  mcpGetIDEConfig: () => ipcRenderer.invoke('synkord:mcp:get-ide-config'),
  windowControl: (action) => ipcRenderer.send('synkord:window-control', action),
});
