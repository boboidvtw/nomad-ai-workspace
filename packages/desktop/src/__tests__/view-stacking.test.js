const test = require('node:test');
const assert = require('node:assert');
const { planViewStacking } = require('../layout-engine.js');
const { applyViewStacking } = require('../view-stacking.js');

/** Fake views and content view that log every call in order. */
function fakeWindow(/** @type {string[]} */ keys) {
  /** @type {string[]} */
  const log = [];
  const view = (/** @type {string} */ name) => ({
    name,
    setBounds: () => log.push(`bounds:${name}`),
    setVisible: (/** @type {boolean} */ v) => log.push(`visible:${name}=${v}`),
  });
  /** @type {Record<string, { view: any }>} */
  const views = Object.fromEntries(keys.map((k) => [k, { view: view(k) }]));
  const contentView = {
    addChildView: (/** @type {{ name: string }} */ v) => log.push(`raise:${v.name}`),
  };
  return { log, views, contentView };
}

const BOUNDS = { x: 0, y: 0, width: 800, height: 600 };

/** @param {Record<string, any>} boundsMap @param {string[]} keepRendering @param {string | null} lastStackKey */
function step(win, boundsMap, keepRendering, lastStackKey, dashboardView = null) {
  const plan = planViewStacking({
    boundsMap,
    keys: Object.keys(win.views),
    keepRendering,
    dashboardOpen: false,
  });
  return applyViewStacking({
    contentView: win.contentView,
    views: win.views,
    boundsMap,
    plan,
    dashboardView,
    lastStackKey,
    ensureLoaded: () => {},
  });
}

test('applyViewStacking: the user views are raised before the relay speaker is shown', () => {
  const win = fakeWindow(['chatgpt', 'grok']);
  const boundsMap = { chatgpt: { ...BOUNDS, visible: true }, grok: { ...BOUNDS, visible: false } };

  const key = step(win, boundsMap, ['grok'], null);

  assert.strictEqual(key, 'grok<chatgpt');
  const raised = win.log.indexOf('raise:chatgpt');
  const shown = win.log.indexOf('visible:grok=true');
  assert.ok(raised >= 0 && shown > raised, win.log.join(' '));
});

test('applyViewStacking: a resize with the same stacking does not reorder views', () => {
  const win = fakeWindow(['chatgpt', 'grok']);
  const boundsMap = { chatgpt: { ...BOUNDS, visible: true }, grok: { ...BOUNDS, visible: false } };
  const key = step(win, boundsMap, ['grok'], null);
  win.log.length = 0;

  const again = step(win, boundsMap, ['grok'], key);

  assert.strictEqual(again, key);
  assert.ok(!win.log.some((l) => l.startsWith('raise:')), win.log.join(' '));
});

test('applyViewStacking: the dashboard stays on top after a restack', () => {
  const win = fakeWindow(['chatgpt', 'grok']);
  const dashboard = { name: 'dashboard' };
  const boundsMap = { chatgpt: { ...BOUNDS, visible: true }, grok: { ...BOUNDS, visible: false } };

  step(win, boundsMap, ['grok'], null, dashboard);

  const raises = win.log.filter((l) => l.startsWith('raise:'));
  assert.deepStrictEqual(raises, ['raise:chatgpt', 'raise:dashboard']);
});

test('applyViewStacking: views with no layout bounds are hidden and not resized', () => {
  const win = fakeWindow(['chatgpt', 'grok']);

  const key = step(win, { chatgpt: { ...BOUNDS, visible: true } }, [], null);

  assert.strictEqual(key, null);
  assert.ok(win.log.includes('visible:grok=false'));
  assert.ok(!win.log.includes('bounds:grok'));
});
