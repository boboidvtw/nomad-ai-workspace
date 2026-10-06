/**
 * Nomad AI Studio - Unified Session & Workspace Manager
 * Implements MMDD | 類型 | 主題 semantic naming, full-text dialogue search,
 * and cross-platform workspace synchronization.
 * Governed by AGENTS.md Section 7.
 */

const { store } = require("./store");
const { VectorMemoryLite } = require("@nomad/core");

const SEMANTIC_TYPES = [
  "功能",
  "修復",
  "設計",
  "優化",
  "文件",
  "探索",
  "研究",
  "發布",
];

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
 * Parse canonical semantic title format: MMDD | 類型 | 主題
 */
function parseSemanticTitle(title) {
  if (!title || typeof title !== "string") return null;
  const match = title.match(/^(\d{4})\s*\|\s*([^|]+)\s*\|\s*(.+)$/);
  if (!match) return null;
  const date = match[1];
  const type = match[2].trim();
  const topic = match[3].trim();
  return {
    date,
    type,
    topic,
    isCanonical: SEMANTIC_TYPES.includes(type),
  };
}

/**
 * Get guaranteed semantic type for a workspace
 */
function getWorkspaceType(workspace) {
  if (!workspace) return "設計";
  const title = workspace.title || "";
  const parsed = parseSemanticTitle(title);
  if (parsed && SEMANTIC_TYPES.includes(parsed.type)) {
    return parsed.type;
  }
  for (const t of SEMANTIC_TYPES) {
    if (title.includes(t)) return t;
  }
  return inferType(title + " " + (workspace.promptSnippet || ""));
}

/**
 * Extract context snippet centered around query tokens
 */
