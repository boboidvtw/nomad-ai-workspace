const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nomadDesktop', {
  setLayout: (options) => ipcRenderer.send('nomad:set-layout', options),
  dispatchPrompt: (options) => ipcRenderer.send('nomad:dispatch-prompt', options),
});
