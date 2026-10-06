process.env.NOMAD_DAEMON_TOKEN = 'test-token-0123456789abcdef0123456789abcdef';
const AUTH = { Authorization: 'Bearer ' + process.env.NOMAD_DAEMON_TOKEN };
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert');
const { LocalSyncBridge } = require('../bridge.js');

test('Bridge: Starts and serves /api/status without wildcard CORS', async () => {
  const bridge = new LocalSyncBridge({
    port: 19876,
    host: '127.0.0.1',
    getStatus: () => ({ layout: 'dual', activePlatforms: ['claude', 'chatgpt'] }),
  });

  const { url } = await bridge.start();

  try {
    const res = await fetch(`${url}/api/status`, { headers: AUTH });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);

    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.app, 'Nomad AI Studio');
    assert.strictEqual(json.data.layout, 'dual');
    assert.deepStrictEqual(json.data.activePlatforms, ['claude', 'chatgpt']);
  } finally {
    await bridge.stop();
  }
});

test('Bridge: Dispatches prompt and validates inputs', async () => {
  let receivedPrompt = null;
  let receivedTargets = null;

  const bridge = new LocalSyncBridge({
    port: 19877,
    host: '127.0.0.1',
    onDispatchPrompt: async ({ prompt, targets }) => {
      receivedPrompt = prompt;
      receivedTargets = targets;
      return { ok: true };
    },
  });

  const { url } = await bridge.start();

  try {
    // 1. Invalid empty prompt test
    const errRes = await fetch(`${url}/api/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH },
      body: JSON.stringify({ prompt: '   ' }),
    });
    assert.strictEqual(errRes.status, 400);
    const errJson = await errRes.json();
    assert.strictEqual(errJson.success, false);
    assert.strictEqual(errJson.errorCode, 'BRIDGE_DISPATCH_EMPTY_PROMPT_001');

    // 2. Valid prompt dispatch test
    const okRes = await fetch(`${url}/api/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH },
      body: JSON.stringify({ prompt: 'Hello AI Studio!', targets: ['claude', 'gemini'] }),
    });
    assert.strictEqual(okRes.status, 200);
    const okJson = await okRes.json();
    assert.strictEqual(okJson.success, true);
    assert.strictEqual(receivedPrompt, 'Hello AI Studio!');
    assert.deepStrictEqual(receivedTargets, ['claude', 'gemini']);
  } finally {
    await bridge.stop();
  }
});

test('Bridge: Layout, Zoom and Window control endpoints', async () => {
  let layoutSet = null;
  let zoomSet = null;
  let windowAction = null;

  const bridge = new LocalSyncBridge({
    port: 19878,
    host: '127.0.0.1',
    onSetLayout: (data) => { layoutSet = data; return { layout: data.layout }; },
    onSetZoom: (data) => { zoomSet = data; return { zoom: data.factor }; },
    onToggleWindow: (action) => { windowAction = action; return { action, visible: true }; },
  });

  const { url } = await bridge.start();

  try {
    // Layout
    const lRes = await fetch(`${url}/api/layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH },
      body: JSON.stringify({ layout: 'quad' }),
    });
    const lJson = await lRes.json();
    assert.strictEqual(lJson.success, true);
    assert.strictEqual(layoutSet.layout, 'quad');

    // Zoom
    const zRes = await fetch(`${url}/api/zoom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH },
      body: JSON.stringify({ platform: 'chatgpt', factor: 1.1 }),
    });
    const zJson = await zRes.json();
    assert.strictEqual(zJson.success, true);
    assert.strictEqual(zoomSet.platform, 'chatgpt');

    // Window
    const wRes = await fetch(`${url}/api/window`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH },
      body: JSON.stringify({ action: 'show' }),
    });
    const wJson = await wRes.json();
    assert.strictEqual(wJson.success, true);
    assert.strictEqual(windowAction, 'show');
  } finally {
    await bridge.stop();
  }
});

