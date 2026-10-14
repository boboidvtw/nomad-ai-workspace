process.env.NOMAD_DAEMON_TOKEN = 'test-token-0123456789abcdef0123456789abcdef';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { THEME_PRESETS } = require('@nomad/core');
const {
  DASHBOARD_HTML_PATH,
  BOTS_PANEL_PATH,
  themeDashboardHtml,
  dashboardThemeTokens,
} = require('@nomad/dashboard');
const { LocalSyncBridge } = require('../bridge.js');

const PAGE = '<!doctype html><html lang="zh-TW"><head><title>x</title></head><body></body></html>';

/** @param {string} html */
function injectedStyle(html) {
  const m = /<style id="nomad-theme">([\s\S]*?)<\/style>/.exec(html);
  return m ? m[1] : null;
}

test('Dashboard theme: no stored appearance leaves the page as served (daemon)', () => {
  assert.strictEqual(themeDashboardHtml(PAGE, undefined), PAGE);
  assert.strictEqual(themeDashboardHtml(PAGE, null), PAGE);
});

test('Dashboard theme: a light theme injects its tokens and the light mode flag', () => {
  const html = themeDashboardHtml(PAGE, { theme: 'daylight', accentColor: '#2563eb' });
  const css = injectedStyle(html);
  assert.ok(css, 'theme style injected');
  assert.ok(html.indexOf('nomad-theme') < html.indexOf('</head>'));
  assert.match(html, /<html lang="zh-TW" data-theme-mode="light">/);
  assert.match(css, /--bg: #f4f7fb;/);
  assert.match(css, /--fg-rgb: 15, 23, 42;/);
  assert.match(css, /--primary: #2563eb;/);
  assert.match(css, /--primary-rgb: 37, 99, 235;/);
  assert.match(css, /--text: #0f172a;/);
  assert.match(css, /color-scheme: light;/);
});

test('Dashboard theme: every theme sets the same token names', () => {
  const names = (/** @type {string} */ theme) =>
    Object.keys(dashboardThemeTokens({ theme })).sort().join();
  const first = names('charcoal');
  for (const theme of Object.keys(THEME_PRESETS)) assert.strictEqual(names(theme), first, theme);
  // Light themes swap the pastel status tints for darker, readable ones.
  assert.notStrictEqual(
    dashboardThemeTokens({ theme: 'daylight' })['--tint-green'],
    dashboardThemeTokens({ theme: 'charcoal' })['--tint-green'],
  );
});

test('Dashboard theme: a malformed accent or unknown theme cannot inject CSS', () => {
  const html = themeDashboardHtml(PAGE, {
    theme: 'deepseek-blue',
    accentColor: 'red;}</style><script>alert(1)</script>',
  });
  assert.ok(!html.includes('<script>'));
  const css = injectedStyle(html) || '';
  assert.match(css, /--bg: #0b0f19;/);
  assert.match(css, new RegExp(`--primary: ${THEME_PRESETS.charcoal.accent};`));
  assert.match(html, /data-theme-mode="dark"/);
});

/** CSS rules from the dashboard sources, minus the :root default tokens. */
function dashboardCssOutsideRoot() {
  const html = fs.readFileSync(DASHBOARD_HTML_PATH, 'utf8');
  const rootStart = html.indexOf(':root {');
  const rootEnd = html.indexOf('\n      }', rootStart);
  return html.slice(0, rootStart) + html.slice(rootEnd) + fs.readFileSync(BOTS_PANEL_PATH, 'utf8');
}

test('Dashboard theme: no hard-coded white overlays, dark panels or pastel text remain', () => {
  const css = dashboardCssOutsideRoot();
  const banned = [
    /rgba\(255,\s*255,\s*255/i,
    /rgba\(99,\s*102,\s*241/i,
    /rgba\((14|15|20|22|30|6),\s*(9|20|22|23|28|30|41),\s*(17|34|36|38|42|48|52|59)/i,
    /#(a5b4fc|6ee7b7|34d399|fcd34d|67e8f9|22d3ee|c4b5fd|fca5a5|f87171|93c5fd|cbd5e1|e2e8f0)\b/i,
    /#(0f172a|0a0e19|04060b|0b101c|060911|0d1220|101728)\b/i,
  ];
  for (const re of banned) {
    const hit = re.exec(css);
    assert.strictEqual(
      hit,
      null,
      `found ${hit?.[0]} near: ${hit && css.slice(hit.index - 80, hit.index + 20)}`,
    );
  }
});

test('Bridge: /dashboard carries the stored theme', async () => {
  const bridge = new LocalSyncBridge({
    port: 19981,
    host: '127.0.0.1',
    getAppearance: () => ({ theme: 'mint', accentColor: '#047857' }),
  });
  const { url } = await bridge.start();
  try {
    const html = await (await fetch(url + '/dashboard')).text();
    assert.match(injectedStyle(html) || '', /--bg: #effcf6;/);
    assert.match(html, /data-theme-mode="light"/);
  } finally {
    await bridge.stop();
  }
});
