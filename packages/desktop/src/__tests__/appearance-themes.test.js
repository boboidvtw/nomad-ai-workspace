const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

/**
 * Loads the Studio shell with a stubbed preload bridge.
 * @param {{ theme?: string, accentColor?: string }} [appearance]
 */
async function loadShell(appearance) {
  /** @type {any[]} */
  const saved = [];
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      /** @type {any} */ (window).nomadDesktop = {
        getSettings: async () => ({ layout: 'focus', activePlatforms: ['chatgpt'], appearance }),
        setAppearance: (/** @type {any} */ a) => saved.push({ ...a }),
      };
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const win = /** @type {any} */ (dom.window);
  const token = (/** @type {string} */ name) =>
    win.document.documentElement.style.getPropertyValue(name).trim();
  return { win, saved, token };
}

test('Themes: twelve cards in dark, light and vivid groups', async () => {
  const { win } = await loadShell();
  const doc = win.document;

  const cards = [...doc.querySelectorAll('#theme-grid .theme-card')].map((c) => c.id);
  const groups = [...doc.querySelectorAll('#theme-grid .theme-group-title')].map(
    (g) => g.textContent,
  );

  assert.strictEqual(cards.length, 12);
  assert.deepStrictEqual(groups, ['深色', '明亮', '繽紛']);
  assert.ok(cards.includes('theme-card-daylight'));
  assert.ok(cards.includes('theme-card-neon'));
});

test('Themes: a light theme switches every token, its accent and the light mode flag', async () => {
  const { win, saved, token } = await loadShell();

  win.selectTheme('daylight');

  assert.strictEqual(token('--bg-base'), '#f4f7fb');
  assert.strictEqual(token('--text-strong'), '#0f172a');
  assert.strictEqual(token('--fg-rgb'), '15, 23, 42');
  assert.strictEqual(token('--accent-color'), '#2563eb');
  assert.strictEqual(token('--accent-rgb'), '37, 99, 235');
  assert.strictEqual(token('--well-rgb'), '255, 255, 255');
  assert.strictEqual(win.document.documentElement.dataset.themeMode, 'light');
  assert.ok(win.document.getElementById('theme-card-daylight').classList.contains('active'));
  assert.deepStrictEqual(saved.at(-1), { theme: 'daylight', accentColor: '#2563eb' });
});

test('Themes: a swatch overrides the theme accent and survives a reload', async () => {
  const first = await loadShell();
  first.win.selectTheme('sunset');
  first.win.selectAccentColor('#a855f7');
  const stored = first.saved.at(-1);

  assert.deepStrictEqual(stored, { theme: 'sunset', accentColor: '#a855f7' });

  const reloaded = await loadShell(stored);
  assert.strictEqual(reloaded.token('--accent-color'), '#a855f7');
  assert.strictEqual(reloaded.token('--bg-image').startsWith('linear-gradient'), true);
  assert.strictEqual(reloaded.token('--on-accent'), '#3b0a1e');
  assert.strictEqual(reloaded.token('--bg-content'), 'transparent');
});

test('Themes: an unknown stored theme falls back to charcoal', async () => {
  const { win, token } = await loadShell({ theme: 'deepseek-blue' });

  assert.strictEqual(token('--bg-base'), '#0b0f19');
  assert.strictEqual(win.document.documentElement.dataset.themeMode, 'dark');
});

test('Themes: chrome colours come from tokens, not hard-coded dark-theme values', () => {
  // Swatches are previews and :root holds the defaults; everything else must use tokens,
  // or a light theme leaves white-on-white text behind.
  const swatchStart = HTML.indexOf('自訂主強調色');
  const swatchEnd = HTML.indexOf('title="自選任意顏色"');
  const rootStart = HTML.indexOf(':root {');
  const rootEnd = HTML.indexOf('}', rootStart);
  const presetsStart = HTML.indexOf('const DARK_TEXT');
  const presetsEnd = HTML.indexOf('const THEME_GROUPS');
  const rest =
    HTML.slice(0, rootStart) +
    HTML.slice(rootEnd, swatchStart) +
    HTML.slice(swatchEnd, presetsStart) +
    HTML.slice(presetsEnd);

  const leftovers = rest.match(
    /#38bdf8|#94a3b8|#cbd5e1|#e2e8f0|#f8fafc|#64748b|rgba\(\s*255,\s*255,\s*255|rgba\(\s*56,\s*189,\s*248|rgba\(\s*15,\s*23,\s*42|background: rgba\(0, 0, 0, 0\.[34]/gi,
  );
  assert.deepStrictEqual(leftovers, null);

  // Pastel status/brand text made for dark panels must go through --tint-* tokens.
  const pastelText = rest.match(
    /(?<![-\w])color:\s*#(ede9fe|c4b5fd|a78bfa|d8b4fe|a5b4fc|6ee7b7|34d399|fdba74|fcd34d|fef08a|f87171|fb7185|2dd4bf)\b/gi,
  );
  assert.deepStrictEqual(pastelText, null);
});

test('Themes: light themes darken the status and brand text tints', async () => {
  const { win } = await loadShell();
  win.selectTheme('daylight');
  const tint = (/** @type {string} */ name) =>
    win.getComputedStyle(win.document.documentElement).getPropertyValue(name).trim();

  assert.strictEqual(tint('--tint-violet-100'), '#4c1d95');
  assert.strictEqual(tint('--tint-emerald-400'), '#047857');

  win.selectTheme('neon');
  assert.strictEqual(tint('--tint-violet-100'), '#ede9fe');
});
