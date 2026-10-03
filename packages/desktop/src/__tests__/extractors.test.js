const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { PLATFORM_EXTRACTORS } = require('../extractors.js');

test('Extractors: Generates syntactically valid extractor and status scripts', () => {
  const platforms = ['claude', 'chatgpt', 'gemini', 'grok'];

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
