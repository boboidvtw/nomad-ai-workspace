const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  unpackedExtensionId,
  refreshStaleExtensionServiceWorker,
} = require('../extension-sw-refresh.js');

/** @param {string} loaderSource */
function makeExtension(loaderSource) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-ext-'));
  const extPath = path.join(dir, 'dist_chrome');
  fs.mkdirSync(extPath);
  fs.writeFileSync(
    path.join(extPath, 'manifest.json'),
    JSON.stringify({ background: { service_worker: 'service-worker-loader.js' } }),
  );
  fs.writeFileSync(path.join(extPath, 'service-worker-loader.js'), loaderSource);
  return { extPath, stateFile: path.join(dir, 'state', 'extension-sw-fingerprint') };
}

function fakeSession() {
  /** @type {any[]} */
  const cleared = [];
  return {
    cleared,
    clearStorageData: async (/** @type {any} */ options) => {
      cleared.push(options);
    },
  };
}

test('computes the same id Chromium assigns to an unpacked extension', () => {
  assert.strictEqual(
    unpackedExtensionId('/Users/liyungchih-macstudio/Developer/nomad-ai-workspace/dist_chrome'),
    'bhiohgcffkpcnagbecngppnkmhofmgph',
  );
});

test('clears the extension service worker when there is no stored fingerprint', async () => {
  const { extPath, stateFile } = makeExtension("import './assets/index.ts-A.js';");
  const session = fakeSession();

  const refreshed = await refreshStaleExtensionServiceWorker({ session, extPath, stateFile });

  assert.strictEqual(refreshed, true);
  assert.deepStrictEqual(session.cleared, [
    { origin: `chrome-extension://${unpackedExtensionId(extPath)}`, storages: ['serviceworkers'] },
  ]);
});

test('leaves the service worker alone when the background bundle is unchanged', async () => {
  const { extPath, stateFile } = makeExtension("import './assets/index.ts-A.js';");
  await refreshStaleExtensionServiceWorker({ session: fakeSession(), extPath, stateFile });
  const session = fakeSession();

  const refreshed = await refreshStaleExtensionServiceWorker({ session, extPath, stateFile });

  assert.strictEqual(refreshed, false);
  assert.deepStrictEqual(session.cleared, []);
});

test('clears the service worker again after a rebuild changes the bundle', async () => {
  const { extPath, stateFile } = makeExtension("import './assets/index.ts-A.js';");
  await refreshStaleExtensionServiceWorker({ session: fakeSession(), extPath, stateFile });
  fs.writeFileSync(
    path.join(extPath, 'service-worker-loader.js'),
    "import './assets/index.ts-B.js';",
  );
  const session = fakeSession();

  const refreshed = await refreshStaleExtensionServiceWorker({ session, extPath, stateFile });

  assert.strictEqual(refreshed, true);
  assert.strictEqual(session.cleared.length, 1);
});

test('does not record the fingerprint when clearing fails, so the next launch retries', async () => {
  const { extPath, stateFile } = makeExtension("import './assets/index.ts-A.js';");
  const failing = {
    clearStorageData: async () => {
      throw new Error('boom');
    },
  };

  const refreshed = await refreshStaleExtensionServiceWorker({
    session: failing,
    extPath,
    stateFile,
    log: { warn: () => {} },
  });

  assert.strictEqual(refreshed, false);
  assert.strictEqual(fs.existsSync(stateFile), false);
});

test('does nothing when the extension has not been built', async () => {
  const session = fakeSession();

  const refreshed = await refreshStaleExtensionServiceWorker({
    session,
    extPath: path.join(os.tmpdir(), 'nomad-missing-ext'),
    stateFile: path.join(os.tmpdir(), 'nomad-missing-state'),
    log: { warn: () => {} },
  });

  assert.strictEqual(refreshed, false);
  assert.deepStrictEqual(session.cleared, []);
});
