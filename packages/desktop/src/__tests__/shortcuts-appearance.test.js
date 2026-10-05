const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { SettingsStore } = require('../store');

test('Desktop Store: Shortcuts & Appearance configuration persistence', () => {
  const tempPath = path.join(os.tmpdir(), `nomad-test-settings-${Date.now()}.json`);
  const store = new SettingsStore(tempPath);
  store.init();

  // Test defaults
  const shortcuts = store.get('shortcuts');
  assert.ok(shortcuts);
  assert.strictEqual(shortcuts.toggleWindow, 'CommandOrControl+Shift+Space');
  assert.strictEqual(shortcuts.toggleFocus, 'CommandOrControl+Shift+F');

  const appearance = store.get('appearance');
  assert.ok(appearance);
  assert.strictEqual(appearance.theme, 'charcoal');
  assert.strictEqual(appearance.accentColor, '#38bdf8');

  // Test update shortcuts
  store.update({
    shortcuts: {
      toggleWindow: 'CommandOrControl+Alt+Space',
      toggleHUD: 'CommandOrControl+Shift+U'
    },
    appearance: {
      theme: 'cyberpunk',
      accentColor: '#a855f7'
    }
  });

  assert.strictEqual(store.get('shortcuts').toggleWindow, 'CommandOrControl+Alt+Space');
  assert.strictEqual(store.get('shortcuts').toggleFocus, 'CommandOrControl+Shift+F'); // Preserved
  assert.strictEqual(store.get('shortcuts').toggleHUD, 'CommandOrControl+Shift+U');
  assert.strictEqual(store.get('appearance').theme, 'cyberpunk');
  assert.strictEqual(store.get('appearance').accentColor, '#a855f7');

  // Verify reload from disk
  const reloadedStore = new SettingsStore(tempPath);
  reloadedStore.init();
  assert.strictEqual(reloadedStore.get('shortcuts').toggleWindow, 'CommandOrControl+Alt+Space');
  assert.strictEqual(reloadedStore.get('appearance').theme, 'cyberpunk');

  // Cleanup
  try { fs.unlinkSync(tempPath); } catch {}
});
