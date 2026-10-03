const { app, BrowserWindow, WebContentsView, session, ipcMain, screen, Menu, shell, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { store } = require('./src/store');
const { calculateLayoutBounds, ALL_PLATFORMS } = require('./src/layout-engine');
const { PLATFORM_INJECTORS } = require('./src/injectors');
const { PLATFORM_EXTRACTORS } = require('./src/extractors');
const { MultiAiOrchestrator } = require('./src/orchestrator');
const { LocalSyncBridge } = require('./src/bridge');
const { TrayAndShortcutManager } = require('./src/tray');
const { SessionManager } = require('./src/session-manager');

const EXTENSION_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'dist_chrome')
  : path.resolve(__dirname, '../../dist_chrome');

const PLATFORMS = {
  claude: { name: 'Claude', url: 'https://claude.ai', color: '#D97706' },
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com', color: '#10A37F' },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com', color: '#2563EB' },
  grok: { name: 'Grok', url: 'https://grok.com', color: '#1D9BF0' },
};

let mainWindow = null;
const views = {};
let trayManager = null;
let bridge = null;
let orchestrator = null;
let sessionManager = null;
let isDrawerOpen = false;
app.isQuitting = false;

const TOP_BAR_HEIGHT = 52;
const BOTTOM_BAR_HEIGHT = 68;
const DRAWER_WIDTH = 420;

function updateViewBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const [winWidth, winHeight] = mainWindow.getContentSize();
  const layout = store.get('layout') || 'dual';
  const activePlatforms = store.get('activePlatforms') || ['claude', 'chatgpt'];
  const splitRatio = store.get('splitRatio') || 0.5;

  const boundsMap = calculateLayoutBounds({
    winWidth,
    winHeight,
    topBarHeight: TOP_BAR_HEIGHT,
    bottomBarHeight: BOTTOM_BAR_HEIGHT,
    layout,
    activePlatforms,
    splitRatio,
    drawerWidth: isDrawerOpen ? DRAWER_WIDTH : 0,
  });

  for (const [key, item] of Object.entries(views)) {
    const b = boundsMap[key];
    if (b && b.visible) {
      item.view.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
      item.view.setVisible(true);
    } else {
      item.view.setVisible(false);
    }
  }
}

function applyZoom(platform, factor) {
  const item = views[platform];
  if (item && item.view && item.view.webContents) {
    try {
      item.view.webContents.setZoomFactor(factor);
    } catch (e) {
      console.warn(`[Nomad Desktop] Failed to set zoom for ${platform}:`, e.message);
    }
  }
}

function applyAllZooms() {
  for (const p of ALL_PLATFORMS) {
    const factor = store.getZoom(p);
    applyZoom(p, factor);
  }
}

