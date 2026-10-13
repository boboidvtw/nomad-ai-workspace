const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { PLATFORM_INJECTORS } = require('../injectors.js');

test('Injectors: Generates syntactically valid scripts for all platforms', () => {
  const platforms = ['claude', 'chatgpt', 'gemini', 'grok', 'copilot', 'perplexity'];
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
 * The pages each confirming injector types into. `send` is the button the page reacts to by
 * emptying the input box, the way the real sites do once they take the prompt.
 */
const SEND_PAGES = {
  claude: {
    html: '<div class="ProseMirror" contenteditable="true"></div><button aria-label="傳送訊息">↑</button>',
    input: '.ProseMirror',
  },
  chatgpt: {
    html: '<div id="prompt-textarea" contenteditable="true"><p></p></div><button data-testid="send-button" aria-label="傳送提示">↑</button>',
    input: '#prompt-textarea',
  },
  grok: {
    // The Voyager prompt manager's save button is also type=submit and comes first.
    html:
      '<div class="gv-pm"><button type="submit" class="gv-pm-save">儲存</button></div>' +
      '<form><textarea placeholder="Ask Grok"></textarea><button type="submit" aria-label="提交">↑</button></form>',
    input: 'textarea',
  },
  perplexity: {
    html: '<textarea placeholder="Ask anything"></textarea><button aria-label="Submit">→</button>',
    input: 'textarea',
  },
};

/**
 * Runs a confirming injector in jsdom.
 * @param {keyof typeof SEND_PAGES} platform
 * @param {{ swallowClicks?: boolean }} [opts]
 */
async function runConfirmingInjector(platform, opts = {}) {
  const { JSDOM } = require('jsdom');
  const page = SEND_PAGES[platform];
  // The Voyager extension tags <body> on these sites (gv-claude-page and the like).
  const dom = new JSDOM(`<!doctype html><body class="gv-${platform}-page">${page.html}</body>`, {
    runScripts: 'outside-only',
  });
  const doc = dom.window.document;
  const input = /** @type {HTMLElement & { value?: string }} */ (doc.querySelector(page.input));
  // jsdom has no layout; Grok picks the largest visible input.
  input.getBoundingClientRect = () => /** @type {DOMRect} */ ({ width: 400, height: 40 });
  doc.querySelector('form')?.addEventListener('submit', (e) => e.preventDefault());
  /** @type {string[]} */
  const sent = [];
  const send = doc.querySelector('button:not(.gv-pm-save)');
  send?.addEventListener('click', () => {
    sent.push(String(input.value ?? input.textContent));
    if ('value' in input && input.tagName === 'TEXTAREA') input.value = '';
    else input.innerHTML = '<p></p>';
  });
  if (opts.swallowClicks) {
    dom.window.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );
  }
  const result = await dom.window.eval(PLATFORM_INJECTORS[platform]('hello'));
  return { result, sent };
}

for (const platform of /** @type {(keyof typeof SEND_PAGES)[]} */ (Object.keys(SEND_PAGES))) {
  test(`Injectors: ${platform} reports ok once the prompt leaves the input box`, async () => {
    const { result, sent } = await runConfirmingInjector(platform);
    assert.deepStrictEqual({ ok: result.ok, via: result.via }, { ok: true, via: 'button' });
    assert.deepStrictEqual(sent, ['hello']);
  });

  test(`Injectors: ${platform} fails when the send click is swallowed`, async () => {
    const { result, sent } = await runConfirmingInjector(platform, { swallowClicks: true });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /did not send the prompt/);
    assert.deepStrictEqual(sent, []);
  });
}

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

/**
 * Builds a Copilot chat page. jsdom has no execCommand, so insertText is emulated the way
 * Lexical behaves: it replaces the editor's content, unless `ignoresInsert` is set.
 * @param {{ ignoresInsert?: boolean }} [opts]
 */
