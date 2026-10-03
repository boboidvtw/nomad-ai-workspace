const test = require('node:test');
const assert = require('node:assert');
const { LocalSyncBridge } = require('../bridge.js');

test('Bridge: Starts and serves /api/status with CORS headers', async () => {
  const bridge = new LocalSyncBridge({
    port: 19876,
    host: '127.0.0.1',
    getStatus: () => ({ layout: 'dual', activePlatforms: ['claude', 'chatgpt'] }),
  });

  const { url } = await bridge.start();

  try {
    const res = await fetch(`${url}/api/status`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), '*');

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '   ' }),
    });
    assert.strictEqual(errRes.status, 400);
    const errJson = await errRes.json();
    assert.strictEqual(errJson.success, false);
    assert.strictEqual(errJson.errorCode, 'BRIDGE_DISPATCH_EMPTY_PROMPT_001');

    // 2. Valid prompt dispatch test
    const okRes = await fetch(`${url}/api/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout: 'quad' }),
    });
    const lJson = await lRes.json();
    assert.strictEqual(lJson.success, true);
    assert.strictEqual(layoutSet.layout, 'quad');

    // Zoom
    const zRes = await fetch(`${url}/api/zoom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'chatgpt', factor: 1.1 }),
    });
    const zJson = await zRes.json();
    assert.strictEqual(zJson.success, true);
    assert.strictEqual(zoomSet.platform, 'chatgpt');

    // Window
    const wRes = await fetch(`${url}/api/window`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const stRes = await fetch(`${url}/api/orchestration/status`);
    const stJson = await stRes.json();
    assert.strictEqual(stJson.success, true);
    assert.strictEqual(stJson.data.status, 'idle');

    // 2. Start
    const startRes = await fetch(`${url}/api/orchestration/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Orchestration prompt', sequence: ['claude', 'chatgpt'] }),
    });
    const startJson = await startRes.json();
    assert.strictEqual(startJson.success, true);
    assert.strictEqual(startedWith.prompt, 'Orchestration prompt');

    // 3. Pause, Resume, Stop
    const pRes = await fetch(`${url}/api/orchestration/pause`, { method: 'POST' });
    assert.strictEqual((await pRes.json()).status, 'paused');

    const rRes = await fetch(`${url}/api/orchestration/resume`, { method: 'POST' });
    assert.strictEqual((await rRes.json()).status, 'running');

    const sRes = await fetch(`${url}/api/orchestration/stop`, { method: 'POST' });
    assert.strictEqual((await sRes.json()).status, 'stopped');
  } finally {
    await bridge.stop();
  }
});
