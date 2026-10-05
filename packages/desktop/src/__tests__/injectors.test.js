const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { PLATFORM_INJECTORS } = require('../injectors.js');

test('Injectors: Generates syntactically valid scripts for all platforms', () => {
  const platforms = ['claude', 'chatgpt', 'gemini', 'grok', 'deepseek', 'perplexity'];
  const samplePrompt = 'Hello "world"! Testing special symbols: <script>alert(1)</script> \n newline & emoji 🚀';

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
      { name: 'architecture.png', type: 'image', mimeType: 'image/png' }
    ]
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
