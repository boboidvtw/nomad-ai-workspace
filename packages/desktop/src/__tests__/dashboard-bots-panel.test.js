const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const { composeDashboard, DASHBOARD_HTML_PATH, BOTS_PANEL_PATH } = require('@nomad/dashboard');

test('the served dashboard inlines the Bots panel at its marker', () => {
  const html = composeDashboard(fs.readFileSync(DASHBOARD_HTML_PATH, 'utf-8'));

  assert.ok(!html.includes('<!-- @nomad:bots-panel -->'));
  assert.ok(html.includes('id="bots-section"'));
  assert.ok(html.includes("filterCategory('bots')"));
});

test('the Bots panel script parses and never assigns API text to innerHTML', () => {
  const panel = fs.readFileSync(BOTS_PANEL_PATH, 'utf-8');
  const script = panel.slice(panel.lastIndexOf('<script>') + 8, panel.lastIndexOf('</script>'));

  assert.doesNotThrow(() => new vm.Script(script));
  assert.ok(!/innerHTML\s*=/.test(script), 'render with textContent / DOM nodes only');
});
