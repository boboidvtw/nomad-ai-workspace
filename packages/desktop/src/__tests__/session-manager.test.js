const test = require('node:test');
const assert = require('node:assert');
const {
  getTaiwanMMDD,
  inferType,
  extractTopic,
  createSemanticTitle,
  SessionManager,
} = require('../session-manager.js');

test('SessionManager: getTaiwanMMDD returns 4-digit format', () => {
  const mmdd = getTaiwanMMDD();
  assert.match(mmdd, /^\d{4}$/);
});

test('SessionManager: inferType accurately classifies intent into strict types', () => {
  assert.strictEqual(inferType('請幫忙修復登入逾時的 bug'), '修復');
  assert.strictEqual(inferType('優化資料庫查詢效能並重構連線池'), '優化');
  assert.strictEqual(inferType('設計一套分散式高可用限流架構'), '設計');
  assert.strictEqual(inferType('整理 API 規格文件與 README'), '文件');
  assert.strictEqual(inferType('探索 WebAssembly 在瀏覽器的可行性 POC'), '探索');
  assert.strictEqual(inferType('調研並審計競品生態與開源方案'), '研究');
  assert.strictEqual(inferType('自動化建置與 Kubernetes 部署發布流程'), '發布');
  assert.strictEqual(inferType('實作全新使用者登入介面與模組'), '功能');
});

test('SessionManager: extractTopic cleans prefixes and enforces 4-15 character bounds', () => {
  const t1 = extractTopic('請以資深分散式架構師視角，設計一套百萬級 QPS 秒殺搶票系統');
  assert.ok(t1.length >= 4 && t1.length <= 15, `Length was ${t1.length}: ${t1}`);

  const t2 = extractTopic('優化連線');
  assert.ok(t2.length >= 4 && t2.length <= 15);
});

test('SessionManager: createSemanticTitle generates MMDD | 類型 | 主題', () => {
  const title = createSemanticTitle('設計百萬級高併發秒殺搶票系統');
  const parts = title.split(' | ');
  assert.strictEqual(parts.length, 3);
  assert.match(parts[0], /^\d{4}$/);
  assert.strictEqual(parts[1], '設計');
  assert.ok(parts[2].length >= 4 && parts[2].length <= 15);
});

test('SessionManager: workspace lifecycle (create, update, switch, delete)', async () => {
  const mockStoreData = { workspaces: [] };
  const mockStore = {
    get: (k) => mockStoreData[k],
    set: (k, v) => {
      mockStoreData[k] = v;
      return v;
    },
  };

  const loadedUrls = {};
  const mockViews = {
    claude: {
      view: {
        webContents: {
          isDestroyed: () => false,
          getURL: () => 'https://claude.ai/chat/c1',
          loadURL: (u) => {
            loadedUrls.claude = u;
          },
        },
      },
    },
    chatgpt: {
      view: {
        webContents: {
          isDestroyed: () => false,
          getURL: () => 'https://chatgpt.com/c/g1',
          loadURL: (u) => {
            loadedUrls.chatgpt = u;
          },
        },
      },
    },
  };

  const mgr = new SessionManager({
    store: mockStore,
    getViews: () => mockViews,
  });

  // 1. Create
  const ws = mgr.createWorkspace({
    prompt: '設計一套高可用秒殺架構',
    mode: 'relay',
    sequence: ['claude', 'chatgpt'],
  });

  assert.ok(ws.id.startsWith('ws-'));
  assert.ok(ws.title.includes('設計'));
  assert.strictEqual(mgr.getWorkspaces().length, 1);
  assert.strictEqual(mgr.getActiveWorkspaceId(), ws.id);

  // 2. Capture URLs
  mgr.captureActiveUrls(ws.id);
  const updated = mgr.getWorkspaces()[0];
  assert.strictEqual(updated.urls.claude, 'https://claude.ai/chat/c1');
  assert.strictEqual(updated.urls.chatgpt, 'https://chatgpt.com/c/g1');

  // 3. Switch workspace
  const switchRes = await mgr.switchWorkspace(ws.id);
  assert.strictEqual(switchRes.success, true);
  assert.strictEqual(loadedUrls.claude, 'https://claude.ai/chat/c1');
  assert.strictEqual(loadedUrls.chatgpt, 'https://chatgpt.com/c/g1');

  // 4. Delete workspace
  const delRes = mgr.deleteWorkspace(ws.id);
  assert.strictEqual(delRes.success, true);
  assert.strictEqual(mgr.getWorkspaces().length, 0);
});

