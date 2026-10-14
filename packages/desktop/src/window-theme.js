/**
 * Nomad AI Studio - Window background per theme
 * The native window paints before index.html, so it needs the stored theme's base colour up
 * front; otherwise light themes flash dark at start. Colours come from @nomad/core's
 * THEME_PRESETS, which index.html mirrors (window-theme.test.js fails when they drift).
 */

const { THEME_PRESETS, resolveThemeName } = require('@nomad/core');

/** @type {Readonly<Record<string, string>>} */
const THEME_BACKGROUNDS = Object.freeze(
  Object.fromEntries(Object.entries(THEME_PRESETS).map(([name, p]) => [name, p.bgBase])),
);

/** @param {{ theme?: unknown } | null | undefined} appearance */
function windowBackgroundFor(appearance) {
  return THEME_BACKGROUNDS[resolveThemeName(appearance?.theme)];
}

/**
 * Query for index.html so its first paint already uses the theme background, before the
 * settings IPC returns and applyTheme() sets every token.
 * @param {{ theme?: unknown } | null | undefined} appearance
 */
function firstPaintQuery(appearance) {
  const preset = THEME_PRESETS[resolveThemeName(appearance?.theme)];
  return { bg: preset.bgBase, mode: preset.group === 'light' ? 'light' : 'dark' };
}

module.exports = { THEME_BACKGROUNDS, windowBackgroundFor, firstPaintQuery };