async function createMainWindow() {
  // 1. Initialize persistent store in user data
  store.init(path.join(app.getPath('userData'), 'nomad-studio-settings.json'));

  // 2. Load unpacked extension if available
  try {
    const extLoader = session.defaultSession.extensions?.loadExtension
      ? (p, opts) => session.defaultSession.extensions.loadExtension(p, opts)
      : (p, opts) => session.defaultSession.loadExtension(p, opts);
    const ext = await extLoader(EXTENSION_PATH, { allowFileAccess: true });
    console.log(`[Nomad Desktop] Loaded Extension: ${ext.name} (v${ext.version})`);
  } catch (err) {
    console.warn('[Nomad Desktop] Extension not loaded (may be packaged or not built):', err.message);
  }

  const isMac = process.platform === 'darwin';
  const iconPath = isMac
    ? path.join(__dirname, 'nomad.icns')
    : (process.platform === 'win32' ? path.join(__dirname, 'nomad.ico') : path.join(__dirname, 'nomad.png'));

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: 'Nomad AI Studio',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    backgroundColor: '#0f172a',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // 3. Initialize WebContentsViews for all 4 platforms
  for (const [key, p] of Object.entries(PLATFORMS)) {
    const view = new WebContentsView({
      webPreferences: {
        session: session.defaultSession,
        contextIsolation: true,
      },
    });

    view.webContents.loadURL(p.url);
    view.webContents.on('did-finish-load', () => {
      const zoom = store.getZoom(key);
      if (zoom && zoom !== 1.0) {
        view.webContents.setZoomFactor(zoom);
      }
    });

    mainWindow.contentView.addChildView(view);
    views[key] = { view, ...p };
  }

  mainWindow.on('resize', updateViewBounds);

  mainWindow.once('ready-to-show', () => {
    updateViewBounds();
    applyAllZooms();
    mainWindow.show();
  });

  // 3.5 Initialize SessionManager
  sessionManager = new SessionManager({
    store,
    getViews: () => views,
  });

  // 4. Initialize Multi-AI Orchestrator Engine
  orchestrator = new MultiAiOrchestrator({
    injectPrompt: async (platform, text) => {
      return await dispatchPromptToTargets(text, [platform]);
    },
    extractResponse: async (platform) => {
      const item = views[platform];
      if (!item) return { ok: false, error: 'Platform view not found' };
      const extractorScript = PLATFORM_EXTRACTORS[platform]?.getLatestResponse();
      if (!extractorScript) return { ok: false, error: 'Extractor script not found' };
      try {
        const res = await item.view.webContents.executeJavaScript(extractorScript);
        return res || { ok: false, error: 'Empty script result' };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
    checkStreaming: async (platform) => {
      const item = views[platform];
      if (!item) return { ok: false, isStreaming: false };
      const statusScript = PLATFORM_EXTRACTORS[platform]?.checkStatus();
      if (!statusScript) return { ok: false, isStreaming: false };
      try {
        const res = await item.view.webContents.executeJavaScript(statusScript);
        return res || { ok: true, isStreaming: false };
      } catch (err) {
        return { ok: false, isStreaming: false, error: err.message };
      }
    },
    onStep: async (event) => {
      if (event.type === 'turn-complete' && event.speaker && event.canonicalTitle) {
        try {
          await sessionManager?.applyInPageRenaming(event.speaker, event.canonicalTitle);
        } catch (e) {
          console.warn("[Nomad Desktop] Action failed:", e.message);
        }
        const activeWs = sessionManager?.getActiveWorkspace();
        if (activeWs) {
          sessionManager.captureActiveUrls(activeWs.id);
        }
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nomad:orchestration-step', event);
      }
      bridge?.broadcast('orchestration-step', event);
    },
    onComplete: async (summary) => {
      const activeWs = sessionManager?.getActiveWorkspace();
      if (activeWs) {
        sessionManager.captureActiveUrls(activeWs.id);
        sessionManager.updateWorkspace(activeWs.id, { completed: true });
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('nomad:workspaces-updated', sessionManager.getAllWorkspaces());
        }
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nomad:orchestration-step', { type: 'completed', summary });
      }
      bridge?.broadcast('orchestration-completed', summary);
    },
  });

  // 5. Initialize Local Sync Bridge
  bridge = new LocalSyncBridge({
    port: store.get('bridgePort') || 8765,
    host: '127.0.0.1',
    orchestrator,
    sessionManager,
    getStatus: () => ({
      layout: store.get('layout'),
      activePlatforms: store.get('activePlatforms'),
      splitRatio: store.get('splitRatio'),
      zoomFactors: store.getAll().zoomFactors,
      windowVisible: mainWindow ? mainWindow.isVisible() : false,
      isDrawerOpen,
    }),
    onDispatchPrompt: async ({ prompt, targets }) => {
      const results = await dispatchPromptToTargets(prompt, targets);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nomad:prompt-dispatched', { prompt, targets, results });
      }
      return results;
    },
    onSetLayout: (data) => {
      if (data.layout) store.set('layout', data.layout);
      if (data.activePlatforms) store.set('activePlatforms', data.activePlatforms);
      if (data.splitRatio) store.set('splitRatio', data.splitRatio);
      updateViewBounds();
      trayManager?.updateContextMenu();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nomad:remote-update', store.getAll());
      }
      return store.getAll();
    },
    onSetZoom: (data) => {
      if (data.platform && typeof data.factor === 'number') {
        store.setZoom(data.platform, data.factor);
        applyZoom(data.platform, data.factor);
      } else if (data.zoomFactors) {
        store.update({ zoomFactors: data.zoomFactors });
        applyAllZooms();
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nomad:remote-update', store.getAll());
      }
      return store.getAll().zoomFactors;
    },
        onInspectPlatform: async (platform) => {
      const item = views[platform];
      if (!item) return { ok: false, error: "Platform view not found" };
      const wc = item.view.webContents;
      const extScript = PLATFORM_EXTRACTORS[platform]?.getLatestResponse();
      const statScript = PLATFORM_EXTRACTORS[platform]?.checkStatus();
      let extRes = null;
      let statRes = null;
      let debugDom = null;
      try { if (extScript) extRes = await wc.executeJavaScript(extScript); } catch (e) { extRes = { ok: false, error: e.message }; }
      try { if (statScript) statRes = await wc.executeJavaScript(statScript); } catch (e) { statRes = { ok: false, error: e.message }; }
      try {
        debugDom = await wc.executeJavaScript(`(function() {
          return {
            url: location.href,
            title: document.title,
            bodyTextSnippet: (document.body ? document.body.innerText : "").slice(0, 300),
            articleCount: document.querySelectorAll("article").length,
            turnCount: document.querySelectorAll("[data-testid*=\"conversation-turn\"]").length,
            markdownCount: document.querySelectorAll(".markdown").length,
            responseContainerCount: document.querySelectorAll(".response-container").length,
            messageContentCount: document.querySelectorAll("message-content").length
          };
        })()`);
      } catch (e) { debugDom = { error: e.message }; }
      return { ok: true, platform, extRes, statRes, debugDom };
    },
    onEvalScript: async (platform, script) => {
      const item = views[platform];
      if (!item) return { ok: false, error: "Platform view not found" };
      try {
        const result = await item.view.webContents.executeJavaScript(script);
        return { ok: true, result };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    onToggleWindow: (action) => {
      if (!mainWindow) return { visible: false };
      if (action === 'show') {
        mainWindow.show();
        mainWindow.focus();
      } else if (action === 'hide') {
        mainWindow.hide();
      } else {
        trayManager?.toggleWindow();
      }
      return { visible: mainWindow.isVisible() };
    },
  });

  try {
    await bridge.start();
  } catch (err) {
    console.error('[Nomad Desktop] Failed to start local sync bridge:', err);
  }

  // 6. Initialize Tray and Global Shortcuts
  trayManager = new TrayAndShortcutManager({
    mainWindow,
    store,
    bridge,
    onLayoutChange: (layout) => {
      store.set('layout', layout);
      if (layout === 'focus') store.set('activePlatforms', ['claude']);
      else if (layout === 'dual') store.set('activePlatforms', ['claude', 'chatgpt']);
      else if (layout === 'triple') store.set('activePlatforms', ['claude', 'chatgpt', 'gemini']);
      else if (layout === 'quad') store.set('activePlatforms', ALL_PLATFORMS);
      updateViewBounds();
      trayManager.updateContextMenu();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nomad:remote-update', store.getAll());
      }
    },
    onZoomChange: (globalFactor) => {
      for (const p of ALL_PLATFORMS) {
        store.setZoom(p, globalFactor);
        applyZoom(p, globalFactor);
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nomad:remote-update', store.getAll());
      }
    },
  });

  trayManager.init();
}

