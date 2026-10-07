/**
 * Nomad AI Studio - Tray & Global Shortcut Manager
 * Manages macOS / Windows system tray resident icon, menu, and global shortcuts.
 */

const { app, Tray, Menu, globalShortcut, nativeImage } = require('electron');
const path = require('path');

class TrayAndShortcutManager {
  /**
   * @param {Object} options
   * @param {import('electron').BrowserWindow} options.mainWindow
   * @param {import('./store').SettingsStore} options.store - Settings store
   * @param {import('./bridge').LocalSyncBridge | null} [options.bridge] - Local Sync Bridge instance
   * @param {Function} [options.onLayoutChange] - Callback for layout changes from tray
   * @param {Function} [options.onZoomChange] - Callback for zoom changes from tray
   * @param {Function} [options.onToggleDrawer] - Callback for toggling drawer
   * @param {Function} [options.onNewSession] - Callback for new session
   * @param {Function} [options.onToggleHud] - Callback for toggling HUD
   */
  constructor({
    mainWindow,
    store,
    bridge,
    onLayoutChange,
    onZoomChange,
    onToggleDrawer,
    onNewSession,
    onToggleHud,
  }) {
    this.mainWindow = mainWindow;
    this.store = store;
    this.bridge = bridge;
    this.onLayoutChange = onLayoutChange || (() => {});
    this.onZoomChange = onZoomChange || (() => {});
    this.onToggleDrawer = onToggleDrawer || (() => {});
    this.onNewSession = onNewSession || (() => {});
    this.onToggleHud = onToggleHud || (() => {});
    this.tray = null;
    this.registeredShortcuts = new Map(); // accelerator -> actionName
  }

  init() {
    this.createTray();
    this.registerAllShortcuts();
    this.setupWindowEvents();
  }