function extractMatchSnippet(text, tokens = [], maxChars = 100) {
  if (!text || typeof text !== "string") return "";
  const lower = text.toLowerCase();
  let firstIdx = -1;
  let matchLen = 0;
  for (const token of tokens) {
    const idx = lower.indexOf(token.toLowerCase());
    if (idx !== -1 && (firstIdx === -1 || idx < firstIdx)) {
      firstIdx = idx;
      matchLen = token.length;
    }
  }
  if (firstIdx === -1) {
    return text.length > maxChars ? text.slice(0, maxChars) + "..." : text;
  }
  const half = Math.floor(maxChars / 2);
  let start = Math.max(0, firstIdx - half);
  let end = Math.min(text.length, firstIdx + matchLen + half);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
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
      history: [],
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

  /**
   * Add a completed turn to a workspace's history
   */
  addTurn(workspaceId, turn = {}) {
    const list = [...this.getWorkspaces()];
    const index = list.findIndex(w => w.id === workspaceId);
    if (index === -1) return null;

    const target = { ...list[index] };
    const history = Array.isArray(target.history) ? [...target.history] : [];

    const normalizedTurn = {
      speaker: turn.speaker || "AI",
      round: Number(turn.round) || 1,
      type: turn.type || "turn-complete",
      content: String(turn.content || turn.response || turn.responseSnippet || "").trim(),
      timestamp: turn.timestamp || new Date().toISOString(),
    };

    history.push(normalizedTurn);
    if (history.length > 200) {
      history.shift();
    }

    target.history = history;
    target.turns = history.length;
    target.updatedAt = new Date().toISOString();

    list[index] = target;
    this.store.set("workspaces", list);
    return target;
  }

  /**
   * Deep full-text keyword search and semantic tag filter
   */
  searchWorkspaces(options = {}) {
    const rawQuery = (options.query || options.q || "").trim();
    const queryTokens = rawQuery ? rawQuery.toLowerCase().split(/\s+/).filter(Boolean) : [];
    const filterType = options.type ? options.type.trim() : "all";
    const filterMode = options.mode ? options.mode.trim() : "all";
    const limit = Math.max(1, Number(options.limit) || 50);

    const workspaces = this.getWorkspaces();
    const results = [];

    // Initialize VectorMemoryLite for CJK & BM25 hybrid semantic scoring
    const vectorIndex = new VectorMemoryLite();
    if (rawQuery) {
      for (const ws of workspaces) {
        const turnTexts = (ws.history || []).map(h => (h.speaker || '') + ': ' + (h.content || h.response || '')).join(' ');
        const fullDoc = [(ws.title || ''), (ws.promptSnippet || ''), turnTexts].join(' ');
        vectorIndex.addDocument({
          id: ws.id,
          title: ws.title || ws.id,
          content: fullDoc
        });
      }
    }
    const vectorSearchResults = rawQuery ? vectorIndex.search(rawQuery, { limit: 100 }) : null;
    const vectorScoreMap = new Map();
    if (vectorSearchResults && vectorSearchResults.success) {
      for (const hit of vectorSearchResults.data) {
        vectorScoreMap.set(hit.id, hit.score);
      }
    }

    for (const ws of workspaces) {
      const wsType = getWorkspaceType(ws);
      const wsMode = ws.mode || "relay";

      // 1. Tag / Type filter
      if (filterType !== "all" && filterType !== "") {
        const matchesType = (wsType === filterType) || (ws.title && ws.title.includes(filterType));
        if (!matchesType) continue;
      }

      // 2. Mode filter
      if (filterMode !== "all" && filterMode !== "") {
        if (wsMode !== filterMode) continue;
      }

      // 3. Keyword matching across title, prompt, urls, and conversation history turns
      const matches = [];
      let score = 0;

      if (queryTokens.length === 0) {
        // Matched by filter alone
        score = 10;
      } else {
        const titleLower = (ws.title || "").toLowerCase();
        const promptLower = (ws.promptSnippet || "").toLowerCase();
        const history = Array.isArray(ws.history) ? ws.history : [];

        let allTokensMatched = true;

        for (const token of queryTokens) {
          let tokenFound = false;

          // Check title
          if (titleLower.includes(token)) {
            tokenFound = true;
            score += 40;
            if (!matches.some(m => m.field === "title")) {
              matches.push({
                field: "title",
                value: ws.title,
                snippet: extractMatchSnippet(ws.title, queryTokens),
              });
            }
          }

          // Check prompt snippet
          if (promptLower.includes(token)) {
            tokenFound = true;
            score += 25;
            if (!matches.some(m => m.field === "prompt")) {
              matches.push({
                field: "prompt",
                value: ws.promptSnippet,
                snippet: extractMatchSnippet(ws.promptSnippet, queryTokens),
              });
            }
          }

          // Check URLs
          if (ws.urls && typeof ws.urls === "object") {
            for (const [platform, url] of Object.entries(ws.urls)) {
              if (url && url.toLowerCase().includes(token)) {
                tokenFound = true;
                score += 15;
                if (!matches.some(m => m.field === "url" && m.platform === platform)) {
                  matches.push({
                    field: "url",
                    platform,
                    value: url,
                  });
                }
              }
            }
          }

          // Check turns
          for (let i = 0; i < history.length; i++) {
            const turn = history[i];
            const content = turn.content || turn.response || "";
            const contentLower = content.toLowerCase();
            const speakerLower = (turn.speaker || "").toLowerCase();

            if (contentLower.includes(token) || speakerLower.includes(token)) {
              tokenFound = true;
              score += 20;
              matches.push({
                field: "turn",
                round: turn.round || 1,
                speaker: (turn.speaker || "AI").toUpperCase(),
                snippet: extractMatchSnippet(content, queryTokens),
                timestamp: turn.timestamp,
              });
            }
          }

          if (!tokenFound) {
            allTokensMatched = false;
            break;
          }
        }

        if (!allTokensMatched) {
          continue;
        }
      }

      // Recency weighting
      const updatedAtMs = ws.updatedAt ? new Date(ws.updatedAt).getTime() : 0;
      if (updatedAtMs > 0) {
        const hoursAgo = Math.max(0, (Date.now() - updatedAtMs) / (1000 * 3600));
        score += Math.max(0, 10 - Math.min(10, hoursAgo / 24));
      }

      // BM25 + CJK N-gram hybrid semantic boost
      const bm25Score = vectorScoreMap.get(ws.id) || 0;
      if (bm25Score > 0) {
        score += Math.round(bm25Score * 10);
      }

      results.push({
        workspace: ws,
        workspaceId: ws.id,
        title: ws.title,
        type: wsType,
        mode: ws.mode || "relay",
        matches,
        score,
      });
    }

    // Sort by relevance score, then by update time
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const bTime = b.workspace.updatedAt ? new Date(b.workspace.updatedAt).getTime() : 0;
      const aTime = a.workspace.updatedAt ? new Date(a.workspace.updatedAt).getTime() : 0;
      return bTime - aTime;
    });

    const limited = results.slice(0, limit);

    return {
      success: true,
      totalCount: workspaces.length,
      matchCount: results.length,
      query: rawQuery,
      filterType,
      filterMode,
      workspaces: limited.map(r => r.workspace),
      results: limited,
    };
  }

  captureActiveUrls(workspaceId) {
    const views = this.getViews();
    const urls = {};
    for (const [platform, item] of Object.entries(views)) {
      try {
        if (item && item.view && !item.view.webContents.isDestroyed()) {
          const currentUrl = item.view.webContents.getURL();
          if (currentUrl && !currentUrl.startsWith("about:") && !currentUrl.startsWith("data:")) {
            urls[platform] = currentUrl;
          }
        }
      } catch (err) {
        console.warn(`[Nomad SessionManager] Failed to get URL for ${platform}:`, (err instanceof Error ? err.message : String(err)));
      }
    }
    return this.updateWorkspace(workspaceId, { urls });
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
          results[platform] = { loaded: false, error: (e instanceof Error ? e.message : String(e)) };
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

  exportWorkspaceAsJson(workspaceId) {
    const list = this.getWorkspaces();
    const ws = list.find(w => w.id === workspaceId);
    if (!ws) return null;
    return JSON.stringify(ws, null, 2);
  }

  exportAllWorkspacesAsJson() {
    const list = this.getWorkspaces();
    return JSON.stringify({
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      activeWorkspaceId: this.getActiveWorkspaceId(),
      workspaces: list,
    }, null, 2);
  }

  importWorkspacesFromJson(jsonStringOrObj) {
    let data;
    try {
      data = typeof jsonStringOrObj === "string" ? JSON.parse(jsonStringOrObj) : jsonStringOrObj;
    } catch (e) {
      return { success: false, error: "JSON 解析失敗: " + (e instanceof Error ? e.message : String(e)) };
    }

    let itemsToImport = [];
    if (Array.isArray(data)) {
      itemsToImport = data;
    } else if (data && Array.isArray(data.workspaces)) {
      itemsToImport = data.workspaces;
    } else if (data && typeof data === "object" && (data.title || data.id)) {
      itemsToImport = [data];
    } else {
      return { success: false, error: "無效的工作區資料格式" };
    }

    const currentList = [...this.getWorkspaces()];
    let importedCount = 0;

    for (const item of itemsToImport) {
      if (!item || typeof item !== "object") continue;
      const id = item.id || ("ws-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4));
      const title = item.title || createSemanticTitle(item.promptSnippet || "匯入會話");
      const normalized = {
        id,
        title,
        promptSnippet: item.promptSnippet || "",
        mode: item.mode || "relay",
        sequence: Array.isArray(item.sequence) ? item.sequence : ["claude", "chatgpt"],
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completed: Boolean(item.completed),
        turns: Number(item.turns) || 0,
        history: Array.isArray(item.history) ? item.history : [],
        urls: {
          claude: item.urls?.claude || "",
          chatgpt: item.urls?.chatgpt || "",
          gemini: item.urls?.gemini || "",
          grok: item.urls?.grok || "",
        },
      };

      const existingIdx = currentList.findIndex(w => w.id === id);
      if (existingIdx >= 0) {
        currentList[existingIdx] = { ...currentList[existingIdx], ...normalized };
      } else {
        currentList.unshift(normalized);
      }
      importedCount++;
    }

    if (currentList.length > 100) {
      currentList.length = 100;
    }

    this.store.set("workspaces", currentList);
    if (!this.getActiveWorkspaceId() && currentList.length > 0) {
      this.store.set("activeWorkspaceId", currentList[0].id);
    }

    return {
      success: true,
      importedCount,
      totalCount: currentList.length,
      activeWorkspaceId: this.getActiveWorkspaceId(),
    };
  }

  exportOrchestrationHistoryAsMarkdown({ title, mode = "relay", sequence = [], history = [] }) {
    const dateStr = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
    const modeMap = { relay: "🔄 任務接力 (Relay)", debate: "⚔️ 交叉辯論 (Debate)", master: "👑 主控分工 (Master)" };
    const modeName = modeMap[mode] || mode;

    let md = "# 🤝 多 AI 圓桌協作對話報告：" + (title || "未命名任務") + "\n\n";
    md += "- **產出時間**：" + dateStr + " (UTC+8)\n";
    md += "- **協作架構**：" + modeName + "\n";
    md += "- **協作序列**：" + sequence.map(s => s.toUpperCase()).join(" ➔ ") + "\n";
    md += "- **紀錄總筆數**：" + history.length + " 條\n\n";
    md += "---\n\n";

    const userPrompt = history.find(h => h.type === "user-prompt" || h.speaker === "user");
    if (userPrompt) {
      md += "## 🎯 初始協作目標與議題\n\n```\n" + (userPrompt.content || "") + "\n```\n\n---\n\n";
    }

    md += "## 💬 多平臺階段性發言與交接歷史\n\n";

    const aiTurns = history.filter(h => h.type !== "user-prompt" && h.speaker !== "user");
    if (aiTurns.length === 0) {
      md += "*(尚未產生 AI 發言紀錄)*\n";
    } else {
      aiTurns.forEach((item, idx) => {
        const speaker = (item.speaker || "AI").toUpperCase();
        const roundText = item.round ? "【第 " + item.round + " 輪】" : "";
        const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString("zh-TW", { hour12: false }) : "";
        md += "### " + (idx + 1) + ". " + roundText + " 🤖 " + speaker + " (" + time + ")\n\n";
        md += (item.content || item.response || "") + "\n\n";
        md += "---\n\n";
      });
    }

    md += "\n> 本報告由 **Nomad AI Studio** 自動匯出生成 · 跨平臺 AI 協同工作站\n";
    return md;
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
      return { ok: false, error: (e instanceof Error ? e.message : String(e)) };
    }
  }
}

module.exports = {
  SEMANTIC_TYPES,
  TYPE_KEYWORDS,
  getTaiwanMMDD,
  inferType,
  extractTopic,
  parseSemanticTitle,
  getWorkspaceType,
  extractMatchSnippet,
  createSemanticTitle,
  SessionManager,
};
