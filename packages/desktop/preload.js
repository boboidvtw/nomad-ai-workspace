const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nomadDesktop', {
  getSettings: () => ipcRenderer.invoke('nomad:get-settings'),
  setLayout: (options) => ipcRenderer.send('nomad:set-layout', options),
  setZoom: (options) => ipcRenderer.send('nomad:set-zoom', options),
  setDrawer: (options) => ipcRenderer.send('nomad:set-drawer', options),
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
  // Unified Session & Workspace Manager (MMDD | 類型 | 主題)
  getWorkspaces: () => ipcRenderer.invoke("nomad:get-workspaces"),
  searchWorkspaces: (options) => ipcRenderer.invoke("nomad:search-workspaces", options),
  createWorkspace: (options) => ipcRenderer.invoke("nomad:create-workspace", options),
  switchWorkspace: (id) => ipcRenderer.invoke("nomad:switch-workspace", id),
  renameWorkspace: (options) => ipcRenderer.invoke("nomad:rename-workspace", options),
  deleteWorkspace: (id) => ipcRenderer.invoke("nomad:delete-workspace", id),
  newSession: () => ipcRenderer.invoke("nomad:new-session"),
  exportMarkdown: (options) => ipcRenderer.invoke("nomad:export-markdown", options),
  exportWorkspaces: () => ipcRenderer.invoke("nomad:export-workspaces"),
  importWorkspaces: (data) => ipcRenderer.invoke("nomad:import-workspaces", data),
  openExportFolder: () => ipcRenderer.invoke("nomad:open-export-folder"),
  getProbe: () => ipcRenderer.invoke('nomad:get-probe'),
  openExternal: (url) => ipcRenderer.invoke('nomad:open-external', url),
  toggleHud: () => ipcRenderer.invoke('nomad:toggle-hud'),
    onWorkspacesUpdated: (callback) => {
    ipcRenderer.on("nomad:workspaces-updated", (event, data) => callback(data));
  },
  // Global Shortcuts & Appearance Customization
  getShortcuts: () => ipcRenderer.invoke('nomad:get-shortcuts'),
  setShortcuts: (shortcuts) => ipcRenderer.invoke('nomad:set-shortcuts', shortcuts),
  getAppearance: () => ipcRenderer.invoke('nomad:get-appearance'),
  setAppearance: (appearance) => ipcRenderer.invoke('nomad:set-appearance', appearance),

  // Universal Google Drive Sync
  driveSyncStatus: (options) => ipcRenderer.invoke('nomad:drive-sync-status', options),
  driveSyncPush: (options) => ipcRenderer.invoke('nomad:drive-sync-push', options),
  driveSyncPull: (options) => ipcRenderer.invoke('nomad:drive-sync-pull', options),

  // Headroom & Laya Pipeline
  pipelineProcess: (input) => ipcRenderer.invoke('nomad:pipeline-process', input),
  pipelineStats: () => ipcRenderer.invoke('nomad:pipeline-stats'),
});
