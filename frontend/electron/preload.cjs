const { contextBridge, ipcRenderer } = require('electron');

// 获取 API 地址
const getAPIBase = () => ipcRenderer.invoke('synkord:get-api-base');

contextBridge.exposeInMainWorld('synkord', {
  getAPIBase,
  mcpGetStatus: () => ipcRenderer.invoke('synkord:mcp:get-status'),
  mcpStart: () => ipcRenderer.invoke('synkord:mcp:start'),
  mcpStop: () => ipcRenderer.invoke('synkord:mcp:stop'),
  mcpRestart: () => ipcRenderer.invoke('synkord:mcp:restart'),
  mcpSetActiveProject: (project) => ipcRenderer.invoke('synkord:mcp:set-active-project', project),
  mcpGetIDEConfig: () => ipcRenderer.invoke('synkord:mcp:get-ide-config'),
  mcpSetUserAuth: (auth) => ipcRenderer.invoke('synkord:mcp:set-user-auth', auth),
  windowControl: (action) => ipcRenderer.send('synkord:window-control', action),
});

// 暴露 API 地址到 window（同步访问）
getAPIBase().then((apiBase) => {
  window.synkordApiBase = apiBase;
});
