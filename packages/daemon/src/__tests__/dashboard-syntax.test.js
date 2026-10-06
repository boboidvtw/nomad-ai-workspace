const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { DASHBOARD_HTML_PATH } = require('@nomad/dashboard');

const DASHBOARD_FILES = [DASHBOARD_HTML_PATH];

for (const file of DASHBOARD_FILES) {
  test('Dashboard: inline scripts parse without syntax errors (' + path.basename(file) + ')', () => {
    const html = fs.readFileSync(file, 'utf-8');
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
    let match;
    let count = 0;
    while ((match = re.exec(html))) {
      count++;
      const line = html.slice(0, match.index).split('\n').length;
      assert.doesNotThrow(
        () => new vm.Script(match[1], { filename: path.basename(file) + ':' + line }),
        'Inline <script> starting at line ' + line + ' has a syntax error'
      );
    }
    assert.ok(count > 0, 'expected at least one inline script');
  });
}