test('SessionManager: export and import workspaces via JSON', () => {
  const mockStoreData = { workspaces: [] };
  const mockStore = {
    get: (k) => mockStoreData[k],
    set: (k, v) => {
      mockStoreData[k] = v;
      return v;
    },
  };

  const mgr = new SessionManager({ store: mockStore });
  const ws1 = mgr.createWorkspace({
    prompt: '實作使用者驗證模組',
    mode: 'relay',
    sequence: ['claude', 'chatgpt'],
  });

  // Export single
  const jsonSingle = mgr.exportWorkspaceAsJson(ws1.id);
  assert.ok(jsonSingle.includes(ws1.id));
  assert.ok(jsonSingle.includes('實作'));

  // Export all
  const jsonAll = mgr.exportAllWorkspacesAsJson();
  const parsedAll = JSON.parse(jsonAll);
  assert.strictEqual(parsedAll.workspaces.length, 1);
  assert.strictEqual(parsedAll.version, '1.0.0');

  // Import into new manager
  const newStoreData = { workspaces: [] };
  const newMgr = new SessionManager({
    store: {
      get: (k) => newStoreData[k],
      set: (k, v) => {
        newStoreData[k] = v;
        return v;
      },
    },
  });

  const importRes = newMgr.importWorkspacesFromJson(jsonAll);
  assert.strictEqual(importRes.success, true);
  assert.strictEqual(importRes.importedCount, 1);
  assert.strictEqual(newMgr.getWorkspaces().length, 1);
  assert.strictEqual(newMgr.getWorkspaces()[0].id, ws1.id);
});

test('SessionManager: exportOrchestrationHistoryAsMarkdown formats report with timestamps and turns', () => {
  const mgr = new SessionManager();
  const md = mgr.exportOrchestrationHistoryAsMarkdown({
    title: '1003 | 設計 | 快取系統',
    mode: 'debate',
    sequence: ['claude', 'chatgpt'],
    history: [
      { type: 'user-prompt', speaker: 'user', content: '請討論快取穿透防禦' },
      {
        type: 'turn-complete',
        speaker: 'claude',
        round: 1,
        content: '建議使用布隆過濾器 (Bloom Filter)',
      },
      {
        type: 'turn-complete',
        speaker: 'chatgpt',
        round: 1,
        content: '補充：需注意布隆過濾器無法刪除元素之缺陷，建議結合布穀鳥過濾器',
      },
    ],
  });

  assert.ok(md.includes('多 AI 圓桌協作對話報告：1003 | 設計 | 快取系統'));
  assert.ok(md.includes('交叉辯論'));
  assert.ok(md.includes('請討論快取穿透防禦'));
  assert.ok(md.includes('布隆過濾器'));
  assert.ok(md.includes('布穀鳥過濾器'));
  assert.ok(md.includes('CLAUDE'));
  assert.ok(md.includes('CHATGPT'));
});

test('SessionManager: parseSemanticTitle parses standard format', () => {
  const { parseSemanticTitle } = require('../session-manager.js');
  const p1 = parseSemanticTitle('1003 | 功能 | 全文搜尋實作');
  assert.strictEqual(p1.date, '1003');
  assert.strictEqual(p1.type, '功能');
  assert.strictEqual(p1.topic, '全文搜尋實作');
  assert.strictEqual(p1.isCanonical, true);

  const p2 = parseSemanticTitle('非標準標題');
  assert.strictEqual(p2, null);
});

test('SessionManager: getWorkspaceType identifies 8 semantic types or falls back gracefully', () => {
  const { getWorkspaceType } = require('../session-manager.js');
  assert.strictEqual(getWorkspaceType({ title: '1003 | 修復 | 登入異常' }), '修復');
  assert.strictEqual(getWorkspaceType({ title: '1003 | 優化 | 查詢效能' }), '優化');
  assert.strictEqual(getWorkspaceType({ title: '1003 | 文件 | 架構手冊' }), '文件');
  assert.strictEqual(getWorkspaceType({ title: '1003 | 探索 | WebGPU試驗' }), '探索');
  assert.strictEqual(getWorkspaceType({ title: '1003 | 研究 | 競品調研' }), '研究');
  assert.strictEqual(getWorkspaceType({ title: '1003 | 發布 | 部署流程' }), '發布');
  assert.strictEqual(getWorkspaceType({ title: '1003 | 功能 | 搜尋過濾' }), '功能');
  assert.strictEqual(getWorkspaceType({ title: '1003 | 設計 | 系統拓撲' }), '設計');
  assert.strictEqual(getWorkspaceType({ title: '修復連線錯誤' }), '修復');
});

test('SessionManager: addTurn appends dialogue turns and updates timestamp and count', () => {
  const mockStoreData = { workspaces: [] };
  const mockStore = {
    get: (k) => mockStoreData[k],
    set: (k, v) => {
      mockStoreData[k] = v;
      return v;
    },
  };

  const mgr = new SessionManager({ store: mockStore });
  const ws = mgr.createWorkspace({ prompt: '測試發言' });

  const updated = mgr.addTurn(ws.id, {
    speaker: 'claude',
    round: 1,
    content: 'Claude 提出了架構設計方案',
  });

  assert.strictEqual(updated.turns, 1);
  assert.strictEqual(updated.history.length, 1);
  assert.strictEqual(updated.history[0].speaker, 'claude');
  assert.strictEqual(updated.history[0].content, 'Claude 提出了架構設計方案');

  // Add second turn
  const updated2 = mgr.addTurn(ws.id, {
    speaker: 'chatgpt',
    round: 1,
    content: 'ChatGPT 進行了程式碼審查與補充',
  });

  assert.strictEqual(updated2.turns, 2);
  assert.strictEqual(updated2.history.length, 2);
  assert.strictEqual(updated2.history[1].speaker, 'chatgpt');
});

