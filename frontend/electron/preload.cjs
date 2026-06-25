const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('synkord', {
  getAPIBase: () => ipcRenderer.invoke('synkord:get-api-base'),
});
