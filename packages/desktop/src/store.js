/**
 * Nomad AI Studio - Settings & Persistence Store
 * Thread-safe, JSON-backed configuration manager with sensible defaults.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  shortcut: 'CommandOrControl+Shift+Space',
  shortcuts: {
    toggleWindow: 'CommandOrControl+Shift+Space',
    toggleFocus: 'CommandOrControl+Shift+F',
    toggleDrawer: 'CommandOrControl+Shift+D',
    newSession: 'CommandOrControl+Shift+N',
    toggleHUD: 'CommandOrControl+Shift+H',
  },
  appearance: {
    theme: 'charcoal', // 'charcoal' | 'oled' | 'cyberpunk' | 'aurora' | 'nordic'
    accentColor: '#38bdf8',
    glassmorphism: true,
    fontSize: 'normal',
  },
  pipeline: {
    headroomEnabled: true,
    layaEnabled: true,
    autoEnhance: true,
    compressionLevel: 'balanced',
  },
  driveSync: {
    autoSync: false,
    customPath: '',
    lastSyncedAt: null,
  },
  layout: 'focus', // 'focus', 'dual', 'triple', 'quad', 'hexa', 'custom'
  activePlatforms: ['chatgpt'],
  splitRatio: 0.5,
  zoomFactors: {
    chatgpt: 1.0,
    claude: 1.0,
    gemini: 1.0,
    grok: 1.0,
    deepseek: 1.0,
    perplexity: 1.0,
  },
  bridgePort: 8765,
  bridgeEnabled: true,
  minimizeToTray: true,
};

class SettingsStore {
  /**
   * @param {string} [customFilePath] - Custom path to settings JSON (for testing)
   */
  constructor(customFilePath) {
    /** @type {string | null} */
    this.filePath = customFilePath || null;
    /** @type {Record<string, any>} Settings are free-form JSON keyed by setting name */
    this.data = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    this.isLoaded = false;
  }

  /**
   * @param {string} [filePath]
   */
  init(filePath) {
    if (filePath) {
      this.filePath = filePath;
    }
    this.load();
    return this;
  }

  load() {
    if (!this.filePath) {
      this.data = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      this.isLoaded = true;
      return this.data;
    }

    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = {
          ...DEFAULT_SETTINGS,
          ...parsed,
          shortcuts: {
            ...DEFAULT_SETTINGS.shortcuts,
            ...(parsed.shortcuts || {}),
          },
          appearance: {
            ...DEFAULT_SETTINGS.appearance,
            ...(parsed.appearance || {}),
          },
          pipeline: {
            ...DEFAULT_SETTINGS.pipeline,
            ...(parsed.pipeline || {}),
          },
          driveSync: {
            ...DEFAULT_SETTINGS.driveSync,
            ...(parsed.driveSync || {}),
          },
          zoomFactors: {
            ...DEFAULT_SETTINGS.zoomFactors,
            ...(parsed.zoomFactors || {}),
          },
        };
      } else {
        this.save();
      }
    } catch (err) {
      console.warn(
        '[Nomad Store] Failed to load settings, using defaults:',
        err instanceof Error ? err.message : String(err),
      );
      this.data = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
    this.isLoaded = true;
    return this.data;
  }

  save() {
    if (!this.filePath) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error(
        '[Nomad Store] Failed to save settings:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /**
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    return this.data[key];
  }

  getAll() {
    return JSON.parse(JSON.stringify(this.data));
  }

  /**
   * @param {string} key
   * @param {unknown} value
   */
  set(key, value) {
    this.data[key] = value;
    this.save();
    return this.data[key];
  }

  /**
   * @param {Record<string, unknown>} partial
   */
  update(partial) {
    if (!partial || typeof partial !== 'object') return this.data;

    if (partial.zoomFactors) {
      this.data.zoomFactors = {
        ...this.data.zoomFactors,
        ...partial.zoomFactors,
      };
      delete partial.zoomFactors;
    }

    if (partial.shortcuts) {
      this.data.shortcuts = {
        ...this.data.shortcuts,
        ...partial.shortcuts,
      };
      delete partial.shortcuts;
    }

    if (partial.appearance) {
      this.data.appearance = {
        ...this.data.appearance,
        ...partial.appearance,
      };
      delete partial.appearance;
    }

    if (partial.pipeline) {
      this.data.pipeline = {
        ...this.data.pipeline,
        ...partial.pipeline,
      };
      delete partial.pipeline;
    }

    if (partial.driveSync) {
      this.data.driveSync = {
        ...this.data.driveSync,
        ...partial.driveSync,
      };
      delete partial.driveSync;
    }

    Object.assign(this.data, partial);
    this.save();
    return this.getAll();
  }

  /**
   * @param {string} platform
   * @returns {number}
   */
  getZoom(platform) {
    return this.data.zoomFactors[platform] || 1.0;
  }

  /**
   * @param {string} platform
   * @param {number} factor
   */
  setZoom(platform, factor) {
    const clamped = Math.min(2.0, Math.max(0.5, Number(factor) || 1.0));
    this.data.zoomFactors[platform] = Math.round(clamped * 100) / 100;
    this.save();
    return this.data.zoomFactors[platform];
  }
}

// Singleton instance
const store = new SettingsStore();

module.exports = {
  DEFAULT_SETTINGS,
  SettingsStore,
  store,
};
