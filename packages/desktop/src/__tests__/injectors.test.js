const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { PLATFORM_INJECTORS } = require('../injectors.js');

test('Injectors: Generates syntactically valid scripts for all platforms', () => {
  const platforms = ['claude', 'chatgpt', 'gemini', 'grok', 'deepseek', 'perplexity'];
  const samplePrompt =
    'Hello "world"! Testing special symbols: <script>alert(1)</script> \n newline & emoji 🚀';

  for (const p of platforms) {
    const fn = PLATFORM_INJECTORS[p];
    assert.strictEqual(typeof fn, 'function', `Injector for ${p} should be a function`);

    const scriptText = fn(samplePrompt);
    assert.strictEqual(typeof scriptText, 'string');
    assert.ok(scriptText.length > 50);

    // Verify syntax using Node VM without executing browser DOM operations
    assert.doesNotThrow(() => {
      new vm.Script(scriptText);
    }, `Script for ${p} should have valid syntax`);
  }
});

test('Injectors: Formats attachments into prompt payload properly', () => {
  const { formatPromptWithAttachments } = require('../injectors.js');
  const payload = {
    text: '請分析這段代碼',
    attachments: [
      { name: 'server.py', type: 'text', language: 'python', content: 'print("hello")' },
      { name: 'architecture.png', type: 'image', mimeType: 'image/png' },
    ],
  };

  const formatted = formatPromptWithAttachments(payload.text, payload.attachments);
  assert.ok(formatted.includes('[附檔: server.py]'));
  assert.ok(formatted.includes('print("hello")'));
  assert.ok(formatted.includes('[圖片附件: architecture.png (image/png)]'));
  assert.ok(formatted.includes('請分析這段代碼'));

  // Test via injector function
  const script = PLATFORM_INJECTORS.claude(payload);
  assert.ok(script.includes('server.py'));
  assert.ok(script.includes('architecture.png'));
});

/**
 * Runs an injector inside a jsdom page and resolves after its delayed send step.
 * @param {string} html
 * @param {string} script
 */
async function runInjector(html, script) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { runScripts: 'outside-only' });
  /** @type {string[]} */
  const clicks = [];
  for (const btn of dom.window.document.querySelectorAll('button')) {
    btn.addEventListener('click', () => clicks.push(btn.getAttribute('aria-label') || ''));
  }
  const result = dom.window.eval(script);
  await new Promise((resolve) => setTimeout(resolve, 400));
  return { result, clicks, document: dom.window.document };
}

test('Injectors: Claude clicks the zh-Hant send button (傳送訊息)', async () => {
  const { result, clicks } = await runInjector(
    '<div class="ProseMirror" contenteditable="true"></div><button aria-label="傳送訊息">↑</button>',
    PLATFORM_INJECTORS.claude('hello'),
  );
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(clicks, ['傳送訊息']);
});

test('Injectors: toDeliveryResult keeps a failed injector result failed', () => {
  const { toDeliveryResult } = require('../injectors.js');
  assert.deepStrictEqual(toDeliveryResult({ ok: false, error: 'ChatGPT input not found' }), {
    ok: false,
    error: 'ChatGPT input not found',
  });
  assert.deepStrictEqual(toDeliveryResult({ ok: true, input: 'DIV' }), {
    ok: true,
    data: { ok: true, input: 'DIV' },
  });
  assert.deepStrictEqual(toDeliveryResult(undefined), { ok: true, data: undefined });
});

const GEMINI_PAGE =
  '<rich-textarea><div class="ql-editor" contenteditable="true"><p></p></div></rich-textarea>' +
  '<button aria-label="傳送訊息">↑</button>';

test('Injectors: Gemini reports ok once the prompt leaves the input box', async () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(`<!doctype html><body>${GEMINI_PAGE}</body>`, {
    runScripts: 'outside-only',
  });
  const doc = dom.window.document;
  const editor = /** @type {HTMLElement} */ (doc.querySelector('.ql-editor'));
  // jsdom has no layout; make the editor count as visible.
  editor.getBoundingClientRect = () => /** @type {DOMRect} */ ({ height: 20 });
  doc.querySelector('button')?.addEventListener('click', () => {
    editor.innerHTML = '<p></p>';
  });

  const result = await dom.window.eval(PLATFORM_INJECTORS.gemini('hello'));
  assert.deepStrictEqual({ ok: result.ok, via: result.via }, { ok: true, via: 'button' });
});

test('Injectors: Gemini fails when the send click is swallowed', async () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(`<!doctype html><body>${GEMINI_PAGE}</body>`, {
    runScripts: 'outside-only',
  });
  const doc = dom.window.document;
  const editor = /** @type {HTMLElement} */ (doc.querySelector('.ql-editor'));
  editor.getBoundingClientRect = () => /** @type {DOMRect} */ ({ height: 20 });
  // What the extension guide did: cancel every page click in the capture phase.
  dom.window.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  const result = await dom.window.eval(PLATFORM_INJECTORS.gemini('hello'));
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /did not send/);
  assert.strictEqual(editor.textContent, 'hello');
});