async function dispatchPromptToTargets(prompt, targets) {
  console.log(`[Nomad Desktop] Dispatching prompt to [${targets.join(', ')}]: "${prompt.slice(0, 30)}..."`);
  const results = {};

  for (const target of targets) {
    const item = views[target];
    if (!item) continue;
    const wc = item.view.webContents;
    const injector = PLATFORM_INJECTORS[target];
    if (!injector) continue;

    try {
      const res = await wc.executeJavaScript(injector(prompt));
      results[target] = { ok: true, data: res };
      console.log(`[Nomad Desktop] Inject result for ${target}:`, res);
    } catch (e) {
      results[target] = { ok: false, error: e.message };
      console.warn(`[Nomad Desktop] Inject failed for ${target}:`, e.message);
    }
  }

  return results;
}

// IPC Handlers
ipcMain.handle('nomad:get-settings', () => {
  return {
    ...store.getAll(),
    platforms: PLATFORMS,
  };
});

ipcMain.on('nomad:set-layout', (event, { layout, activePlatforms, focus, dual, splitRatio }) => {
  if (layout) store.set('layout', layout);
  if (activePlatforms) {
    store.set('activePlatforms', activePlatforms);
  } else if (focus) {
    store.set('activePlatforms', [focus]);
  } else if (dual) {
    store.set('activePlatforms', dual);
  }
  if (typeof splitRatio === 'number') {
    store.set('splitRatio', splitRatio);
  }
  updateViewBounds();
  trayManager?.updateContextMenu();
});

