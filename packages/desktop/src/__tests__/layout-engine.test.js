const test = require('node:test');
const assert = require('node:assert');
const { calculateLayoutBounds, ALL_PLATFORMS } = require('../layout-engine.js');

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
});

test('Layout Engine: Quad mode tiles 4 views in 2x2 grid', () => {
  const bounds = calculateLayoutBounds({
    winWidth: 1200,
    winHeight: 800,
    topBarHeight: 50,
    bottomBarHeight: 50,
    layout: 'quad',
    activePlatforms: ALL_PLATFORMS,
  });

  // Top-left
  assert.strictEqual(bounds.claude.visible, true);
  assert.strictEqual(bounds.claude.x, 0);
  assert.strictEqual(bounds.claude.y, 50);
  assert.strictEqual(bounds.claude.width, 600);
  assert.strictEqual(bounds.claude.height, 350);

  // Top-right
  assert.strictEqual(bounds.chatgpt.visible, true);
  assert.strictEqual(bounds.chatgpt.x, 600);
  assert.strictEqual(bounds.chatgpt.y, 50);

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
  const one = calculateLayoutBounds({ winWidth: 1000, winHeight: 500, layout: 'custom', activePlatforms: ['grok'] });
  assert.strictEqual(one.grok.visible, true);
  assert.strictEqual(one.grok.width, 1000);

  const three = calculateLayoutBounds({ winWidth: 900, winHeight: 500, layout: 'custom', activePlatforms: ['claude', 'gemini', 'grok'] });
  assert.strictEqual(three.claude.visible, true);
  assert.strictEqual(three.gemini.visible, true);
  assert.strictEqual(three.grok.visible, true);
  assert.strictEqual(three.chatgpt.visible, false);
});
