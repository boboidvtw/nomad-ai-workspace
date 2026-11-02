const test = require('node:test');
const assert = require('node:assert');
const { calculateLayoutBounds, planViewStacking, ALL_PLATFORMS } = require('../layout-engine.js');

test('Layout Engine: Focus mode gives 100% width and height to selected platform', () => {
  const bounds = calculateLayoutBounds({
    winWidth: 1200,
    winHeight: 800,
    topBarHeight: 50,
    bottomBarHeight: 70,
    layout: 'focus',
    activePlatforms: ['claude'],
  });

  assert.strictEqual(bounds.claude.visible, true);
  assert.strictEqual(bounds.claude.x, 0);
  assert.strictEqual(bounds.claude.y, 50);
  assert.strictEqual(bounds.claude.width, 1200);
  assert.strictEqual(bounds.claude.height, 680); // 800 - 50 - 70

  assert.strictEqual(bounds.chatgpt.visible, false);
  assert.strictEqual(bounds.gemini.visible, false);
  assert.strictEqual(bounds.grok.visible, false);
  assert.strictEqual(bounds.copilot.visible, false);
  assert.strictEqual(bounds.perplexity.visible, false);
});

test('Layout Engine: Dual mode splits width according to splitRatio', () => {
  const bounds = calculateLayoutBounds({
    winWidth: 1000,
    winHeight: 600,
    topBarHeight: 50,
    bottomBarHeight: 50,
    layout: 'dual',
    activePlatforms: ['claude', 'chatgpt'],
    splitRatio: 0.6,
  });

  assert.strictEqual(bounds.claude.visible, true);
  assert.strictEqual(bounds.claude.width, 600); // 1000 * 0.6
  assert.strictEqual(bounds.claude.height, 500);

  assert.strictEqual(bounds.chatgpt.visible, true);
  assert.strictEqual(bounds.chatgpt.x, 600);
  assert.strictEqual(bounds.chatgpt.width, 400); // 1000 - 600
  assert.strictEqual(bounds.chatgpt.height, 500);

  assert.strictEqual(bounds.gemini.visible, false);
  assert.strictEqual(bounds.grok.visible, false);
  assert.strictEqual(bounds.copilot.visible, false);
  assert.strictEqual(bounds.perplexity.visible, false);
});

test('Layout Engine: Triple mode divides width across 3 columns', () => {
  const bounds = calculateLayoutBounds({
    winWidth: 1200,
    winHeight: 700,
    topBarHeight: 50,
    bottomBarHeight: 50,
    layout: 'triple',
    activePlatforms: ['claude', 'chatgpt', 'gemini'],
  });

  assert.strictEqual(bounds.claude.visible, true);
  assert.strictEqual(bounds.claude.width, 400);

  assert.strictEqual(bounds.chatgpt.visible, true);
  assert.strictEqual(bounds.chatgpt.x, 400);
  assert.strictEqual(bounds.chatgpt.width, 400);

  assert.strictEqual(bounds.gemini.visible, true);
  assert.strictEqual(bounds.gemini.x, 800);
  assert.strictEqual(bounds.gemini.width, 400);

  assert.strictEqual(bounds.grok.visible, false);
  assert.strictEqual(bounds.copilot.visible, false);
  assert.strictEqual(bounds.perplexity.visible, false);
});

test('Layout Engine: Quad mode tiles 4 views in 2x2 grid', () => {
  const bounds = calculateLayoutBounds({
    winWidth: 1200,
    winHeight: 800,
    topBarHeight: 50,
    bottomBarHeight: 50,
    layout: 'quad',
    activePlatforms: ALL_PLATFORMS.slice(0, 4),
  });

  // Top-left (ChatGPT is primary index 0)
  assert.strictEqual(bounds.chatgpt.visible, true);
  assert.strictEqual(bounds.chatgpt.x, 0);
  assert.strictEqual(bounds.chatgpt.y, 50);
  assert.strictEqual(bounds.chatgpt.width, 600);
  assert.strictEqual(bounds.chatgpt.height, 350);

  // Top-right (Claude is index 1)
  assert.strictEqual(bounds.claude.visible, true);
  assert.strictEqual(bounds.claude.x, 600);
  assert.strictEqual(bounds.claude.y, 50);

  // Bottom-left
  assert.strictEqual(bounds.gemini.visible, true);
  assert.strictEqual(bounds.gemini.x, 0);
  assert.strictEqual(bounds.gemini.y, 400);

  // Bottom-right
  assert.strictEqual(bounds.grok.visible, true);
  assert.strictEqual(bounds.grok.x, 600);
  assert.strictEqual(bounds.grok.y, 400);
});

