/**
 * Nomad AI Studio - Settings & Persistence Store
 * Thread-safe, JSON-backed configuration manager with sensible defaults.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  shortcut: 'CommandOrControl+Shift+Space',
  layout: 'dual', // 'focus', 'dual', 'triple', 'quad', 'custom'
  activePlatforms: ['claude', 'chatgpt'],
  splitRatio: 0.5,
  zoomFactors: {
    claude: 1.0,
    chatgpt: 1.0,
    gemini: 1.0,
    grok: 1.0,
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
    this.filePath = customFilePath || null;
    this.data = { ...DEFAULT_SETTINGS };
    this.isLoaded = false;
  }

  init(filePath) {
    if (filePath) {
      this.filePath = filePath;
    }
    this.load();
    return this;
  }

  load() {
    if (!this.filePath) {
      this.data = { ...DEFAULT_SETTINGS };
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
          zoomFactors: {
            ...DEFAULT_SETTINGS.zoomFactors,
            ...(parsed.zoomFactors || {}),
          },
        };
      } else {
        this.save();
      }
    } catch (err) {
      console.warn('[Nomad Store] Failed to load settings, using defaults:', err.message);
      this.data = { ...DEFAULT_SETTINGS };
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
      console.error('[Nomad Store] Failed to save settings:', err.message);
    }
  }

  get(key) {
    return this.data[key];
  }

  getAll() {
    return { ...this.data };
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
    return this.data[key];
  }

  update(partial) {
    if (!partial || typeof partial !== 'object') return this.data;
    
    if (partial.zoomFactors) {
      this.data.zoomFactors = {
        ...this.data.zoomFactors,
        ...partial.zoomFactors,
      };
      delete partial.zoomFactors;
    }

    Object.assign(this.data, partial);
    this.save();
    return this.getAll();
  }

  getZoom(platform) {
    return this.data.zoomFactors[platform] || 1.0;
  }

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