test('Bridge: Orchestration endpoints (status, start, pause, resume, stop)', async () => {
  let startedWith = null;
  const mockOrch = {
    getStatus: () => ({ status: 'idle', round: 1 }),
    start: async (opts) => { startedWith = opts; return { success: true, data: { started: true } }; },
    pause: () => ({ success: true, status: 'paused' }),
    resume: () => ({ success: true, status: 'running' }),
    stop: () => ({ success: true, status: 'stopped' }),
  };

  const bridge = new LocalSyncBridge({
    port: 19879,
    host: '127.0.0.1',
    orchestrator: mockOrch,
  });

  const { url } = await bridge.start();

  try {
    // 1. Status
    const stRes = await fetch(`${url}/api/orchestration/status`, { headers: AUTH });
    const stJson = await stRes.json();
    assert.strictEqual(stJson.success, true);
    assert.strictEqual(stJson.data.status, 'idle');

    // 2. Start
    const startRes = await fetch(`${url}/api/orchestration/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH },
      body: JSON.stringify({ prompt: 'Orchestration prompt', sequence: ['claude', 'chatgpt'] }),
    });
    const startJson = await startRes.json();
    assert.strictEqual(startJson.success, true);
    assert.strictEqual(startedWith.prompt, 'Orchestration prompt');

    // 3. Pause, Resume, Stop
    const pRes = await fetch(`${url}/api/orchestration/pause`, { method: 'POST', headers: AUTH });
    assert.strictEqual((await pRes.json()).status, 'paused');

    const rRes = await fetch(`${url}/api/orchestration/resume`, { method: 'POST', headers: AUTH });
    assert.strictEqual((await rRes.json()).status, 'running');

    const sRes = await fetch(`${url}/api/orchestration/stop`, { method: 'POST', headers: AUTH });
    assert.strictEqual((await sRes.json()).status, 'stopped');
  } finally {
    await bridge.stop();
  }
});


test("Bridge: Workspaces and Orchestration Export/Import endpoints", async () => {
  const { SessionManager } = require("../session-manager");
  const mockStoreData = { workspaces: [] };
  const sessionManager = new SessionManager({
    store: {
      get: (k) => mockStoreData[k],
      set: (k, v) => { mockStoreData[k] = v; return v; },
    }
  });

  const ws = sessionManager.createWorkspace({
    prompt: "設計全端分散式系統",
    sequence: ["claude", "chatgpt"],
  });

  const mockOrch = {
    getStatus: () => ({ status: "completed", canonicalTitle: "1003 | 設計 | 全端分散式", mode: "relay", sequence: ["claude", "chatgpt"] }),
    history: [
      { type: "user-prompt", speaker: "user", content: "請架構系統" },
      { type: "turn-complete", speaker: "claude", round: 1, content: "Claude 方案 v1" },
    ]
  };

  const bridge = new LocalSyncBridge({
    port: 19880,
    host: "127.0.0.1",
    sessionManager,
    orchestrator: mockOrch,
  });

  const { url } = await bridge.start();

  try {
    // 1. Export workspaces JSON
    const expRes = await fetch(`${url}/api/workspaces/export`, { headers: AUTH });
    assert.strictEqual(expRes.status, 200);
    const expJson = await expRes.json();
    assert.strictEqual(expJson.success, true);
    assert.strictEqual(expJson.data.workspaces.length, 1);

    // 2. Export markdown
    const mdRes = await fetch(`${url}/api/orchestration/export-markdown`, { headers: AUTH });
    assert.strictEqual(mdRes.status, 200);
    const mdJson = await mdRes.json();
    assert.strictEqual(mdJson.success, true);
    assert.ok(mdJson.data.markdown.includes("Claude 方案 v1"));

    // 3. Export to file
    const fileRes = await fetch(`${url}/api/export-to-file`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH },
      body: JSON.stringify({ type: "markdown", content: mdJson.data.markdown, filename: "test_report" })
    });
    assert.strictEqual(fileRes.status, 200);
    const fileJson = await fileRes.json();
    assert.strictEqual(fileJson.success, true);
    assert.ok(fs.existsSync(fileJson.filePath));
    // Clean up test file
    fs.unlinkSync(fileJson.filePath);

    // 4. Import workspaces
    const impRes = await fetch(`${url}/api/workspaces/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH },
      body: JSON.stringify({
        data: [{ id: "ws-import-test", title: "1003 | 功能 | 匯入測試", promptSnippet: "匯入測試" }]
      })
    });
    assert.strictEqual(impRes.status, 200);
    const impJson = await impRes.json();
    assert.strictEqual(impJson.success, true);
    assert.strictEqual(impJson.importedCount, 1);

    // 5. Search workspaces via GET & POST
    const searchGetRes = await fetch(`${url}/api/workspaces/search?q=匯入測試&type=功能`, { headers: AUTH });
    assert.strictEqual(searchGetRes.status, 200);
    const searchGetJson = await searchGetRes.json();
    assert.strictEqual(searchGetJson.success, true);
    assert.strictEqual(searchGetJson.matchCount, 1);
    assert.strictEqual(searchGetJson.results[0].workspaceId, "ws-import-test");

    const searchPostRes = await fetch(`${url}/api/workspaces/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH },
      body: JSON.stringify({ query: "匯入測試", type: "all" })
    });
    assert.strictEqual(searchPostRes.status, 200);
    const searchPostJson = await searchPostRes.json();
    assert.strictEqual(searchPostJson.success, true);
    assert.strictEqual(searchPostJson.matchCount, 1);
  } finally {
    await bridge.stop();
  }
});

test('Bridge: Serves /dashboard and /api/probe endpoints', async () => {
  const bridge = new LocalSyncBridge({
    port: 19881,
    host: '127.0.0.1',
  });

  const { url } = await bridge.start();

  try {
    // 1. Test /dashboard
    const dashRes = await fetch(url + '/dashboard');
    assert.strictEqual(dashRes.status, 200);
    const html = await dashRes.text();
    assert.ok(html.includes('Nomad Dashboard'));

    // 2. Test /api/probe
    const probeRes = await fetch(url + '/api/probe');
    assert.strictEqual(probeRes.status, 200);
    const probeJson = await probeRes.json();
    assert.strictEqual(probeJson.success, true);
    assert.ok(probeJson.data.services.length > 0);
  } finally {
    await bridge.stop();
  }
});

test('Bridge: Rejects missing tokens and foreign origins', async () => {
  const bridge = new LocalSyncBridge({ port: 19879, host: '127.0.0.1' });
  const { url } = await bridge.start();

  try {
    const noToken = await fetch(`${url}/api/status`);
    assert.strictEqual(noToken.status, 401);

    const evil = await fetch(`${url}/api/status`, { headers: { ...AUTH, Origin: 'https://evil.example.com' } });
    assert.strictEqual(evil.status, 403);
    assert.strictEqual(evil.headers.get('access-control-allow-origin'), null);

    const evalAttempt = await fetch(`${url}/api/debug/eval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'claude', script: 'document.cookie' })
    });
    assert.strictEqual(evalAttempt.status, 401);

    const probe = await fetch(`${url}/api/probe?timeout=100`);
    assert.strictEqual(probe.status, 200);
    assert.strictEqual(probe.headers.get('access-control-allow-origin'), '*');
  } finally {
    await bridge.stop();
  }
});
