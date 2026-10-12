const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { PLATFORM_EXTRACTORS } = require('../extractors.js');

test('Extractors: Generates syntactically valid extractor and status scripts', () => {
  const platforms = ['claude', 'chatgpt', 'gemini', 'grok', 'copilot', 'perplexity'];

  for (const p of platforms) {
    const ext = PLATFORM_EXTRACTORS[p];
    assert.ok(ext, `Extractor for ${p} should exist`);
    assert.strictEqual(typeof ext.getLatestResponse, 'function');
    assert.strictEqual(typeof ext.checkStatus, 'function');

    const getScript = ext.getLatestResponse();
    const statusScript = ext.checkStatus();

    assert.doesNotThrow(() => {
      new vm.Script(getScript);
    }, `getLatestResponse for ${p} should compile cleanly`);

    assert.doesNotThrow(() => {
      new vm.Script(statusScript);
    }, `checkStatus for ${p} should compile cleanly`);
  }
});

test('Extractors: Copilot reads the last reply without zero-width characters', () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(
    '<!doctype html><body>' +
      '<div data-testid="markdown-reply"><p>first</p></div>' +
      '<div data-testid="markdown-reply"><p>CPX-1234​‌</p></div>' +
      '<button aria-label="停止產生">■</button></body>',
    { runScripts: 'outside-only' },
  );
  const stop = /** @type {HTMLElement} */ (dom.window.document.querySelector('button'));
  stop.getBoundingClientRect = () => /** @type {DOMRect} */ ({ height: 20 });

  const reply = dom.window.eval(PLATFORM_EXTRACTORS.copilot.getLatestResponse());
  // Copy out of the jsdom realm before comparing.
  assert.deepStrictEqual({ ...reply }, { ok: true, text: 'CPX-1234', length: 8 });
  assert.strictEqual(dom.window.eval(PLATFORM_EXTRACTORS.copilot.checkStatus()).isStreaming, true);

  stop.remove();
  assert.strictEqual(dom.window.eval(PLATFORM_EXTRACTORS.copilot.checkStatus()).isStreaming, false);
});
