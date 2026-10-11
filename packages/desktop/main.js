const {
  app,
  BrowserWindow,
  WebContentsView,
  session,
  ipcMain,
  shell,
  globalShortcut,
} = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { store } = require('./src/store');
const { calculateLayoutBounds, ALL_PLATFORMS } = require('./src/layout-engine');
const { PLATFORM_INJECTORS } = require('./src/injectors');
const { PLATFORM_EXTRACTORS } = require('./src/extractors');
const { MultiAiOrchestrator } = require('./src/orchestrator');
const { LocalSyncBridge } = require('./src/bridge');
const { createWebviewTaskRunner } = require('./src/webview-task-runner');

const TASK_REPLY_TIMEOUT_MS = 180000;
const CHAT_READY_DELAY_MS = 2500;
const { TrayAndShortcutManager } = require('./src/tray');
const { resolveMcpAllowedPaths } = require('./src/mcp-workspace');
const {
  PipelineManager,
  getSyncStatus,
  exportToDrive,
  importFromDrive,
  ArtifactExtractor,
  DiffEngine,
  LocalModelClient,
  McpGateway,
  KnowledgeBase,
  BotRoster,
  DEFAULT_ROSTER_PATH,
  NEW_CHAT_URLS,
} = require('@nomad/core');

const localModelClient = new LocalModelClient();
const mcpGateway = new McpGateway({
  allowedPaths: resolveMcpAllowedPaths({
    isPackaged: app.isPackaged,
    userDataDir: app.getPath('userData'),
  }),
});
const knowledgeBase = new KnowledgeBase();
const { SessionManager } = require('./src/session-manager');

const EXTENSION_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'dist_chrome')
  : path.resolve(__dirname, '../../dist_chrome');

const PLATFORMS = {
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com', color: '#10A37F' },
  claude: { name: 'Claude', url: 'https://claude.ai', color: '#D97706' },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com', color: '#2563EB' },
  grok: { name: 'Grok', url: 'https://grok.com', color: '#1D9BF0' },
  deepseek: { name: 'DeepSeek', url: 'https://chat.deepseek.com', color: '#4D6BFE' },
  perplexity: { name: 'Perplexity', url: 'https://www.perplexity.ai', color: '#22B8CD' },
};

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {Record<string, { view: WebContentsView, isLoaded: boolean, name: string, url: string, color: string }>} */
const views = {};
/** @type {import('./src/tray').TrayAndShortcutManager | null} */
let trayManager = null;
/** @type {import('./src/bridge').LocalSyncBridge | null} */
let bridge = null;
/** @type {import('./src/orchestrator').MultiAiOrchestrator | null} */
let orchestrator = null;
/** @type {import('./src/session-manager').SessionManager | null} */
let sessionManager = null;
let isDrawerOpen = false;
app.isQuitting = false;

const TOP_BAR_HEIGHT = 52;
const BOTTOM_BAR_HEIGHT = 68;
const DRAWER_WIDTH = 420;

/**
 * @param {string} key
 */