ipcMain.on('nomad:set-zoom', (event, { platform, factor }) => {
  if (platform && typeof factor === 'number') {
    store.setZoom(platform, factor);
    applyZoom(platform, factor);
  }
});

ipcMain.on('nomad:set-drawer', (event, { open }) => {
  isDrawerOpen = Boolean(open);
  updateViewBounds();
});

ipcMain.on('nomad:dispatch-prompt', async (event, { prompt, targets }) => {
  await dispatchPromptToTargets(prompt, targets);
});

// Multi-AI Orchestration IPC Handlers
ipcMain.handle('nomad:orchestration-start', async (event, options) => {
  if (!orchestrator) return { success: false, errorCode: 'ORCHESTRATOR_NOT_READY' };
  let ws = sessionManager?.getActiveWorkspace();
  if (!ws || options.title) {
    ws = sessionManager?.createWorkspace({
      title: options.title,
      prompt: options.prompt,
      sequence: options.sequence || options.speakers,
      mode: options.mode,
    });
  } else if (options.prompt && !ws.title) {
    sessionManager?.updateWorkspace(ws.id, {
      title: options.title,
      prompt: options.prompt,
    });
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('nomad:workspaces-updated', sessionManager?.getAllWorkspaces() || []);
  }
  return await orchestrator.start({
    ...options,
    canonicalTitle: ws?.title,
  });
});

// Workspace & Session Management IPC Handlers
ipcMain.handle('nomad:get-workspaces', () => {
  if (!sessionManager) return { activeWorkspaceId: null, workspaces: [] };
  return {
    activeWorkspaceId: sessionManager.getActiveWorkspaceId(),
    activeWorkspace: sessionManager.getActiveWorkspace(),
    workspaces: sessionManager.getAllWorkspaces(),
  };
});

ipcMain.handle('nomad:switch-workspace', async (event, workspaceId) => {
  if (!sessionManager) return { success: false, error: 'SessionManager not ready' };
  const res = await sessionManager.switchWorkspace(workspaceId);
  if (res.success && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('nomad:workspaces-updated', sessionManager.getAllWorkspaces());
  }
  return res;
});

ipcMain.handle('nomad:create-workspace', (event, data) => {
  if (!sessionManager) return null;
  const ws = sessionManager.createWorkspace(data);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('nomad:workspaces-updated', sessionManager.getAllWorkspaces());
  }
  return ws;
});

ipcMain.handle('nomad:rename-workspace', (event, { id, title }) => {
  if (!sessionManager) return null;
  const ws = sessionManager.updateWorkspace(id, { title });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('nomad:workspaces-updated', sessionManager.getAllWorkspaces());
  }
  return ws;
});

ipcMain.handle('nomad:delete-workspace', (event, id) => {
  if (!sessionManager) return false;
  const ok = sessionManager.deleteWorkspace(id);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('nomad:workspaces-updated', sessionManager.getAllWorkspaces());
  }
  return ok;
});


