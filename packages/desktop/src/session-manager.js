/**
 * Nomad AI Studio - Unified Session & Workspace Manager
 * Implements MMDD | 類型 | 主題 semantic naming and cross-platform workspace synchronization.
 * Governed by AGENTS.md Section 7.
 */

const { store } = require("./store");

const TYPE_KEYWORDS = [
  { type: "修復", keywords: ["修復", "修正", "debug", "bug", "報錯", "失敗", "例外", "異常", "fix", "error"] },
  { type: "優化", keywords: ["優化", "效能", "重構", "加速", "調優", "refactor", "perf", "壞味道"] },
  { type: "文件", keywords: ["文件", "readme", "手冊", "doc", "註冊表", "規格書"] },
  { type: "探索", keywords: ["探索", "poc", "spike", "試驗", "原型", "可行性驗證"] },
  { type: "研究", keywords: ["研究", "調研", "審計", "比較", "生態調研", "文獻", "audit"] },
  { type: "發布", keywords: ["發布", "部署", "上線", "交付", "release", "deploy"] },
  { type: "功能", keywords: ["功能", "新增", "實作", "能力", "模組開發", "feat"] },
  { type: "設計", keywords: ["設計", "架構", "選型", "規範", "拓撲", "blueprint"] },
];

/**
 * Generate standardized Taiwan-time date MMDD (e.g. 1003)
 */
function getTaiwanMMDD() {
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const twDate = new Date(utc + (3600000 * 8));
  const mm = String(twDate.getMonth() + 1).padStart(2, "0");
  const dd = String(twDate.getDate()).padStart(2, "0");
  return `${mm}${dd}`;
}

/**
 * Infer semantic type from prompt text
 */
function inferType(promptText) {
  const lower = (promptText || "").toLowerCase();
  for (const item of TYPE_KEYWORDS) {
    if (item.keywords.some(k => lower.includes(k))) {
      return item.type;
    }
  }
  return "設計";
}

/**
 * Extract concise topic (4-15 Chinese chars)
 */
function extractTopic(promptText) {
  if (!promptText) return "多AI協作任務";
  
  let cleaned = promptText
    .replace(/^請(以|用|幫忙|協助|設計|分析|撰寫|整理).*?視角[，,：:]?/g, "")
    .replace(/^請(以|用|幫忙|協助|設計|分析|撰寫|整理)[，,：:]?/g, "")
    .replace(/^(以|用|針對).*?視角[，,：:]?/g, "")
    .replace(/[，,。！!？?：:\s]+/g, " ")
    .replace(/[（(].*?[）)]/g, "")
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);
  let topic = words[0] || "協作任務";
  if (topic.length < 4 && words[1]) {
    topic = topic + words[1];
  }
  if (topic.length > 15) {
    topic = topic.slice(0, 15);
  }
  if (topic.length < 4) {
    topic = topic + "架構設計";
  }
  return topic;
}

/**
 * Create full canonical title: MMDD | 類型 | 主題
 */
function createSemanticTitle(promptText, customType = null, customTopic = null) {
  const date = getTaiwanMMDD();
  const type = customType || inferType(promptText);
  const topic = customTopic || extractTopic(promptText);
  return `${date} | ${type} | ${topic}`;
}

class SessionManager {
  /**
   * @param {Object} [options]
   * @param {Object} [options.store] - SettingsStore instance
   * @param {Function} [options.getViews] - () => views map
   */
  constructor(options = {}) {
    this.store = options.store || store;
    this.getViews = options.getViews || (() => ({}));
  }

  getWorkspaces() {
    return this.store.get("workspaces") || [];
  }

  getAllWorkspaces() {
    return this.getWorkspaces();
  }

  getActiveWorkspaceId() {
    return this.store.get("activeWorkspaceId") || null;
  }

  getActiveWorkspace() {
    const id = this.getActiveWorkspaceId();
    return this.getWorkspaces().find(w => w.id === id) || null;
  }

