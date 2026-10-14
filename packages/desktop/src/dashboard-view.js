/**
 * Nomad AI Studio - In-app Dashboard view
 * The Dashboard is served by the Studio bridge with the auth token inlined, so it opens in its
 * own WebContentsView (X-Frame-Options: DENY rules out an iframe). Navigation stays on the
 * bridge's /dashboard page; any other link goes to the system browser.
 */

/** Dashboard sections that can be opened directly (`#bots` etc.). */
const DASHBOARD_SECTIONS = Object.freeze([
  'all',
  'agents',
  'ai',
  'bots',
  'infra',
  'tasks',
  'tools',
]);

/**
 * Normalises a requested section hash; unknown values open the default view.
 * @param {unknown} hash
 * @returns {string} '' or '#<section>'
 */
function normalizeDashboardHash(hash) {
  const name = String(hash || '').replace(/^#/, '');
  return DASHBOARD_SECTIONS.includes(name) ? `#${name}` : '';
}

/**
 * @param {number} port - Port the Studio bridge actually listens on
 * @param {unknown} [hash]
 * @returns {string}
 */
function dashboardUrl(port, hash) {
  return `http://127.0.0.1:${port}/dashboard${normalizeDashboardHash(hash)}`;
}

/**
 * True when the view may navigate to `url`: only the bridge's own dashboard page.
 * @param {string} url
 * @param {number} port
 * @returns {boolean}
 */
function isDashboardNavigation(url, port) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'http:' &&
      parsed.hostname === '127.0.0.1' &&
      parsed.port === String(port) &&
      /^\/dashboard\/?$/.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

/**
 * True for URLs safe to hand to the system browser.
 * @param {unknown} url
 * @returns {boolean}
 */
function isExternalWebUrl(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * The Dashboard takes the whole content area that platform views share.
 * @param {{ winWidth: number, winHeight: number, topBarHeight: number, bottomBarHeight: number, drawerWidth?: number }} params
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
function dashboardBounds({ winWidth, winHeight, topBarHeight, bottomBarHeight, drawerWidth = 0 }) {
  return {
    x: 0,
    y: topBarHeight,
    width: Math.max(200, winWidth - Math.max(0, drawerWidth)),
    height: Math.max(100, winHeight - topBarHeight - bottomBarHeight),
  };
}

module.exports = {
  DASHBOARD_SECTIONS,
  normalizeDashboardHash,
  dashboardUrl,
  isDashboardNavigation,
  isExternalWebUrl,
  dashboardBounds,
};
