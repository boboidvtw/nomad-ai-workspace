export type ThemePreset = {
    group: "dark" | "light" | "vivid";
    label: string;
    icon: string;
    bgBase: string;
    bgImage?: string | undefined;
    bgSurface: string;
    bgDeep: string;
    /**
     * - "r, g, b"
     */
    panel: string;
    /**
     * - "r, g, b"
     */
    fg: string;
    /**
     * - five shades, strongest first
     */
    text: string[];
    accent: string;
    accent2: string;
    onAccent?: string | undefined;
};
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
export const DEFAULT_THEME: "charcoal";
/** @type {Readonly<Record<string, ThemePreset>>} */
export const THEME_PRESETS: Readonly<Record<string, ThemePreset>>;
/**
 * @param {unknown} name
 * @returns {string} a THEME_PRESETS key; unknown names fall back to charcoal
 */
export function resolveThemeName(name: unknown): string;
/**
 * @param {unknown} value
 * @returns {value is string} true for "#rrggbb"
 */
export function isHexColor(value: unknown): value is string;
/**
 * @param {string} hex "#rrggbb"
 * @returns {string} "r, g, b"
 */
export function hexToRgb(hex: string): string;
