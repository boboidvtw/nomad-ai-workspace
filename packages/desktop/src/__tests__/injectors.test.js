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