ipcMain.handle("nomad:export-markdown", async (event, customOpts = {}) => {
  if (!sessionManager) return { success: false, error: "SessionManager not ready" };
  const history = customOpts.history || (orchestrator ? orchestrator.history : []);
  const title = customOpts.title || (orchestrator ? orchestrator.getStatus().canonicalTitle : "多AI協作報告");
  const mode = customOpts.mode || (orchestrator ? orchestrator.mode : "relay");
  const sequence = customOpts.sequence || (orchestrator ? orchestrator.sequence : ["claude", "chatgpt"]);

  const markdown = sessionManager.exportOrchestrationHistoryAsMarkdown({ title, mode, sequence, history });
  const exportDir = path.join(os.homedir(), "Desktop", "Nomad_AI_Exports");
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const safeTitle = (title || "nomad_report").replace(/[\\/:*?"<>|\s]/g, "_");
  const filename = safeTitle + "_" + Date.now() + ".md";
  const filePath = path.join(exportDir, filename);
  fs.writeFileSync(filePath, markdown, "utf8");

  return { success: true, filePath, exportDir, filename, markdown };
});

ipcMain.handle("nomad:export-workspaces", async () => {
  if (!sessionManager) return { success: false, error: "SessionManager not ready" };
  const json = sessionManager.exportAllWorkspacesAsJson();
  const exportDir = path.join(os.homedir(), "Desktop", "Nomad_AI_Exports");
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }
  const filename = "nomad_workspaces_" + Date.now() + ".json";
  const filePath = path.join(exportDir, filename);
  fs.writeFileSync(filePath, json, "utf8");

  return { success: true, filePath, exportDir, filename, data: JSON.parse(json) };
});

ipcMain.handle("nomad:import-workspaces", async (event, rawJsonOrObj) => {
  if (!sessionManager) return { success: false, error: "SessionManager not ready" };
  const result = sessionManager.importWorkspacesFromJson(rawJsonOrObj);
  if (result.success && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("nomad:workspaces-updated", sessionManager.getAllWorkspaces());
  }
  return result;
});

ipcMain.handle("nomad:open-export-folder", async () => {
  const exportDir = path.join(os.homedir(), "Desktop", "Nomad_AI_Exports");
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }
  await shell.openPath(exportDir);
  return { success: true, path: exportDir };
});

ipcMain.handle('nomad:new-session', async () => {
  if (!sessionManager) return { success: false };
  const newUrls = {
    claude: 'https://claude.ai/new',
    chatgpt: 'https://chatgpt.com/',
    gemini: 'https://gemini.google.com/app',
    grok: 'https://grok.com/',
  };
  for (const [key, url] of Object.entries(newUrls)) {
    if (views[key]?.view) {
      try {
        views[key].view.webContents.loadURL(url);
      } catch (e) {
        console.warn("[Nomad Desktop] Action failed:", e.message);
      }
    }
  }
  const ws = sessionManager.createWorkspace({
    title: '新協作對話',
    urls: newUrls,
  });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('nomad:workspaces-updated', sessionManager.getAllWorkspaces());
  }
  return { success: true, workspace: ws };
});

ipcMain.handle('nomad:orchestration-pause', async () => {
  if (!orchestrator) return { success: false, errorCode: 'ORCHESTRATOR_NOT_READY' };
  return orchestrator.pause();
});

ipcMain.handle('nomad:orchestration-resume', async () => {
  if (!orchestrator) return { success: false, errorCode: 'ORCHESTRATOR_NOT_READY' };
  return orchestrator.resume();
});

ipcMain.handle('nomad:orchestration-stop', async () => {
  if (!orchestrator) return { success: false, errorCode: 'ORCHESTRATOR_NOT_READY' };
  return orchestrator.stop();
});

ipcMain.handle('nomad:orchestration-status', async () => {
  if (!orchestrator) return { status: 'offline' };
  return orchestrator.getStatus();
});

// App Lifecycle
app.on('before-quit', async () => {
  app.isQuitting = true;
  trayManager?.destroy();
  if (orchestrator) {
    orchestrator.stop();
  }
  if (bridge) {
    try { await bridge.stop(); } catch (e) {}
  }
  try {
    await session.defaultSession.cookies.flushStore();
  } catch (e) {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  } else if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(createMainWindow);