  createTray() {
    const isMac = process.platform === 'darwin';
    const iconFile = isMac
      ? 'trayTemplate.png'
      : process.platform === 'win32'
        ? 'nomad.ico'
        : 'nomad.png';
    const iconPath = path.join(__dirname, '..', iconFile);

    try {
      let icon = nativeImage.createFromPath(iconPath);
      if (isMac) {
        icon.setTemplateImage(true);
      }

      this.tray = new Tray(icon);
      this.tray.setToolTip('Nomad AI Studio (Cmd+Shift+Space)');

      this.updateContextMenu();

      this.tray.on('click', () => {
        this.toggleWindow();
      });

      this.tray.on('double-click', () => {
        this.toggleWindow();
      });
    } catch (err) {
      console.warn(
        '[Nomad Tray] Failed to initialize system tray:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  updateContextMenu() {
    if (!this.tray) return;

    const currentLayout = this.store.get('layout') || 'dual';
    const bridgePort = this.store.get('bridgePort') || 8765;
    const shortcuts = this.store.get('shortcuts') || {};
    const shortcut =
      shortcuts.toggleWindow || this.store.get('shortcut') || 'CommandOrControl+Shift+Space';
    const isMac = process.platform === 'darwin';
    const shortcutLabel = shortcut.replace('CommandOrControl', isMac ? 'Cmd' : 'Ctrl');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `顯示 / 隱藏 工作台 (${shortcutLabel})`,
        click: () => this.toggleWindow(),
      },
      { type: 'separator' },
      {
        label: '版面模式 (Layout)',
        submenu: [
          {
            label: '單欄專注 (Focus)',
            type: 'radio',
            checked: currentLayout === 'focus',
            click: () => this.onLayoutChange('focus'),
          },
          {
            label: '雙欄並排 (Dual)',
            type: 'radio',
            checked: currentLayout === 'dual',
            click: () => this.onLayoutChange('dual'),
          },
          {
            label: '三欄對比 (Triple)',
            type: 'radio',
            checked: currentLayout === 'triple',
            click: () => this.onLayoutChange('triple'),
          },
          {
            label: '四宮格競技 (Quad)',
            type: 'radio',
            checked: currentLayout === 'quad',
            click: () => this.onLayoutChange('quad'),
          },
          {
            label: '六宮格矩陣 (Hexa 6-Grid)',
            type: 'radio',
            checked: currentLayout === 'hexa',
            click: () => this.onLayoutChange('hexa'),
          },
        ],
      },
      {
        label: '全域縮放 (Global Zoom)',
        submenu: [
          { label: '80%', click: () => this.onZoomChange(0.8) },
          { label: '90%', click: () => this.onZoomChange(0.9) },
          { label: '100% (預設)', click: () => this.onZoomChange(1.0) },
          { label: '110%', click: () => this.onZoomChange(1.1) },
          { label: '125%', click: () => this.onZoomChange(1.25) },
        ],
      },
      { type: 'separator' },
      {
        label: `🌐 本地中繼: 127.0.0.1:${bridgePort} (運行中)`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: '開機自動啟動',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => {
          app.setLoginItemSettings({ openAtLogin: item.checked });
        },
      },
      {
        label: '徹底退出 Nomad AI Studio',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  /**
   * Register all configured global shortcuts
   * @param {Object} [customMap]
   */
  registerAllShortcuts(customMap) {
    // Unregister all existing
    for (const [accelerator] of this.registeredShortcuts.entries()) {
      try {
        globalShortcut.unregister(accelerator);
      } catch {}
    }
    this.registeredShortcuts.clear();

    const shortcuts = customMap || this.store.get('shortcuts') || {};
    const defaultToggle = this.store.get('shortcut') || 'CommandOrControl+Shift+Space';

    const actions = {
      toggleWindow: shortcuts.toggleWindow || defaultToggle,
      toggleFocus: shortcuts.toggleFocus,
      toggleDrawer: shortcuts.toggleDrawer,
      newSession: shortcuts.newSession,
      toggleHUD: shortcuts.toggleHUD,
    };

    /** @type {Record<string, () => void>} */
    const handlers = {
      toggleWindow: () => this.toggleWindow(),
      toggleFocus: () => this.onLayoutChange('focus'),
      toggleDrawer: () => this.onToggleDrawer(),
      newSession: () => this.onNewSession(),
      toggleHUD: () => this.onToggleHud(),
    };

    for (const [name, accelerator] of Object.entries(actions)) {
      if (!accelerator || typeof accelerator !== 'string') continue;
      try {
        const ok = globalShortcut.register(accelerator, handlers[name]);
        if (ok) {
          this.registeredShortcuts.set(accelerator, name);
          console.log(`[Nomad Shortcut] Registered global shortcut: ${accelerator} (${name})`);
        } else {
          console.warn(`[Nomad Shortcut] Registration failed for: ${accelerator} (${name})`);
        }
      } catch (err) {
        console.warn(
          `[Nomad Shortcut] Error registering ${accelerator}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    this.updateContextMenu();
  }

  // Compatibility method
  /**
   * @param {string} [customShortcut]
   */
  registerGlobalShortcut(customShortcut) {
    this.registerAllShortcuts(customShortcut ? { toggleWindow: customShortcut } : undefined);
  }

  toggleWindow() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
      this.mainWindow.show();
      this.mainWindow.focus();
    } else if (this.mainWindow.isVisible()) {
      if (this.mainWindow.isFocused()) {
        this.mainWindow.hide();
      } else {
        this.mainWindow.focus();
      }
    } else {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  setupWindowEvents() {
    if (!this.mainWindow) return;

    this.mainWindow.on('close', (event) => {
      const minimizeToTray = this.store.get('minimizeToTray') !== false;
      if (!app.isQuitting && minimizeToTray) {
        event.preventDefault();
        this.mainWindow.hide();
      }
    });
  }

  destroy() {
    try {
      globalShortcut.unregisterAll();
      this.registeredShortcuts.clear();
      if (this.tray) {
        this.tray.destroy();
        this.tray = null;
      }
    } catch {}
  }
}

module.exports = {
  TrayAndShortcutManager,
};
