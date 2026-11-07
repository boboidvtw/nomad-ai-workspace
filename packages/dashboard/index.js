/**
 * @nomad/dashboard - Single source of the Nomad Dashboard HTML and its static handler.
 * Served by both @nomad/daemon and the desktop Studio bridge.
 */

const fs = require('fs');
const path = require('path');
const { err, ErrorCodes } = require('@nomad/core');
const { dashboardThemeTokens, themeDashboardHtml } = require('./theme');

const DASHBOARD_HTML_PATH = path.join(__dirname, 'index.html');
const BOTS_PANEL_PATH = path.join(__dirname, 'bots-panel.html');
const BOTS_PANEL_MARKER = '<!-- @nomad:bots-panel -->';
const SERVICE_PANEL_PATH = path.join(__dirname, 'service-panel.html');
const SERVICE_PANEL_MARKER = '<!-- @nomad:service-panel -->';
const CALENDAR_PANEL_PATH = path.join(__dirname, 'calendar-panel.html');
const CALENDAR_PANEL_MARKER = '<!-- @nomad:calendar-panel -->';
const SHIPPING_PANEL_PATH = path.join(__dirname, 'shipping-panel.html');
const SHIPPING_PANEL_MARKER = '<!-- @nomad:shipping-panel -->';
const GITHUB_PANEL_PATH = path.join(__dirname, 'github-panel.html');
const GITHUB_PANEL_MARKER = '<!-- @nomad:github-panel -->';
const GITHUB_DATA_PATH = path.join(__dirname, 'github-inventory.json');
const GITHUB_DATA_MARKER = '/*@nomad:github-inventory-data*/';

/**
 * Inlines the GitHub inventory snapshot into its JSON script tag.
 * `<` is escaped so the data can never close the script element.
 * @param {string} html
 * @returns {string}
 */
function inlineGithubData(html) {
  if (!html.includes(GITHUB_DATA_MARKER) || !fs.existsSync(GITHUB_DATA_PATH)) return html;
  const data = JSON.parse(fs.readFileSync(GITHUB_DATA_PATH, 'utf-8'));
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return html.replace(GITHUB_DATA_MARKER, () => json);
}

/**
 * @param {string} html
 * @param {string} marker
 * @param {string} filePath
 * @returns {string}
 */
function inlinePanel(html, marker, filePath) {
  if (!html.includes(marker) || !fs.existsSync(filePath)) return html;
  const panel = fs.readFileSync(filePath, 'utf-8');
  return html.replace(marker, () => panel);
}

/**
 * Inlines the panels kept in their own files so index.html does not keep growing.
 * @param {string} html
 * @returns {string}
 */
function composeDashboard(html) {
  const page = [
    [BOTS_PANEL_MARKER, BOTS_PANEL_PATH],
    [SERVICE_PANEL_MARKER, SERVICE_PANEL_PATH],
    [CALENDAR_PANEL_MARKER, CALENDAR_PANEL_PATH],
    [SHIPPING_PANEL_MARKER, SHIPPING_PANEL_PATH],
    [GITHUB_PANEL_MARKER, GITHUB_PANEL_PATH],
  ].reduce((acc, [marker, file]) => inlinePanel(acc, marker, file), html);
  return inlineGithubData(page);
}

/**
 * Returns the dashboard index.html path, or null if it is missing from the install.
 * @returns {string|null}
 */
function findDashboardPath() {
  return fs.existsSync(DASHBOARD_HTML_PATH) ? DASHBOARD_HTML_PATH : null;
}

/**
 * Serves the dashboard HTML file
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {(html: string) => string} [transform] - Optional HTML rewrite (e.g. auth token injection)
 */
function serveDashboard(req, res, transform) {
  const filePath = findDashboardPath();
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify(
        err(
          ErrorCodes.DASHBOARD_FILE_NOT_FOUND_001,
          'Nomad Dashboard index.html not found on system',
        ),
      ),
    );
    return;
  }

  try {
    const raw = composeDashboard(fs.readFileSync(filePath, 'utf-8'));
    const content = typeof transform === 'function' ? transform(raw) : raw;
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(content),
      'Cache-Control': 'no-cache',
      // The page can carry the auth token: keep it out of other sites' frames and no-cors reads.
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
    });
    res.end(content);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify(
        err(ErrorCodes.DASHBOARD_READ_FAILED_002, 'Failed to read Nomad Dashboard file', {
          error: error instanceof Error ? error.message : String(error),
        }),
      ),
    );
  }
}

module.exports = {
  DASHBOARD_HTML_PATH,
  BOTS_PANEL_PATH,
  composeDashboard,
  findDashboardPath,
  serveDashboard,
  dashboardThemeTokens,
  themeDashboardHtml,
};
