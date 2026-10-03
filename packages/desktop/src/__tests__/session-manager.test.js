const test = require("node:test");
const assert = require("node:assert");
const {
  getTaiwanMMDD,
  inferType,
  extractTopic,
  createSemanticTitle,
  SessionManager,
} = require("../session-manager.js");

test("SessionManager: getTaiwanMMDD returns 4-digit format", () => {
  const mmdd = getTaiwanMMDD();
  assert.match(mmdd, /^\d{4}$/);
});

test("SessionManager: inferType accurately classifies intent into strict types", () => {
  assert.strictEqual(inferType("請幫忙修復登入逾時的 bug"), "修復");
  assert.strictEqual(inferType("優化資料庫查詢效能並重構連線池"), "優化");
  assert.strictEqual(inferType("設計一套分散式高可用限流架構"), "設計");
  assert.strictEqual(inferType("整理 API 規格文件與 README"), "文件");
  assert.strictEqual(inferType("探索 WebAssembly 在瀏覽器的可行性 POC"), "探索");
  assert.strictEqual(inferType("調研並審計競品生態與開源方案"), "研究");
  assert.strictEqual(inferType("自動化建置與 Kubernetes 部署發布流程"), "發布");
  assert.strictEqual(inferType("實作全新使用者登入介面與模組"), "功能");
});

test("SessionManager: extractTopic cleans prefixes and enforces 4-15 character bounds", () => {
  const t1 = extractTopic("請以資深分散式架構師視角，設計一套百萬級 QPS 秒殺搶票系統");
  assert.ok(t1.length >= 4 && t1.length <= 15, `Length was ${t1.length}: ${t1}`);

  const t2 = extractTopic("優化連線");
  assert.ok(t2.length >= 4 && t2.length <= 15);
});

test("SessionManager: createSemanticTitle generates MMDD | 類型 | 主題", () => {
  const title = createSemanticTitle("設計百萬級高併發秒殺搶票系統");
  const parts = title.split(" | ");
  assert.strictEqual(parts.length, 3);
  assert.match(parts[0], /^\d{4}$/);
  assert.strictEqual(parts[1], "設計");
  assert.ok(parts[2].length >= 4 && parts[2].length <= 15);
});

test("SessionManager: workspace lifecycle (create, update, switch, delete)", async () => {
  const mockStoreData = { workspaces: [] };
  const mockStore = {
    get: (k) => mockStoreData[k],
    set: (k, v) => { mockStoreData[k] = v; return v; },
  };

  const loadedUrls = {};
  const mockViews = {
    claude: { view: { webContents: { isDestroyed: () => false, getURL: () => "https://claude.ai/chat/c1", loadURL: (u) => { loadedUrls.claude = u; } } } },
    chatgpt: { view: { webContents: { isDestroyed: () => false, getURL: () => "https://chatgpt.com/c/g1", loadURL: (u) => { loadedUrls.chatgpt = u; } } } },
  };

  const mgr = new SessionManager({
    store: mockStore,
    getViews: () => mockViews,
  });

  // 1. Create
  const ws = mgr.createWorkspace({
    prompt: "設計一套高可用秒殺架構",
    mode: "relay",
    sequence: ["claude", "chatgpt"],
  });

  assert.ok(ws.id.startsWith("ws-"));
  assert.ok(ws.title.includes("設計"));
  assert.strictEqual(mgr.getWorkspaces().length, 1);
  assert.strictEqual(mgr.getActiveWorkspaceId(), ws.id);

  // 2. Capture URLs
  mgr.captureActiveUrls(ws.id);
  const updated = mgr.getWorkspaces()[0];
  assert.strictEqual(updated.urls.claude, "https://claude.ai/chat/c1");
  assert.strictEqual(updated.urls.chatgpt, "https://chatgpt.com/c/g1");

  // 3. Switch workspace
  const switchRes = await mgr.switchWorkspace(ws.id);
  assert.strictEqual(switchRes.success, true);
  assert.strictEqual(loadedUrls.claude, "https://claude.ai/chat/c1");
  assert.strictEqual(loadedUrls.chatgpt, "https://chatgpt.com/c/g1");

  // 4. Delete workspace
  const delRes = mgr.deleteWorkspace(ws.id);
  assert.strictEqual(delRes.success, true);
  assert.strictEqual(mgr.getWorkspaces().length, 0);
});


test("SessionManager: export and import workspaces via JSON", () => {
  const mockStoreData = { workspaces: [] };
  const mockStore = {
    get: (k) => mockStoreData[k],
    set: (k, v) => { mockStoreData[k] = v; return v; },
  };

  const mgr = new SessionManager({ store: mockStore });
  const ws1 = mgr.createWorkspace({
    prompt: "實作使用者驗證模組",
    mode: "relay",
    sequence: ["claude", "chatgpt"],
  });

  // Export single
  const jsonSingle = mgr.exportWorkspaceAsJson(ws1.id);
  assert.ok(jsonSingle.includes(ws1.id));
  assert.ok(jsonSingle.includes("實作"));

  // Export all
  const jsonAll = mgr.exportAllWorkspacesAsJson();
  const parsedAll = JSON.parse(jsonAll);
  assert.strictEqual(parsedAll.workspaces.length, 1);
  assert.strictEqual(parsedAll.version, "1.0.0");

  // Import into new manager
  const newStoreData = { workspaces: [] };
  const newMgr = new SessionManager({
    store: {
      get: (k) => newStoreData[k],
      set: (k, v) => { newStoreData[k] = v; return v; }
    }
  });

  const importRes = newMgr.importWorkspacesFromJson(jsonAll);
  assert.strictEqual(importRes.success, true);
  assert.strictEqual(importRes.importedCount, 1);
  assert.strictEqual(newMgr.getWorkspaces().length, 1);
  assert.strictEqual(newMgr.getWorkspaces()[0].id, ws1.id);
});

test("SessionManager: exportOrchestrationHistoryAsMarkdown formats report with timestamps and turns", () => {
  const mgr = new SessionManager();
  const md = mgr.exportOrchestrationHistoryAsMarkdown({
    title: "1003 | 設計 | 快取系統",
    mode: "debate",
    sequence: ["claude", "chatgpt"],
    history: [
      { type: "user-prompt", speaker: "user", content: "請討論快取穿透防禦" },
      { type: "turn-complete", speaker: "claude", round: 1, content: "建議使用布隆過濾器 (Bloom Filter)" },
      { type: "turn-complete", speaker: "chatgpt", round: 1, content: "補充：需注意布隆過濾器無法刪除元素之缺陷，建議結合布穀鳥過濾器" },
    ]
  });

  assert.ok(md.includes("多 AI 圓桌協作對話報告：1003 | 設計 | 快取系統"));
  assert.ok(md.includes("交叉辯論"));
  assert.ok(md.includes("請討論快取穿透防禦"));
  assert.ok(md.includes("布隆過濾器"));
  assert.ok(md.includes("布穀鳥過濾器"));
  assert.ok(md.includes("CLAUDE"));
  assert.ok(md.includes("CHATGPT"));
});