function copilotPage(opts = {}) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(
    '<!doctype html><body><div id="feed"></div>' +
      '<span id="m365-chat-editor-target-element" contenteditable="true">left over</span>' +
      '<button aria-label="傳送" type="submit">↑</button></body>',
    { runScripts: 'outside-only' },
  );
  const doc = dom.window.document;
  const editor = /** @type {HTMLElement} */ (doc.getElementById('m365-chat-editor-target-element'));
  Object.defineProperty(editor, 'innerText', { get: () => editor.textContent });
  /** @type {any} */ (doc).execCommand = (/** @type {string} */ cmd, _ui, value) => {
    if (cmd === 'insertText' && !opts.ignoresInsert) editor.textContent = String(value);
    return true;
  };
  /** @type {string[]} */
  const sent = [];
  doc.querySelector('button')?.addEventListener('click', () => {
    sent.push(String(editor.textContent));
    const bubble = doc.createElement('div');
    bubble.setAttribute('data-testid', 'chatQuestion');
    doc.getElementById('feed')?.appendChild(bubble);
  });
  return { dom, sent };
}

test('Injectors: Copilot replaces leftover text and confirms the send', async () => {
  const { dom, sent } = copilotPage();

  const result = await dom.window.eval(PLATFORM_INJECTORS.copilot('hello copilot'));

  assert.deepStrictEqual({ ok: result.ok, via: result.via }, { ok: true, via: 'button' });
  assert.deepStrictEqual(sent, ['hello copilot']);
});

test('Injectors: Copilot refuses to send when the editor kept its old text', async () => {
  const { dom, sent } = copilotPage({ ignoresInsert: true });

  const result = await dom.window.eval(PLATFORM_INJECTORS.copilot('hello copilot'));

  assert.strictEqual(result.ok, false);
  assert.match(result.error, /did not take the prompt/);
  assert.deepStrictEqual(sent, []);
});

/**
 * Builds the current Perplexity page: a Lexical editor (#ask-input) and a 提交 button.
 * jsdom has no execCommand, so insertText is emulated the way Lexical takes it, unless
 * `ignoresInsert` is set.
 * @param {{ ignoresInsert?: boolean }} [opts]
 */
function perplexityPage(opts = {}) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(
    '<!doctype html><body><div id="ask-input" contenteditable="true" role="textbox" data-lexical-editor="true"><p><br></p></div>' +
      '<button type="button" aria-label="聽寫">mic</button><button type="button" aria-label="提交">→</button></body>',
    { runScripts: 'outside-only' },
  );
  const doc = dom.window.document;
  const editor = /** @type {HTMLElement} */ (doc.getElementById('ask-input'));
  Object.defineProperty(editor, 'innerText', { get: () => editor.textContent });
  /** @type {any} */ (doc).execCommand = (/** @type {string} */ cmd, _ui, value) => {
    if (cmd === 'insertText' && !opts.ignoresInsert) editor.textContent = String(value);
    return true;
  };
  /** @type {string[]} */
  const sent = [];
  doc.querySelector('button[aria-label="提交"]')?.addEventListener('click', () => {
    sent.push(String(editor.textContent));
    editor.innerHTML = '<p><br></p>';
  });
  return { dom, sent };
}

test('Injectors: Perplexity types into its Lexical editor and clicks 提交', async () => {
  const { dom, sent } = perplexityPage();

  const result = await dom.window.eval(PLATFORM_INJECTORS.perplexity('hello perplexity'));

  assert.deepStrictEqual(
    { ok: result.ok, input: result.input, via: result.via },
    { ok: true, input: 'DIV', via: 'button' },
  );
  assert.deepStrictEqual(sent, ['hello perplexity']);
});

test('Injectors: Perplexity refuses to send when the editor did not take the prompt', async () => {
  const { dom, sent } = perplexityPage({ ignoresInsert: true });

  const result = await dom.window.eval(PLATFORM_INJECTORS.perplexity('hello perplexity'));

  assert.strictEqual(result.ok, false);
  assert.match(result.error, /did not take the prompt/);
  assert.deepStrictEqual(sent, []);
});