test('SessionManager: searchWorkspaces performs keyword full-text search and tag filtering', () => {
  const mockStoreData = { workspaces: [] };
  const mockStore = {
    get: (k) => mockStoreData[k],
    set: (k, v) => {
      mockStoreData[k] = v;
      return v;
    },
  };

  const mgr = new SessionManager({ store: mockStore });

  // Workspace 1: Bugfix
  const ws1 = mgr.createWorkspace({
    title: '1003 | 修復 | 修正資料庫逾時錯誤',
    prompt: '處理連線池逾時 bug',
    mode: 'relay',
  });
  mgr.addTurn(ws1.id, {
    speaker: 'claude',
    round: 1,
    content: '診斷發現是 PostgreSQL 連線未正確釋放导致死鎖',
  });

  // Workspace 2: Feature
  const ws2 = mgr.createWorkspace({
    title: '1003 | 功能 | 新增全文搜尋與標籤過濾',
    prompt: '實作跨平臺會話全文搜尋與 8 大語義標籤過濾',
    mode: 'debate',
  });
  mgr.addTurn(ws2.id, {
    speaker: 'chatgpt',
    round: 1,
    content: '建議使用高效 Token 分詞搭配 Snippet 邊界截取演算法',
  });

  // 1. Search by title keyword
  const resTitle = mgr.searchWorkspaces({ query: '資料庫' });
  assert.strictEqual(resTitle.success, true);
  assert.strictEqual(resTitle.matchCount, 1);
  assert.strictEqual(resTitle.results[0].workspaceId, ws1.id);
  assert.strictEqual(resTitle.results[0].matches[0].field, 'title');

  // 2. Deep full-text search inside dialogue turns
  const resTurn = mgr.searchWorkspaces({ query: 'PostgreSQL' });
  assert.strictEqual(resTurn.matchCount, 1);
  assert.strictEqual(resTurn.results[0].workspaceId, ws1.id);
  const turnMatch = resTurn.results[0].matches.find((m) => m.field === 'turn');
  assert.ok(turnMatch);
  assert.strictEqual(turnMatch.speaker, 'CLAUDE');
  assert.ok(turnMatch.snippet.includes('PostgreSQL'));

  // 3. Search another turn keyword
  const resTurn2 = mgr.searchWorkspaces({ query: '邊界截取' });
  assert.strictEqual(resTurn2.matchCount, 1);
  assert.strictEqual(resTurn2.results[0].workspaceId, ws2.id);

  // 4. Tag / Type filtering
  const resTypeFix = mgr.searchWorkspaces({ type: '修復' });
  assert.strictEqual(resTypeFix.matchCount, 1);
  assert.strictEqual(resTypeFix.results[0].workspaceId, ws1.id);

  const resTypeFeat = mgr.searchWorkspaces({ type: '功能' });
  assert.strictEqual(resTypeFeat.matchCount, 1);
  assert.strictEqual(resTypeFeat.results[0].workspaceId, ws2.id);

  // 5. Combined query and tag filtering
  const resCombined = mgr.searchWorkspaces({ query: '搜尋', type: '功能' });
  assert.strictEqual(resCombined.matchCount, 1);
  assert.strictEqual(resCombined.results[0].workspaceId, ws2.id);

  const resMismatch = mgr.searchWorkspaces({ query: '搜尋', type: '修復' });
  assert.strictEqual(resMismatch.matchCount, 0);

  // 6. Mode filtering
  const resMode = mgr.searchWorkspaces({ mode: 'debate' });
  assert.strictEqual(resMode.matchCount, 1);
  assert.strictEqual(resMode.results[0].workspaceId, ws2.id);
});

test('SessionManager: searchWorkspaces uses VectorMemoryLite BM25 to score semantic matches', () => {
  const mockStoreData = { workspaces: [] };
  const mockStore = {
    get: (k) => mockStoreData[k],
    set: (k, v) => {
      mockStoreData[k] = v;
      return v;
    },
  };

  const mgr = new SessionManager({ store: mockStore });
  const ws = mgr.createWorkspace({
    title: '1003 | 探索 | 向量檢索演算法評估',
    prompt: '評估 BM25 與 CJK N-gram 分詞在本地端記憶體的查詢表現',
  });

  const res = mgr.searchWorkspaces({ query: '向量檢索演算法' });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.matchCount, 1);
  assert.ok(res.results[0].score > 30);
});
