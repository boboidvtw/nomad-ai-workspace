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

  // Multi-AI Autonomous Orchestration & Dialogue
  orchestrationStart: (options) => ipcRenderer.invoke('nomad:orchestration-start', options),
  orchestrationPause: () => ipcRenderer.invoke('nomad:orchestration-pause'),
  orchestrationResume: () => ipcRenderer.invoke('nomad:orchestration-resume'),
  orchestrationStop: () => ipcRenderer.invoke('nomad:orchestration-stop'),
  orchestrationStatus: () => ipcRenderer.invoke('nomad:orchestration-status'),
  onOrchestrationStep: (callback) => {
    ipcRenderer.on('nomad:orchestration-step', (event, data) => callback(data));
  },
});
