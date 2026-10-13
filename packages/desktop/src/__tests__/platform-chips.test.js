const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

/**
 * Loads the Studio shell with a stubbed preload bridge and returns its layout calls.
 * @param {{ layout: string, activePlatforms: string[] }} settings
 */
async function loadShell(settings) {
  /** @type {any[]} */
  const layoutCalls = [];
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      /** @type {any} */ (window).nomadDesktop = {
        getSettings: async () => ({ ...settings }),
        setLayout: (/** @type {any} */ opts) => layoutCalls.push(structuredClone(opts)),
      };
    },
  });
  // Let init() apply the stubbed settings.
  await new Promise((resolve) => setTimeout(resolve, 50));
  const win = /** @type {any} */ (dom.window);
  return { win, layoutCalls, click: (/** @type {string} */ p) => win.togglePlatform(p) };
}

test('Platform chips: in focus mode a chip switches the single platform', async () => {
  const { layoutCalls, click } = await loadShell({ layout: 'focus', activePlatforms: ['chatgpt'] });

  click('claude');
  click('gemini');

  assert.deepStrictEqual(layoutCalls, [
    { layout: 'focus', activePlatforms: ['claude'], splitRatio: 0.5 },
    { layout: 'focus', activePlatforms: ['gemini'], splitRatio: 0.5 },
  ]);
});

test('Platform chips: in focus mode the shown platform chip does nothing', async () => {
  const { layoutCalls, click } = await loadShell({ layout: 'focus', activePlatforms: ['grok'] });

  click('grok');

  assert.deepStrictEqual(layoutCalls, []);
});

/**
 * @param {{ layout: string, activePlatforms: string[] }} settings
 * @param {string[]} clicks
 */
async function clickThrough(settings, clicks) {
  const { layoutCalls, click } = await loadShell(settings);
  for (const p of clicks) click(p);
  return layoutCalls.map((c) => [c.layout, c.activePlatforms]);
}

test('Platform chips: fixed layouts keep their count and drop the longest-shown platform', async () => {
  assert.deepStrictEqual(
    await clickThrough({ layout: 'dual', activePlatforms: ['chatgpt', 'claude'] }, [
      'gemini',
      'grok',
    ]),
    [
      ['dual', ['claude', 'gemini']],
      ['dual', ['gemini', 'grok']],
    ],
  );
  assert.deepStrictEqual(
    await clickThrough({ layout: 'triple', activePlatforms: ['chatgpt', 'claude', 'gemini'] }, [
      'perplexity',
    ]),
    [['triple', ['claude', 'gemini', 'perplexity']]],
  );
  assert.deepStrictEqual(
    await clickThrough(
      { layout: 'quad', activePlatforms: ['chatgpt', 'claude', 'gemini', 'grok'] },
      ['copilot'],
    ),
    [['quad', ['claude', 'gemini', 'grok', 'copilot']]],
  );
});

test('Platform chips: a shown platform is removed and the matching layout lights up', async () => {
  assert.deepStrictEqual(
    await clickThrough(
      { layout: 'quad', activePlatforms: ['chatgpt', 'claude', 'gemini', 'grok'] },
      ['claude', 'chatgpt', 'gemini'],
    ),
    [
      ['triple', ['chatgpt', 'gemini', 'grok']],
      ['dual', ['gemini', 'grok']],
      ['focus', ['grok']],
    ],
  );
  assert.deepStrictEqual(
    await clickThrough(
      {
        layout: 'hexa',
        activePlatforms: ['chatgpt', 'claude', 'gemini', 'grok', 'copilot', 'perplexity'],
      },
      ['copilot', 'copilot'],
    ),
    [
      ['custom', ['chatgpt', 'claude', 'gemini', 'grok', 'perplexity']],
      ['hexa', ['chatgpt', 'claude', 'gemini', 'grok', 'perplexity', 'copilot']],
    ],
  );
});
