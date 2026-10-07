process.env.NOMAD_DAEMON_TOKEN = 'test-token-0123456789abcdef0123456789abcdef';
const AUTH = {
  Authorization: 'Bearer ' + process.env.NOMAD_DAEMON_TOKEN,
  'Content-Type': 'application/json',
};
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const { LocalSyncBridge } = require('../bridge.js');

/** @param {string} url @param {string} route @param {unknown} [body] */
function post(url, route, body = {}) {
  return fetch(`${url}${route}`, { method: 'POST', headers: AUTH, body: JSON.stringify(body) });
}

test('Bridge: /api/debug/* is 404 unless debugEndpoints is enabled', async () => {
  /** @type {Array<[string, string]>} */
  const evalCalls = [];
  const hooks = {
    onEvalScript: async (/** @type {string} */ platform, /** @type {string} */ script) => {
      evalCalls.push([platform, script]);
      return { ok: true };
    },
    onInspectPlatform: async () => ({ ok: true }),
  };

  const off = new LocalSyncBridge({ port: 19892, host: '127.0.0.1', ...hooks });
  const { url: offUrl } = await off.start();
  try {
    const evalRes = await post(offUrl, '/api/debug/eval', {
      platform: 'claude',
      script: 'document.cookie',
    });
    assert.strictEqual(evalRes.status, 404);
    const inspectRes = await post(offUrl, '/api/debug/inspect-platform', { platform: 'claude' });
    assert.strictEqual(inspectRes.status, 404);
    assert.deepStrictEqual(evalCalls, []);
  } finally {
    await off.stop();
  }

  const on = new LocalSyncBridge({
    port: 19893,
    host: '127.0.0.1',
    debugEndpoints: true,
    ...hooks,
  });
  const { url: onUrl } = await on.start();
  try {
    const evalRes = await post(onUrl, '/api/debug/eval', { platform: 'claude', script: '1+1' });
    assert.strictEqual(evalRes.status, 200);
    assert.deepStrictEqual(evalCalls, [['claude', '1+1']]);
  } finally {
    await on.stop();
  }
});

test('Bridge: Drive sync uses the configured folder, never the request body', async (t) => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-bridge-drive-'));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const configuredDir = path.join(sandbox, 'configured');
  const evilDir = path.join(sandbox, 'evil');
  fs.mkdirSync(evilDir);
  fs.writeFileSync(
    path.join(evilDir, 'nomad-workspaces.json'),
    JSON.stringify({ workspaces: [{ id: 'planted' }] }),
  );

  const bridge = new LocalSyncBridge({
    port: 19894,
    host: '127.0.0.1',
    getDriveSyncDir: () => configuredDir,
  });
  const { url } = await bridge.start();
  try {
    const push = await post(url, '/api/sync/drive/push', {
      workspaces: [{ id: 'ws-1' }],
      targetDir: path.join(evilDir, 'nested'),
    });
    assert.strictEqual(push.status, 200);
    assert.strictEqual((await push.json()).data.targetDir, configuredDir);
    assert.strictEqual(fs.existsSync(path.join(evilDir, 'nested')), false);

    const status = await fetch(`${url}/api/sync/drive/status?dir=${encodeURIComponent(evilDir)}`, {
      headers: AUTH,
    });
    assert.strictEqual((await status.json()).data.targetDir, configuredDir);

    const pull = await post(url, '/api/sync/drive/pull', {
      sourceDir: evilDir,
      strategy: 'overwrite',
    });
    assert.strictEqual(pull.status, 200);
    const ids = (await pull.json()).data.reconciledWorkspaces.map(
      (/** @type {{ id: string }} */ w) => w.id,
    );
    assert.deepStrictEqual(ids, ['ws-1']);
  } finally {
    await bridge.stop();
  }
});
