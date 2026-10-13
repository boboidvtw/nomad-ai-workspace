/**
 * Nomad AI Studio - Window background per theme
 * The native window paints before index.html, so it needs the stored theme's base colour up
 * front; otherwise light themes flash dark at start. Mirrors `bgBase` and `group` in
 * THEME_PRESETS (index.html); window-theme.test.js fails when the two drift apart.
 */

const DEFAULT_THEME = 'charcoal';

/** @type {Readonly<Record<string, string>>} */
const THEME_BACKGROUNDS = Object.freeze({
  charcoal: '#0b0f19',
  oled: '#000000',
  cyberpunk: '#0a0618',
  aurora: '#041410',
  nordic: '#0f172a',
  daylight: '#f4f7fb',
  peach: '#fff5f0',
  mint: '#effcf6',
  lavender: '#f6f3ff',
  neon: '#1a0b2e',
  sunset: '#4a1530',
  ocean: '#0c3a5c',
});

const LIGHT_THEMES = new Set(['daylight', 'peach', 'mint', 'lavender']);

/** @param {{ theme?: unknown } | null | undefined} appearance */
function resolveTheme(appearance) {
  const theme = appearance?.theme;
  return typeof theme === 'string' && Object.hasOwn(THEME_BACKGROUNDS, theme)
    ? theme
    : DEFAULT_THEME;
}

/** @param {{ theme?: unknown } | null | undefined} appearance */
function windowBackgroundFor(appearance) {
  return THEME_BACKGROUNDS[resolveTheme(appearance)];
}

/**
 * Query for index.html so its first paint already uses the theme background, before the
 * settings IPC returns and applyTheme() sets every token.
 * @param {{ theme?: unknown } | null | undefined} appearance
 */
function firstPaintQuery(appearance) {
  const theme = resolveTheme(appearance);
  return { bg: THEME_BACKGROUNDS[theme], mode: LIGHT_THEMES.has(theme) ? 'light' : 'dark' };
}

module.exports = { THEME_BACKGROUNDS, windowBackgroundFor, firstPaintQuery };
