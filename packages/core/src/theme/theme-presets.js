/**
 * Nomad theme presets: the single source for every theme the Studio offers.
 * Studio index.html keeps an inline copy (it loads over file:// without Node);
 * packages/desktop/src/__tests__/window-theme.test.js fails when that copy drifts.
 *
 * Each theme sets every colour token. `text` runs strongest to dimmest; `fg` is the RGB of
 * the hairline/overlay tint (white on dark themes, ink on light ones); `accent` is the
 * accent a theme switches to, which a stored accent colour can still override.
 */

/**
 * @typedef {Object} ThemePreset
 * @property {"dark" | "light" | "vivid"} group
 * @property {string} label
 * @property {string} icon
 * @property {string} bgBase
 * @property {string} [bgImage]
 * @property {string} bgSurface
 * @property {string} bgDeep
 * @property {string} panel - "r, g, b"
 * @property {string} fg - "r, g, b"
 * @property {string[]} text - five shades, strongest first
 * @property {string} accent
 * @property {string} accent2
 * @property {string} [onAccent]
 */

const DEFAULT_THEME = 'charcoal';

/** @type {Readonly<Record<string, ThemePreset>>} */
const THEME_PRESETS = Object.freeze({
  charcoal: {
    group: 'dark',
    label: '深夜深灰',
    icon: '🌌',
    bgBase: '#0b0f19',
    bgSurface: 'rgba(15, 23, 42, 0.88)',
    bgDeep: '#090d16',
    panel: '30, 41, 59',
    fg: '255, 255, 255',
    text: ['#f8fafc', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b'],
    accent: '#38bdf8',
    accent2: '#2563eb',
  },
  oled: {
    group: 'dark',
    label: '太空純黑',
    icon: '🖤',
    bgBase: '#000000',
    bgSurface: 'rgba(10, 10, 10, 0.95)',
    bgDeep: '#000000',
    panel: '23, 23, 23',
    fg: '255, 255, 255',
    text: ['#f8fafc', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b'],
    accent: '#38bdf8',
    accent2: '#6366f1',
  },
  cyberpunk: {
    group: 'dark',
    label: '賽博藍紫',
    icon: '⚡',
    bgBase: '#0a0618',
    bgSurface: 'rgba(24, 15, 46, 0.9)',
    bgDeep: '#07041a',
    panel: '40, 24, 74',
    fg: '255, 255, 255',
    text: ['#f8fafc', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b'],
    accent: '#a855f7',
    accent2: '#6366f1',
  },
  aurora: {
    group: 'dark',
    label: '極光翡翠',
    icon: '🌲',
    bgBase: '#041410',
    bgSurface: 'rgba(6, 32, 25, 0.9)',
    bgDeep: '#03100c',
    panel: '10, 48, 38',
    fg: '255, 255, 255',
    text: ['#f8fafc', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b'],
    accent: '#10b981',
    accent2: '#0d9488',
  },
  nordic: {
    group: 'dark',
    label: '極簡冷銀',
    icon: '❄️',
    bgBase: '#0f172a',
    bgSurface: 'rgba(30, 41, 59, 0.9)',
    bgDeep: '#0b1222',
    panel: '30, 41, 59',
    fg: '255, 255, 255',
    text: ['#f8fafc', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b'],
    accent: '#38bdf8',
    accent2: '#2563eb',
  },
  daylight: {
    group: 'light',
    label: '晨光白',
    icon: '☀️',
    bgBase: '#f4f7fb',
    bgImage: 'linear-gradient(135deg, #f8fbff 0%, #eef2ff 100%)',
    bgSurface: 'rgba(255, 255, 255, 0.82)',
    bgDeep: '#e8eef6',
    panel: '255, 255, 255',
    fg: '15, 23, 42',
    text: ['#0f172a', '#1e293b', '#334155', '#475569', '#556274'],
    accent: '#2563eb',
    accent2: '#7c3aed',
  },
  peach: {
    group: 'light',
    label: '蜜桃晨曦',
    icon: '🍑',
    bgBase: '#fff5f0',
    bgImage: 'linear-gradient(135deg, #fff7ed 0%, #ffe4e6 100%)',
    bgSurface: 'rgba(255, 251, 248, 0.84)',
    bgDeep: '#ffe9df',
    panel: '255, 255, 255',
    fg: '67, 20, 7',
    text: ['#431407', '#4a2318', '#6b3a2c', '#7a4636', '#7f4a3b'],
    accent: '#e11d48',
    accent2: '#f97316',
  },
  mint: {
    group: 'light',
    label: '薄荷蘇打',
    icon: '🌿',
    bgBase: '#effcf6',
    bgImage: 'linear-gradient(135deg, #ecfdf5 0%, #e0f2fe 100%)',
    bgSurface: 'rgba(255, 255, 255, 0.82)',
    bgDeep: '#dcf5ea',
    panel: '255, 255, 255',
    fg: '2, 44, 34',
    text: ['#022c22', '#064e3b', '#065f46', '#2f5e51', '#3b6559'],
    accent: '#047857',
    accent2: '#0284c7',
  },
  lavender: {
    group: 'light',
    label: '薰衣草田',
    icon: '💜',
    bgBase: '#f6f3ff',
    bgImage: 'linear-gradient(135deg, #f5f3ff 0%, #fdf2f8 100%)',
    bgSurface: 'rgba(255, 255, 255, 0.82)',
    bgDeep: '#ece6fd',
    panel: '255, 255, 255',
    fg: '46, 16, 101',
    text: ['#2e1065', '#3b0764', '#4c1d95', '#5b4a86', '#6d5f96'],
    accent: '#7c3aed',
    accent2: '#db2777',
  },
  neon: {
    group: 'vivid',
    label: '霓虹夜城',
    icon: '🌆',
    bgBase: '#1a0b2e',
    bgImage: 'linear-gradient(135deg, #3b0764 0%, #831843 55%, #1e1b4b 100%)',
    bgSurface: 'rgba(59, 7, 100, 0.35)',
    bgDeep: '#1e0a3a',
    panel: '88, 28, 135',
    fg: '255, 255, 255',
    text: ['#ffffff', '#fdf4ff', '#fae8ff', '#f5d0fe', '#f0c4fc'],
    accent: '#f9a8d4',
    accent2: '#c084fc',
    onAccent: '#3b0764',
  },
  sunset: {
    group: 'vivid',
    label: '熱帶夕陽',
    icon: '🌅',
    bgBase: '#4a1530',
    bgImage: 'linear-gradient(135deg, #9a3412 0%, #be185d 50%, #6b21a8 100%)',
    bgSurface: 'rgba(88, 14, 50, 0.35)',
    bgDeep: '#4a1028',
    panel: '136, 19, 75',
    fg: '255, 255, 255',
    text: ['#ffffff', '#fff7ed', '#ffedd5', '#fed7aa', '#fdd0a2'],
    accent: '#fcd34d',
    accent2: '#fb923c',
    onAccent: '#3b0a1e',
  },
  ocean: {
    group: 'vivid',
    label: '海洋湛藍',
    icon: '🌊',
    bgBase: '#0c3a5c',
    bgImage: 'linear-gradient(135deg, #075985 0%, #1d4ed8 55%, #0e7490 100%)',
    bgSurface: 'rgba(8, 40, 80, 0.35)',
    bgDeep: '#0b2f55',
    panel: '14, 80, 140',
    fg: '255, 255, 255',
    text: ['#ffffff', '#f0f9ff', '#e0f2fe', '#bae6fd', '#b3e0fb'],
    accent: '#67e8f9',
    accent2: '#60a5fa',
    onAccent: '#082f49',
  },
});

/**
 * @param {unknown} name
 * @returns {string} a THEME_PRESETS key; unknown names fall back to charcoal
 */
function resolveThemeName(name) {
  return typeof name === 'string' && Object.hasOwn(THEME_PRESETS, name) ? name : DEFAULT_THEME;
}

/**
 * @param {unknown} value
 * @returns {value is string} true for "#rrggbb"
 */
function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

/**
 * @param {string} hex "#rrggbb"
 * @returns {string} "r, g, b"
 */
function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
}

module.exports = { DEFAULT_THEME, THEME_PRESETS, resolveThemeName, isHexColor, hexToRgb };
