const test = require('node:test');
const assert = require('node:assert/strict');
const {
  THEME_PRESETS,
  DEFAULT_THEME,
  resolveThemeName,
  isHexColor,
  hexToRgb,
} = require('../../index');

test('Theme presets: twelve themes, each with every token', () => {
  assert.equal(Object.keys(THEME_PRESETS).length, 12);
  for (const [name, p] of Object.entries(THEME_PRESETS)) {
    assert.ok(['dark', 'light', 'vivid'].includes(p.group), name);
    assert.ok(isHexColor(p.bgBase) && isHexColor(p.accent) && isHexColor(p.accent2), name);
    assert.equal(p.text.length, 5, name);
    assert.match(p.panel, /^\d{1,3}, \d{1,3}, \d{1,3}$/, name);
    assert.match(p.fg, /^\d{1,3}, \d{1,3}, \d{1,3}$/, name);
  }
});

test('Theme presets: unknown names fall back to the default theme', () => {
  assert.equal(resolveThemeName('daylight'), 'daylight');
  assert.equal(resolveThemeName('deepseek-blue'), DEFAULT_THEME);
  assert.equal(resolveThemeName('toString'), DEFAULT_THEME);
  assert.equal(resolveThemeName(undefined), DEFAULT_THEME);
});

test('Theme presets: hex helpers only accept #rrggbb', () => {
  assert.equal(isHexColor('#2563eb'), true);
  assert.equal(isHexColor('#fff'), false);
  assert.equal(isHexColor('red;}</style>'), false);
  assert.equal(hexToRgb('#2563eb'), '37, 99, 235');
});
