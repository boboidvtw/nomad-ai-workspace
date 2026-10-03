const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nomadDesktop', {
  getSettings: () => ipcRenderer.invoke('nomad:get-settings'),
  setLayout: (options) => ipcRenderer.send('nomad:set-layout', options),
  setZoom: (options) => ipcRenderer.send('nomad:set-zoom', options),
  dispatchPrompt: (options) => ipcRenderer.send('nomad:dispatch-prompt', options),
  onRemoteUpdate: (callback) => {
    ipcRenderer.on('nomad:remote-update', (event, data) => callback(data));
  },
  onPromptDispatched: (callback) => {
    ipcRenderer.on('nomad:prompt-dispatched', (event, data) => callback(data));
  },
});
