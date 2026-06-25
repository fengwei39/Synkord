const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('synkord', {
  getAPIBase: () => ipcRenderer.invoke('synkord:get-api-base'),
  windowControl: (action) => ipcRenderer.send('synkord:window-control', action),
});
