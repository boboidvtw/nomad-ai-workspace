/**
 * Dashboard theming: maps the Studio's stored appearance onto the dashboard's CSS tokens.
 * index.html's :root holds the default (classic dark) values; the Studio bridge injects a
 * `<style id="nomad-theme">` that overrides them. The daemon has no stored appearance and
 * serves the defaults.
 */

const { THEME_PRESETS, resolveThemeName, isHexColor, hexToRgb } = require('@nomad/core');

/** Status tints: pastels read on dark backgrounds, the 700 shades on light ones. */
const DARK_TINTS = {
  indigo: '#a5b4fc',
  green: '#6ee7b7',
  amber: '#fcd34d',
  cyan: '#67e8f9',
  violet: '#c4b5fd',
  red: '#fca5a5',
  blue: '#93c5fd',
};
const LIGHT_TINTS = {
  indigo: '#4338ca',
  green: '#047857',
  amber: '#b45309',
  cyan: '#0e7490',
  violet: '#6d28d9',
  red: '#b91c1c',
  blue: '#1d4ed8',
};

/**
 * @typedef {{ theme?: unknown, accentColor?: unknown }} Appearance
 */

/**
 * @param {Appearance} appearance
 * @returns {Record<string, string>} CSS custom properties for the dashboard
 */
function dashboardThemeTokens(appearance) {
  const preset = THEME_PRESETS[resolveThemeName(appearance.theme)];
  const light = preset.group === 'light';
  const accent = isHexColor(appearance.accentColor) ? appearance.accentColor : preset.accent;
  const accentRgb = hexToRgb(accent);
  const tints = light ? LIGHT_TINTS : DARK_TINTS;
  /** @type {Record<string, string>} */
  const tokens = {
    'color-scheme': light ? 'light' : 'dark',
    '--bg': preset.bgBase,
    '--bg-image': preset.bgImage || 'none',
    '--bg-surface': preset.bgSurface,
    '--bg-solid': light ? `rgb(${preset.panel})` : preset.bgDeep,
    '--panel-rgb': preset.panel,
    '--fg-rgb': preset.fg,
    '--well-rgb': light ? '255, 255, 255' : '0, 0, 0',
    '--card-bg': `rgba(${preset.panel}, 0.72)`,
    '--card-hover': `rgba(${preset.panel}, 0.88)`,
    '--card-border': `rgba(${preset.fg}, ${light ? 0.12 : 0.08})`,
    '--card-border-hover': `rgba(${accentRgb}, 0.45)`,
    '--primary': accent,
    '--primary-rgb': accentRgb,
    '--primary-hover': preset.accent2,
    '--primary-glow': `rgba(${accentRgb}, 0.3)`,
    '--on-primary': preset.onAccent || '#ffffff',
    '--text': preset.text[0],
    '--text-soft': preset.text[2],
    '--text-muted': preset.text[3],
    '--text-subtle': preset.text[4],
  };
  for (const [name, value] of Object.entries(tints)) tokens[`--tint-${name}`] = value;
  return tokens;
}

/**
 * Injects the stored theme into the dashboard HTML. Every value comes from THEME_PRESETS or
 * a validated #rrggbb accent, so nothing user-typed reaches the stylesheet.
 * @param {string} html
 * @param {Appearance | null | undefined} appearance
 * @returns {string}
 */
function themeDashboardHtml(html, appearance) {
  if (!appearance) return html;
  const tokens = dashboardThemeTokens(appearance);
  const body = Object.entries(tokens)
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');
  const style = `<style id="nomad-theme">:root { ${body} }</style>`;
  return html
    .replace(
      /<html([^>]*)>/i,
      (_, attrs) => `<html${attrs} data-theme-mode="${tokens['color-scheme']}">`,
    )
    .replace(/<\/head>/i, () => `${style}</head>`);
}

module.exports = { dashboardThemeTokens, themeDashboardHtml };
