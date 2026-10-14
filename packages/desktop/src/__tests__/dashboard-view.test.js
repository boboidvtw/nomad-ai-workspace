const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeDashboardHash,
  dashboardUrl,
  isDashboardNavigation,
  isExternalWebUrl,
  dashboardBounds,
} = require('../dashboard-view.js');

const MAIN_JS = fs.readFileSync(path.join(__dirname, '../../main.js'), 'utf8');
const PRELOAD_JS = fs.readFileSync(path.join(__dirname, '../../preload.js'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

test('Dashboard view: URL uses the real bridge port and only known sections', () => {
  assert.strictEqual(dashboardUrl(8766), 'http://127.0.0.1:8766/dashboard');
  assert.strictEqual(dashboardUrl(8765, '#bots'), 'http://127.0.0.1:8765/dashboard#bots');
  assert.strictEqual(dashboardUrl(8765, 'tasks'), 'http://127.0.0.1:8765/dashboard#tasks');
  assert.strictEqual(normalizeDashboardHash('#x"><script>'), '');
  assert.strictEqual(normalizeDashboardHash(undefined), '');
});

test('Dashboard view: navigation stays on the bridge dashboard', () => {
  assert.ok(isDashboardNavigation('http://127.0.0.1:8765/dashboard', 8765));
  assert.ok(isDashboardNavigation('http://127.0.0.1:8765/dashboard/#bots', 8765));
  assert.ok(!isDashboardNavigation('http://127.0.0.1:8766/dashboard', 8765));
  assert.ok(!isDashboardNavigation('http://127.0.0.1:8765/api/bots', 8765));
  assert.ok(!isDashboardNavigation('http://localhost:8765/dashboard', 8765));
  assert.ok(!isDashboardNavigation('https://example.com/dashboard', 8765));
  assert.ok(!isDashboardNavigation('not a url', 8765));
});

test('Dashboard view: only http(s) goes to the system browser', () => {
  assert.ok(isExternalWebUrl('https://github.com'));
  assert.ok(isExternalWebUrl('http://127.0.0.1:8765/dashboard'));
  assert.ok(!isExternalWebUrl('file:///etc/passwd'));
  assert.ok(!isExternalWebUrl('javascript:alert(1)'));
  assert.ok(!isExternalWebUrl(42));
});

test('Dashboard view: fills the content area beside the drawer', () => {
  const base = { winWidth: 1440, winHeight: 920, topBarHeight: 52, bottomBarHeight: 68 };
  assert.deepStrictEqual(dashboardBounds(base), { x: 0, y: 52, width: 1440, height: 800 });
  assert.deepStrictEqual(dashboardBounds({ ...base, drawerWidth: 420 }), {
    x: 0,
    y: 52,
    width: 1020,
    height: 800,
  });
});

test('Dashboard view: every preload channel the Dashboard needs has a main handler', () => {
  for (const channel of ['nomad:open-external', 'nomad:set-dashboard']) {
    assert.ok(PRELOAD_JS.includes(`'${channel}'`), `preload exposes ${channel}`);
    assert.ok(MAIN_JS.includes(`ipcMain.handle('${channel}'`), `main handles ${channel}`);
  }
});

test('Dashboard view: the Studio no longer hardcodes the dashboard port', () => {
  assert.ok(!INDEX_HTML.includes("openExternal('http://127.0.0.1:8765/dashboard')"));
  assert.ok(INDEX_HTML.includes('id="btn-dashboard-pill"'));
});
