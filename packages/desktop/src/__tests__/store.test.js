const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { SettingsStore } = require('../store.js');

test('Store: Defaults are loaded when file does not exist', () => {
  const tmpFile = path.join(os.tmpdir(), `nomad-test-store-${Date.now()}.json`);
  const store = new SettingsStore(tmpFile).init();

  assert.strictEqual(store.get('layout'), 'focus');
  assert.deepStrictEqual(store.get('activePlatforms'), ['chatgpt']);
  assert.strictEqual(store.get('shortcut'), 'CommandOrControl+Shift+Space');
  assert.strictEqual(store.get('bridgePort'), 8765);
  assert.strictEqual(store.getZoom('claude'), 1.0);

  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});

test('Store: Saves and persists updates properly', () => {
  const tmpFile = path.join(os.tmpdir(), `nomad-test-store-save-${Date.now()}.json`);
  const store = new SettingsStore(tmpFile).init();

  store.set('layout', 'quad');
  store.setZoom('gemini', 1.25);
  store.update({ splitRatio: 0.65 });

  assert.strictEqual(store.get('layout'), 'quad');
  assert.strictEqual(store.getZoom('gemini'), 1.25);
  assert.strictEqual(store.get('splitRatio'), 0.65);

  // Reload from file to verify persistence
  const reloaded = new SettingsStore(tmpFile).init();
  assert.strictEqual(reloaded.get('layout'), 'quad');
  assert.strictEqual(reloaded.getZoom('gemini'), 1.25);
  assert.strictEqual(reloaded.get('splitRatio'), 0.65);

  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});

test('Store: Zoom factor is clamped safely between 0.5 and 2.0', () => {
  const tmpFile = path.join(os.tmpdir(), `nomad-test-store-zoom-${Date.now()}.json`);
  const store = new SettingsStore(tmpFile).init();

  store.setZoom('claude', 5.0);
  assert.strictEqual(store.getZoom('claude'), 2.0);

  store.setZoom('claude', 0.1);
  assert.strictEqual(store.getZoom('claude'), 0.5);

  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});

test('Store: Settings saved with DeepSeek load with Copilot in its place', () => {
  const tmpFile = path.join(os.tmpdir(), `nomad-test-store-deepseek-${Date.now()}.json`);
  fs.writeFileSync(
    tmpFile,
    JSON.stringify({
      layout: 'dual',
      activePlatforms: ['deepseek', 'claude'],
      zoomFactors: { chatgpt: 0.95, deepseek: 1.2 },
    }),
  );

  const store = new SettingsStore(tmpFile).init();

  assert.deepStrictEqual(store.get('activePlatforms'), ['copilot', 'claude']);
  assert.strictEqual(store.getZoom('chatgpt'), 0.95);
  assert.strictEqual(store.getZoom('copilot'), 1.0);
  assert.strictEqual('deepseek' in store.get('zoomFactors'), false);

  fs.unlinkSync(tmpFile);
});

test('Store: Replacing DeepSeek never shows Copilot twice', () => {
  const tmpFile = path.join(os.tmpdir(), `nomad-test-store-dupe-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify({ activePlatforms: ['copilot', 'deepseek'] }));

  const store = new SettingsStore(tmpFile).init();

  assert.deepStrictEqual(store.get('activePlatforms'), ['copilot']);
  fs.unlinkSync(tmpFile);
});
