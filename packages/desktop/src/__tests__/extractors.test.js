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

test('Extractors: Claude reads only the markdown of the last reply, not its row chrome', () => {
  const { JSDOM } = require('jsdom');
  // The current claude.ai row: a screen-reader label and an action bar around the markdown.
  const row = (/** @type {string} */ body) =>
    '<div data-testid="assistant-message"><span class="sr-only">Claude 已回覆：</span>' +
    `<div class="standard-markdown">${body}</div>` +
    '<div role="group"><button aria-label="複製"></button><span>現在</span></div></div>';
  const dom = new JSDOM(
    `<!doctype html><body>${row('<p>old</p>')}${row('<p>CODE-1</p><p>line two</p>')}</body>`,
    { runScripts: 'outside-only' },
  );

  const reply = dom.window.eval(PLATFORM_EXTRACTORS.claude.getLatestResponse());

  // jsdom has no innerText, so paragraphs are not separated here; Chromium adds newlines.
  assert.strictEqual(reply.ok, true);
  assert.match(reply.text, /^CODE-1\s*line two$/);
});

test('Extractors: Perplexity drops inline citation chips from the reply', () => {
  const { JSDOM } = require('jsdom');
  // Live perplexity.ai markup (2026-10-14): each source is an inline chip "<site> +N".
  const chip = (/** @type {string} */ site) =>
    `<span class="citation inline" data-pplx-citation="" data-pplx-citation-url="https://${site}.com/x">` +
    `<span class="group/trigger inline-flex"><span class="citation inline"><span>${site}</span><span>+1</span></span></span></span>`;
  const dom = new JSDOM(
    '<!doctype html><body>' +
      '<div class="prose"><p>old answer</p></div>' +
      `<div class="prose"><p>選 RAG。${chip('databricks')}</p><p>第二點。${chip('redhat')}</p></div>` +
      '</body>',
    { runScripts: 'outside-only' },
  );
  const before = dom.window.document.body.innerHTML;

  const reply = dom.window.eval(PLATFORM_EXTRACTORS.perplexity.getLatestResponse());

  assert.strictEqual(reply.ok, true);
  assert.ok(!/databricks|redhat|\+1/.test(reply.text), `chip text leaked: ${reply.text}`);
  assert.match(reply.text, /選 RAG。/);
  assert.match(reply.text, /第二點。/);
  assert.strictEqual(reply.length, reply.text.length);
  assert.strictEqual(dom.window.document.body.innerHTML, before, 'page DOM is left untouched');
});
