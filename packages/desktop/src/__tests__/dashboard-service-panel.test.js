const test = require('node:test');
const assert = require('node:assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const { ServiceController, buildServiceRegistry } = require('@nomad/core');
const { LocalSyncBridge } = require('../bridge.js');

const INDEX = fs.readFileSync(path.join(__dirname, '../../../dashboard/index.html'), 'utf8');
const PANEL = fs.readFileSync(
  path.join(__dirname, '../../../dashboard/service-panel.html'),
  'utf8',
);
const HTML = INDEX.replace('<!-- @nomad:service-panel -->', () => PANEL);
const TOKEN = 'a'.repeat(64);
const openWindows = [];

function fakeServices() {
  return [
    {
      id: 'laya',
      label: 'Laya',
      state: 'stopped',
      canStart: true,
      canStop: false,
    },
    {
      id: 'hermes-gateway',
      label: 'Hermes Telegram 閘道',
      state: 'stopped',
      canStart: true,
      canStop: false,
      confirmStart: '確定嗎？',
    },
    {
      id: 'nomad-cli',
      label: 'Nomad 協調器',
      state: 'unavailable',
      canStart: false,
      canStop: false,
      message: '協調器已不在',
    },
  ];
}

async function loadDashboard({ confirmResult = true } = {}) {
  const posts = [];
  const dom = new JSDOM(HTML, {
    url: 'http://127.0.0.1:8765/dashboard',
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      window.confirm = () => confirmResult;
      window.EventSource = class {
        close() {}
      };
      window.fetch = async (url, options = {}) => {
        if (options.method === 'POST') posts.push({ url: String(url), body: options.body });
        const data = { services: fakeServices() };
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data }),
          text: async () => '',
        };
      };
    },
  });
  openWindows.push(dom.window);
  await new Promise((resolve) => setTimeout(resolve, 60));
  return { document: dom.window.document, window: dom.window, posts };
}

// The dashboard's refresh timers would otherwise keep the test process alive.
test.afterEach(() => {
  while (openWindows.length) openWindows.pop().close();
});

test('Service panel: every card has a how-to and at least one control', async () => {
  const { document } = await loadDashboard();
  const cards = [...document.querySelectorAll('.card[id^="card-"]')];
  assert.strictEqual(cards.length, 12);
  for (const card of cards) {
    assert.ok(card.querySelector('.svc-row'), `${card.id} has controls`);
    const guide = card.querySelector('details.svc-guide');
    assert.ok(guide, `${card.id} has a how-to`);
    assert.ok(!guide.open, `${card.id} how-to starts collapsed`);
    assert.ok(guide.querySelectorAll('li').length >= 3, `${card.id} how-to has steps`);
  }
});

test('Service panel: every control maps to a registered service', async () => {
  const { document } = await loadDashboard();
  const ids = new Set(buildServiceRegistry('/home/u').map((s) => s.id));
  const rows = [...document.querySelectorAll('.svc-row')];
  assert.strictEqual(new Set(rows.map((r) => r.dataset.service)).size, ids.size);
  for (const row of rows) assert.ok(ids.has(row.dataset.service), row.dataset.service);
});

test('Service panel: buttons send only the id, and follow the reported state', async () => {
  const { document, posts } = await loadDashboard();
  const row = document.querySelector('.svc-row[data-service="laya"]');
  const start = row.querySelector('[data-action="start"]');
  assert.strictEqual(row.querySelector('.svc-state').textContent, '未啟動');
  assert.strictEqual(start.disabled, false);
  assert.strictEqual(row.querySelector('[data-action="stop"]').disabled, true);
  start.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepStrictEqual(posts, [
    { url: 'http://127.0.0.1:8765/api/services/laya/start', body: undefined },
  ]);
});

test('Service panel: an unavailable service shows why and cannot be pressed', async () => {
  const { document } = await loadDashboard();
  const row = document.querySelector('.svc-row[data-service="nomad-cli"]');
  assert.strictEqual(row.querySelector('[data-action="start"]').disabled, true);
  assert.strictEqual(row.querySelector('.svc-message').textContent, '協調器已不在');
  const badge = document.querySelector('#card-nomad-cli .status-badge');
  assert.ok(!badge.textContent.includes('Stack Ready'));
});

test('Service panel: declining the warning sends nothing', async () => {
  const { document, posts } = await loadDashboard({ confirmResult: false });
  document.querySelector('.svc-row[data-service="hermes-gateway"] [data-action="start"]').click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepStrictEqual(posts, []);
});

test('Summary: online count comes from real states, with no fixed bonus', async () => {
  const { document } = await loadDashboard();
  assert.ok(!INDEX.includes('currentOnline += 4'));
  assert.strictEqual(document.getElementById('hud-online-count').textContent, '0');
});

test('Commands: nothing points at tools or services this machine does not have', () => {
  for (const stale of [
    'launchctl kickstart',
    'telegram_bridge',
    'psql -h 127.0.0.1',
    'redis-cli -h',
    'python3 main.py',
    '.hermes/agent.log',
  ]) {
    assert.ok(!INDEX.includes(stale), stale);
  }
});

test('Bridge: service routes need the token and refuse other sites', async () => {
  const calls = [];
  const serviceController = new ServiceController({
    services: [
      {
        id: 'alpha',
        label: 'Alpha',
        check: { type: 'port', port: 9 },
        start: { kind: 'exec', bin: 'alpha', args: [] },
        stop: null,
        timeoutMs: 10,
      },
    ],
    pollMs: 1,
    runner: {
      pathExists: () => true,
      which: (bin) => bin,
      probePort: async () => false,
      logHint: () => '',
      exec: async (bin, args) => {
        calls.push([bin, args]);
        return { code: 0 };
      },
    },
  });
  const bridge = new LocalSyncBridge({
    port: 19897,
    host: '127.0.0.1',
    authToken: TOKEN,
    serviceController,
  });
  await bridge.start();
  const url = 'http://127.0.0.1:19897/api/services';
  const auth = { Authorization: 'Bearer ' + TOKEN };
  try {
    assert.strictEqual((await fetch(url)).status, 401);
    assert.strictEqual((await fetch(url + '/alpha/start', { method: 'POST' })).status, 401);
    const crossSite = await fetch(url + '/alpha/start', {
      method: 'POST',
      headers: { ...auth, Origin: 'https://evil.example' },
    });
    assert.strictEqual(crossSite.status, 403);
    assert.deepStrictEqual(calls, []);

    assert.strictEqual((await fetch(url, { headers: auth })).status, 200);
    const started = await fetch(url + '/alpha/start', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bin: 'rm', args: ['-rf', '/'] }),
    });
    assert.strictEqual(started.status, 202);
    await serviceController.whenIdle('alpha');
    assert.deepStrictEqual(calls, [['alpha', []]]);
  } finally {
    await bridge.stop();
  }
});