function ensurePlatformLoaded(key) {
  const item = views[key];
  if (!item) return;
  if (!item.isLoaded) {
    item.isLoaded = true;
    console.log(`[Nomad Desktop] Lazy-loading platform: ${key} (${item.url})`);
    try {
      item.view.webContents.loadURL(item.url);
    } catch (e) {
      console.warn(
        `[Nomad Desktop] Failed to load URL for ${key}:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }
}

/**
 * Loads a bot's canonical conversation, or a new chat when url is null, and waits for the
 * composer to mount. SPA redirects abort the load (ERR_ABORTED) without being a failure.
 * @param {string} platform
 * @param {string | null} url
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function openPlatformChat(platform, url) {
  ensurePlatformLoaded(platform);
  const item = views[platform];
  const target = url || NEW_CHAT_URLS[platform];
  if (!item || !target) return { ok: false, error: `No webview or chat URL for ${platform}` };
  try {
    await item.view.webContents.loadURL(target);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!message.includes('ERR_ABORTED')) return { ok: false, error: message };
  }
  await new Promise((resolve) => setTimeout(resolve, CHAT_READY_DELAY_MS));
  return { ok: true };
}

function updateViewBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const [winWidth, winHeight] = mainWindow.getContentSize();
  const layout = store.get('layout') || 'focus';
  const activePlatforms = store.get('activePlatforms') || ['chatgpt'];
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
      ensurePlatformLoaded(key);
      item.view.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
      item.view.setVisible(true);
    } else {
      item.view.setVisible(false);
    }
  }
}

/**
 * @param {string} platform
 * @param {number} factor
 */
function applyZoom(platform, factor) {
  const item = views[platform];
  if (item && item.isLoaded && item.view && item.view.webContents) {
    try {
      item.view.webContents.setZoomFactor(factor);
    } catch (e) {
      console.warn(
        `[Nomad Desktop] Failed to set zoom for ${platform}:`,
        e instanceof Error ? e.message : String(e),
      );
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
      ? (/** @type {string} */ p, /** @type {Electron.LoadExtensionOptions} */ opts) =>
          session.defaultSession.extensions.loadExtension(p, opts)
      : (/** @type {string} */ p, /** @type {Electron.LoadExtensionOptions} */ opts) =>
          session.defaultSession.loadExtension(p, opts);
    const ext = await extLoader(EXTENSION_PATH, { allowFileAccess: true });
    console.log(`[Nomad Desktop] Loaded Extension: ${ext.name} (v${ext.version})`);
  } catch (err) {
    console.warn(
      '[Nomad Desktop] Extension not loaded (may be packaged or not built):',
      err instanceof Error ? err.message : String(err),
    );
  }

  const isMac = process.platform === 'darwin';
  const iconPath = isMac
    ? path.join(__dirname, 'nomad.icns')
    : process.platform === 'win32'
      ? path.join(__dirname, 'nomad.ico')
      : path.join(__dirname, 'nomad.png');

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

  // 3. Initialize WebContentsViews for all 4 platforms with on-demand lazy loading
  const initialActive = store.get('activePlatforms') || ['chatgpt'];
  for (const [key, p] of Object.entries(PLATFORMS)) {
    const view = new WebContentsView({
      webPreferences: {
        session: session.defaultSession,
        contextIsolation: true,
      },
    });

    const shouldLoadImmediately = initialActive.includes(key);

    view.webContents.on('did-finish-load', () => {
      const zoom = store.getZoom(key);
      if (zoom && zoom !== 1.0) {
        view.webContents.setZoomFactor(zoom);
      }
    });

    mainWindow.contentView.addChildView(view);
    views[key] = { view, isLoaded: false, ...p };

    if (shouldLoadImmediately) {
      ensurePlatformLoaded(key);
    }
  }

  mainWindow.on('resize', updateViewBounds);

  mainWindow.once('ready-to-show', () => {
    updateViewBounds();
    applyAllZooms();
    mainWindow?.show();
  });

  // 3.5 Initialize SessionManager
  sessionManager = new SessionManager({
    store,
    getViews: () => views,
  });

  // 4. Initialize Multi-AI Orchestrator Engine
  orchestrator = new MultiAiOrchestrator({
    injectPrompt: async (/** @type {string} */ platform, /** @type {string} */ text) => {
      return await dispatchPromptToTargets(text, [platform]);
    },
    extractResponse: async (/** @type {string} */ platform) => {
      const item = views[platform];
      if (!item) return { ok: false, error: 'Platform view not found' };
      const extractorScript = PLATFORM_EXTRACTORS[platform]?.getLatestResponse();
      if (!extractorScript) return { ok: false, error: 'Extractor script not found' };
      try {
        const res = await item.view.webContents.executeJavaScript(extractorScript);
        return res || { ok: false, error: 'Empty script result' };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    checkStreaming: async (/** @type {string} */ platform) => {
      const item = views[platform];
      if (!item) return { ok: false, isStreaming: false };
      const statusScript = PLATFORM_EXTRACTORS[platform]?.checkStatus();
      if (!statusScript) return { ok: false, isStreaming: false };
      try {
        const res = await item.view.webContents.executeJavaScript(statusScript);
        return res || { ok: true, isStreaming: false };
      } catch (err) {
        return {
          ok: false,
          isStreaming: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    onStep: async (/** @type {Record<string, any>} */ event) => {
      if (event.type === 'turn-complete' && event.speaker && event.canonicalTitle) {
        try {
          await sessionManager?.applyInPageRenaming(event.speaker, event.canonicalTitle);
        } catch (e) {
          console.warn(
            '[Nomad Desktop] Action failed:',
            e instanceof Error ? e.message : String(e),
          );
        }
        const activeWs = sessionManager?.getActiveWorkspace();
        if (sessionManager && activeWs) {
          sessionManager.captureActiveUrls(activeWs.id);
          sessionManager.addTurn(activeWs.id, {
            speaker: event.speaker,
            round: event.round,
            content: event.content || event.responseSnippet,
            timestamp: new Date().toISOString(),
          });
        }
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nomad:orchestration-step', event);
      }
      bridge?.broadcast('orchestration-step', event);
    },
    onComplete: async (/** @type {Record<string, any>} */ summary) => {
      const activeWs = sessionManager?.getActiveWorkspace();
      if (sessionManager && activeWs) {
        sessionManager.captureActiveUrls(activeWs.id);
        sessionManager.updateWorkspace(activeWs.id, {
          completed: true,
          history:
            orchestrator && orchestrator.history && orchestrator.history.length > 0
              ? orchestrator.history
              : activeWs.history || [],
        });
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(
            'nomad:workspaces-updated',
            sessionManager.getAllWorkspaces(),
          );
        }
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nomad:orchestration-step', { type: 'completed', summary });
      }
      bridge?.broadcast('orchestration-completed', summary);
    },
  });

  // 5. Initialize Local Sync Bridge. The Studio owns ~/.nomad/roster.json (bots persist here).
  const botRoster = new BotRoster({ storagePath: DEFAULT_ROSTER_PATH });
  const rosterLoad = botRoster.loadFromDisk();
  if (!rosterLoad.success) console.warn('[Nomad Desktop] Bot roster:', rosterLoad.message);
  bridge = new LocalSyncBridge({
    roster: botRoster,
    port: store.get('bridgePort') || 8765,
    host: '127.0.0.1',
    orchestrator,
    sessionManager,
    // /api/debug/* runs scripts inside the logged-in AI webviews: dev builds only, or opt in explicitly.
    debugEndpoints: !app.isPackaged || process.env.NOMAD_DEBUG_ENDPOINTS === '1',
    getDriveSyncDir: () => store.get('driveSync')?.customPath || undefined,
    mcpGateway,
    getStatus: () => ({
      layout: store.get('layout'),
      activePlatforms: store.get('activePlatforms'),
      splitRatio: store.get('splitRatio'),
      zoomFactors: store.getAll().zoomFactors,
      windowVisible: mainWindow ? mainWindow.isVisible() : false,
      isDrawerOpen,
    }),
    runWebviewTask: (() => {
      // Tasks can run far longer than a relay turn, so allow up to 3 minutes per reply.
      const runner = createWebviewTaskRunner({
        roster: botRoster,
        inject: (platform, text) => dispatchPromptToTargets(text, [platform]),
        awaitSettled: (platform) =>
          orchestrator
            ? orchestrator.awaitSettled(platform, { maxWaitMs: TASK_REPLY_TIMEOUT_MS })
            : Promise.resolve({ settled: false, text: '' }),
        openChat: openPlatformChat,
        currentUrl: async (platform) => views[platform]?.view.webContents.getURL() || null,
      });
      return (
        /** @type {string} */ platform,
        /** @type {string} */ prompt,
        /** @type {any} */ context,
      ) => runner.run(platform, prompt, context);
    })(),
    onDispatchPrompt: async ({ prompt, targets }) => {
      const results = await dispatchPromptToTargets(prompt, targets);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nomad:prompt-dispatched', { prompt, targets, results });
      }
      return results;
    },
    onSetLayout: (
      /** @type {{ layout?: string, activePlatforms?: string[], splitRatio?: number }} */ data,
    ) => {
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
    onSetZoom: (
      /** @type {{ platform?: string, factor?: number, globalFactor?: number, zoomFactors?: Record<string, number> }} */ data,
    ) => {
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
    onInspectPlatform: async (/** @type {string} */ platform) => {
      ensurePlatformLoaded(platform);
      const item = views[platform];
      if (!item) return { ok: false, error: 'Platform view not found' };
      const wc = item.view.webContents;
      const extScript = PLATFORM_EXTRACTORS[platform]?.getLatestResponse();
      const statScript = PLATFORM_EXTRACTORS[platform]?.checkStatus();
      let extRes = null;
      let statRes = null;
      let debugDom = null;
      try {
        if (extScript) extRes = await wc.executeJavaScript(extScript);
      } catch (e) {
        extRes = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      try {
        if (statScript) statRes = await wc.executeJavaScript(statScript);
      } catch (e) {
        statRes = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      try {
        debugDom = await wc.executeJavaScript(`(function() {
          return {
            url: location.href,
            title: document.title,
            bodyTextSnippet: (document.body ? document.body.innerText : "").slice(0, 300),
            articleCount: document.querySelectorAll("article").length,
            turnCount: document.querySelectorAll('[data-testid*="conversation-turn"]').length,
            markdownCount: document.querySelectorAll(".markdown").length,
            responseContainerCount: document.querySelectorAll(".response-container").length,
            messageContentCount: document.querySelectorAll("message-content").length
          };
        })()`);
      } catch (e) {
        debugDom = { error: e instanceof Error ? e.message : String(e) };
      }
      return { ok: true, platform, extRes, statRes, debugDom };
    },
    onEvalScript: async (/** @type {string} */ platform, /** @type {string} */ script) => {
      ensurePlatformLoaded(platform);
      const item = views[platform];
      if (!item) return { ok: false, error: 'Platform view not found' };
      try {
        const result = await item.view.webContents.executeJavaScript(script);
        return { ok: true, result };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    onToggleWindow: (/** @type {string} */ action) => {
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

    try {
      globalShortcut.register('CommandOrControl+Shift+P', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('nomad:toggle-spotlight-hud');
        }
      });
    } catch (err) {
      console.warn(
        '[Nomad Desktop] Spotlight shortcut registration skipped:',
        err instanceof Error ? err.message : String(err),
      );
    }
  } catch (err) {
    console.error('[Nomad Desktop] Failed to start local sync bridge:', err);
  }

  // 6. Initialize Tray and Global Shortcuts
  trayManager = new TrayAndShortcutManager({
    mainWindow,
    store,
    bridge,
    onLayoutChange: (/** @type {string} */ layout) => {
      store.set('layout', layout);
      if (layout === 'focus') store.set('activePlatforms', ['chatgpt']);
      else if (layout === 'dual') store.set('activePlatforms', ['chatgpt', 'claude']);
      else if (layout === 'triple') store.set('activePlatforms', ['chatgpt', 'claude', 'gemini']);
      else if (layout === 'quad') store.set('activePlatforms', ALL_PLATFORMS.slice(0, 4));
      else if (layout === 'hexa') store.set('activePlatforms', ALL_PLATFORMS.slice(0, 6));
      updateViewBounds();
      trayManager?.updateContextMenu();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nomad:remote-update', store.getAll());
      }
    },
    onZoomChange: (/** @type {number} */ globalFactor) => {
      for (const p of ALL_PLATFORMS) {
        store.setZoom(p, globalFactor);
        applyZoom(p, globalFactor);
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nomad:remote-update', store.getAll());
      }
    },
    onToggleDrawer: () => {
      isDrawerOpen = !isDrawerOpen;
      updateViewBounds();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nomad:remote-update', { drawerOpen: isDrawerOpen });
      }
    },
    onNewSession: () => {
      if (!sessionManager) return;
      sessionManager.createWorkspace({ prompt: '新跨平臺協作' });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nomad:workspaces-updated', sessionManager.getWorkspaces());
      }
    },
    onToggleHud: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('nomad:remote-update', { openHud: true });
      }
    },
  });

  trayManager.init();
}

/**
 * @param {string | { text?: string }} prompt - Renderer IPC may send `{ text }`
 * @param {string[]} targets - Platform ids, or 'local' for the local model
 * @param {import('./src/injectors').PromptAttachment[]} [attachments]
 * @returns {Promise<Record<string, unknown>>}
 */
async function dispatchPromptToTargets(prompt, targets, attachments = []) {
  const promptText = typeof prompt === 'string' ? prompt : prompt.text || '';
  console.log(
    `[Nomad Desktop] Dispatching prompt to [${targets.join(', ')}]: "${promptText.slice(0, 30)}..."`,
  );
  /** @type {Record<string, unknown>} */
  const results = {};

  if (targets.includes('local')) {
    try {
      console.log('[Nomad Desktop] Dispatching to Local Model (LM Studio/Ollama)...');
      const chatRes = await localModelClient.chatCompletion({
        prompt: promptText,
        messages: [{ role: 'user', content: promptText }],
      });
      results['local'] = chatRes;
      if (chatRes.success) {
        const activeWs = sessionManager?.getActiveWorkspace();
        if (sessionManager && activeWs) {
          sessionManager.addTurn(activeWs.id, {
            speaker: 'local',
            round: 1,
            content: chatRes.data.content,
          });
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(
              'nomad:workspaces-updated',
              sessionManager.getAllWorkspaces(),
            );
          }
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('nomad:local-model-response', chatRes.data);
        }
      }
    } catch (e) {
      results['local'] = { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  for (const target of targets) {
    if (target === 'local') continue;
    ensurePlatformLoaded(target);
    const item = views[target];
    if (!item) continue;
    const wc = item.view.webContents;
    const injector = PLATFORM_INJECTORS[target];
    if (!injector) continue;

    try {
      const res = await wc.executeJavaScript(injector({ text: promptText, attachments }));
      results[target] = { ok: true, data: res };
      console.log(`[Nomad Desktop] Inject result for ${target}:`, res);
    } catch (e) {
      results[target] = { ok: false, error: e instanceof Error ? e.message : String(e) };
      console.warn(
        `[Nomad Desktop] Inject failed for ${target}:`,
        e instanceof Error ? e.message : String(e),
      );
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

ipcMain.on('nomad:dispatch-prompt', async (event, { prompt, targets, attachments }) => {
  await dispatchPromptToTargets(prompt, targets, attachments || []);
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
      promptSnippet: String(options.prompt).slice(0, 100),
    });
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(
      'nomad:workspaces-updated',
      sessionManager?.getAllWorkspaces() || [],
    );
  }
  return await orchestrator.start({
    ...options,
    canonicalTitle: ws?.title,
  });
});

// Workspace & Session Management IPC Handlers
ipcMain.handle('nomad:search-workspaces', (event, options) => {
  if (!sessionManager) return { success: false, data: [] };
  return sessionManager.searchWorkspaces(options);
});

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

ipcMain.handle('nomad:export-markdown', async (event, customOpts = {}) => {
  if (!sessionManager) return { success: false, error: 'SessionManager not ready' };
  const history = customOpts.history || (orchestrator ? orchestrator.history : []);
  const title =
    customOpts.title || (orchestrator ? orchestrator.getStatus().canonicalTitle : '多AI協作報告');
  const mode = customOpts.mode || (orchestrator ? orchestrator.mode : 'relay');
  const sequence =
    customOpts.sequence || (orchestrator ? orchestrator.sequence : ['claude', 'chatgpt']);

  const markdown = sessionManager.exportOrchestrationHistoryAsMarkdown({
    title,
    mode,
    sequence,
    history,
  });
  const exportDir = path.join(os.homedir(), 'Desktop', 'Nomad_AI_Exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const safeTitle = (title || 'nomad_report').replace(/[\\/:*?"<>|\s]/g, '_');
  const filename = safeTitle + '_' + Date.now() + '.md';
  const filePath = path.join(exportDir, filename);
  fs.writeFileSync(filePath, markdown, 'utf8');

  return { success: true, filePath, exportDir, filename, markdown };
});

ipcMain.handle('nomad:export-workspaces', async () => {
  if (!sessionManager) return { success: false, error: 'SessionManager not ready' };
  const json = sessionManager.exportAllWorkspacesAsJson();
  const exportDir = path.join(os.homedir(), 'Desktop', 'Nomad_AI_Exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }
  const filename = 'nomad_workspaces_' + Date.now() + '.json';
  const filePath = path.join(exportDir, filename);
  fs.writeFileSync(filePath, json, 'utf8');

  return { success: true, filePath, exportDir, filename, data: JSON.parse(json) };
});

ipcMain.handle('nomad:import-workspaces', async (event, rawJsonOrObj) => {
  if (!sessionManager) return { success: false, error: 'SessionManager not ready' };
  const result = sessionManager.importWorkspacesFromJson(rawJsonOrObj);
  if (result.success && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('nomad:workspaces-updated', sessionManager.getAllWorkspaces());
  }
  return result;
});

ipcMain.handle('nomad:open-export-folder', async () => {
  const exportDir = path.join(os.homedir(), 'Desktop', 'Nomad_AI_Exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }
  await shell.openPath(exportDir);
  return { success: true, path: exportDir };
});

ipcMain.handle('nomad:new-session', async () => {
  if (!sessionManager) return { success: false };
  for (const [key, url] of Object.entries(NEW_CHAT_URLS)) {
    if (views[key]?.view) {
      try {
        views[key].view.webContents.loadURL(url);
      } catch (e) {
        console.warn('[Nomad Desktop] Action failed:', e instanceof Error ? e.message : String(e));
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

// --- Global Shortcuts, Appearance, Drive Sync & Pipeline IPC ---

ipcMain.handle('nomad:get-shortcuts', () => {
  return store.get('shortcuts') || {};
});

ipcMain.handle('nomad:set-shortcuts', (event, shortcuts) => {
  store.set('shortcuts', shortcuts);
  if (trayManager) {
    trayManager.registerAllShortcuts(shortcuts);
  }
  return { success: true, shortcuts: store.get('shortcuts') };
});

ipcMain.handle('nomad:get-appearance', () => {
  return store.get('appearance') || {};
});

ipcMain.handle('nomad:set-appearance', (event, appearance) => {
  store.set('appearance', appearance);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('nomad:remote-update', { appearance });
  }
  return { success: true, appearance: store.get('appearance') };
});

ipcMain.handle('nomad:drive-sync-status', async (event, customOpts = {}) => {
  const customPath = customOpts.targetDir || store.get('driveSync')?.customPath || undefined;
  return getSyncStatus(customPath ? { targetDir: customPath } : {});
});

ipcMain.handle('nomad:drive-sync-push', async (event, customOpts = {}) => {
  if (!sessionManager) return { success: false, errorCode: 'SESSION_MANAGER_NOT_READY' };
  const workspaces = sessionManager.getWorkspaces();
  const settings = store.getAll();
  const targetDir = customOpts.targetDir || store.get('driveSync')?.customPath || undefined;
  const result = exportToDrive({ workspaces, settings, targetDir });
  if (result.success) {
    const driveSync = store.get('driveSync') || {};
    driveSync.lastSyncedAt = result.data.timestamp;
    store.set('driveSync', driveSync);
  }
  return result;
});

ipcMain.handle('nomad:drive-sync-pull', async (event, customOpts = {}) => {
  if (!sessionManager) return { success: false, errorCode: 'SESSION_MANAGER_NOT_READY' };
  const sm = sessionManager;
  const sourceDir = customOpts.sourceDir || store.get('driveSync')?.customPath || undefined;
  const strategy = customOpts.strategy || 'merge';
  const result = importFromDrive({
    sourceDir,
    currentWorkspaces: sm.getWorkspaces(),
    strategy,
  });
  if (result.success) {
    sm.store.set('workspaces', result.data.reconciledWorkspaces);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('nomad:workspaces-updated', result.data.reconciledWorkspaces);
    }
  }
  return result;
});

ipcMain.handle('nomad:pipeline-process', async (event, input) => {
  const pm = new PipelineManager(store.get('pipeline') || {});
  return pm.process(input);
});

// P1: Canvas & Artifacts IPC
ipcMain.handle('nomad:extract-artifacts', (event, text) => {
  return ArtifactExtractor.extract(text || '');
});

ipcMain.handle('nomad:generate-sandbox-html', (event, { artifact, type, title }) => {
  const html = ArtifactExtractor.generateSandboxHtml(artifact, type, title);
  return { success: true, data: { html } };
});

// P2: Side-by-side Diff & Local Model IPC
ipcMain.handle('nomad:compute-diff', (event, options) => {
  return DiffEngine.diffLines(options?.textA || '', options?.textB || '', options || {});
});

ipcMain.handle('nomad:probe-local-model', async (event, options) => {
  const port = options?.port || 1234;
  const host = options?.host || '127.0.0.1';
  const client = new LocalModelClient({ endpoint: `http://${host}:${port}/v1` });
  const probeRes = await client.probe();
  if (probeRes.success) {
    return probeRes;
  }
  return { success: true, data: { online: false, port, host, error: probeRes.message } };
});

ipcMain.handle('nomad:chat-local-model', async (event, options) => {
  const port = options?.port || 1234;
  const host = options?.host || '127.0.0.1';
  const client = new LocalModelClient({ endpoint: `http://${host}:${port}/v1` });
  return await client.chatCompletion(options);
});

// P3: MCP Gateway & Local RAG IPC
ipcMain.handle('nomad:get-mcp-tools', () => {
  return mcpGateway.listTools();
});

ipcMain.handle('nomad:call-mcp-tool', async (event, { name, args }) => {
  return await mcpGateway.callTool(name, args || {});
});

ipcMain.handle('nomad:ingest-rag-doc', (event, doc) => {
  return knowledgeBase.addDocument(doc);
});

ipcMain.handle('nomad:retrieve-rag-context', (event, { prompt, topK }) => {
  return knowledgeBase.retrieveContext(prompt || '', topK || 3);
});

ipcMain.handle('nomad:toggle-spotlight', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('nomad:toggle-spotlight-hud');
  }
  return { success: true, toggled: true };
});

ipcMain.handle('nomad:pipeline-stats', async () => {
  const pm = new PipelineManager(store.get('pipeline') || {});
  return pm.getStats();
});

// App Lifecycle
app.on('before-quit', async () => {
  app.isQuitting = true;
  trayManager?.destroy();
  if (orchestrator) {
    orchestrator.stop();
  }
  if (bridge) {
    try {
      await bridge.stop();
    } catch {}
  }
  try {
    await session.defaultSession.cookies.flushStore();
  } catch {}
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
