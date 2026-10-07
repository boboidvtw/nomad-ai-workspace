// Point the home directory at a sandbox before anything resolves it, so the
// auto-detected Drive folder is never the developer's real one.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-drive-sec-'));
const fakeHome = path.join(sandbox, 'home');
fs.mkdirSync(fakeHome);
process.env.HOME = fakeHome;
process.env.USERPROFILE = fakeHome;
process.env.NOMAD_DAEMON_TOKEN = 'test-token-0123456789abcdef0123456789abcdef';

const { test, after } = require('node:test');
const assert = require('node:assert');
const { NomadDaemonServer } = require('../server');

const PORT = 19852;
const AUTH = { Authorization: 'Bearer ' + process.env.NOMAD_DAEMON_TOKEN };
const DETECTED_DIR = path.join(fakeHome, '.nomad-drive-backup', 'Nomad Workspace Data');

after(() => fs.rmSync(sandbox, { recursive: true, force: true }));

/**
 * @param {string} route
 * @param {Record<string, unknown>} [body]
 */
async function call(route, body) {
  const res = await fetch(
    `http://127.0.0.1:${PORT}${route}`,
    body
      ? {
          method: 'POST',
          headers: { ...AUTH, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : { headers: AUTH },
  );
  return { status: res.status, json: await res.json() };
}

test('Daemon Drive sync: ignores caller-supplied directories', async () => {
  assert.strictEqual(os.homedir(), fakeHome);
  const evilDir = path.join(sandbox, 'evil');
  fs.mkdirSync(evilDir);
  fs.writeFileSync(
    path.join(evilDir, 'nomad-workspaces.json'),
    JSON.stringify({ workspaces: [{ id: 'planted' }] }),
  );

  const daemon = new NomadDaemonServer({ port: PORT });
  await daemon.start();
  try {
    const push = await call('/api/sync/drive/push', {
      workspaces: [{ id: 'ws-1' }],
      targetDir: path.join(evilDir, 'nested'),
    });
    assert.strictEqual(push.status, 200);
    assert.strictEqual(push.json.data.targetDir, DETECTED_DIR);
    assert.strictEqual(fs.existsSync(path.join(evilDir, 'nested')), false);
    assert.ok(fs.existsSync(path.join(DETECTED_DIR, 'nomad-workspaces.json')));

    const status = await call(`/api/sync/drive/status?dir=${encodeURIComponent(evilDir)}`);
    assert.strictEqual(status.json.data.targetDir, DETECTED_DIR);

    const pull = await call('/api/sync/drive/pull', { sourceDir: evilDir, strategy: 'overwrite' });
    assert.strictEqual(pull.status, 200);
    assert.deepStrictEqual(
      pull.json.data.reconciledWorkspaces.map((/** @type {{ id: string }} */ w) => w.id),
      ['ws-1'],
    );
  } finally {
    await daemon.stop();
  }
});
