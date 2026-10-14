const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { THEME_BACKGROUNDS, windowBackgroundFor, firstPaintQuery } = require('../window-theme.js');

const HTML_PATH = path.join(__dirname, '../../index.html');
const HTML = fs.readFileSync(HTML_PATH, 'utf8');

const { THEME_PRESETS } = require('@nomad/core');

/** Evaluates the inline THEME_PRESETS literal in index.html. */
function readStudioPresets() {
  const block = HTML.slice(HTML.indexOf('const DARK_TEXT'), HTML.indexOf('const THEME_GROUPS'));
  return new Function(block + 'return THEME_PRESETS;')();
}

test('Window theme: the Studio copy of THEME_PRESETS matches @nomad/core', () => {
  assert.deepStrictEqual(readStudioPresets(), { ...THEME_PRESETS });
});

test('Window theme: every preset maps to its background and mode', () => {
  assert.strictEqual(Object.keys(THEME_BACKGROUNDS).length, 12);
  for (const [theme, p] of Object.entries(THEME_PRESETS)) {
    assert.strictEqual(THEME_BACKGROUNDS[theme], p.bgBase);
    assert.deepStrictEqual(firstPaintQuery({ theme }), {
      bg: p.bgBase,
      mode: p.group === 'light' ? 'light' : 'dark',
    });
  }
});

test('Window theme: the stored theme picks its background, unknown ones fall back to charcoal', () => {
  assert.strictEqual(windowBackgroundFor({ theme: 'daylight' }), '#f4f7fb');
  assert.strictEqual(windowBackgroundFor({ theme: 'ocean' }), '#0c3a5c');
  assert.strictEqual(windowBackgroundFor({ theme: 'deepseek-blue' }), '#0b0f19');
  assert.strictEqual(windowBackgroundFor({ theme: 'toString' }), '#0b0f19');
  assert.strictEqual(windowBackgroundFor(undefined), '#0b0f19');
  assert.strictEqual(windowBackgroundFor(null), '#0b0f19');
});

/**
 * Loads the shell from a URL and reads the tokens before init() can apply the stored theme
 * (getSettings never resolves here).
 * @param {string} search
 */
function firstPaintTokens(search) {
  const dom = new JSDOM(HTML, {
    url: 'file://' + HTML_PATH + search,
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      /** @type {any} */ (window).nomadDesktop = { getSettings: () => new Promise(() => {}) };
    },
  });
  const root = dom.window.document.documentElement;
  return {
    bg: root.style.getPropertyValue('--bg-base').trim(),
    scheme: root.style.colorScheme,
  };
}

test('Window theme: the shell paints the stored theme background before settings load', () => {
  assert.deepStrictEqual(firstPaintTokens('?bg=%23f4f7fb&mode=light'), {
    bg: '#f4f7fb',
    scheme: 'light',
  });
  assert.deepStrictEqual(firstPaintTokens('?bg=%230c3a5c&mode=dark'), {
    bg: '#0c3a5c',
    scheme: 'dark',
  });
});

test('Window theme: a malformed or missing query keeps the stylesheet defaults', () => {
  assert.deepStrictEqual(firstPaintTokens(''), { bg: '', scheme: '' });
  assert.deepStrictEqual(firstPaintTokens('?bg=red;x:url(evil)&mode=sepia'), {
    bg: '',
    scheme: '',
  });
});
