const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { DASHBOARD_HTML_PATH } = require('@nomad/dashboard');

const DASHBOARD_FILES = [DASHBOARD_HTML_PATH];

for (const file of DASHBOARD_FILES) {
  test(
    'Dashboard: inline scripts parse without syntax errors (' + path.basename(file) + ')',
    () => {
      const html = fs.readFileSync(file, 'utf-8');
      const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
      let match;
      let count = 0;
      while ((match = re.exec(html))) {
        count++;
        const line = html.slice(0, match.index).split('\n').length;
        assert.doesNotThrow(
          () => new vm.Script(match[1], { filename: path.basename(file) + ':' + line }),
          'Inline <script> starting at line ' + line + ' has a syntax error',
        );
      }
      assert.ok(count > 0, 'expected at least one inline script');
    },
  );
}

function decodeEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

for (const file of DASHBOARD_FILES) {
  test(
    'Dashboard: inline event handlers parse without syntax errors (' + path.basename(file) + ')',
    () => {
      // Strip <script> bodies so JS string literals containing markup are not mistaken for attributes.
      const markup = fs
        .readFileSync(file, 'utf-8')
        .replace(
          /(<script[^>]*>)[\s\S]*?(<\/script>)/g,
          (m, open, close) => open + '\n'.repeat(m.split('\n').length - 1) + close,
        );
      const re = /\s(on[a-z]+)="([^"]*)"/g;
      let match;
      let count = 0;
      while ((match = re.exec(markup))) {
        count++;
        const line = markup.slice(0, match.index).split('\n').length;
        const code = decodeEntities(match[2]);
        assert.doesNotThrow(
          () =>
            new vm.Script('(function (event) {\n' + code + '\n})', {
              filename: path.basename(file) + ':' + line,
            }),
          match[1] + ' handler at line ' + line + ' has a syntax error: ' + code.slice(0, 120),
        );
      }
      assert.ok(count > 0, 'expected inline event handlers');
    },
  );
}