test('Layout Engine: Custom mode adapts dynamically based on number of active platforms', () => {
  const one = calculateLayoutBounds({
    winWidth: 1000,
    winHeight: 500,
    layout: 'custom',
    activePlatforms: ['grok'],
  });
  assert.strictEqual(one.grok.visible, true);
  assert.strictEqual(one.grok.width, 1000);

  const three = calculateLayoutBounds({
    winWidth: 900,
    winHeight: 500,
    layout: 'custom',
    activePlatforms: ['claude', 'gemini', 'grok'],
  });
  assert.strictEqual(three.claude.visible, true);
  assert.strictEqual(three.gemini.visible, true);
  assert.strictEqual(three.grok.visible, true);
  assert.strictEqual(three.chatgpt.visible, false);
});

test('Layout Engine: Subtracts drawerWidth when drawer is open', () => {
  const boundsWithDrawer = calculateLayoutBounds({
    winWidth: 1440,
    winHeight: 900,
    layout: 'focus',
    activePlatforms: ['claude'],
    drawerWidth: 420,
  });

  assert.strictEqual(boundsWithDrawer.claude.visible, true);
  assert.strictEqual(boundsWithDrawer.claude.width, 1020); // 1440 - 420
});

test('Layout Engine: Hexa mode tiles 6 views in 3x2 grid', () => {
  const bounds = calculateLayoutBounds({
    winWidth: 1200,
    winHeight: 800,
    topBarHeight: 50,
    bottomBarHeight: 50,
    layout: 'hexa',
    activePlatforms: ALL_PLATFORMS,
  });

  // 3 columns: 400px each. 2 rows: 350px each.
  // chatgpt (col 0, row 0)
  assert.strictEqual(bounds.chatgpt.visible, true);
  assert.strictEqual(bounds.chatgpt.x, 0);
  assert.strictEqual(bounds.chatgpt.y, 50);
  assert.strictEqual(bounds.chatgpt.width, 400);
  assert.strictEqual(bounds.chatgpt.height, 350);

  // claude (col 1, row 0)
  assert.strictEqual(bounds.claude.visible, true);
  assert.strictEqual(bounds.claude.x, 400);
  assert.strictEqual(bounds.claude.y, 50);

  // gemini (col 2, row 0)
  assert.strictEqual(bounds.gemini.visible, true);
  assert.strictEqual(bounds.gemini.x, 800);
  assert.strictEqual(bounds.gemini.y, 50);

  // grok (col 0, row 1)
  assert.strictEqual(bounds.grok.visible, true);
  assert.strictEqual(bounds.grok.x, 0);
  assert.strictEqual(bounds.grok.y, 400);

  // copilot (col 1, row 1)
  assert.strictEqual(bounds.copilot.visible, true);
  assert.strictEqual(bounds.copilot.x, 400);
  assert.strictEqual(bounds.copilot.y, 400);

  // perplexity (col 2, row 1)
  assert.strictEqual(bounds.perplexity.visible, true);
  assert.strictEqual(bounds.perplexity.x, 800);
  assert.strictEqual(bounds.perplexity.y, 400);
});

test('LayoutEngine: hidden platforms keep a full content-area size', () => {
  // A 0x0 view renders nothing: Grok's virtualised chat showed no messages to read back.
  const bounds = calculateLayoutBounds({
    winWidth: 1400,
    winHeight: 900,
    topBarHeight: 52,
    bottomBarHeight: 68,
    layout: 'focus',
    activePlatforms: ['claude'],
    drawerWidth: 300,
  });

  assert.deepStrictEqual(bounds.grok, {
    x: 0,
    y: 52,
    width: 1100,
    height: 780,
    visible: false,
  });
});

test('Layout Engine: Evolver IDE mode hides all WebContentsViews while retaining full dimensions for background bots', () => {
  const bounds = calculateLayoutBounds({
    winWidth: 1440,
    winHeight: 900,
    topBarHeight: 52,
    bottomBarHeight: 68,
    layout: 'evolver',
    activePlatforms: ['claude', 'chatgpt'],
    drawerWidth: 0,
  });

  for (const p of ALL_PLATFORMS) {
    assert.strictEqual(bounds[p].visible, false, `${p} should be hidden in evolver IDE mode`);
    assert.strictEqual(bounds[p].width, 1440);
    assert.strictEqual(bounds[p].height, 780);
  }
});