  createWorkspace({ prompt, mode = "relay", sequence = ["claude", "chatgpt"], customTitle = null, title = null, urls = null }) {
    const canonicalTitle = title || customTitle || createSemanticTitle(prompt);
    const id = `ws-${Date.now()}`;
    const workspace = {
      id,
      title: canonicalTitle,
      promptSnippet: (prompt || "").slice(0, 100),
      mode,
      sequence,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completed: false,
      turns: 0,
      urls: urls || {
        claude: "",
        chatgpt: "",
        gemini: "",
        grok: "",
      },
    };

    const list = [...this.getWorkspaces()];
    list.unshift(workspace);
    if (list.length > 50) list.pop();
    this.store.set("workspaces", list);
    this.store.set("activeWorkspaceId", id);
    return workspace;
  }

  updateWorkspace(id, partial = {}) {
    const list = [...this.getWorkspaces()];
    const index = list.findIndex(w => w.id === id);
    if (index === -1) return null;

    const target = { ...list[index] };
    if (partial.urls) {
      target.urls = { ...target.urls, ...partial.urls };
      delete partial.urls;
    }
    Object.assign(target, partial, { updatedAt: new Date().toISOString() });
    list[index] = target;
    this.store.set("workspaces", list);
    return target;
  }

  captureActiveUrls(workspaceId) {
    const views = this.getViews();
    const urls = {};
    for (const [platform, item] of Object.entries(views)) {
      try {
        if (item && item.view && !item.view.webContents.isDestroyed()) {
          const url = item.view.webContents.getURL();
          if (url && !url.endsWith(".com/") && !url.endsWith(".ai/") && !url.endsWith("/app") && !url.includes("/new")) {
            urls[platform] = url;
          }
        }
      } catch (e) {}
    }
    if (workspaceId && Object.keys(urls).length > 0) {
      this.updateWorkspace(workspaceId, { urls });
    }
    return urls;
  }

  async switchWorkspace(workspaceId) {
    const list = this.getWorkspaces();
    const target = list.find(w => w.id === workspaceId);
    if (!target) return { success: false, message: "Workspace not found" };

    const views = this.getViews();
    const results = {};

    for (const [platform, url] of Object.entries(target.urls || {})) {
      if (url && views[platform]) {
        try {
          views[platform].view.webContents.loadURL(url);
          results[platform] = { loaded: true, url };
        } catch (e) {
          results[platform] = { loaded: false, error: e.message };
        }
      }
    }

    this.store.set("activeWorkspaceId", workspaceId);
    return { success: true, workspace: target, results };
  }

  deleteWorkspace(workspaceId) {
    let list = this.getWorkspaces();
    list = list.filter(w => w.id !== workspaceId);
    this.store.set("workspaces", list);
    if (this.getActiveWorkspaceId() === workspaceId) {
      this.store.set("activeWorkspaceId", list[0]?.id || null);
    }
    return { success: true };
  }

  async applyInPageRenaming(platform, title) {
    const views = this.getViews();
    const item = views[platform];
    if (!item) return { ok: false, error: "Platform not found" };

    const script = `(function() {
      try {
        document.title = ${JSON.stringify(title)} + " - " + ${JSON.stringify(platform.toUpperCase())};
        if (location.hostname.includes("chatgpt.com")) {
          const m = location.pathname.match(/\\/c\\/([a-zA-Z0-9-]+)/);
          if (m) {
            fetch("/backend-api/conversation/" + m[1], {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: ${JSON.stringify(title)} })
            }).catch(() => {});
          }
        }
        return { ok: true, title: ${JSON.stringify(title)} };
      } catch(e) {
        return { ok: false, error: e.message };
      }
    })()`;

    try {
      return await item.view.webContents.executeJavaScript(script);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

module.exports = {
  TYPE_KEYWORDS,
  getTaiwanMMDD,
  inferType,
  extractTopic,
  createSemanticTitle,
  SessionManager,
};
