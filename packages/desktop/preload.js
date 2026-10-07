const { contextBridge, ipcRenderer } = require('electron');

// Payloads are forwarded verbatim over IPC; main.js validates them.
/** @typedef {(data?: unknown) => void} IpcListener */

contextBridge.exposeInMainWorld('nomadDesktop', {
  getSettings: () => ipcRenderer.invoke('nomad:get-settings'),
  setLayout: (/** @type {unknown} */ options) => ipcRenderer.send('nomad:set-layout', options),
  setZoom: (/** @type {unknown} */ options) => ipcRenderer.send('nomad:set-zoom', options),
  setDrawer: (/** @type {unknown} */ options) => ipcRenderer.send('nomad:set-drawer', options),
  dispatchPrompt: (/** @type {unknown} */ options) =>
    ipcRenderer.send('nomad:dispatch-prompt', options),
  onRemoteUpdate: (/** @type {IpcListener} */ callback) => {
    ipcRenderer.on('nomad:remote-update', (event, data) => callback(data));
  },
  onPromptDispatched: (/** @type {IpcListener} */ callback) => {
    ipcRenderer.on('nomad:prompt-dispatched', (event, data) => callback(data));
  },

  // Multi-AI Autonomous Orchestration & Dialogue
  orchestrationStart: (/** @type {unknown} */ options) =>
    ipcRenderer.invoke('nomad:orchestration-start', options),
  orchestrationPause: () => ipcRenderer.invoke('nomad:orchestration-pause'),
  orchestrationResume: () => ipcRenderer.invoke('nomad:orchestration-resume'),
  orchestrationStop: () => ipcRenderer.invoke('nomad:orchestration-stop'),
  orchestrationStatus: () => ipcRenderer.invoke('nomad:orchestration-status'),
  onOrchestrationStep: (/** @type {IpcListener} */ callback) => {
    ipcRenderer.on('nomad:orchestration-step', (event, data) => callback(data));
  },
  // Unified Session & Workspace Manager (MMDD | 類型 | 主題)
  getWorkspaces: () => ipcRenderer.invoke('nomad:get-workspaces'),
  searchWorkspaces: (/** @type {unknown} */ options) =>
    ipcRenderer.invoke('nomad:search-workspaces', options),
  createWorkspace: (/** @type {unknown} */ options) =>
    ipcRenderer.invoke('nomad:create-workspace', options),
  switchWorkspace: (/** @type {unknown} */ id) => ipcRenderer.invoke('nomad:switch-workspace', id),
  renameWorkspace: (/** @type {unknown} */ options) =>
    ipcRenderer.invoke('nomad:rename-workspace', options),
  deleteWorkspace: (/** @type {unknown} */ id) => ipcRenderer.invoke('nomad:delete-workspace', id),
  newSession: () => ipcRenderer.invoke('nomad:new-session'),
  exportMarkdown: (/** @type {unknown} */ options) =>
    ipcRenderer.invoke('nomad:export-markdown', options),
  exportWorkspaces: () => ipcRenderer.invoke('nomad:export-workspaces'),
  importWorkspaces: (/** @type {unknown} */ data) =>
    ipcRenderer.invoke('nomad:import-workspaces', data),
  openExportFolder: () => ipcRenderer.invoke('nomad:open-export-folder'),
  getProbe: () => ipcRenderer.invoke('nomad:get-probe'),
  openExternal: (/** @type {unknown} */ url) => ipcRenderer.invoke('nomad:open-external', url),
  toggleHud: () => ipcRenderer.invoke('nomad:toggle-hud'),
  onWorkspacesUpdated: (/** @type {IpcListener} */ callback) => {
    ipcRenderer.on('nomad:workspaces-updated', (event, data) => callback(data));
  },
  // Global Shortcuts & Appearance Customization
  getShortcuts: () => ipcRenderer.invoke('nomad:get-shortcuts'),
  setShortcuts: (/** @type {unknown} */ shortcuts) =>
    ipcRenderer.invoke('nomad:set-shortcuts', shortcuts),
  getAppearance: () => ipcRenderer.invoke('nomad:get-appearance'),
  setAppearance: (/** @type {unknown} */ appearance) =>
    ipcRenderer.invoke('nomad:set-appearance', appearance),

  // Universal Google Drive Sync
  driveSyncStatus: (/** @type {unknown} */ options) =>
    ipcRenderer.invoke('nomad:drive-sync-status', options),
  driveSyncPush: (/** @type {unknown} */ options) =>
    ipcRenderer.invoke('nomad:drive-sync-push', options),
  driveSyncPull: (/** @type {unknown} */ options) =>
    ipcRenderer.invoke('nomad:drive-sync-pull', options),

  // Headroom & Laya Pipeline
  pipelineProcess: (/** @type {unknown} */ input) =>
    ipcRenderer.invoke('nomad:pipeline-process', input),
  pipelineStats: () => ipcRenderer.invoke('nomad:pipeline-stats'),

  // Roadmap P1: Canvas & Artifacts
  extractArtifacts: (/** @type {unknown} */ text) =>
    ipcRenderer.invoke('nomad:extract-artifacts', text),
  generateSandboxHtml: (
    /** @type {unknown} */ artifact,
    /** @type {unknown} */ type,
    /** @type {unknown} */ title,
  ) => ipcRenderer.invoke('nomad:generate-sandbox-html', { artifact, type, title }),

  // Roadmap P2: Side-by-Side Diff & Local Model Client
  computeDiff: (/** @type {unknown} */ options) =>
    ipcRenderer.invoke('nomad:compute-diff', options),
  probeLocalModel: (/** @type {unknown} */ options) =>
    ipcRenderer.invoke('nomad:probe-local-model', options),
  chatLocalModel: (/** @type {unknown} */ options) =>
    ipcRenderer.invoke('nomad:chat-local-model', options),

  // Roadmap P3: MCP Gateway & Local RAG Knowledge Base
  getMcpTools: () => ipcRenderer.invoke('nomad:get-mcp-tools'),
  callMcpTool: (/** @type {unknown} */ options) =>
    ipcRenderer.invoke('nomad:call-mcp-tool', options),
  ingestRagDoc: (/** @type {unknown} */ doc) => ipcRenderer.invoke('nomad:ingest-rag-doc', doc),
  retrieveRagContext: (/** @type {unknown} */ options) =>
    ipcRenderer.invoke('nomad:retrieve-rag-context', options),

  // Spotlight HUD
  toggleSpotlight: () => ipcRenderer.invoke('nomad:toggle-spotlight'),
  onToggleSpotlightHud: (/** @type {IpcListener} */ callback) => {
    ipcRenderer.on('nomad:toggle-spotlight-hud', () => callback());
  },
  onLocalModelResponse: (/** @type {IpcListener} */ callback) => {
    ipcRenderer.on('nomad:local-model-response', (event, data) => callback(data));
  },
});