const KEYS = ['chatgpt', 'claude', 'gemini', 'grok'];
const SHOWN = { visible: true };
const HIDDEN = { visible: false };

test('planViewStacking: without a relay speaker views follow the layout and nothing restacks', () => {
  const plan = planViewStacking({
    boundsMap: { chatgpt: SHOWN, claude: SHOWN, gemini: HIDDEN },
    keys: KEYS,
    keepRendering: [],
    dashboardOpen: false,
  });
  assert.deepStrictEqual(plan.views, {
    chatgpt: { visible: true, load: true },
    claude: { visible: true, load: true },
    gemini: { visible: false, load: false },
    grok: { visible: false, load: false },
  });
  assert.deepStrictEqual(plan.raise, []);
  assert.strictEqual(plan.stackKey, null);
});

test('planViewStacking: a hidden relay speaker shows behind the views the user sees', () => {
  const plan = planViewStacking({
    boundsMap: { chatgpt: SHOWN, claude: SHOWN, gemini: HIDDEN, grok: HIDDEN },
    keys: KEYS,
    keepRendering: ['grok'],
    dashboardOpen: false,
  });
  assert.deepStrictEqual(plan.views.grok, { visible: true, load: true });
  assert.deepStrictEqual(plan.views.gemini, { visible: false, load: false });
  assert.deepStrictEqual(plan.raise, ['chatgpt', 'claude']);
  assert.strictEqual(plan.stackKey, 'grok<chatgpt,claude');
});

test('planViewStacking: a relay speaker the user already sees needs no restacking', () => {
  const plan = planViewStacking({
    boundsMap: { chatgpt: SHOWN, grok: SHOWN },
    keys: KEYS,
    keepRendering: ['grok'],
    dashboardOpen: false,
  });
  assert.deepStrictEqual(plan.views.grok, { visible: true, load: true });
  assert.strictEqual(plan.stackKey, null);
});

test('planViewStacking: with the dashboard open only the relay speaker keeps rendering', () => {
  const plan = planViewStacking({
    boundsMap: { chatgpt: SHOWN, grok: SHOWN },
    keys: KEYS,
    keepRendering: ['grok'],
    dashboardOpen: true,
  });
  assert.deepStrictEqual(plan.views.chatgpt, { visible: false, load: false });
  assert.deepStrictEqual(plan.views.grok, { visible: true, load: true });
  assert.deepStrictEqual(plan.raise, []);
  assert.strictEqual(plan.stackKey, 'grok<<dashboard');
});

test('planViewStacking: stackKey is stable across resizes and changes with the shown views', () => {
  const args = { keys: KEYS, keepRendering: ['gemini'], dashboardOpen: false };
  const a = planViewStacking({ ...args, boundsMap: { chatgpt: SHOWN, gemini: HIDDEN } });
  const b = planViewStacking({ ...args, boundsMap: { chatgpt: SHOWN, gemini: HIDDEN } });
  const c = planViewStacking({
    ...args,
    boundsMap: { chatgpt: SHOWN, claude: SHOWN, gemini: HIDDEN },
  });
  assert.strictEqual(a.stackKey, b.stackKey);
  assert.notStrictEqual(a.stackKey, c.stackKey);
});

test('planViewStacking: a speaker with no layout bounds stays hidden', () => {
  const plan = planViewStacking({
    boundsMap: { chatgpt: SHOWN },
    keys: KEYS,
    keepRendering: ['grok'],
    dashboardOpen: false,
  });
  assert.deepStrictEqual(plan.views.grok, { visible: false, load: false });
  assert.strictEqual(plan.stackKey, null);
});

test('planViewStacking: a relay speaker and a bot target both keep rendering behind', () => {
  const plan = planViewStacking({
    boundsMap: { chatgpt: SHOWN, claude: HIDDEN, gemini: HIDDEN, grok: HIDDEN },
    keys: KEYS,
    keepRendering: ['grok', 'gemini'],
    dashboardOpen: false,
  });
  assert.deepStrictEqual(plan.views.gemini, { visible: true, load: true });
  assert.deepStrictEqual(plan.views.grok, { visible: true, load: true });
  assert.deepStrictEqual(plan.views.claude, { visible: false, load: false });
  assert.deepStrictEqual(plan.raise, ['chatgpt']);
  assert.strictEqual(plan.stackKey, 'gemini,grok<chatgpt');
});
